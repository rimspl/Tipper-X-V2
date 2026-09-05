import { blobToDataUrl } from '../lib/media.js';
import {
  deriveTyreTypeFromSize,
  extractSpokenNumberCandidates,
  normalizePositionCode,
  normalizeSpokenAlphaNumeric,
  normalizeTyreModel,
  normalizeTyreSize,
  normalizeMake
} from '../../../shared/field-masters.js';

const OBSERVATION_DEFAULT_SUBCATEGORY = {
  Safety: 'Sidewall Cut',
  Wear: 'Uneven Wear',
  Pressure: 'Low Pressure',
  Fitment: 'Wrong Position'
};

const DEFAULT_TARGET_PSI = 120;

function parseNumericFromText(value, { roundInteger = false } = {}) {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }

  const candidates = extractSpokenNumberCandidates(raw);
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  const parsed = [...candidates]
    .map((candidate) => Number(candidate))
    .filter((candidate) => Number.isFinite(candidate))
    .sort((left, right) => Math.abs(right) - Math.abs(left))[0];

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return roundInteger ? Math.round(parsed) : Number(parsed.toFixed(2));
}

function normalizeVehicleIdentifier(value) {
  const compact = normalizeSpokenAlphaNumeric(value);
  if (!compact) {
    return null;
  }

  if (/^[A-Z]{1,4}[0-9]{1,4}$/.test(compact)) {
    return compact.replace(/^([A-Z]+)([0-9]+)$/i, '$1-$2');
  }

  return compact;
}

function normalizeFitmentType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes('new') || normalized.includes('fresh') || normalized.includes('naya') || normalized.includes('nai')) return 'New';
  if (normalized.includes('old') || normalized.includes('used') || normalized.includes('retread') || normalized.includes('purana') || normalized.includes('prana')) return 'Old';
  return null;
}

export function buildVoiceStepId(moduleId, dataKey) {
  const safeModule = String(moduleId || 'module').trim().toLowerCase().replace(/[^a-z0-9_\-]/g, '_');
  const safeField = String(dataKey || 'field').trim().toLowerCase().replace(/[^a-z0-9_\-]/g, '_');
  return `${safeModule}_${safeField}_voice`;
}

export async function requestVoiceExtraction({ audioBlob, formType, stepId, userId }) {
  const dataUrl = await blobToDataUrl(audioBlob);
  const response = await fetch('/api/v1/sync/voice-pipeline-preview', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId
    },
    body: JSON.stringify({
      form_type: formType,
      step_id: stepId,
      audio: dataUrl
    })
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) {
    throw new Error(json?.error || `Voice preview failed (${response.status})`);
  }

  const result = json.result || {};
  const extractedData = result.extracted_data && typeof result.extracted_data === 'object'
    ? result.extracted_data
    : { preferred_fields: {} };

  return {
    asrModel: result.asr_model || null,
    asrError: result.asr_error || null,
    transcript: String(result.asr_transcript || '').trim(),
    tokens: Array.isArray(result.asr_tokens) ? result.asr_tokens : [],
    confidence: Number.isFinite(Number(result.asr_confidence)) ? Number(result.asr_confidence) : null,
    durationSeconds: Number.isFinite(Number(result.duration_seconds)) ? Number(result.duration_seconds) : null,
    extractedData,
    preferredFields: extractedData.preferred_fields && typeof extractedData.preferred_fields === 'object'
      ? extractedData.preferred_fields
      : {}
  };
}

