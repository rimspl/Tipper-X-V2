import {
  applyCors,
  handlePreflight,
  methodGuard,
  parseBody,
  requireFields
} from '../../../services/api-sync/_lib.js';
import {
  extractTextFromImageBuffer,
  isOcrCategoryEnabled,
  resolvePhotoRouting
} from '../../../services/api-sync/_ocr.js';

const CATEGORY_ALIASES = {
  pressure_gauge: 'Pressure_Gauge',
  'pressure gauge': 'Pressure_Gauge',
  dashboard_cluster: 'Dashboard_Cluster',
  'dashboard cluster': 'Dashboard_Cluster',
  dashboard: 'Dashboard_Cluster',
  cabin_number: 'Cabin_Number',
  'cabin number': 'Cabin_Number',
  cabin: 'Cabin_Number',
  tyre_sidewall: 'Tyre_Sidewall',
  'tyre sidewall': 'Tyre_Sidewall',
  sidewall: 'Tyre_Sidewall',
  serial_sidewall: 'Tyre_Sidewall',
  tyre_serial: 'Tyre_Sidewall',
  serial: 'Tyre_Sidewall',
  tread_depth_gauge: 'Tread_Depth_Gauge',
  'tread depth gauge': 'Tread_Depth_Gauge',
  tread: 'Tread_Depth_Gauge',
  miscellaneous: 'Miscellaneous',
  misc: 'Miscellaneous'
};

function normalizeCategory(value) {
  const key = String(value || '').trim().toLowerCase();
  return CATEGORY_ALIASES[key] || null;
}

function parseDataUrl(rawInput) {
  const raw = String(rawInput || '').trim();
  if (!raw) {
    throw new Error('image is required');
  }

  const withPrefix = raw.startsWith('data:')
    ? raw
    : `data:image/jpeg;base64,${raw}`;

  const match = withPrefix.match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) {
    throw new Error('Invalid data URL image payload');
  }

  const mimeType = String(match[1] || 'image/jpeg').trim().toLowerCase();
  const base64 = String(match[2] || '').trim();
  const buffer = Buffer.from(base64, 'base64');

  if (!buffer.length) {
    throw new Error('Image payload decoded to empty buffer');
  }

  return {
    mimeType,
    base64,
    dataUrl: withPrefix,
    buffer
  };
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const TYRE_MAKES = ['MRF', 'APOLLO', 'BRIDGESTONE', 'JK', 'CEAT', 'YOKOHAMA'];

function normalizePositionCode(value) {
  const candidate = String(value || '').trim().toUpperCase();
  if (!candidate) return null;
  const match = candidate.match(/\bFL2?\b|\bFR2?\b|\bRL2?\b|\bRR2?\b|\bAX\d(?:L|R)(?:O|I)\b/);
  return match ? match[0] : null;
}

function selectRouting(initialRouting, externalRouting) {
  if (!externalRouting) {
    return {
      routing: initialRouting,
      usedExternal: false,
      reason: null
    };
  }

  const initialCategory = String(initialRouting?.photo_category || '').trim() || 'Miscellaneous';
  const externalCategory = String(externalRouting?.photo_category || '').trim() || 'Miscellaneous';
  const externalConfidence = Number(externalRouting?.category_confidence || 0);

  if (initialCategory === 'Miscellaneous') {
    return { routing: externalRouting, usedExternal: true, reason: 'guided_misc' };
  }

  if (externalCategory === initialCategory) {
    return {
      routing: {
        ...externalRouting,
        category_confidence: Math.max(
          Number(initialRouting?.category_confidence || 0),
          Number.isFinite(externalConfidence) ? externalConfidence : 0
        )
      },
      usedExternal: true,
      reason: 'match'
    };
  }

  if (externalCategory === 'Miscellaneous' && externalConfidence < 0.94) {
    return {
      routing: initialRouting,
      usedExternal: false,
      reason: 'external_misc_low_confidence'
    };
  }

  if (!Number.isFinite(externalConfidence) || externalConfidence < 0.78) {
    return {
      routing: initialRouting,
      usedExternal: false,
      reason: 'external_low_confidence'
    };
  }

  return {
    routing: externalRouting,
    usedExternal: true,
    reason: 'external_high_confidence'
  };
}

