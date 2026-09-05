import {
  applyCors,
  handlePreflight,
  methodGuard,
  parseBody,
  requireFields
} from '../../../services/api-sync/_lib.js';
import { transcribeAudioBuffer } from '../../../services/api-sync/_voice.js';

function parseAudioDataUrl(rawInput) {
  const raw = String(rawInput || '').trim();
  if (!raw) {
    throw new Error('audio is required');
  }

  const withPrefix = raw.startsWith('data:')
    ? raw
    : `data:audio/wav;base64,${raw}`;

  const match = withPrefix.match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) {
    throw new Error('Invalid data URL audio payload');
  }

  const mimeType = String(match[1] || 'audio/wav').trim().toLowerCase();
  if (!mimeType.startsWith('audio/')) {
    throw new Error('Provided payload is not audio content');
  }

  const base64 = String(match[2] || '').trim();
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length) {
    throw new Error('Audio payload decoded to empty buffer');
  }

  return {
    mimeType,
    buffer
  };
}

export default async function handler(req, res) {
  applyCors(res, 'POST, OPTIONS');
  if (handlePreflight(req, res)) return;
  if (!methodGuard(req, res, 'POST')) return;

  try {
    const body = parseBody(req);
    const missing = requireFields(body, ['audio']);
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missing.join(', ')}`
      });
    }

    const formType = String(body.form_type || 'voice_capture').trim().toLowerCase();
    const stepId = String(body.step_id || 'voice_step').trim().toLowerCase();
    const parsed = parseAudioDataUrl(body.audio);

    const asr = await transcribeAudioBuffer({
      audioBuffer: parsed.buffer,
      formType,
      stepId
    });

    return res.status(200).json({
      success: true,
      result: {
        asr_enabled: true,
        asr_model: asr.model || null,
        asr_error: asr.error || null,
        asr_transcript: asr.transcript || '',
        asr_tokens: Array.isArray(asr.tokens) ? asr.tokens : [],
        asr_confidence: Number.isFinite(Number(asr.confidence)) ? Number(asr.confidence) : null,
        duration_seconds: Number.isFinite(Number(asr.duration_seconds)) ? Number(asr.duration_seconds) : null,
        sample_rate_hz: Number.isFinite(Number(asr.sample_rate_hz)) ? Number(asr.sample_rate_hz) : null,
        mime_type: parsed.mimeType,
        extracted_data: asr.extracted_data || { preferred_fields: {} }
      }
    });
  } catch (error) {
    console.error('voice pipeline preview error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Voice pipeline preview failed'
    });
  }
}