export function normalizeFieldValue(dataKey, rawValue) {
  const key = String(dataKey || '').trim().toLowerCase();
  if (rawValue === undefined || rawValue === null) {
    return null;
  }

  const rawText = String(rawValue).trim();
  if (!rawText) {
    return null;
  }

  if (['found_psi', 'target_psi', 'rtd1', 'rtd2', 'otd'].includes(key)) {
    return parseNumericFromText(rawText, { roundInteger: false });
  }

  if (['meter_reading', 'current_reading', 'fitment_reading'].includes(key)) {
    return parseNumericFromText(rawText, { roundInteger: true });
  }

  if (key === 'tyre_serial') {
    return normalizeSpokenAlphaNumeric(rawText)
      || rawText.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '')
      || null;
  }

  if (key === 'size') {
    return normalizeTyreSize(rawText)
      || rawText.toUpperCase().replace(/\u00D7/g, 'X').replace(/\s+/g, '')
      || null;
  }

  if (key === 'vehicle_no') {
    return normalizeVehicleIdentifier(rawText)
      || rawText.toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9-]/g, '')
      || null;
  }

  if (key === 'make') {
    return normalizeMake(rawText) || rawText.toUpperCase().trim() || null;
  }

  if (key === 'model') {
    return normalizeTyreModel(rawText) || rawText.toUpperCase().trim() || null;
  }

  if (key === 'position_code') {
    return normalizePositionCode(rawText)
      || rawText.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9]/g, '')
      || null;
  }

  if (key === 'tyre_type') {
    const normalized = rawText.toLowerCase();
    if (normalized.includes('radial') || normalized === 'r') return 'Radial';
    if (normalized.includes('bias')) return 'Bias';
    return rawText;
  }

  if (key === 'tyre_not_found') {
    const normalized = rawText.toLowerCase();
    if (normalized === 'yes' || normalized === 'y' || normalized === 'true' || normalized === '1' || normalized.includes('not found')) {
      return 'Yes';
    }
    if (normalized === 'no' || normalized === 'n' || normalized === 'false' || normalized === '0') {
      return 'No';
    }
    return rawText;
  }

  if (key === 'category') {
    const normalized = rawText.toLowerCase();
    if (normalized.includes('safety')) return 'Safety';
    if (normalized.includes('wear')) return 'Wear';
    if (normalized.includes('pressure')) return 'Pressure';
    if (normalized.includes('fitment')) return 'Fitment';
    return rawText;
  }

  if (key === 'removal_reason') {
    const normalized = rawText.toLowerCase();
    if (normalized.includes('scrap')) return 'Scrap';
    if (normalized.includes('repair')) return 'Repair';
    if (normalized.includes('spare')) return 'Spare';
    if (normalized.includes('claim')) return 'Claim';
    return rawText;
  }

  if (key === 'fitment_type') {
    return normalizeFitmentType(rawText) || rawText;
  }

  return rawText;
}

export function resolvePreferredFieldValue(preferredFields, dataKey) {
  if (!preferredFields || typeof preferredFields !== 'object') {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(preferredFields, dataKey)) {
    return preferredFields[dataKey];
  }

  if (dataKey === 'category') {
    return preferredFields.observation_type || preferredFields.category || null;
  }

  return null;
}

export function enrichPreferredForForm(formType, preferredFields, draftValues = {}) {
  const preferred = {
    ...(preferredFields && typeof preferredFields === 'object' ? preferredFields : {})
  };

  if (formType === 'pressure_check') {
    const draftTargetPsi = normalizeFieldValue('target_psi', draftValues.target_psi);
    const hintedTargetPsi = normalizeFieldValue('target_psi', preferred.target_psi);
    const resolvedTargetPsi = Number.isFinite(Number(hintedTargetPsi))
      ? hintedTargetPsi
      : (Number.isFinite(Number(draftTargetPsi)) ? draftTargetPsi : DEFAULT_TARGET_PSI);

    preferred.target_psi = resolvedTargetPsi;

    const action = String(draftValues.action || preferred.action || '').trim();
    if (action) {
      preferred.action = action.slice(0, 160);
    }
  }

  if (formType === 'tyre_card') {
    const normalizedSize = normalizeTyreSize(preferred.size || draftValues.size);
    if (normalizedSize) {
      preferred.size = normalizedSize;
    }

    const tyreType = deriveTyreTypeFromSize(preferred.size || draftValues.size);
    if (tyreType) {
      preferred.tyre_type = tyreType;
    }

    const fitmentType = normalizeFitmentType(preferred.fitment_type || draftValues.fitment_type);
    if (fitmentType) {
      preferred.fitment_type = fitmentType;
    }

    const normalizedMake = normalizeMake(preferred.make || draftValues.make);
    if (normalizedMake) {
      preferred.make = normalizedMake;
    }

    const normalizedModel = normalizeTyreModel(preferred.model || draftValues.model);
    if (normalizedModel) {
      preferred.model = normalizedModel;
    }
  }

  if (formType === 'observation') {
    const category = normalizeFieldValue('category', preferred.category || preferred.observation_type || draftValues.category);
    if (category) {
      preferred.category = category;
      preferred.observation_type = category;
    }

    if (!preferred.subcategory && category) {
      preferred.subcategory = OBSERVATION_DEFAULT_SUBCATEGORY[category] || null;
    }

    if (!preferred.summary_text) {
      preferred.summary_text = category
        ? `Observation noted for ${category}`
        : 'Observation noted';
    }

    if (!preferred.risk_level && category) {
      preferred.risk_level = category === 'Safety' ? 'High' : 'Medium';
    }
  }

  return preferred;
}