function parseExtractedData({ ocrResult, formType, stepId, photoCategory }) {
  const tokens = Array.isArray(ocrResult?.tokens) ? ocrResult.tokens : [];
  const fullText = String(ocrResult?.full_text || '').trim();
  const normalizedStep = String(stepId || '').trim().toLowerCase();
  const normalizedForm = String(formType || '').trim().toLowerCase();

  const numberValues = [];
  const serialCandidates = [];
  const makeCandidates = [];
  const sizeCandidates = [];
  const vehicleCandidates = [];
  const positionCandidates = [];

  for (const token of tokens) {
    const text = String(token?.text || '').trim();
    if (!text) continue;

    const upper = text.toUpperCase();

    for (const make of TYRE_MAKES) {
      if (upper.includes(make)) {
        makeCandidates.push(make);
      }
    }

    const sizeMatch = upper.match(/\b\d{2,3}(?:\.\d{2})?R\d{2}\b|\b\d{3}\/\d{2}R\d{2}\b/);
    if (sizeMatch) {
      sizeCandidates.push(sizeMatch[0]);
    }

    const vehicleMatch = upper.match(/\b[A-Z]{1,3}[ -]?\d{1,3}[A-Z]{0,2}[ -]?\d{1,5}\b/);
    if (vehicleMatch) {
      vehicleCandidates.push(vehicleMatch[0].replace(/\s+/g, '-'));
    }

    const positionMatch = normalizePositionCode(upper);
    if (positionMatch) {
      positionCandidates.push(positionMatch);
    }

    const numberMatches = text.match(/\d+(?:\.\d+)?/g) || [];
    for (const item of numberMatches) {
      const parsed = Number(item);
      if (Number.isFinite(parsed)) {
        numberValues.push(parsed);
      }
    }

    const serialMatch = text.match(/\b[A-Z0-9]{6,15}\b/i);
    if (serialMatch && !/^\d+$/.test(serialMatch[0])) {
      serialCandidates.push(serialMatch[0].toUpperCase());
    }
  }

  const uniqueNumbers = Array.from(new Set(numberValues.map((value) => Number(value.toFixed(3)))));
  const uniqueSerials = Array.from(new Set(serialCandidates));

  const psiCandidates = uniqueNumbers.filter((value) => value >= 40 && value <= 180);
  const odometerCandidates = uniqueNumbers.filter((value) => value >= 1000 && value <= 2000000);
  const treadCandidates = uniqueNumbers.filter((value) => value >= 0 && value <= 40);

  const uniqueMakes = Array.from(new Set(makeCandidates));
  const uniqueSizes = Array.from(new Set(sizeCandidates));
  const uniqueVehicles = Array.from(new Set(vehicleCandidates));
  const uniquePositions = Array.from(new Set(positionCandidates));

  const preferred = {};
  if (photoCategory === 'Pressure_Gauge') {
    if (psiCandidates.length > 0) preferred.found_psi = psiCandidates[0];
  }
  if (photoCategory === 'Dashboard_Cluster' || normalizedStep.includes('odometer')) {
    if (odometerCandidates.length > 0) preferred.meter_reading = Math.round(odometerCandidates[0]);
  }
  if (photoCategory === 'Tyre_Sidewall') {
    if (uniqueSerials.length > 0) preferred.tyre_serial = uniqueSerials[0];
    if (uniqueMakes.length > 0) preferred.make = uniqueMakes[0];
    if (uniqueSizes.length > 0) preferred.size = uniqueSizes[0];
  }
  if (photoCategory === 'Tread_Depth_Gauge' || normalizedStep.includes('tread')) {
    if (treadCandidates.length > 0) preferred.rtd1 = treadCandidates[0];
    if (treadCandidates.length > 1) preferred.rtd2 = treadCandidates[1];
  }

  if (uniqueVehicles.length > 0) preferred.vehicle_no = uniqueVehicles[0];
  if (uniquePositions.length > 0) preferred.position_code = uniquePositions[0];

  if (normalizedForm === 'pressure_check' && !preferred.position_code) {
    const stepPosition = normalizePositionCode(normalizedStep.toUpperCase());
    if (stepPosition) {
      preferred.position_code = stepPosition;
    }
  }

  return {
    text: fullText,
    token_count: tokens.length,
    numbers: uniqueNumbers,
    psi_candidates: psiCandidates,
    odometer_candidates: odometerCandidates,
    tread_candidates: treadCandidates,
    serial_candidates: uniqueSerials,
    make_candidates: uniqueMakes,
    size_candidates: uniqueSizes,
    vehicle_candidates: uniqueVehicles,
    position_candidates: uniquePositions,
    preferred_fields: preferred
  };
}

