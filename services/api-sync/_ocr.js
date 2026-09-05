const OCR_MODEL = 'nemoretriever-ocr-v1';
const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_CLASSIFIER_TIMEOUT_MS = 12000;
const DEFAULT_CHAT_COMPLETIONS_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const DEFAULT_VISION_MODEL = 'meta/llama-3.2-11b-vision-instruct';
const OCR_ENABLED_CATEGORIES = new Set([
  'Pressure_Gauge',
  'Dashboard_Cluster',
  'Cabin_Number',
  'Tyre_Sidewall',
  'Tread_Depth_Gauge'
]);

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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeCategory(value) {
  const key = String(value || '').trim().toLowerCase();
  return CATEGORY_ALIASES[key] || null;
}

function toNormalizedStepId(stepId) {
  return String(stepId || '').trim().toLowerCase();
}

function normalizeLabels(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((label) => String(label || '').trim())
    .filter(Boolean);
}

function normalizeMeta(meta) {
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    return meta;
  }
  return {};
}

function readAscii(view, offset, length) {
  let text = '';
  for (let i = 0; i < length && offset + i < view.byteLength; i += 1) {
    text += String.fromCharCode(view.getUint8(offset + i));
  }
  return text;
}

function findIfdValue(view, ifdOffset, littleEndian, targetTag, tiffStart) {
  if (ifdOffset + 2 > view.byteLength) return null;
  const count = view.getUint16(ifdOffset, littleEndian);

  for (let index = 0; index < count; index += 1) {
    const entryOffset = ifdOffset + 2 + index * 12;
    if (entryOffset + 12 > view.byteLength) return null;

    const tag = view.getUint16(entryOffset, littleEndian);
    if (tag !== targetTag) continue;

    const type = view.getUint16(entryOffset + 2, littleEndian);
    const valueCount = view.getUint32(entryOffset + 4, littleEndian);
    if (type !== 4 || valueCount < 1) return null;

    return view.getUint32(entryOffset + 8, littleEndian);
  }

  return null;
}

function findAsciiTagValue(view, ifdOffset, littleEndian, targetTag, tiffStart) {
  if (ifdOffset + 2 > view.byteLength) return null;
  const count = view.getUint16(ifdOffset, littleEndian);

  for (let index = 0; index < count; index += 1) {
    const entryOffset = ifdOffset + 2 + index * 12;
    if (entryOffset + 12 > view.byteLength) return null;

    const tag = view.getUint16(entryOffset, littleEndian);
    if (tag !== targetTag) continue;

    const type = view.getUint16(entryOffset + 2, littleEndian);
    const valueCount = view.getUint32(entryOffset + 4, littleEndian);
    if (type !== 2 || valueCount < 1) return null;

    const valueSize = valueCount;
    const valueOffset = valueSize <= 4
      ? (entryOffset + 8)
      : (tiffStart + view.getUint32(entryOffset + 8, littleEndian));

    if (valueOffset + valueSize > view.byteLength) return null;
    return readAscii(view, valueOffset, valueCount).replace(/\x00+$/, '').trim() || null;
  }

  return null;
}

function parseExifDateFromTiff(view, tiffStart) {
  if (tiffStart + 8 > view.byteLength) return null;

  const order = readAscii(view, tiffStart, 2);
  const littleEndian = order === 'II';
  if (!littleEndian && order !== 'MM') return null;

  const magic = view.getUint16(tiffStart + 2, littleEndian);
  if (magic !== 42) return null;

  const ifd0Offset = view.getUint32(tiffStart + 4, littleEndian);
  const ifd0 = tiffStart + ifd0Offset;
  const exifPointer = findIfdValue(view, ifd0, littleEndian, 0x8769, tiffStart);
  if (!Number.isFinite(exifPointer)) return null;

  const exifIfd = tiffStart + exifPointer;
  return findAsciiTagValue(view, exifIfd, littleEndian, 0x9003, tiffStart);
}

