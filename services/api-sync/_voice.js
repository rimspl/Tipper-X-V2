import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import {
  extractSpokenNumberCandidates,
  POSITION_CODES,
  MODEL_CODES,
  TYRE_SIZE_MASTER,
  deriveTyreTypeFromSize,
  normalizeMake as normalizeMakeMaster,
  normalizePositionCode as normalizePositionCodeMaster,
  normalizeSpokenAlphaNumeric,
  normalizeTyreModel,
  normalizeTyreSize as normalizeTyreSizeMaster,
  suggestPositionCodes,
  suggestTyreModels,
  suggestTyreSizes
} from '../../shared/field-masters.js';

const DEFAULT_ASR_GRPC_ENDPOINT = 'grpc.nvcf.nvidia.com:443';
const DEFAULT_ASR_FUNCTION_ID = 'b702f636-f60c-4a3d-a6f4-f3568c13bd7d';
const DEFAULT_ASR_MODEL = 'whisper-large-v3';
const DEFAULT_ASR_LANGUAGE = 'en-IN';
const DEFAULT_TEXT_NORMALIZER_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const DEFAULT_TEXT_NORMALIZER_MODEL = 'meta/llama-3.1-8b-instruct';
const MIN_ASR_INTERVAL_MS = 1600;
const OBSERVATION_CATEGORY_KEYWORDS = {
  Safety: ['safety', 'danger', 'unsafe', 'risk', 'critical', 'burst', 'exposed cord'],
  Wear: ['wear', 'uneven wear', 'bald', 'tread wear', 'center wear'],
  Pressure: ['pressure', 'psi', 'air', 'underinflated', 'overinflated', 'valve leak'],
  Fitment: ['fitment', 'alignment', 'position', 'loose nut', 'mismatch']
};

const OBSERVATION_SUBCATEGORY_KEYWORDS = {
  Safety: {
    'Sidewall Cut': ['sidewall cut', 'sidewall damage', 'cut on sidewall'],
    Bulge: ['bulge', 'swelling'],
    'Exposed Cord': ['exposed cord', 'cord visible', 'wire visible']
  },
  Wear: {
    'Uneven Wear': ['uneven wear', 'irregular wear'],
    'Fast Wear': ['fast wear', 'rapid wear'],
    'Center Wear': ['center wear', 'middle wear']
  },
  Pressure: {
    'Low Pressure': ['low pressure', 'under pressure', 'underinflated'],
    'Over Pressure': ['over pressure', 'high pressure', 'overinflated'],
    'Valve Leak': ['valve leak', 'leaking valve']
  },
  Fitment: {
    'Wrong Position': ['wrong position', 'incorrect position'],
    'Loose Nut': ['loose nut', 'wheel nut loose'],
    'Mismatch Pair': ['mismatch pair', 'mismatched pair']
  }
};

let asrClientPromise = null;
let lastAsrCallAt = 0;
let skipConfiguredModel = false;
const aiNormalizeCache = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function enforceRateLimit() {
  const now = Date.now();
  const elapsed = now - lastAsrCallAt;
  if (elapsed < MIN_ASR_INTERVAL_MS) {
    await sleep(MIN_ASR_INTERVAL_MS - elapsed);
  }
  lastAsrCallAt = Date.now();
}

function getAsrGrpcEndpoint() {
  return String(process.env.NVIDIA_ASR_GRPC_ENDPOINT || DEFAULT_ASR_GRPC_ENDPOINT).trim();
}

function getAsrFunctionId() {
  return String(process.env.NVIDIA_ASR_FUNCTION_ID || DEFAULT_ASR_FUNCTION_ID).trim();
}

function getAsrModel() {
  const raw = String(process.env.NVIDIA_ASR_MODEL || DEFAULT_ASR_MODEL).trim();
  if (!raw) return '';
  if (/^(auto|default|server-default)$/i.test(raw)) return '';
  return raw;
}

function getAsrLanguage() {
  return String(process.env.NVIDIA_ASR_LANGUAGE || DEFAULT_ASR_LANGUAGE).trim();
}

function getAsrApiKey() {
  return String(
    process.env.NVIDIA_ASR_API_KEY
    || process.env.NVIDIA_OCR_API_KEY
    || process.env.NVIDIA_API_KEY
    || ''
  ).trim();
}

function resolveProtoDir(currentDir) {
  const candidates = [
    path.join(currentDir, 'proto'),
    path.join(currentDir, '..', '..', 'api', 'v1', 'sync', 'proto'),
    path.join(process.cwd(), 'services', 'api-sync', 'proto'),
    path.join(process.cwd(), 'api', 'v1', 'sync', 'proto')
  ];

  for (const candidate of candidates) {
    const asrProto = path.join(candidate, 'riva_asr.proto');
    if (fs.existsSync(asrProto)) {
      return candidate;
    }
  }

  throw new Error(`ASR proto files not found. Checked: ${candidates.join(', ')}`);
}