async function callExternalClassifier({ formType, stepId, imageDataUrl }) {
  const endpoint = String(process.env.VISION_CLASSIFIER_ENDPOINT || '').trim();
  if (!endpoint) {
    return {
      routing: null,
      classifier_error: null,
      exif_datetime_original: null,
      preprocess: null,
      timings_ms: null
    };
  }

  const token = String(process.env.VISION_CLASSIFIER_TOKEN || '').trim();
  const headers = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        form_type: formType,
        step_id: stepId,
        image: imageDataUrl
      })
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        routing: null,
        classifier_error: json?.detail || json?.error || json?.message || `Classifier HTTP ${response.status}`,
        exif_datetime_original: null,
        preprocess: null,
        timings_ms: null
      };
    }

    const category = normalizeCategory(json.photo_category || json.category || json.label);
    if (!category) {
      return {
        routing: null,
        classifier_error: 'Classifier response missing usable photo category',
        exif_datetime_original: null,
        preprocess: json?.preprocess || null,
        timings_ms: json?.timings_ms || null
      };
    }

    const confidence = toNumber(json.category_confidence ?? json.confidence);
    const labels = Array.isArray(json.classifier_labels)
      ? json.classifier_labels.map((label) => String(label || '').trim()).filter(Boolean)
      : [];

    return {
      routing: {
        photo_category: category,
        classifier: String(json.classifier || json.model || 'external_vision_classifier').trim() || 'external_vision_classifier',
        category_confidence: Number.isFinite(confidence) ? Math.min(0.99, Math.max(0.01, confidence)) : 0.8,
        classifier_labels: labels
      },
      classifier_error: null,
      exif_datetime_original: String(json.exif_datetime_original || '').trim() || null,
      preprocess: json?.preprocess || null,
      timings_ms: json?.timings_ms || null
    };
  } catch (error) {
    return {
      routing: null,
      classifier_error: error?.message || 'Classifier request failed',
      exif_datetime_original: null,
      preprocess: null,
      timings_ms: null
    };
  }
}

export default async function handler(req, res) {
  applyCors(res, 'POST, OPTIONS');
  if (handlePreflight(req, res)) return;
  if (!methodGuard(req, res, 'POST')) return;

  try {
    const body = parseBody(req);
    const missing = requireFields(body, ['image']);
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missing.join(', ')}`
      });
    }

    const formType = String(body.form_type || 'quick_capture').trim().toLowerCase();
    const stepId = String(body.step_id || 'quick_capture_photo').trim().toLowerCase();
    const meta = body.meta && typeof body.meta === 'object' && !Array.isArray(body.meta)
      ? body.meta
      : {};

    const parsedImage = parseDataUrl(body.image);

    const initialRouting = resolvePhotoRouting({
      formType,
      stepId,
      metaJson: meta
    });

    const external = await callExternalClassifier({
      formType,
      stepId,
      imageDataUrl: parsedImage.dataUrl
    });

    const routingSelection = selectRouting(initialRouting, external.routing);
    const routing = routingSelection.routing;
    const routingFallbackReason = (!routingSelection.usedExternal && routingSelection.reason && routingSelection.reason.startsWith('external_'))
      ? `Using guided routing (${routingSelection.reason.replace('external_', '')})`
      : null;
    const exifDateTimeOriginal = String(
      external.exif_datetime_original
      || meta?.pipeline?.exif_datetime_original
      || meta?.exif_datetime_original
      || ''
    ).trim() || null;

    const ocrEnabled = isOcrCategoryEnabled(routing.photo_category);
    let ocrResult = {
      model: null,
      full_text: '',
      tokens: [],
      error: null
    };

    if (ocrEnabled) {
      ocrResult = await extractTextFromImageBuffer({
        buffer: parsedImage.buffer,
        mimeType: parsedImage.mimeType
      });
    }

    return res.status(200).json({
      success: true,
      result: {
        photo_category: routing.photo_category,
        category_confidence: routing.category_confidence,
        classifier: routing.classifier,
        classifier_labels: routing.classifier_labels,
        classifier_error: external.classifier_error || routingFallbackReason,
        exif_datetime_original: exifDateTimeOriginal,
        preprocess: external.preprocess || meta?.pipeline || null,
        timings_ms: external.timings_ms || null,
        ocr_enabled: ocrEnabled,
        ocr_model: ocrResult.model || null,
        ocr_error: ocrResult.error || null,
        ocr_text: ocrResult.full_text || '',
        ocr_tokens: Array.isArray(ocrResult.tokens) ? ocrResult.tokens : [],
        extracted_data: parseExtractedData({
          ocrResult,
          formType,
          stepId,
          photoCategory: routing.photo_category
        })
      }
    });
  } catch (error) {
    console.error('photo pipeline preview error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Photo pipeline preview failed'
    });
  }
}