function extractExifDateFromArrayBuffer(arrayBuffer) {
  try {
    const view = new DataView(arrayBuffer);
    if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) {
      return null;
    }

    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      if (view.getUint8(offset) !== 0xff) break;

      const marker = view.getUint8(offset + 1);
      offset += 2;

      if (marker === 0xd9 || marker === 0xda) break;
      if (offset + 2 > view.byteLength) break;

      const segmentLength = view.getUint16(offset, false);
      if (segmentLength < 2 || offset + segmentLength > view.byteLength) break;

      if (marker === 0xe1) {
        const dataStart = offset + 2;
        const exifHeader = readAscii(view, dataStart, 6);
        if (exifHeader === 'Exif\x00\x00') {
          const tiffStart = dataStart + 6;
          const parsed = parseExifDateFromTiff(view, tiffStart);
          if (parsed) return parsed;
        }
      }

      offset += segmentLength;
    }
  } catch {
    return null;
  }

  return null;
}

function inferRoutingFromStep({ formType, stepId }) {
  const normalizedForm = String(formType || '').trim().toLowerCase();
  const normalizedStep = toNormalizedStepId(stepId);

  if (normalizedForm === 'pressure_check') {
    return {
      photo_category: 'Pressure_Gauge',
      classifier: 'guided_step_router_v1',
      category_confidence: 0.93,
      classifier_labels: ['clock', 'stop sign']
    };
  }

  if (normalizedStep.includes('tread')) {
    return {
      photo_category: 'Tread_Depth_Gauge',
      classifier: 'guided_step_router_v1',
      category_confidence: 0.92,
      classifier_labels: ['ruler']
    };
  }

  if (
    normalizedStep.includes('serial')
    || normalizedStep.includes('sidewall')
    || normalizedStep.includes('before_removal')
    || normalizedStep.includes('after_removal')
  ) {
    return {
      photo_category: 'Tyre_Sidewall',
      classifier: 'guided_step_router_v1',
      category_confidence: 0.91,
      classifier_labels: ['tire', 'wheel']
    };
  }

  if (normalizedStep.includes('odometer') || normalizedStep.includes('dashboard')) {
    return {
      photo_category: 'Dashboard_Cluster',
      classifier: 'guided_step_router_v1',
      category_confidence: 0.9,
      classifier_labels: ['tv', 'laptop', 'cell phone']
    };
  }

  if (normalizedStep.includes('truck') || normalizedStep.includes('cabin')) {
    return {
      photo_category: 'Cabin_Number',
      classifier: 'guided_step_router_v1',
      category_confidence: 0.9,
      classifier_labels: ['truck']
    };
  }

  if (normalizedStep.includes('gauge')) {
    return {
      photo_category: 'Pressure_Gauge',
      classifier: 'guided_step_router_v1',
      category_confidence: 0.86,
      classifier_labels: ['clock']
    };
  }

  if (normalizedForm === 'tyre_card') {
    return {
      photo_category: 'Tyre_Sidewall',
      classifier: 'guided_step_router_v1',
      category_confidence: 0.78,
      classifier_labels: ['tire']
    };
  }

  return {
    photo_category: 'Miscellaneous',
    classifier: 'guided_step_router_v1',
    category_confidence: 0.55,
    classifier_labels: []
  };
}

export function resolvePhotoRouting({ formType, stepId, metaJson }) {
  const meta = normalizeMeta(metaJson);
  const pipeline = normalizeMeta(meta.pipeline);
  const inferred = inferRoutingFromStep({ formType, stepId });

  const providedCategory = normalizeCategory(pipeline.photo_category || meta.photo_category);
  const providedConfidence = Number(pipeline.category_confidence ?? meta.category_confidence);
  const providedLabels = normalizeLabels(
    pipeline.classifier_labels
    || pipeline.labels
    || meta.classifier_labels
    || meta.labels
  );
  const providedClassifier = String(
    pipeline.classifier
    || meta.classifier
    || ''
  ).trim();

  return {
    photo_category: providedCategory || inferred.photo_category,
    classifier: providedClassifier || inferred.classifier,
    category_confidence: Number.isFinite(providedConfidence)
      ? Number(clamp(providedConfidence, 0.01, 0.99).toFixed(4))
      : inferred.category_confidence,
    classifier_labels: providedLabels.length > 0 ? providedLabels : inferred.classifier_labels
  };
}