async function getAsrClient() {
  if (asrClientPromise) {
    return asrClientPromise;
  }

  asrClientPromise = Promise.resolve().then(() => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const protoDir = resolveProtoDir(currentDir);
    const asrProtoPath = path.join(protoDir, 'riva_asr.proto');

    const packageDefinition = protoLoader.loadSync(asrProtoPath, {
      includeDirs: [protoDir],
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true
    });

    const loaded = grpc.loadPackageDefinition(packageDefinition);
    const Service = loaded?.nvidia?.riva?.asr?.RivaSpeechRecognition;

    if (!Service) {
      throw new Error('Failed to load RivaSpeechRecognition gRPC service definition');
    }

    return new Service(
      getAsrGrpcEndpoint(),
      grpc.credentials.createSsl(),
      {
        'grpc.max_send_message_length': 64 * 1024 * 1024,
        'grpc.max_receive_message_length': 64 * 1024 * 1024
      }
    );
  });

  return asrClientPromise;
}

function parseWavPcm16(audioBuffer) {
  const buffer = Buffer.isBuffer(audioBuffer) ? audioBuffer : Buffer.from(audioBuffer);
  if (buffer.length < 44) {
    throw new Error('Audio too small to parse WAV header');
  }

  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Audio must be WAV (RIFF/WAVE) format');
  }

  let offset = 12;
  let fmtChunk = null;
  let dataChunkOffset = -1;
  let dataChunkSize = -1;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkDataStart = offset + 8;

    if (chunkDataStart + chunkSize > buffer.length) {
      break;
    }

    if (chunkId === 'fmt ') {
      fmtChunk = {
        audioFormat: buffer.readUInt16LE(chunkDataStart),
        channels: buffer.readUInt16LE(chunkDataStart + 2),
        sampleRate: buffer.readUInt32LE(chunkDataStart + 4),
        byteRate: buffer.readUInt32LE(chunkDataStart + 8),
        blockAlign: buffer.readUInt16LE(chunkDataStart + 12),
        bitsPerSample: buffer.readUInt16LE(chunkDataStart + 14)
      };
    }

    if (chunkId === 'data') {
      dataChunkOffset = chunkDataStart;
      dataChunkSize = chunkSize;
      break;
    }

    offset = chunkDataStart + chunkSize + (chunkSize % 2);
  }

  if (!fmtChunk) {
    throw new Error('WAV missing fmt chunk');
  }
  if (dataChunkOffset < 0 || dataChunkSize <= 0) {
    throw new Error('WAV missing data chunk');
  }
  if (fmtChunk.audioFormat !== 1) {
    throw new Error(`Unsupported WAV audio format ${fmtChunk.audioFormat}; expected PCM`);
  }
  if (fmtChunk.bitsPerSample !== 16) {
    throw new Error(`Unsupported bits-per-sample ${fmtChunk.bitsPerSample}; expected 16-bit PCM`);
  }

  const frameSize = fmtChunk.channels * 2;
  const frameCount = Math.floor(dataChunkSize / frameSize);
  const source = buffer.subarray(dataChunkOffset, dataChunkOffset + frameCount * frameSize);

  if (fmtChunk.channels === 1) {
    return {
      sampleRateHertz: fmtChunk.sampleRate,
      pcmBuffer: source,
      channels: 1,
      durationSeconds: frameCount / Math.max(fmtChunk.sampleRate, 1)
    };
  }

  const mono = Buffer.alloc(frameCount * 2);
  for (let index = 0; index < frameCount; index += 1) {
    let sampleSum = 0;
    for (let channel = 0; channel < fmtChunk.channels; channel += 1) {
      const pos = index * frameSize + channel * 2;
      sampleSum += source.readInt16LE(pos);
    }
    const avg = Math.max(-32768, Math.min(32767, Math.round(sampleSum / fmtChunk.channels)));
    mono.writeInt16LE(avg, index * 2);
  }

  return {
    sampleRateHertz: fmtChunk.sampleRate,
    pcmBuffer: mono,
    channels: fmtChunk.channels,
    durationSeconds: frameCount / Math.max(fmtChunk.sampleRate, 1)
  };
}

function decodeAsrResponse(response) {
  const results = Array.isArray(response?.results) ? response.results : [];
  const alternatives = results
    .flatMap((result) => Array.isArray(result?.alternatives) ? result.alternatives : [])
    .filter((alt) => String(alt?.transcript || '').trim().length > 0);

  if (alternatives.length === 0) {
    return {
      transcript: '',
      confidence: 0.4,
      alternatives: []
    };
  }

  alternatives.sort((a, b) => {
    const confA = Number.isFinite(Number(a.confidence)) ? Number(a.confidence) : 0;
    const confB = Number.isFinite(Number(b.confidence)) ? Number(b.confidence) : 0;
    return confB - confA;
  });

  const best = alternatives[0];

  return {
    transcript: String(best.transcript || '').trim(),
    confidence: Number.isFinite(Number(best.confidence))
      ? Number(best.confidence)
      : 0.75,
    alternatives: alternatives.map((alt) => ({
      transcript: String(alt.transcript || '').trim(),
      confidence: Number.isFinite(Number(alt.confidence)) ? Number(alt.confidence) : null
    }))
  };
}

