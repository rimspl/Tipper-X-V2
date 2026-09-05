import {
  ALLOWED_FORM_TYPES,
  applyCors,
  methodGuard,
  handlePreflight,
  parseBody,
  requireFields
} from '../../../services/api-sync/_lib.js';
import {
  extractTextFromImageBuffer,
  isOcrCategoryEnabled,
  resolvePhotoRouting
} from '../../../services/api-sync/_ocr.js';
import { transcribeAudioBuffer } from '../../../services/api-sync/_voice.js';
import { buildExtractionPayload, parseOcrHints } from '../../../services/api-sync/_processing.js';

function normalizeFormType(formType) {
  return String(formType || '').trim().toLowerCase();
}

function parseDataUrl(dataUrl) {
  const raw = String(dataUrl || '');
  const match = raw.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return null;
  }

  const mimeType = match[1] || 'image/jpeg';
  const base64 = match[2] || '';
  try {
    const buffer = Buffer.from(base64, 'base64');
    return { mimeType, buffer };
  } catch (error) {
    return null;
  }
}

function parseAudioDataUrl(dataUrl) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    return null;
  }

  const mimeType = String(parsed.mimeType || '').toLowerCase();
  if (!mimeType.startsWith('audio/')) {
    return null;
  }

  return parsed;
}

export default async function handler(req, res) {
  applyCors(res, 'POST, OPTIONS');
  if (handlePreflight(req, res)) return;
  if (!methodGuard(req, res, 'POST')) return;

  try {
    const body = parseBody(req);
    const missing = requireFields(body, ['form_type', 'steps']);
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missing.join(', ')}`
      });
    }

    const formType = normalizeFormType(body.form_type);
    if (!ALLOWED_FORM_TYPES.has(formType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid form_type. Allowed: ${Array.from(ALLOWED_FORM_TYPES).join(', ')}`
      });
    }

    const steps = Array.isArray(body.steps) ? body.steps : [];
    if (steps.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'steps must contain at least one capture step'
      });
    }

    const ocrByStep = {};
    const mediaRows = [];

    for (const [index, step] of steps.entries()) {
      const stepId = String(step.step_id || `step_${index + 1}`).trim();
      const mediaKind = String(step.media_kind || 'image').trim().toLowerCase();
      const routing = resolvePhotoRouting({
        formType,
        stepId,
        metaJson: step.meta || {}
      });

      const basePreview = {
        model: 'nemoretriever-ocr-v1',
        tokens: [],
        full_text: '',
        raw: null,
        error: null,
        photo_category: routing.photo_category,
        classifier: routing.classifier,
        category_confidence: routing.category_confidence,
        classifier_labels: routing.classifier_labels,
        ocr_enabled: isOcrCategoryEnabled(routing.photo_category),
        asr_enabled: mediaKind === 'audio',
        exif_datetime_original: step.meta?.exif_datetime_original || null
      };

      mediaRows.push({
        id: `preview_media_${index + 1}`,
        step_id: stepId,
        sha256: String(step.sha256 || '').trim() || `preview_sha_${index + 1}`,
        meta_json: {
          blur_score: Number(step.meta?.blur_score || 0.2),
          pipeline: {
            photo_category: routing.photo_category,
            classifier: routing.classifier,
            category_confidence: routing.category_confidence,
            classifier_labels: routing.classifier_labels,
            exif_datetime_original: step.meta?.exif_datetime_original || null
          }
        }
      });

      if (mediaKind === 'audio') {
        const parsedAudio = parseAudioDataUrl(step.data_url);
        if (!parsedAudio) {
          ocrByStep[stepId] = {
            ...basePreview,
            model: 'whisper-large-v3',
            asr_enabled: true,
            ocr_enabled: false,
            error: 'Invalid audio data_url payload'
          };
        } else {
          const asrResult = await transcribeAudioBuffer({
            audioBuffer: parsedAudio.buffer,
            stepId,
            formType
          });

          ocrByStep[stepId] = {
            ...basePreview,
            ...asrResult,
            model: asrResult.model || 'whisper-large-v3',
            asr_enabled: true,
            ocr_enabled: false
          };
        }
        mediaRows[index].meta_json.extracted_data = ocrByStep[stepId]?.extracted_data || null;
        continue;
      }

      if (mediaKind !== 'image') {
        ocrByStep[stepId] = {
          ...basePreview,
          ocr_enabled: false,
          error: 'Skipped non-image media'
        };
        continue;
      }

      if (!basePreview.ocr_enabled) {
        ocrByStep[stepId] = basePreview;
        continue;
      }

      const parsed = parseDataUrl(step.data_url);
      if (!parsed) {
        ocrByStep[stepId] = {
          ...basePreview,
          error: 'Invalid data_url payload'
        };
        continue;
      }

      const result = await extractTextFromImageBuffer({
        buffer: parsed.buffer,
        mimeType: step.mime_type || parsed.mimeType,
        formType,
        stepId,
        photoCategory: basePreview.photo_category
      });

      ocrByStep[stepId] = {
        ...basePreview,
        ...result
      };
      mediaRows[index].meta_json.extracted_data = ocrByStep[stepId]?.extracted_data || null;
    }

    const ocrHints = parseOcrHints(formType, ocrByStep, mediaRows);
    const extraction = buildExtractionPayload(
      {
        id: `preview_${Date.now()}`,
        form_type: formType,
        context_json: body.context || {}
      },
      mediaRows,
      ocrHints
    );

    extraction.ocr_summary = {
      total_steps: Object.keys(ocrByStep).length,
      extracted_tokens: Object.values(ocrByStep).reduce((count, entry) => count + (entry?.tokens?.length || 0), 0),
      errors: Object.values(ocrByStep).filter((entry) => entry?.error).length,
      ocr_attempted: Object.values(ocrByStep).filter((entry) => entry?.ocr_enabled).length,
      ocr_succeeded: Object.values(ocrByStep).filter((entry) => entry?.ocr_enabled && !entry?.error).length,
      category_counts: Object.values(ocrByStep).reduce((acc, entry) => {
        const key = entry?.photo_category || 'Miscellaneous';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {})
    };

    const debugEnabled = Boolean(body.debug);
    const debugSteps = debugEnabled
      ? Object.entries(ocrByStep).map(([stepId, entry]) => ({
        step_id: stepId,
        photo_category: entry?.photo_category || null,
        ocr_enabled: Boolean(entry?.ocr_enabled),
        error: entry?.error || null,
        classifier_error: entry?.classifier_error || null,
        token_count: Array.isArray(entry?.tokens) ? entry.tokens.length : 0,
        sample_tokens: Array.isArray(entry?.tokens)
          ? entry.tokens.slice(0, 12).map((token) => token.text)
          : []
      }))
      : undefined;

    return res.status(200).json({
      success: true,
      preview_mode: true,
      submission: {
        pipeline_status: 'completed',
        processing_status: 'completed'
      },
      processing: {
        decision: extraction.decision,
        overall_confidence: extraction.overall_confidence,
        validation: extraction.validation,
        ocr_summary: extraction.ocr_summary
      },
      extracted: extraction.extracted,
      ocr_hints: extraction.ocr_hints || ocrHints.values,
      debug_steps: debugSteps
    });
  } catch (error) {
    console.error('extract preview error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Preview extraction failed'
    });
  }
}