export function isOcrCategoryEnabled(photoCategory) {
  return OCR_ENABLED_CATEGORIES.has(String(photoCategory || '').trim());
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
    return {
      routing: externalRouting,
      usedExternal: true,
      reason: 'guided_misc'
    };
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

function normalizeRoutingFromExternal(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const category = normalizeCategory(payload.photo_category || payload.category || payload.label);
  if (!category) {
    return null;
  }

  const confidence = Number(payload.category_confidence ?? payload.confidence ?? 0.8);
  const labels = normalizeLabels(payload.classifier_labels || payload.labels || payload.detected_labels || []);
  const classifier = String(payload.classifier || payload.model || 'external_vision_classifier').trim() || 'external_vision_classifier';
  const exifDate = String(payload.exif_datetime_original || payload.exifDateTimeOriginal || '').trim() || null;

  return {
    photo_category: category,
    classifier,
    category_confidence: Number(clamp(Number.isFinite(confidence) ? confidence : 0.8, 0.01, 0.99).toFixed(4)),
    classifier_labels: labels,
    exif_datetime_original: exifDate
  };
}

async function requestExternalVisionClassifier({
  endpoint,
  token,
  formType,
  stepId,
  mimeType,
  base64Image
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_CLASSIFIER_TIMEOUT_MS);

  try {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        form_type: formType,
        step_id: stepId,
        image: `data:${mimeType};base64,${base64Image}`
      }),
      signal: controller.signal
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = json?.error || json?.message || `Classifier HTTP ${response.status}`;
      throw new Error(message);
    }

    const normalized = normalizeRoutingFromExternal(json);
    if (!normalized) {
      throw new Error('Classifier response missing category');
    }

    return normalized;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeToken(token) {
  if (!token) return null;
  const text = String(token.text || token.value || '').trim();
  if (!text) return null;

  const confidenceRaw = token.confidence_score ?? token.confidence ?? token.score ?? 0.8;
  const confidence = Number.isFinite(Number(confidenceRaw))
    ? Number(clamp(Number(confidenceRaw), 0, 1).toFixed(4))
    : 0.8;

  return {
    text,
    confidence,
    bounding_box: token.bounding_box || token.bbox || token.box || null
  };
}

function parseTextBlock(content = '') {
  return String(content)
    .split(/\n|\t|\s{2,}/g)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((text) => ({ text, confidence: 0.75, bounding_box: null }));
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

function parseJsonObjectFromText(content = '') {
  const sanitized = stripCodeFence(content);
  if (!sanitized) return null;

  const direct = tryParseJson(sanitized);
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
    return direct;
  }

  const firstBrace = sanitized.indexOf('{');
  const lastBrace = sanitized.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    return null;
  }

  const candidate = sanitized.slice(firstBrace, lastBrace + 1);
  const extracted = tryParseJson(candidate);
  if (extracted && typeof extracted === 'object' && !Array.isArray(extracted)) {
    return extracted;
  }

  return null;
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function textOrNull(value, { upper = false } = {}) {
  const text = String(value || '').trim();
  if (!text) return null;
  return upper ? text.toUpperCase() : text;
}

function numberOrNull(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function normalizeSerial(value) {
  const text = textOrNull(value, { upper: true });
  if (!text) return null;
  const compact = text.replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '');
  if (compact.length < 5 || compact.length > 24) return null;
  return compact;
}

function normalizeTyreSize(value) {
  const text = textOrNull(value, { upper: true });
  if (!text) return null;
  const match = text.match(/\b\d{2,3}(?:\.\d{2})?R\d{2}\b|\b\d{3}\/\d{2}R\d{2}\b/);
  return match ? match[0] : text;
}

function normalizeVehicleNo(value) {
  const text = textOrNull(value, { upper: true });
  if (!text) return null;
  const compact = text.replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '');
  return compact || null;
}

function normalizePositionCode(value) {
  const text = textOrNull(value, { upper: true });
  if (!text) return null;
  const compact = text.replace(/\s+/g, '').replace(/[^A-Z0-9]/g, '');
  return compact || null;
}

function normalizeTyreMake(value) {
  const text = textOrNull(value);
  if (!text) return null;

  const known = ['MRF', 'Apollo', 'Bridgestone', 'JK', 'CEAT', 'Yokohama', 'Goodyear'];
  const upper = text.toUpperCase();
  const match = known.find((item) => upper.includes(item.toUpperCase()));
  return match || text;
}