function isModelUnavailableError(error) {
  const details = String(error?.details || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  const combined = `${details} ${message}`;

  if (!combined.includes('model')) {
    return false;
  }

  return (
    combined.includes('not available')
    || combined.includes('not found')
    || combined.includes('unavailable')
  );
}

function buildRecognizeRequest({ parsed, formType, stepId, languageCode, model }) {
  const config = {
    encoding: 'LINEAR_PCM',
    sample_rate_hertz: parsed.sampleRateHertz,
    language_code: languageCode,
    max_alternatives: 3,
    enable_word_time_offsets: false,
    enable_automatic_punctuation: true,
    verbatim_transcripts: true,
    custom_configuration: {
      task: 'transcribe'
    }
  };

  if (model && String(model).trim()) {
    config.model = String(model).trim();
  }

  return {
    config,
    audio: parsed.pcmBuffer,
    id: {
      value: `${String(formType || 'voice').toLowerCase()}-${String(stepId || 'step')}-${Date.now()}`
    }
  };
}

function normalizeAsrErrorMessage(error) {
  const details = String(error?.details || '').trim();
  const message = String(error?.message || '').trim();
  const combined = details || message;

  if (isModelUnavailableError(error)) {
    return 'Configured speech model is unavailable on server';
  }

  return combined || 'ASR request failed';
}

function getTextNormalizerApiKey() {
  return String(
    process.env.NVIDIA_TEXT_NORMALIZER_API_KEY
    || process.env.NVIDIA_OCR_API_KEY
    || process.env.NVIDIA_ASR_API_KEY
    || process.env.NVIDIA_API_KEY
    || ''
  ).trim();
}

function getTextNormalizerEndpoint() {
  return String(
    process.env.NVIDIA_TEXT_NORMALIZER_ENDPOINT
    || process.env.NVIDIA_OCR_CHAT_ENDPOINT
    || DEFAULT_TEXT_NORMALIZER_ENDPOINT
  ).trim();
}

function getTextNormalizerModel() {
  return String(
    process.env.NVIDIA_TEXT_NORMALIZER_MODEL
    || process.env.NVIDIA_OCR_MODEL
    || DEFAULT_TEXT_NORMALIZER_MODEL
  ).trim() || DEFAULT_TEXT_NORMALIZER_MODEL;
}

function stripCodeFence(content = '') {
  const text = String(content || '').trim();
  if (!text.startsWith('```')) {
    return text;
  }

  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseJsonObjectFromContent(content = '') {
  const cleaned = stripCodeFence(content);
  if (!cleaned) return null;

  const direct = tryParseJson(cleaned);
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
    return direct;
  }

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return null;
  }

  const extracted = tryParseJson(cleaned.slice(start, end + 1));
  if (extracted && typeof extracted === 'object' && !Array.isArray(extracted)) {
    return extracted;
  }

  return null;
}

function shouldUseAiNormalizer(field, transcript) {
  const text = String(transcript || '').trim().toLowerCase();
  if (!text) return false;

  const tokenCount = text.split(/\s+/g).filter(Boolean).length;
  if (tokenCount < 2 && text.length < 6) {
    return false;
  }

  if (field === 'position_code') {
    return /\b(position|front|left|right|axle|outer|inner|samne|aage|baye|baaye|daye|daaye|fl|fr|ax|three|four|teen|char|do|3|4)\b/i.test(text);
  }

  if (field === 'size') {
    return /\b(size|slash|point|dot|radial|bias|by|into|cross|x|r|barah|das|bais|chaubis|assi|295|12|10|20|22|24|80|95)\b|\d/.test(text);
  }

  return tokenCount >= 2;
}

async function requestAiCanonicalValue({ field, transcript, allowedValues = [], topSuggestions = [] }) {
  const normalizedTranscript = String(transcript || '').trim();
  if (!normalizedTranscript) {
    return null;
  }

  if (!shouldUseAiNormalizer(field, normalizedTranscript)) {
    return null;
  }

  const allowed = Array.from(new Set((allowedValues || []).map((value) => String(value || '').trim()).filter(Boolean)));
  if (allowed.length === 0) {
    return null;
  }

  const cacheKey = `${field}::${normalizedTranscript}`;
  if (aiNormalizeCache.has(cacheKey)) {
    return aiNormalizeCache.get(cacheKey);
  }

  const apiKey = getTextNormalizerApiKey();
  if (!apiKey) {
    return null;
  }

  const endpoint = getTextNormalizerEndpoint();
  const model = getTextNormalizerModel();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 180,
        messages: [
          {
            role: 'system',
            content: 'You normalize tyre workshop speech to canonical values. Respond with strict JSON only.'
          },
          {
            role: 'user',
            content: [
              `Field: ${field}`,
              `Transcript: ${normalizedTranscript}`,
              `Allowed values: ${allowed.join(', ')}`,
              topSuggestions.length > 0
                ? `Top deterministic suggestions: ${topSuggestions.join(', ')}`
                : null,
              'Output JSON keys: value (string or null), confidence (0 to 1).',
              'Set value to null if unsure. Never output anything except JSON.'
            ].filter(Boolean).join('\n')
          }
        ]
      }),
      signal: controller.signal
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      return null;
    }

    const content = String(json?.choices?.[0]?.message?.content || '').trim();
    const parsed = parseJsonObjectFromContent(content);
    if (!parsed) {
      return null;
    }

    const rawValue = String(
      parsed.value
      || parsed.canonical
      || parsed[field]
      || ''
    ).trim();

    let canonicalValue = rawValue;
    if (field === 'position_code') {
      canonicalValue = normalizePositionCode(rawValue) || toUpper(rawValue).replace(/\s+/g, '');
    } else if (field === 'size') {
      canonicalValue = normalizeTyreSize(rawValue) || toUpper(rawValue).replace(/\s+/g, '');
    }

    if (!canonicalValue || !allowed.includes(canonicalValue)) {
      aiNormalizeCache.set(cacheKey, null);
      return null;
    }

    const confidence = Number(parsed.confidence);
    const normalizedConfidence = Number.isFinite(confidence)
      ? Math.max(0, Math.min(1, confidence))
      : 0;

    if (normalizedConfidence < 0.68) {
      aiNormalizeCache.set(cacheKey, null);
      return null;
    }

    const result = {
      value: canonicalValue,
      confidence: normalizedConfidence
    };

    aiNormalizeCache.set(cacheKey, result);
    return result;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolvePositionCodeSmart(transcript) {
  const direct = normalizePositionCode(transcript);
  if (direct) {
    return direct;
  }

  const suggestions = suggestPositionCodes(transcript, 3);
  const best = suggestions[0] || null;
  if (best && best.score >= 0.72) {
    return best.value;
  }

  const ai = await requestAiCanonicalValue({
    field: 'position_code',
    transcript,
    allowedValues: POSITION_CODES,
    topSuggestions: suggestions.map((item) => item.value)
  });

  if (ai?.value) {
    return ai.value;
  }

  if (best && best.score >= 0.58) {
    return best.value;
  }

  return null;
}

async function resolveTyreSizeSmart(transcript) {
  const direct = normalizeTyreSize(transcript);
  if (direct) {
    return direct;
  }

  const suggestions = suggestTyreSizes(transcript, 3);
  const best = suggestions[0] || null;
  if (best && best.score >= 0.72) {
    return best.value;
  }

  const ai = await requestAiCanonicalValue({
    field: 'size',
    transcript,
    allowedValues: TYRE_SIZE_MASTER,
    topSuggestions: suggestions.map((item) => item.value)
  });

  if (ai?.value) {
    return ai.value;
  }

  if (best && best.score >= 0.58) {
    return best.value;
  }

  return null;
}

function toUpper(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizePositionCode(value) {
  return normalizePositionCodeMaster(value);
}

function numberOrNull(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function normalizeVehicleNo(value) {
  const compact = normalizeSpokenAlphaNumeric(value);
  if (!compact) return null;
  if (/^[A-Z]{1,4}[0-9]{1,4}$/.test(compact)) {
    return compact.replace(/^([A-Z]+)([0-9]+)$/i, '$1-$2');
  }
  return compact;
}

function extractVehicleNoCandidate(text) {
  const cleaned = toUpper(text)
    .replace(/[^A-Z0-9\s-]/g, ' ')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return null;
  }

  const patterns = [
    /\b[A-Z]{2}\s\d{1,2}\s[A-Z]{1,3}\s\d{1,4}\b/,
    /\b[A-Z]{1,3}\s\d{1,4}\s[A-Z]{1,3}\b/,
    /\b[A-Z]{1,3}\s\d{1,5}\s[A-Z]{1,3}\s\d{1,4}\b/,
    /\b[A-Z]{1,3}\s\d{1,5}\b/
  ];

  let best = null;
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (!match || !match[0]) continue;
    const candidate = normalizeVehicleNo(match[0]);
    if (!candidate) continue;
    if (!best || candidate.length > best.length) {
      best = candidate;
    }
  }

  if (best) {
    return best;
  }

  const tokens = cleaned.split(' ').filter(Boolean);
  for (let size = 2; size <= Math.min(tokens.length, 5); size += 1) {
    for (let start = 0; start <= tokens.length - size; start += 1) {
      const candidate = normalizeVehicleNo(tokens.slice(start, start + size).join(' '));
      const compactCandidate = String(candidate || '').replace(/-/g, '');
      if (!candidate || !/^[A-Z]{1,4}[0-9]{1,4}$/.test(compactCandidate)) {
        continue;
      }
      return candidate;
    }
  }

  return best;
}

function normalizeTyreSerial(value) {
  const compact = normalizeSpokenAlphaNumeric(value);
  if (!compact) return null;
  if (compact.length < 5 || compact.length > 24) return null;
  return compact;
}

function normalizeTyreSize(value) {
  return normalizeTyreSizeMaster(value);
}

function detectTyreMake(text) {
  return normalizeMakeMaster(text);
}

async function resolveTyreModelSmart(transcript) {
  const direct = normalizeTyreModel(transcript);
  if (direct) {
    return direct;
  }

  const suggestions = suggestTyreModels(transcript, 3);
  const best = suggestions[0] || null;
  if (best && best.score >= 0.72) {
    return best.value;
  }

  const ai = await requestAiCanonicalValue({
    field: 'model',
    transcript,
    allowedValues: MODEL_CODES,
    topSuggestions: suggestions.map((item) => item.value)
  });

  if (ai?.value) {
    return ai.value;
  }

  if (best && best.score >= 0.58) {
    return best.value;
  }

  return null;
}