function buildVisionExtractionPrompt({ formType, stepId, photoCategory }) {
  const normalizedForm = String(formType || '').trim().toLowerCase();
  const normalizedStep = String(stepId || '').trim().toLowerCase();

  if (normalizedForm === 'tyre_card' && normalizedStep.includes('serial')) {
    return [
      'Read only clearly visible tyre sidewall text.',
      'Return strict JSON with keys: visible_text, tyre_serial, make, size.',
      'Rules:',
      '- tyre_serial can be numeric-only or alpha-numeric.',
      '- If unsure, keep value null.',
      '- Do not guess unseen text.'
    ].join('\n');
  }

  if (normalizedForm === 'tyre_card' && (normalizedStep.includes('brand_size') || normalizedStep.includes('size'))) {
    return [
      'Read tyre brand and tyre size text from sidewall.',
      'Return strict JSON with keys: visible_text, make, size.',
      'If a value is not clearly visible, set it to null. Do not guess.'
    ].join('\n');
  }

  if (normalizedForm === 'tyre_card' && normalizedStep.includes('tread')) {
    return [
      'Read tread depth gauge value from this image.',
      'Return strict JSON with keys: visible_text, otd.',
      'otd must be numeric in mm. If unreadable set null. Do not guess.'
    ].join('\n');
  }

  if (normalizedForm === 'tyre_card' && (normalizedStep.includes('truck') || normalizedStep.includes('position'))) {
    return [
      'Extract truck identifier and tyre position marker if visible.',
      'Return strict JSON with keys: visible_text, vehicle_no, position_code.',
      'If either field is not clearly visible, set null. Do not guess.'
    ].join('\n');
  }

  if (normalizedForm === 'tyre_card' && normalizedStep.includes('odometer')) {
    return [
      'Extract odometer reading from dashboard image.',
      'Return strict JSON with keys: visible_text, meter_reading.',
      'meter_reading must be integer. If unreadable set null.'
    ].join('\n');
  }

  if (normalizedForm === 'pressure_check') {
    return [
      'Extract tyre pressure reading from gauge image.',
      'Return strict JSON with keys: visible_text, found_psi, target_psi, position_code.',
      'If a field is not visible set it to null. Do not guess.'
    ].join('\n');
  }

  return [
    `Extract readable text from ${photoCategory || 'this image'}.`,
    'Return strict JSON with keys: visible_text.',
    'Do not use markdown. Do not hallucinate unreadable text.'
  ].join('\n');
}

function normalizePreferredFields({ formType, stepId, parsed }) {
  const normalizedForm = String(formType || '').trim().toLowerCase();
  const normalizedStep = String(stepId || '').trim().toLowerCase();
  const source = parsed?.preferred_fields && typeof parsed.preferred_fields === 'object'
    ? parsed.preferred_fields
    : parsed;

  const preferred = {};

  if (normalizedForm === 'tyre_card' && normalizedStep.includes('serial')) {
    preferred.tyre_serial = normalizeSerial(source?.tyre_serial);
    preferred.make = normalizeTyreMake(source?.make);
    preferred.size = normalizeTyreSize(source?.size);
    return preferred;
  }

  if (normalizedForm === 'tyre_card' && (normalizedStep.includes('brand_size') || normalizedStep.includes('size'))) {
    preferred.make = normalizeTyreMake(source?.make);
    preferred.size = normalizeTyreSize(source?.size);
    return preferred;
  }

  if (normalizedForm === 'tyre_card' && normalizedStep.includes('tread')) {
    const otd = numberOrNull(source?.otd);
    preferred.otd = Number.isFinite(otd) && otd >= 0 && otd <= 40
      ? Number(otd.toFixed(2))
      : null;
    return preferred;
  }

  if (normalizedForm === 'tyre_card' && (normalizedStep.includes('truck') || normalizedStep.includes('position'))) {
    preferred.vehicle_no = normalizeVehicleNo(source?.vehicle_no);
    preferred.position_code = normalizePositionCode(source?.position_code);
    return preferred;
  }

  if (normalizedForm === 'tyre_card' && normalizedStep.includes('odometer')) {
    const meter = numberOrNull(source?.meter_reading);
    preferred.meter_reading = Number.isFinite(meter) && meter >= 1000 && meter <= 2000000
      ? Math.round(meter)
      : null;
    return preferred;
  }

  if (normalizedForm === 'pressure_check') {
    const found = numberOrNull(source?.found_psi);
    const target = numberOrNull(source?.target_psi);
    preferred.found_psi = Number.isFinite(found) ? Number(found.toFixed(2)) : null;
    preferred.target_psi = Number.isFinite(target) ? Number(target.toFixed(2)) : null;
    preferred.position_code = normalizePositionCode(source?.position_code);
    return preferred;
  }

  return preferred;
}