function normalizeDamageClass(text) {
  const lower = String(text || '').trim().toLowerCase();
  if (!lower) return null;
  if (lower.includes('none') || lower.includes('ok')) return 'None';
  if (lower.includes('cut')) return 'Cut';
  if (lower.includes('crack')) return 'Crack';
  if (lower.includes('bulge') || lower.includes('bubble')) return 'Bulge';
  if (lower.includes('wear')) return 'Tread Wear';
  return null;
}

function normalizeSeverity(text) {
  const lower = String(text || '').trim().toLowerCase();
  if (!lower) return null;
  if (lower.includes('high') || lower.includes('critical')) return 'High';
  if (lower.includes('medium') || lower.includes('moderate')) return 'Medium';
  if (lower.includes('low') || lower.includes('minor')) return 'Low';
  return null;
}

function normalizeRemovalReason(text) {
  const lower = String(text || '').trim().toLowerCase();
  if (!lower) return null;
  if (lower.includes('scrap')) return 'Scrap';
  if (lower.includes('repair')) return 'Repair';
  if (lower.includes('spare')) return 'Spare';
  if (lower.includes('claim')) return 'Claim';
  return null;
}

function normalizeDisposition(text) {
  const reason = normalizeRemovalReason(text);
  if (reason) return reason;
  const lower = String(text || '').trim().toLowerCase();
  if (lower.includes('retread')) return 'Repair';
  return null;
}

function normalizeFitmentType(text) {
  const lower = String(text || '').trim().toLowerCase();
  if (!lower) return null;
  if (lower.includes('new') || lower.includes('fresh')) return 'New';
  if (lower.includes('old') || lower.includes('used') || lower.includes('retread')) return 'Old';
  return null;
}

function normalizeRiskLevel(text) {
  const lower = String(text || '').trim().toLowerCase();
  if (!lower) return null;
  if (lower.includes('high') || lower.includes('critical')) return 'High';
  if (lower.includes('medium') || lower.includes('moderate')) return 'Medium';
  if (lower.includes('low') || lower.includes('minor')) return 'Low';
  return null;
}

function extractNumberCandidates(text) {
  return extractSpokenNumberCandidates(text)
    .map((value) => numberOrNull(value))
    .filter((value) => Number.isFinite(value));
}

function selectNumberInRange(text, min, max) {
  const values = extractNumberCandidates(text);
  const picked = [...values]
    .filter((value) => value >= min && value <= max)
    .sort((left, right) => right - left)[0];
  return Number.isFinite(picked) ? picked : null;
}

function inferFieldFromStepId(stepId) {
  const normalized = String(stepId || '').trim().toLowerCase();
  if (!normalized) return null;

  if (normalized.includes('tyre_serial')) return 'tyre_serial';
  if (normalized.includes('make')) return 'make';
  if (normalized.includes('model')) return 'model';
  if (normalized.includes('size')) return 'size';
  if (normalized.includes('otd')) return 'otd';
  if (normalized.includes('vehicle_no')) return 'vehicle_no';
  if (normalized.includes('position_code')) return 'position_code';
  if (normalized.includes('meter_reading') || normalized.includes('odometer')) return 'meter_reading';
  if (normalized.includes('fitment_type') || normalized.includes('tyre_condition') || normalized.includes('new_old')) return 'fitment_type';
  if (normalized.includes('found_psi')) return 'found_psi';
  if (normalized.includes('target_psi')) return 'target_psi';
  if (normalized.includes('action')) return 'action';
  if (normalized.includes('fitment_reading')) return 'fitment_reading';
  if (normalized.includes('current_reading')) return 'current_reading';
  if (normalized.includes('removal_reason')) return 'removal_reason';
  if (normalized.includes('disposition')) return 'disposition';
  if (normalized.includes('rtd1')) return 'rtd1';
  if (normalized.includes('rtd2')) return 'rtd2';
  if (normalized.includes('damage_class')) return 'damage_class';
  if (normalized.includes('severity')) return 'severity';
  if (normalized.includes('remarks')) return 'remarks';
  if (normalized.includes('subcategory')) return 'subcategory';
  if (normalized.includes('observation_type')) return 'category';
  if (normalized.includes('category')) return 'category';
  if (normalized.includes('summary_text')) return 'summary_text';
  if (normalized.includes('risk_level')) return 'risk_level';
  if (normalized.includes('suggested_action')) return 'suggested_action';

  return null;
}

function detectObservationSubcategoryAny(transcriptLower) {
  let best = null;
  for (const options of Object.values(OBSERVATION_SUBCATEGORY_KEYWORDS)) {
    for (const [subcategory, keywords] of Object.entries(options)) {
      const score = keywords.reduce(
        (acc, keyword) => (transcriptLower.includes(keyword) ? acc + 1 : acc),
        0
      );
      if (!best || score > best.score) {
        best = { subcategory, score };
      }
    }
  }

  if (!best || best.score === 0) return null;
  return best.subcategory;
}

function detectObservationCategory(transcriptLower) {
  let best = null;
  for (const [category, keywords] of Object.entries(OBSERVATION_CATEGORY_KEYWORDS)) {
    const score = keywords.reduce(
      (acc, keyword) => (transcriptLower.includes(keyword) ? acc + 1 : acc),
      0
    );
    if (!best || score > best.score) {
      best = { category, score };
    }
  }
  if (!best || best.score === 0) return null;
  return best.category;
}

function detectObservationSubcategory(category, transcriptLower) {
  const options = OBSERVATION_SUBCATEGORY_KEYWORDS[category];
  if (!options) return null;

  let best = null;
  for (const [subcategory, keywords] of Object.entries(options)) {
    const score = keywords.reduce(
      (acc, keyword) => (transcriptLower.includes(keyword) ? acc + 1 : acc),
      0
    );
    if (!best || score > best.score) {
      best = { subcategory, score };
    }
  }

  if (!best || best.score === 0) return null;
  return best.subcategory;
}

function detectRiskLevel(transcriptLower, category) {
  if (/\b(critical|danger|immediate|unsafe|burst)\b/.test(transcriptLower)) {
    return 'High';
  }
  if (category === 'Safety') {
    return 'High';
  }
  if (/\b(monitor|check|watch|minor)\b/.test(transcriptLower)) {
    return 'Low';
  }
  if (category === 'Pressure') {
    return 'Medium';
  }
  return null;
}

function extractSuggestedAction(transcript) {
  const text = String(transcript || '').trim();
  if (!text) return null;

  const actionMatch = text.match(/(?:need to|needs to|should|must|recommend(?:ed)?\s+to)\s+([^.;!?]+)/i);
  if (actionMatch && actionMatch[1]) {
    return actionMatch[1].trim();
  }

  if (/\b(replace|replacement)\b/i.test(text)) return 'Replace tyre and verify condition';
  if (/\b(repair|patch)\b/i.test(text)) return 'Repair and inspect before reuse';
  if (/\b(add air|inflate|air top up)\b/i.test(text)) return 'Inflate to recommended PSI and recheck';
  return null;
}