function buildTokensFromPreferred(preferred = {}) {
  const tokens = [];
  for (const value of Object.values(preferred)) {
    if (value === null || value === undefined || value === '') continue;
    tokens.push({
      text: String(value),
      confidence: 0.9,
      bounding_box: null
    });
  }
  return tokens;
}

async function requestVisionChatExtraction({
  endpoint,
  apiKey,
  model,
  mimeType,
  base64Image,
  formType,
  stepId,
  photoCategory
}) {
  const prompt = buildVisionExtractionPrompt({ formType, stepId, photoCategory });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

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
        max_tokens: 220,
        messages: [
          {
            role: 'system',
            content: 'You are an OCR extraction assistant for tyre maintenance photos. Return strict JSON only, no markdown.'
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`
                }
              }
            ]
          }
        ]
      }),
      signal: controller.signal
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = json?.error?.message || json?.error || json?.message || `HTTP ${response.status}`;
      throw new Error(`Vision OCR request failed: ${message}`);
    }

    const content = String(json?.choices?.[0]?.message?.content || '').trim();
    const parsed = parseJsonObjectFromText(content);
    const preferred = normalizePreferredFields({ formType, stepId, parsed });

    const visibleText = textOrNull(parsed?.visible_text)
      || textOrNull(parsed?.full_text)
      || textOrNull(content);

    const tokens = [];
    if (visibleText) {
      tokens.push(...parseTextBlock(visibleText));
    }
    tokens.push(...buildTokensFromPreferred(preferred));

    return {
      model,
      tokens,
      full_text: visibleText || '',
      raw: json,
      extracted_data: {
        preferred_fields: preferred,
        raw_content: content,
        parser: parsed ? 'json' : 'text'
      }
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeOcrResponse(payload) {
  const tokens = [];

  const collectArrayTokens = (array) => {
    if (!Array.isArray(array)) return;
    for (const item of array) {
      const token = normalizeToken(item);
      if (token) tokens.push(token);
    }
  };

  collectArrayTokens(payload?.tokens);
  collectArrayTokens(payload?.data);
  collectArrayTokens(payload?.output);
  collectArrayTokens(payload?.predictions);

  if (Array.isArray(payload?.result?.tokens)) {
    collectArrayTokens(payload.result.tokens);
  }

  if (Array.isArray(payload?.result?.lines)) {
    for (const line of payload.result.lines) {
      const token = normalizeToken(line);
      if (token) tokens.push(token);
    }
  }

  if (Array.isArray(payload?.choices)) {
    for (const choice of payload.choices) {
      const message = choice?.message?.content;
      if (typeof message === 'string') {
        tokens.push(...parseTextBlock(message));
      }
    }
  }

  if (typeof payload?.text === 'string') {
    tokens.push(...parseTextBlock(payload.text));
  }

  const unique = [];
  const seen = new Set();
  for (const token of tokens) {
    const key = `${token.text}|${token.confidence}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(token);
  }

  return {
    model: OCR_MODEL,
    tokens: unique,
    full_text: unique.map((token) => token.text).join(' ').trim(),
    raw: payload
  };
}

async function requestNvidiaOcr({ endpoint, apiKey, mimeType, base64Image }) {
  const attempts = [
    {
      model: OCR_MODEL,
      image: `data:${mimeType};base64,${base64Image}`
    },
    {
      model: OCR_MODEL,
      input: [
        {
          type: 'image_url',
          url: `data:${mimeType};base64,${base64Image}`
        }
      ]
    },
    {
      model: OCR_MODEL,
      input: [
        {
          type: 'image_base64',
          media_type: mimeType,
          data: base64Image
        }
      ]
    }
  ];

  let lastError = null;

  for (const payload of attempts) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        clearTimeout(timeout);
        const json = await response.json().catch(() => ({}));

        if (response.ok) {
          return normalizeOcrResponse(json);
        }

        const message = json?.error?.message || json?.error || json?.message || `HTTP ${response.status}`;
        lastError = new Error(`NVIDIA OCR request failed: ${message}`);

        if (response.status >= 500 && attempt < 2) {
          await delay(3000);
          continue;
        }
      } catch (error) {
        clearTimeout(timeout);
        lastError = error;
        if (attempt < 2) {
          await delay(3000);
          continue;
        }
      }

      break;
    }
  }

  throw lastError || new Error('NVIDIA OCR failed without response');
}