async function extractPreferredFieldsFromTranscript({ transcript, formType, stepId }) {
  const cleaned = String(transcript || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return {};
  }

  const lower = cleaned.toLowerCase();
  const normalizedForm = String(formType || '').trim().toLowerCase();
  const stepField = inferFieldFromStepId(stepId);
  const preferred = {};

  if (!stepField || stepField === 'vehicle_no') {
    const vehicle = extractVehicleNoCandidate(cleaned);
    if (vehicle) {
      preferred.vehicle_no = vehicle;
    }
  }

  if (!stepField || stepField === 'position_code') {
    const position = await resolvePositionCodeSmart(cleaned);
    if (position) {
      preferred.position_code = position;
    }
  }

  if (stepField === 'tyre_serial') {
    preferred.tyre_serial = normalizeTyreSerial(cleaned);
  }

  if (stepField === 'make') {
    preferred.make = detectTyreMake(cleaned);
  }

  if (stepField === 'model') {
    preferred.model = await resolveTyreModelSmart(cleaned);
  }

  if (stepField === 'size') {
    preferred.size = await resolveTyreSizeSmart(cleaned);
  }

  if (stepField === 'otd') {
    const value = selectNumberInRange(cleaned, 0, 40);
    preferred.otd = Number.isFinite(value) ? Number(value.toFixed(2)) : null;
  }

  if (stepField === 'vehicle_no' && !preferred.vehicle_no) {
    preferred.vehicle_no = normalizeVehicleNo(cleaned);
  }

  if (stepField === 'position_code' && !preferred.position_code) {
    preferred.position_code = await resolvePositionCodeSmart(cleaned);
  }

  if (stepField === 'meter_reading') {
    const value = selectNumberInRange(cleaned, 1000, 2000000);
    preferred.meter_reading = Number.isFinite(value) ? Math.round(value) : null;
  }

  if (stepField === 'fitment_type') {
    preferred.fitment_type = normalizeFitmentType(cleaned);
  }

  if (stepField === 'found_psi') {
    const value = selectNumberInRange(cleaned, 30, 200);
    preferred.found_psi = Number.isFinite(value) ? Number(value.toFixed(2)) : null;
  }

  if (stepField === 'target_psi') {
    const value = selectNumberInRange(cleaned, 30, 200);
    preferred.target_psi = Number.isFinite(value) ? Number(value.toFixed(2)) : null;
  }

  if (stepField === 'action') {
    preferred.action = cleaned.slice(0, 160);
  }

  if (stepField === 'fitment_reading') {
    const value = selectNumberInRange(cleaned, 0, 2000000);
    preferred.fitment_reading = Number.isFinite(value) ? Math.round(value) : null;
  }

  if (stepField === 'current_reading') {
    const value = selectNumberInRange(cleaned, 0, 2000000);
    preferred.current_reading = Number.isFinite(value) ? Math.round(value) : null;
  }

  if (stepField === 'removal_reason') {
    preferred.removal_reason = normalizeRemovalReason(cleaned);
  }

  if (stepField === 'disposition') {
    preferred.disposition = normalizeDisposition(cleaned);
  }

  if (stepField === 'rtd1') {
    const value = selectNumberInRange(cleaned, 0, 40);
    preferred.rtd1 = Number.isFinite(value) ? Number(value.toFixed(2)) : null;
  }

  if (stepField === 'rtd2') {
    const value = selectNumberInRange(cleaned, 0, 40);
    preferred.rtd2 = Number.isFinite(value) ? Number(value.toFixed(2)) : null;
  }

  if (stepField === 'damage_class') {
    preferred.damage_class = normalizeDamageClass(cleaned);
  }

  if (stepField === 'severity') {
    preferred.severity = normalizeSeverity(cleaned);
  }

  if (stepField === 'remarks') {
    preferred.remarks = cleaned.slice(0, 220);
  }

  if (stepField === 'category') {
    preferred.category = detectObservationCategory(lower);
  }

  if (stepField === 'subcategory') {
    const category = detectObservationCategory(lower);
    preferred.subcategory = category
      ? detectObservationSubcategory(category, lower)
      : detectObservationSubcategoryAny(lower);
  }

  if (stepField === 'summary_text') {
    preferred.summary_text = cleaned.slice(0, 280);
  }

  if (stepField === 'risk_level') {
    preferred.risk_level = normalizeRiskLevel(cleaned);
  }

  if (stepField === 'suggested_action') {
    preferred.suggested_action = cleaned.slice(0, 220);
  }

  const shouldInferObservation = normalizedForm === 'observation' && (
    !stepField
    || stepField === 'category'
    || stepField === 'subcategory'
    || stepField === 'summary_text'
    || stepField === 'risk_level'
    || stepField === 'suggested_action'
  );

  if (shouldInferObservation) {
    if (!preferred.summary_text) {
      preferred.summary_text = cleaned.slice(0, 280);
    }

    if (!preferred.category) {
      preferred.category = detectObservationCategory(lower);
    }

    if (!preferred.subcategory && preferred.category) {
      preferred.subcategory = detectObservationSubcategory(preferred.category, lower);
    }

    if (!preferred.risk_level) {
      preferred.risk_level = detectRiskLevel(lower, preferred.category || null);
    }

    if (!preferred.suggested_action) {
      preferred.suggested_action = extractSuggestedAction(cleaned);
    }
  }

  const shouldInferPressure = normalizedForm === 'pressure_check' && (
    !stepField
    || stepField === 'found_psi'
    || stepField === 'target_psi'
  );

  if (shouldInferPressure) {
    if (!Number.isFinite(numberOrNull(preferred.found_psi))) {
      const found = selectNumberInRange(cleaned, 30, 200);
      if (Number.isFinite(found)) {
        preferred.found_psi = Number(found.toFixed(2));
      }
    }
  }

  const shouldInferTyreCard = normalizedForm === 'tyre_card' && (
    !stepField
    || stepField === 'tyre_serial'
    || stepField === 'make'
    || stepField === 'model'
    || stepField === 'size'
  );

  if (shouldInferTyreCard) {
    const sizeInferenceAllowed = !stepField
      || stepField === 'size'
      || /\bSIZE\b|\b\d{2,3}\s*R\s*\d{2}\b|\b\d{3}\s*\/\s*\d{2}\b/.test(cleaned);

    if (!preferred.make) {
      preferred.make = detectTyreMake(cleaned);
    }
    if (!preferred.model) {
      preferred.model = await resolveTyreModelSmart(cleaned);
    }
    if (!preferred.size && sizeInferenceAllowed) {
      preferred.size = await resolveTyreSizeSmart(cleaned);
    }
    if (!preferred.tyre_serial) {
      preferred.tyre_serial = normalizeTyreSerial(cleaned);
    }
    if (!preferred.fitment_type) {
      preferred.fitment_type = normalizeFitmentType(cleaned);
    }
  }

  const normalizedTyreSize = normalizeTyreSize(preferred.size);
  if (normalizedTyreSize) {
    preferred.size = normalizedTyreSize;
    const tyreType = deriveTyreTypeFromSize(normalizedTyreSize);
    if (tyreType) {
      preferred.tyre_type = tyreType;
    }
  }

  const shouldInferInspection = normalizedForm === 'tyre_inspection' && (
    !stepField
    || stepField === 'damage_class'
    || stepField === 'severity'
  );

  if (shouldInferInspection) {
    if (!preferred.damage_class) {
      preferred.damage_class = normalizeDamageClass(cleaned);
    }
    if (!preferred.severity) {
      preferred.severity = normalizeSeverity(cleaned);
    }
  }

  const shouldInferRemoval = normalizedForm === 'tyre_removal' && (
    !stepField
    || stepField === 'removal_reason'
    || stepField === 'disposition'
  );

  if (shouldInferRemoval) {
    if (!preferred.removal_reason) {
      preferred.removal_reason = normalizeRemovalReason(cleaned);
    }
    if (!preferred.disposition) {
      preferred.disposition = normalizeDisposition(cleaned);
    }
  }

  const compact = {};
  for (const [key, value] of Object.entries(preferred)) {
    if (value === null || value === undefined || value === '') continue;
    compact[key] = value;
  }

  return compact;
}

function buildTranscriptTokens(transcript, confidence) {
  const words = String(transcript || '')
    .split(/\s+/g)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 160);

  if (words.length === 0) {
    return [];
  }

  const tokenConfidence = Number.isFinite(Number(confidence))
    ? Math.max(0.35, Math.min(0.99, Number(confidence)))
    : 0.75;

  return words.map((word) => ({
    text: word,
    confidence: tokenConfidence,
    bounding_box: null
  }));
}