export async function extractTextFromImageBuffer({
  buffer,
  mimeType = 'image/jpeg',
  formType = null,
  stepId = null,
  photoCategory = null
}) {
  const apiKey = String(process.env.NVIDIA_OCR_API_KEY || '').trim();
  if (!apiKey) {
    return {
      model: OCR_MODEL,
      tokens: [],
      full_text: '',
      raw: null,
      error: 'NVIDIA_OCR_API_KEY missing'
    };
  }

  const chatEndpoint = String(process.env.NVIDIA_OCR_CHAT_ENDPOINT || DEFAULT_CHAT_COMPLETIONS_ENDPOINT).trim();
  const visionModel = String(process.env.NVIDIA_OCR_MODEL || DEFAULT_VISION_MODEL).trim();
  const legacyEndpoint = String(process.env.NVIDIA_OCR_ENDPOINT || '').trim();
  const base64Image = Buffer.from(buffer).toString('base64');
  const errors = [];

  try {
    return await requestVisionChatExtraction({
      endpoint: chatEndpoint,
      apiKey,
      model: visionModel,
      mimeType,
      base64Image,
      formType,
      stepId,
      photoCategory
    });
  } catch (error) {
    errors.push(error.message || 'Vision OCR chat call failed');
  }

  if (legacyEndpoint) {
    try {
      return await requestNvidiaOcr({ endpoint: legacyEndpoint, apiKey, mimeType, base64Image });
    } catch (error) {
      errors.push(error.message || 'Legacy OCR endpoint failed');
    }
  }

  return {
    model: visionModel || OCR_MODEL,
    tokens: [],
    full_text: '',
    raw: null,
    error: errors.join(' | ') || 'NVIDIA OCR failed'
  };
}