function recognizeOnce(client, request, metadata) {
  return new Promise((resolve, reject) => {
    client.Recognize(request, metadata, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(response || {});
    });
  });
}

export async function transcribeAudioBuffer({
  audioBuffer,
  stepId,
  formType,
  languageCode = getAsrLanguage()
}) {
  const apiKey = getAsrApiKey();
  if (!apiKey) {
    return {
      model: getAsrModel(),
      transcript: '',
      confidence: 0,
      alternatives: [],
      tokens: [],
      full_text: '',
      error: 'Voice AI key missing (set NVIDIA_ASR_API_KEY or NVIDIA_OCR_API_KEY)',
      extracted_data: {
        preferred_fields: {}
      }
    };
  }

  const functionId = getAsrFunctionId();
  if (!functionId) {
    return {
      model: getAsrModel(),
      transcript: '',
      confidence: 0,
      alternatives: [],
      tokens: [],
      full_text: '',
      error: 'NVIDIA_ASR_FUNCTION_ID missing',
      extracted_data: {
        preferred_fields: {}
      }
    };
  }

  const parsed = parseWavPcm16(audioBuffer);

  await enforceRateLimit();
  const client = await getAsrClient();

  const metadata = new grpc.Metadata();
  metadata.set('authorization', `Bearer ${apiKey}`);
  metadata.set('function-id', functionId);

  const requestedModel = getAsrModel();
  const modelForRequest = requestedModel && !skipConfiguredModel
    ? requestedModel
    : null;
  const requestWithModel = buildRecognizeRequest({
    parsed,
    formType,
    stepId,
    languageCode,
    model: modelForRequest
  });

  try {
    let response = null;
    let usedModel = modelForRequest || 'server-default';

    try {
      response = await recognizeOnce(client, requestWithModel, metadata);
    } catch (error) {
      if (!modelForRequest || !isModelUnavailableError(error)) {
        throw error;
      }

      skipConfiguredModel = true;

      const fallbackRequest = buildRecognizeRequest({
        parsed,
        formType,
        stepId,
        languageCode,
        model: null
      });

      response = await recognizeOnce(client, fallbackRequest, metadata);
      usedModel = 'server-default';
    }

    const decoded = decodeAsrResponse(response);
    const preferredFields = await extractPreferredFieldsFromTranscript({
      transcript: decoded.transcript,
      formType,
      stepId
    });
    const tokens = buildTranscriptTokens(decoded.transcript, decoded.confidence);

    return {
      model: usedModel,
      transcript: decoded.transcript,
      confidence: decoded.confidence,
      alternatives: decoded.alternatives,
      tokens,
      full_text: decoded.transcript,
      sample_rate_hz: parsed.sampleRateHertz,
      duration_seconds: Number(parsed.durationSeconds.toFixed(2)),
      channels: parsed.channels,
      error: null,
      extracted_data: {
        preferred_fields: preferredFields
      }
    };
  } catch (error) {
    return {
      model: getAsrModel(),
      transcript: '',
      confidence: 0,
      alternatives: [],
      tokens: [],
      full_text: '',
      sample_rate_hz: parsed.sampleRateHertz,
      duration_seconds: Number(parsed.durationSeconds.toFixed(2)),
      channels: parsed.channels,
      error: normalizeAsrErrorMessage(error),
      extracted_data: {
        preferred_fields: {}
      }
    };
  }
}

export async function runAsrForMediaRows({ supabase, mediaRows, bucket, formType }) {
  const asrByStep = {};

  for (const row of mediaRows || []) {
    const mediaKind = String(row.media_kind || '').toLowerCase();
    if (mediaKind !== 'audio') {
      continue;
    }

    if (!row.storage_path) {
      asrByStep[row.step_id] = {
        model: getAsrModel(),
        transcript: '',
        confidence: 0,
        alternatives: [],
        error: 'Missing storage path',
        duration_seconds: null,
        sample_rate_hz: null,
        channels: null,
        extracted_data: {
          preferred_fields: {}
        }
      };
      continue;
    }

    try {
      const { data, error } = await supabase
        .storage
        .from(bucket)
        .download(row.storage_path);

      if (error || !data) {
        asrByStep[row.step_id] = {
          model: getAsrModel(),
          transcript: '',
          confidence: 0,
          alternatives: [],
          error: error?.message || 'Audio download failed',
          duration_seconds: null,
          sample_rate_hz: null,
          channels: null,
          extracted_data: {
            preferred_fields: {}
          }
        };
        continue;
      }

      const audioBuffer = Buffer.from(await data.arrayBuffer());
      asrByStep[row.step_id] = await transcribeAudioBuffer({
        audioBuffer,
        stepId: row.step_id,
        formType
      });
    } catch (error) {
      asrByStep[row.step_id] = {
        model: getAsrModel(),
        transcript: '',
        confidence: 0,
        alternatives: [],
        error: error.message || 'ASR processing failed',
        duration_seconds: null,
        sample_rate_hz: null,
        channels: null,
        extracted_data: {
          preferred_fields: {}
        }
      };
    }
  }

  return asrByStep;
}