export async function runOcrForMediaRows({ supabase, mediaRows, bucket, formType }) {
  const ocrByStep = {};
  const classifierEndpoint = String(process.env.VISION_CLASSIFIER_ENDPOINT || '').trim();
  const classifierToken = String(process.env.VISION_CLASSIFIER_TOKEN || '').trim();

  for (const row of mediaRows || []) {
    const rowMeta = normalizeMeta(row.meta_json);
    const rowPipeline = normalizeMeta(rowMeta.pipeline);
    let exifDateTimeOriginal = String(rowPipeline.exif_datetime_original || rowMeta.exif_datetime_original || '').trim() || null;

    const initialRouting = resolvePhotoRouting({
      formType,
      stepId: row.step_id,
      metaJson: row.meta_json
    });

    const mediaKind = String(row.media_kind || '').toLowerCase();
    if (mediaKind && mediaKind !== 'image') {
      ocrByStep[row.step_id] = {
        model: OCR_MODEL,
        tokens: [],
        full_text: '',
        raw: null,
        error: 'Skipped non-image media',
        photo_category: initialRouting.photo_category,
        classifier: initialRouting.classifier,
        category_confidence: initialRouting.category_confidence,
        classifier_labels: initialRouting.classifier_labels,
        ocr_enabled: false,
        classifier_error: null,
        exif_datetime_original: exifDateTimeOriginal
      };
      continue;
    }

    if (!row.storage_path) {
      ocrByStep[row.step_id] = {
        model: OCR_MODEL,
        tokens: [],
        full_text: '',
        raw: null,
        error: 'Missing storage path',
        photo_category: initialRouting.photo_category,
        classifier: initialRouting.classifier,
        category_confidence: initialRouting.category_confidence,
        classifier_labels: initialRouting.classifier_labels,
        ocr_enabled: isOcrCategoryEnabled(initialRouting.photo_category),
        classifier_error: null,
        exif_datetime_original: exifDateTimeOriginal
      };
      continue;
    }

    let routing = initialRouting;
    let classifierError = null;
    let downloadedArrayBuffer = null;

    const mimeType = row.meta_json?.mime_type || row.meta_json?.mimeType || 'image/jpeg';

    try {
      if (classifierEndpoint || isOcrCategoryEnabled(initialRouting.photo_category)) {
        const { data, error } = await supabase
          .storage
          .from(bucket)
          .download(row.storage_path);

        if (error || !data) {
          ocrByStep[row.step_id] = {
            model: OCR_MODEL,
            tokens: [],
            full_text: '',
            raw: null,
            error: error?.message || 'Media download failed',
            photo_category: initialRouting.photo_category,
            classifier: initialRouting.classifier,
            category_confidence: initialRouting.category_confidence,
            classifier_labels: initialRouting.classifier_labels,
            ocr_enabled: isOcrCategoryEnabled(initialRouting.photo_category),
            classifier_error: null,
            exif_datetime_original: exifDateTimeOriginal
          };
          continue;
        }

        downloadedArrayBuffer = await data.arrayBuffer();
        if (!exifDateTimeOriginal) {
          exifDateTimeOriginal = extractExifDateFromArrayBuffer(downloadedArrayBuffer);
        }
      }

      if (classifierEndpoint && downloadedArrayBuffer) {
        try {
          const externalRouting = await requestExternalVisionClassifier({
            endpoint: classifierEndpoint,
            token: classifierToken,
            formType,
            stepId: row.step_id,
            mimeType,
            base64Image: Buffer.from(downloadedArrayBuffer).toString('base64')
          });

          if (externalRouting) {
            const selection = selectRouting(initialRouting, externalRouting);
            routing = selection.routing;

            if (externalRouting.exif_datetime_original && !exifDateTimeOriginal) {
              exifDateTimeOriginal = externalRouting.exif_datetime_original;
            }

            if (!selection.usedExternal && selection.reason && selection.reason.startsWith('external_')) {
              classifierError = `Using guided routing (${selection.reason.replace('external_', '')})`;
            }
          }
        } catch (error) {
          classifierError = error.message || 'External classifier failed';
        }
      }

      const baseEntry = {
        model: OCR_MODEL,
        tokens: [],
        full_text: '',
        raw: null,
        error: null,
        photo_category: routing.photo_category,
        classifier: routing.classifier,
        category_confidence: routing.category_confidence,
        classifier_labels: routing.classifier_labels,
        ocr_enabled: isOcrCategoryEnabled(routing.photo_category),
        classifier_error: classifierError,
        exif_datetime_original: exifDateTimeOriginal
      };

      if (!baseEntry.ocr_enabled) {
        ocrByStep[row.step_id] = baseEntry;
        continue;
      }

      if (!downloadedArrayBuffer) {
        const { data, error } = await supabase
        .storage
        .from(bucket)
        .download(row.storage_path);

        if (error || !data) {
          ocrByStep[row.step_id] = {
            ...baseEntry,
            error: error?.message || 'Media download failed'
          };
          continue;
        }

        downloadedArrayBuffer = await data.arrayBuffer();
        if (!exifDateTimeOriginal) {
          exifDateTimeOriginal = extractExifDateFromArrayBuffer(downloadedArrayBuffer);
        }
      }

      const result = await extractTextFromImageBuffer({
        buffer: downloadedArrayBuffer,
        mimeType,
        formType,
        stepId: row.step_id,
        photoCategory: baseEntry.photo_category
      });

      ocrByStep[row.step_id] = {
        ...baseEntry,
        ...result
      };
    } catch (error) {
      const fallbackEntry = {
        model: OCR_MODEL,
        tokens: [],
        full_text: '',
        raw: null,
        error: error.message || 'Unknown OCR error',
        photo_category: routing.photo_category,
        classifier: routing.classifier,
        category_confidence: routing.category_confidence,
        classifier_labels: routing.classifier_labels,
        ocr_enabled: isOcrCategoryEnabled(routing.photo_category),
        classifier_error: classifierError,
        exif_datetime_original: exifDateTimeOriginal
      };

      ocrByStep[row.step_id] = {
        ...fallbackEntry
      };
    }
  }

  return ocrByStep;
}
