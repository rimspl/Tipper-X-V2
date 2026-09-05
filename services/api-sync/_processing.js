import { createAuditEvent, getBucketName } from './_lib.js';
import { runOcrForMediaRows } from './_ocr.js';
import { runAsrForMediaRows } from './_voice.js';
import { deriveTyreTypeFromSize, normalizeTyreSize as normalizeTyreSizeMaster } from '../../shared/field-masters.js';
import { checkAndDispatchAlerts } from '../alert-dispatcher.js';

const EXPECTED_STEP_COUNT = {
  tyre_card: 9,
  pressure_check: 4,
  tyre_inspection: 6,
  tyre_removal: 7,
  observation: 3
};

const FIXED_TARGET_PSI = 120;

const TYRE_MAKES = ['MRF', 'Apollo', 'Bridgestone', 'JK', 'CEAT', 'Yokohama'];
const TYRE_SIZES = ['11.00R20', '12.00R20', '295/90R20', '10.00R20'];
const INSPECTION_DAMAGE_CLASSES = ['None', 'Cut', 'Crack', 'Bulge', 'Tread Wear'];
const REMOVAL_REASONS = ['Scrap', 'Repair', 'Spare', 'Claim'];

const OBSERVATION_TAXONOMY = {
  Safety: ['Sidewall Cut', 'Bulge', 'Exposed Cord'],
  Wear: ['Uneven Wear', 'Fast Wear', 'Center Wear'],
  Pressure: ['Low Pressure', 'Over Pressure', 'Valve Leak'],
  Fitment: ['Wrong Position', 'Loose Nut', 'Mismatch Pair']
};

function toUpper(text) {
  return String(text || '').trim().toUpperCase();
}

function extractNumericCandidates(tokens = []) {
  const values = [];
  for (const token of tokens) {
    const matches = String(token.text || '').match(/\d+(?:\.\d+)?/g);
    if (!matches) continue;
    for (const match of matches) {
      const value = Number(match);
      if (Number.isFinite(value)) {
        values.push({
          value,
          confidence: Number.isFinite(Number(token.confidence)) ? Number(token.confidence) : 0.75
        });
      }
    }
  }
  return values;
}

function pickHighestConfidence(items = [], predicate) {
  let best = null;
  for (const item of items) {
    if (predicate && !predicate(item)) continue;
    if (!best || Number(item.confidence || 0) > Number(best.confidence || 0)) {
      best = item;
    }
  }
  return best;
}

function parsePositionFromStepId(stepId) {
  const normalized = String(stepId || '').trim().toLowerCase();
  const match = normalized.match(/position_([a-z0-9]+)_gauge/);
  if (!match) return null;
  return String(match[1] || '').trim().toUpperCase() || null;
}

function hasFieldValue(value) {
  return !(value === null || value === undefined || value === '');
}

function mergeHintValue(values, confidence, key, value, conf = 0.78, force = false) {
  if (!hasFieldValue(value)) {
    return;
  }

  const nextConfidence = clamp(Number(conf) || 0.78, 0.45, 0.99);
  if (!force && hasFieldValue(values[key]) && Number(confidence[key] || 0) >= nextConfidence) {
    return;
  }

  values[key] = value;
  confidence[key] = nextConfidence;
}

export function parseOcrHints(formType, ocrByStep = {}, mediaRows = []) {
  const tokens = Object.values(ocrByStep)
    .flatMap((entry) => Array.isArray(entry?.tokens) ? entry.tokens : [])
    .map((token) => ({
      text: String(token.text || '').trim(),
      confidence: Number.isFinite(Number(token.confidence)) ? Number(token.confidence) : 0.75
    }))
    .filter((token) => token.text.length > 0);

  const values = {};
  const confidence = {};
  const uppercase = tokens.map((token) => ({ ...token, text: toUpper(token.text) }));

  if (uppercase.length > 0) {
    const serialCandidates = uppercase
      .map((token) => ({
        ...token,
        compact: token.text.replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '')
      }))
      .filter((token) => token.compact.length >= 6 && token.compact.length <= 24);
    const bestSerial = pickHighestConfidence(serialCandidates);
    if (bestSerial) {
      values.tyre_serial = bestSerial.compact;
      confidence.tyre_serial = clamp(bestSerial.confidence, 0.55, 0.99);
    }

    const bestMake = pickHighestConfidence(
      uppercase.filter((token) => TYRE_MAKES.some((make) => token.text.includes(make.toUpperCase())))
    );
    if (bestMake) {
      const make = TYRE_MAKES.find((candidate) => bestMake.text.includes(candidate.toUpperCase()));
      if (make) {
        values.make = make;
        confidence.make = clamp(bestMake.confidence, 0.55, 0.99);
      }
    }

    const sizeCandidates = uppercase
      .map((token) => ({
        ...token,
        match: token.text.match(/\b\d{2,3}(?:\.\d{2})?R\d{2}\b|\b\d{3}\/\d{2}R\d{2}\b/)
      }))
      .filter((token) => token.match);
    const bestSize = pickHighestConfidence(sizeCandidates);
    if (bestSize) {
      values.size = bestSize.match[0];
      confidence.size = clamp(bestSize.confidence, 0.55, 0.99);
    }

    const positionCandidates = uppercase
      .map((token) => ({
        ...token,
        match: token.text.match(/\bFL2?\b|\bFR2?\b|\bAX\d(?:L|R)(?:O|I)\b/)
      }))
      .filter((token) => token.match);
    const bestPosition = pickHighestConfidence(positionCandidates);
    if (bestPosition) {
      values.position_code = bestPosition.match[0];
      confidence.position_code = clamp(bestPosition.confidence, 0.55, 0.99);
    }

    const numberCandidates = extractNumericCandidates(tokens);
    const meterCandidate = pickHighestConfidence(numberCandidates, (item) => item.value >= 10000 && item.value <= 999999);
    if (meterCandidate) {
      values.meter_reading = Math.round(meterCandidate.value);
      confidence.meter_reading = clamp(meterCandidate.confidence, 0.55, 0.99);
      values.current_reading = Math.round(meterCandidate.value);
      confidence.current_reading = clamp(meterCandidate.confidence, 0.55, 0.99);
    }

    const psiCandidate = pickHighestConfidence(numberCandidates, (item) => item.value >= 40 && item.value <= 180);
    if (psiCandidate) {
      values.found_psi = Number(psiCandidate.value.toFixed(2));
      confidence.found_psi = clamp(psiCandidate.confidence, 0.55, 0.99);
    }

    const rtdCandidateA = pickHighestConfidence(numberCandidates, (item) => item.value >= 0 && item.value <= 35);
    const rtdCandidateB = pickHighestConfidence(numberCandidates.filter((item) => item !== rtdCandidateA), (item) => item.value >= 0 && item.value <= 35);
    if (rtdCandidateA) {
      values.rtd1 = Number(rtdCandidateA.value.toFixed(2));
      confidence.rtd1 = clamp(rtdCandidateA.confidence, 0.55, 0.99);
    }
    if (rtdCandidateB) {
      values.rtd2 = Number(rtdCandidateB.value.toFixed(2));
      confidence.rtd2 = clamp(rtdCandidateB.confidence, 0.55, 0.99);
    }

    const otdCandidate = pickHighestConfidence(numberCandidates, (item) => item.value >= 5 && item.value <= 35);
    if (otdCandidate) {
      values.otd = Number(otdCandidate.value.toFixed(2));
      confidence.otd = clamp(otdCandidate.confidence, 0.55, 0.99);
    }

    if (formType === 'observation') {
      const bestCategory = pickHighestConfidence(
        uppercase.filter((token) => Object.keys(OBSERVATION_TAXONOMY).some((category) => token.text.includes(category.toUpperCase())))
      );

      if (bestCategory) {
        const category = Object.keys(OBSERVATION_TAXONOMY)
          .find((candidate) => bestCategory.text.includes(candidate.toUpperCase()));
        if (category) {
          values.category = category;
          confidence.category = clamp(bestCategory.confidence, 0.55, 0.99);
        }
      }

      if (values.category) {
        const options = OBSERVATION_TAXONOMY[values.category] || [];
        const sub = pickHighestConfidence(
          uppercase.filter((token) => options.some((option) => token.text.includes(option.toUpperCase())))
        );
        if (sub) {
          const subcategory = options.find((option) => sub.text.includes(option.toUpperCase()));
          if (subcategory) {
            values.subcategory = subcategory;
            confidence.subcategory = clamp(sub.confidence, 0.55, 0.99);
          }
        }
      }
    }
  }

  const mediaByStep = new Map(
    (mediaRows || []).map((row) => [String(row.step_id || '').trim(), row])
  );

  for (const [stepId, entry] of Object.entries(ocrByStep || {})) {
    const normalizedStep = String(stepId || '').trim().toLowerCase();
    const mediaRow = mediaByStep.get(stepId);

    const localExtracted = mediaRow?.meta_json?.extracted_data
      || mediaRow?.meta_json?.pipeline?.extracted_data
      || entry?.extracted_data
      || null;

    const preferred = localExtracted && typeof localExtracted.preferred_fields === 'object'
      ? localExtracted.preferred_fields
      : {};

    mergeHintValue(values, confidence, 'tyre_serial', textOrNull(preferred.tyre_serial, { upper: true }), 0.86);
    mergeHintValue(values, confidence, 'make', cleanTyreMake(preferred.make), 0.83);
    mergeHintValue(values, confidence, 'size', cleanTyreSize(preferred.size), 0.83);
    mergeHintValue(values, confidence, 'tyre_type', textOrNull(preferred.tyre_type), 0.82, true);
    mergeHintValue(values, confidence, 'vehicle_no', textOrNull(preferred.vehicle_no, { upper: true }), 0.84);
    mergeHintValue(values, confidence, 'position_code', textOrNull(preferred.position_code, { upper: true }), 0.84);
    mergeHintValue(values, confidence, 'summary_text', textOrNull(preferred.summary_text), 0.88, true);
    mergeHintValue(values, confidence, 'category', textOrNull(preferred.category), 0.88, true);
    mergeHintValue(values, confidence, 'category', textOrNull(preferred.observation_type), 0.87, true);
    mergeHintValue(values, confidence, 'subcategory', textOrNull(preferred.subcategory), 0.88, true);
    mergeHintValue(values, confidence, 'risk_level', textOrNull(preferred.risk_level), 0.86, true);
    mergeHintValue(values, confidence, 'suggested_action', textOrNull(preferred.suggested_action), 0.84, true);
    mergeHintValue(values, confidence, 'action', textOrNull(preferred.action), 0.84, true);
    mergeHintValue(values, confidence, 'remarks', textOrNull(preferred.remarks), 0.82, true);
    mergeHintValue(values, confidence, 'removal_reason', textOrNull(preferred.removal_reason), 0.84, true);
    mergeHintValue(values, confidence, 'disposition', textOrNull(preferred.disposition), 0.84, true);
    mergeHintValue(values, confidence, 'fitment_type', normalizeFitmentType(preferred.fitment_type), 0.86, true);

    const preferredMeter = numberOrNull(preferred.meter_reading);
    if (Number.isFinite(preferredMeter) && preferredMeter >= 1000 && preferredMeter <= 2000000) {
      mergeHintValue(values, confidence, 'meter_reading', Math.round(preferredMeter), 0.87, true);
      mergeHintValue(values, confidence, 'current_reading', Math.round(preferredMeter), 0.86);
    }

    const preferredPsi = numberOrNull(preferred.found_psi);
    if (Number.isFinite(preferredPsi) && preferredPsi >= 30 && preferredPsi <= 200) {
      mergeHintValue(values, confidence, 'found_psi', Number(preferredPsi.toFixed(2)), 0.88, true);
    }

    const preferredTargetPsi = numberOrNull(preferred.target_psi);
    if (Number.isFinite(preferredTargetPsi) && preferredTargetPsi >= 30 && preferredTargetPsi <= 200) {
      mergeHintValue(values, confidence, 'target_psi', Number(preferredTargetPsi.toFixed(2)), 0.87, true);
    }

    const preferredFitmentReading = numberOrNull(preferred.fitment_reading);
    if (Number.isFinite(preferredFitmentReading) && preferredFitmentReading >= 0 && preferredFitmentReading <= 2000000) {
      mergeHintValue(values, confidence, 'fitment_reading', Math.round(preferredFitmentReading), 0.87, true);
    }

    const preferredCurrentReading = numberOrNull(preferred.current_reading);
    if (Number.isFinite(preferredCurrentReading) && preferredCurrentReading >= 0 && preferredCurrentReading <= 2000000) {
      mergeHintValue(values, confidence, 'current_reading', Math.round(preferredCurrentReading), 0.87, true);
    }

    const preferredRtd1 = numberOrNull(preferred.rtd1);
    if (Number.isFinite(preferredRtd1)) {
      mergeHintValue(values, confidence, 'rtd1', Number(preferredRtd1.toFixed(2)), 0.85, true);
      mergeHintValue(values, confidence, 'otd', Number(preferredRtd1.toFixed(2)), 0.78);
    }

    const preferredRtd2 = numberOrNull(preferred.rtd2);
    if (Number.isFinite(preferredRtd2)) {
      mergeHintValue(values, confidence, 'rtd2', Number(preferredRtd2.toFixed(2)), 0.83, true);
    }

    const preferredOtd = numberOrNull(preferred.otd);
    if (Number.isFinite(preferredOtd) && preferredOtd >= 0 && preferredOtd <= 40) {
      mergeHintValue(values, confidence, 'otd', Number(preferredOtd.toFixed(2)), 0.86, true);
    }

    mergeHintValue(values, confidence, 'damage_class', textOrNull(preferred.damage_class), 0.85, true);
    mergeHintValue(values, confidence, 'severity', textOrNull(preferred.severity), 0.84, true);

    if (formType === 'pressure_check') {
      const stepPosition = parsePositionFromStepId(normalizedStep);
      if (stepPosition) {
        mergeHintValue(values, confidence, 'position_code', stepPosition, 0.88, true);
      }
    }

    if (normalizedStep.includes('odometer') || normalizedStep.includes('meter_reading')) {
      const stepNumbers = extractNumericCandidates(Array.isArray(entry?.tokens) ? entry.tokens : []);
      const odo = pickHighestConfidence(stepNumbers, (item) => item.value >= 1000 && item.value <= 2000000);
      if (odo) {
        mergeHintValue(values, confidence, 'meter_reading', Math.round(odo.value), clamp(odo.confidence, 0.65, 0.99), true);
        mergeHintValue(values, confidence, 'current_reading', Math.round(odo.value), clamp(odo.confidence, 0.64, 0.99), true);
      }
    }

    if (normalizedStep.includes('serial') || normalizedStep.includes('sidewall')) {
      const serialStepCandidates = (Array.isArray(entry?.tokens) ? entry.tokens : [])
        .map((token) => ({
          text: toUpper(token?.text),
          confidence: Number.isFinite(Number(token?.confidence)) ? Number(token.confidence) : 0.75,
          compact: toUpper(token?.text).replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '')
        }))
        .filter((token) => token.compact.length >= 6 && token.compact.length <= 24);

      const serialStep = pickHighestConfidence(serialStepCandidates);
      if (serialStep) {
        const normalizedSerial = serialStep.compact;

        if (normalizedSerial.length >= 5) {
          mergeHintValue(
            values,
            confidence,
            'tyre_serial',
            normalizedSerial,
            clamp(serialStep.confidence, 0.68, 0.99),
            false
          );
        }
      }
    }
  }

  return { values, confidence };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toIsoDate(value) {
  if (!value) {
    return new Date().toISOString().split('T')[0];
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().split('T')[0];
  }
  return date.toISOString().split('T')[0];
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return fallback;
}

function isCompatibilitySchemaError(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();

  if (code === '42p01' || code === 'pgrst205') {
    return true;
  }

  return (
    message.includes('could not find the table')
    || message.includes('schema cache')
    || (message.includes('relation') && message.includes('does not exist'))
    || message.includes('does not exist')
    || message.includes('missing from schema')
  );
}

function normalizeVehicleNo(raw, seed) {
  const candidate = String(raw || '').trim().toUpperCase();
  if (candidate) {
    return candidate;
  }
  return `VH-${String((seed % 900) + 100).padStart(3, '0')}`;
}

function normalizePosition(raw, seed) {
  const candidate = String(raw || '').trim().toUpperCase();
  if (candidate) {
    return candidate;
  }
  const positions = ['FL', 'FR', 'AX3LO', 'AX3LI', 'AX4RO', 'AX4RI'];
  return positions[seed % positions.length];
}

function normalizeShift(raw) {
  const candidate = String(raw || '').trim();
  if (candidate) {
    return candidate;
  }
  return 'General';
}

function buildSeed(submissionId, mediaRows = []) {
  let hash = 7;
  const input = `${submissionId || ''}|${mediaRows.map((row) => `${row.step_id}:${row.sha256}`).join('|')}`;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash || 1;
}

function pick(list, seed, offset = 0) {
  if (!Array.isArray(list) || list.length === 0) return null;
  const idx = (seed + offset * 17) % list.length;
  return list[idx];
}

function numberInRange(seed, min, max, offset = 0) {
  const spread = max - min;
  if (spread <= 0) return min;
  const value = (seed >>> (offset % 12)) % (spread + 1);
  return min + value;
}

function serialFromSeed(seed) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  let out = '';
  let value = seed;
  for (let index = 0; index < 10; index += 1) {
    out += alphabet[value % alphabet.length];
    value = Math.floor(value / alphabet.length) + index * 13;
  }
  return out;
}

function averageBlurScore(mediaRows = []) {
  const scored = mediaRows
    .map((row) => safeNumber(row.meta_json?.blur_score, NaN))
    .filter((value) => Number.isFinite(value));

  if (scored.length === 0) {
    return 0.18;
  }

  const sum = scored.reduce((acc, value) => acc + value, 0);
  return clamp(sum / scored.length, 0, 1);
}

function buildFieldConfidence(seed, index, blurScore) {
  const drift = ((seed >>> (index % 16)) & 255) / 255;
  const raw = 0.74 + drift * 0.22;
  const blurPenalty = blurScore * 0.28;
  return Number(clamp(raw - blurPenalty, 0.45, 0.99).toFixed(4));
}

function computeOverallConfidence({ fieldConfidence, blurScore, coverage, validationOk }) {
  const values = Object.values(fieldConfidence || {});
  const fieldAvg = values.length > 0
    ? values.reduce((acc, value) => acc + value, 0) / values.length
    : 0.7;
  const quality = clamp(1 - blurScore, 0.2, 1);
  let overall = fieldAvg * 0.55 + quality * 0.25 + clamp(coverage, 0, 1) * 0.2;
  if (!validationOk) {
    overall = Math.min(overall, 0.72);
  }
  return Number(clamp(overall, 0.4, 0.99).toFixed(4));
}

function chooseDecision({ overallConfidence, validationOk }) {
  if (!validationOk || overallConfidence < 0.6) {
    return 'mandatory_review';
  }

  const managerReviewEnabled = String(process.env.SYNC_REQUIRE_MANAGER_REVIEW || '').trim().toLowerCase() === 'true';
  if (managerReviewEnabled && overallConfidence < 0.9) {
    return 'manager_review';
  }

  return 'auto_approve';
}

function normalizeContext(contextJson) {
  const context = contextJson || {};
  const vehicle = String(context.vehicle_no || context.vehicleNo || '').trim().toUpperCase();
  const position = String(context.position_code || context.positionCode || '').trim().toUpperCase();
  const shift = String(context.shift || '').trim();

  return {
    vehicle_no: vehicle || null,
    position_code: position || null,
    shift: shift || null,
    task_id: context.task_id || null
  };
}

function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
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

function cleanTyreMake(value) {
  const candidate = textOrNull(value);
  if (!candidate) return null;
  const normalized = candidate.toUpperCase();
  const known = TYRE_MAKES.find((make) => normalized.includes(make.toUpperCase()));
  return known || candidate;
}

function cleanTyreSize(value) {
  const candidate = textOrNull(value, { upper: true });
  if (!candidate) return null;
  return normalizeTyreSizeMaster(candidate) || candidate;
}

function normalizeObservationCategory(value) {
  const candidate = textOrNull(value);
  if (!candidate) return null;
  const normalized = candidate.toUpperCase();
  const match = Object.keys(OBSERVATION_TAXONOMY).find((category) => category.toUpperCase() === normalized);
  return match || null;
}

function normalizeObservationSubcategory(category, value) {
  if (!category) return null;
  const candidate = textOrNull(value);
  if (!candidate) return null;
  const normalized = candidate.toUpperCase();
  const options = OBSERVATION_TAXONOMY[category] || [];
  const match = options.find((option) => option.toUpperCase() === normalized);
  return match || null;
}

function normalizeRiskLevel(value) {
  const candidate = textOrNull(value, { upper: true });
  if (!candidate) return null;
  if (candidate === 'HIGH' || candidate === 'MEDIUM' || candidate === 'LOW') {
    return candidate.charAt(0) + candidate.slice(1).toLowerCase();
  }
  return null;
}

function normalizeSeverity(value) {
  const candidate = textOrNull(value, { upper: true });
  if (!candidate) return null;
  if (candidate === 'HIGH' || candidate === 'MEDIUM' || candidate === 'LOW') {
    return candidate.charAt(0) + candidate.slice(1).toLowerCase();
  }
  return null;
}

function normalizeDamageClass(value) {
  const candidate = textOrNull(value);
  if (!candidate) return null;
  const normalized = candidate.toUpperCase();
  const match = INSPECTION_DAMAGE_CLASSES.find((item) => item.toUpperCase() === normalized);
  return match || null;
}

function normalizeRemovalReason(value) {
  const candidate = textOrNull(value);
  if (!candidate) return null;
  const normalized = candidate.toUpperCase();
  const match = REMOVAL_REASONS.find((item) => item.toUpperCase() === normalized);
  return match || null;
}

function normalizeFitmentType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes('new') || normalized.includes('fresh')) return 'New';
  if (normalized.includes('old') || normalized.includes('used') || normalized.includes('retread')) return 'Old';
  return null;
}

function normalizeTyreType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes('radial') || normalized === 'r') return 'Radial';
  if (normalized.includes('bias')) return 'Bias';
  return null;
}

export function buildExtractionPayload(submission, mediaRows, ocrHints = { values: {}, confidence: {} }) {
  const seed = buildSeed(submission.id, mediaRows);
  const blurScore = averageBlurScore(mediaRows);
  const expectedCount = EXPECTED_STEP_COUNT[submission.form_type] || Math.max(mediaRows.length, 1);
  const coverage = mediaRows.length / expectedCount;
  const context = normalizeContext(submission.context_json);
  const hintedValues = ocrHints?.values || {};
  const hintedConfidence = ocrHints?.confidence || {};

  let extracted = {};

  if (submission.form_type === 'tyre_card') {
    const meter = numberOrNull(hintedValues.meter_reading);
    const normalizedSize = cleanTyreSize(hintedValues.size);
    const derivedTyreType = deriveTyreTypeFromSize(normalizedSize);
    extracted = {
      tyre_serial: textOrNull(hintedValues.tyre_serial, { upper: true }),
      make: cleanTyreMake(hintedValues.make),
      size: normalizedSize,
      tyre_type: normalizeTyreType(hintedValues.tyre_type) || derivedTyreType,
      otd: numberOrNull(hintedValues.otd),
      vehicle_no: textOrNull(hintedValues.vehicle_no, { upper: true }) || context.vehicle_no,
      position_code: textOrNull(hintedValues.position_code, { upper: true }) || context.position_code,
      meter_reading: meter,
      rtd1: numberOrNull(hintedValues.rtd1),
      rtd2: numberOrNull(hintedValues.rtd2),
      fitment_type: normalizeFitmentType(hintedValues.fitment_type),
      fitment_event: 'FITMENT'
    };
  } else if (submission.form_type === 'pressure_check') {
    const found = numberOrNull(hintedValues.found_psi);
    const target = numberOrNull(hintedValues.target_psi) ?? FIXED_TARGET_PSI;
    const variance = Number.isFinite(found) && Number.isFinite(target)
      ? Number((found - target).toFixed(2))
      : null;
    const adjusted = variance === null ? null : Math.abs(variance) > 0;

    let action = textOrNull(hintedValues.action);
    if (!action && adjusted !== null) {
      action = adjusted
        ? (variance < 0 ? 'Air Added' : 'Air Released')
        : 'Checked OK';
    }

    extracted = {
      tyre_serial: textOrNull(hintedValues.tyre_serial, { upper: true }),
      make: cleanTyreMake(hintedValues.make),
      size: cleanTyreSize(hintedValues.size),
      vehicle_no: textOrNull(hintedValues.vehicle_no, { upper: true }) || context.vehicle_no,
      position_code: textOrNull(hintedValues.position_code, { upper: true }) || context.position_code,
      found_psi: found,
      target_psi: target,
      variance,
      adjusted,
      action
    };
  } else if (submission.form_type === 'tyre_inspection') {
    const rtd1 = numberOrNull(hintedValues.rtd1);
    const rtd2 = numberOrNull(hintedValues.rtd2);
    const damage = textOrNull(hintedValues.damage_class);
    const severity = textOrNull(hintedValues.severity);

    extracted = {
      tyre_serial: textOrNull(hintedValues.tyre_serial, { upper: true }),
      make: cleanTyreMake(hintedValues.make),
      size: cleanTyreSize(hintedValues.size),
      vehicle_no: textOrNull(hintedValues.vehicle_no, { upper: true }) || context.vehicle_no,
      position_code: textOrNull(hintedValues.position_code, { upper: true }) || context.position_code,
      meter_reading: numberOrNull(hintedValues.meter_reading),
      rtd1,
      rtd2,
      damage_class: normalizeDamageClass(damage),
      severity: normalizeSeverity(severity),
      remarks: textOrNull(hintedValues.remarks)
    };
  } else if (submission.form_type === 'tyre_removal') {
    const currentReading = numberOrNull(hintedValues.current_reading);
    const fitmentReading = numberOrNull(hintedValues.fitment_reading);
    const reason = normalizeRemovalReason(hintedValues.removal_reason) || textOrNull(hintedValues.removal_reason);
    const disposition = textOrNull(hintedValues.disposition)
      || (reason === 'Scrap' ? 'Scrap' : (reason === 'Repair' ? 'Repair' : null));

    const lifeAchieved = Number.isFinite(currentReading) && Number.isFinite(fitmentReading)
      ? Math.max(0, Number((currentReading - fitmentReading).toFixed(2)))
      : null;

    extracted = {
      tyre_serial: textOrNull(hintedValues.tyre_serial, { upper: true }),
      make: cleanTyreMake(hintedValues.make),
      size: cleanTyreSize(hintedValues.size),
      vehicle_no: textOrNull(hintedValues.vehicle_no, { upper: true }) || context.vehicle_no,
      position_code: textOrNull(hintedValues.position_code, { upper: true }) || context.position_code,
      fitment_reading: fitmentReading,
      current_reading: currentReading,
      life_achieved: lifeAchieved,
      removal_reason: reason,
      disposition,
      rtd1: numberOrNull(hintedValues.rtd1),
      rtd2: numberOrNull(hintedValues.rtd2),
      remarks: textOrNull(hintedValues.remarks)
    };
  } else if (submission.form_type === 'observation') {
    const category = normalizeObservationCategory(hintedValues.category || hintedValues.observation_type);
    const subcategory = normalizeObservationSubcategory(category, hintedValues.subcategory)
      || (category ? (OBSERVATION_TAXONOMY[category]?.[0] || null) : null);
    const risk = normalizeRiskLevel(hintedValues.risk_level)
      || (category === 'Safety' ? 'High' : (category === 'Pressure' ? 'Medium' : null));
    const summary = textOrNull(hintedValues.summary_text)
      || textOrNull(hintedValues.observation_type)
      || (category ? `Observation noted for ${category}` : null);

    extracted = {
      tyre_serial: textOrNull(hintedValues.tyre_serial, { upper: true }),
      vehicle_no: textOrNull(hintedValues.vehicle_no, { upper: true }) || context.vehicle_no,
      position_code: textOrNull(hintedValues.position_code, { upper: true }) || context.position_code,
      category,
      subcategory,
      summary_text: summary,
      risk_level: risk,
      suggested_action: textOrNull(hintedValues.suggested_action)
    };
  }

  const fieldConfidence = {};
  Object.keys(extracted).forEach((key, index) => {
    const value = extracted[key];
    const hinted = hintedConfidence[key];

    if (!hasValue(value)) {
      fieldConfidence[key] = 0.2;
      return;
    }

    if (Number.isFinite(Number(hinted))) {
      fieldConfidence[key] = Number(clamp(Number(hinted), 0.45, 0.99).toFixed(4));
    } else if (key === 'vehicle_no' || key === 'position_code') {
      fieldConfidence[key] = 0.96;
    } else {
      fieldConfidence[key] = buildFieldConfidence(seed, index + 1, blurScore);
    }
  });

  const validation = validateExtraction(submission.form_type, extracted);
  const overallConfidence = computeOverallConfidence({
    fieldConfidence,
    blurScore,
    coverage,
    validationOk: validation.is_valid
  });

  const decision = chooseDecision({
    overallConfidence,
    validationOk: validation.is_valid
  });

  return {
    submission_id: submission.id,
    form_type: submission.form_type,
    extracted,
    field_confidence: fieldConfidence,
    overall_confidence: overallConfidence,
    validation,
    decision,
    context,
    ocr_hints: hintedValues,
    blur_score: Number(blurScore.toFixed(4))
  };
}

export function validateExtraction(formType, extracted) {
  const errors = [];

  if (formType === 'tyre_card') {
    if (!hasValue(extracted.tyre_serial)) {
      errors.push('tyre_serial missing');
    }
    if (!hasValue(extracted.vehicle_no)) {
      errors.push('vehicle_no missing');
    }
    if (!hasValue(extracted.position_code)) {
      errors.push('position_code missing');
    }

    if (!hasValue(extracted.meter_reading)) {
      errors.push('meter_reading missing');
    }

    if (!hasValue(extracted.rtd1)) {
      errors.push('rtd1 missing');
    }

    if (!hasValue(extracted.rtd2)) {
      errors.push('rtd2 missing');
    }

    if (!hasValue(extracted.fitment_type)) {
      errors.push('fitment_type missing');
    }

    if (hasValue(extracted.fitment_type) && !['New', 'Old'].includes(String(extracted.fitment_type))) {
      errors.push('fitment_type must be New or Old');
    }

    if (hasValue(extracted.rtd1) && (safeNumber(extracted.rtd1, -1) < 0 || safeNumber(extracted.rtd1, -1) > 40)) {
      errors.push('rtd1 out of range');
    }

    if (hasValue(extracted.rtd2) && (safeNumber(extracted.rtd2, -1) < 0 || safeNumber(extracted.rtd2, -1) > 40)) {
      errors.push('rtd2 out of range');
    }

    if (hasValue(extracted.otd) && (safeNumber(extracted.otd, -1) < 0 || safeNumber(extracted.otd, -1) > 40)) {
      errors.push('otd out of range');
    }
  }

  if (formType === 'pressure_check') {
    if (!hasValue(extracted.found_psi)) {
      errors.push('found_psi missing');
    }
    if (!hasValue(extracted.tyre_serial)) {
      errors.push('tyre_serial missing');
    }
    if (!hasValue(extracted.vehicle_no)) {
      errors.push('vehicle_no missing');
    }
    if (!hasValue(extracted.position_code)) {
      errors.push('position_code missing');
    }

    if (hasValue(extracted.found_psi) && (safeNumber(extracted.found_psi, 0) < 40 || safeNumber(extracted.found_psi, 0) > 180)) {
      errors.push('found_psi out of plausible range');
    }

    if (hasValue(extracted.target_psi) && (safeNumber(extracted.target_psi, 0) < 40 || safeNumber(extracted.target_psi, 0) > 180)) {
      errors.push('target_psi out of plausible range');
    }
  }

  if (formType === 'tyre_inspection') {
    if (!hasValue(extracted.tyre_serial)) {
      errors.push('tyre_serial missing');
    }
    if (!hasValue(extracted.vehicle_no)) {
      errors.push('vehicle_no missing');
    }
    if (!hasValue(extracted.position_code)) {
      errors.push('position_code missing');
    }
    if (!hasValue(extracted.meter_reading)) {
      errors.push('meter_reading missing');
    }
    if (!hasValue(extracted.rtd1)) {
      errors.push('rtd1 missing');
    }
    if (!hasValue(extracted.rtd2)) {
      errors.push('rtd2 missing');
    }

    if (hasValue(extracted.rtd1) && (safeNumber(extracted.rtd1, -1) < 0 || safeNumber(extracted.rtd1, -1) > 40)) {
      errors.push('rtd1 out of range');
    }
    if (hasValue(extracted.rtd2) && (safeNumber(extracted.rtd2, -1) < 0 || safeNumber(extracted.rtd2, -1) > 40)) {
      errors.push('rtd2 out of range');
    }
  }

  if (formType === 'tyre_removal') {
    if (!hasValue(extracted.tyre_serial)) {
      errors.push('tyre_serial missing');
    }
    if (!hasValue(extracted.removal_reason)) {
      errors.push('removal_reason missing');
    }
    if (!hasValue(extracted.current_reading)) {
      errors.push('current_reading missing');
    }

    if (hasValue(extracted.current_reading) && hasValue(extracted.fitment_reading)
      && safeNumber(extracted.current_reading, 0) < safeNumber(extracted.fitment_reading, 0)) {
      errors.push('current_reading must be >= fitment_reading');
    }
  }

  if (formType === 'observation') {
    if (!hasValue(extracted.vehicle_no)) {
      errors.push('vehicle_no missing');
    }
    if (!hasValue(extracted.category)) {
      errors.push('category missing');
    }

    if (hasValue(extracted.category) && !OBSERVATION_TAXONOMY[extracted.category]) {
      errors.push('category not in allowed taxonomy');
    }

    if (hasValue(extracted.category) && hasValue(extracted.subcategory)) {
      const options = OBSERVATION_TAXONOMY[extracted.category] || [];
      if (!options.includes(extracted.subcategory)) {
        errors.push('subcategory not in allowed taxonomy');
      }
    }
  }

  return {
    is_valid: errors.length === 0,
    errors
  };
}

export async function upsertExtractedFields(supabase, submissionId, extraction) {
  await supabase.schema('ops').from('extracted_fields').delete().eq('submission_id', submissionId);

  const rows = Object.entries(extraction.extracted || {})
    .filter(([, fieldValue]) => fieldValue !== undefined && fieldValue !== null)
    .map(([fieldKey, fieldValue]) => ({
      submission_id: submissionId,
      field_key: fieldKey,
      field_value: fieldValue,
      confidence: extraction.field_confidence?.[fieldKey] ?? null,
      source_media_id: null
    }));

  if (rows.length === 0) {
    return;
  }

  const { error } = await supabase.schema('ops').from('extracted_fields').insert(rows);
  if (error) {
    throw new Error(`Failed to store extracted fields: ${error.message}`);
  }
}

async function resolveUserIdForLog(supabase, userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data?.id || null;
}

async function ensureVehicle(supabase, { vehicleNo, siteId, meterReading }) {
  const dbNorm = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const normalized = dbNorm(vehicleNo);
  if (!normalized) throw new Error('Missing vehicle_no for compatibility write');
  const siteKey = siteId ? String(siteId).trim() : null;
  const tryFindVehicle = async () => {
    if (siteKey) {
      const { data: byNormSite, error: e1 } = await supabase.from('vehicles').select('id, site_id, current_odometer, vehicle_no, vehicle_no_norm').eq('vehicle_no_norm', normalized).eq('site_id', siteKey).maybeSingle();
      if (e1 && e1.code !== 'PGRST116') throw new Error(`Vehicle lookup failed: ${e1.message}`);
      if (byNormSite?.id) return byNormSite;
    }
    const { data: byNorm, error: e2 } = await supabase.from('vehicles').select('id, site_id, current_odometer, vehicle_no, vehicle_no_norm').eq('vehicle_no_norm', normalized).maybeSingle();
    if (e2 && e2.code !== 'PGRST116') throw new Error(`Vehicle lookup failed: ${e2.message}`);
    if (byNorm?.id) return byNorm;
    const { data: byNo, error: e3 } = await supabase.from('vehicles').select('id, site_id, current_odometer, vehicle_no, vehicle_no_norm').eq('vehicle_no', String(vehicleNo).trim()).maybeSingle();
    if (e3 && e3.code !== 'PGRST116') throw new Error(`Vehicle lookup failed: ${e3.message}`);
    if (byNo?.id) return byNo;
    const { data: byNoIlike, error: e4 } = await supabase.from('vehicles').select('id, site_id, current_odometer, vehicle_no, vehicle_no_norm').ilike('vehicle_no', String(vehicleNo).trim()).maybeSingle();
    if (e4 && e4.code !== 'PGRST116') throw new Error(`Vehicle lookup failed: ${e4.message}`);
    return byNoIlike || null;
  };
  const existing = await tryFindVehicle();
  if (existing?.id) {
    const needsSitePatch = siteKey && !existing.site_id;
    const needsOdoPatch = Number.isFinite(meterReading) && meterReading > safeNumber(existing.current_odometer, 0);
    if (needsSitePatch || needsOdoPatch) {
      const patch = {};
      if (needsSitePatch) patch.site_id = siteKey;
      if (needsOdoPatch) patch.current_odometer = meterReading;
      await supabase.from('vehicles').update(patch).eq('id', existing.id);
    }
    if (siteKey && existing.site_id && String(existing.site_id) !== String(siteKey)) {
      const patchedSameSite = await supabase.from('vehicles').select('id').eq('vehicle_no_norm', normalized).eq('site_id', siteKey).maybeSingle();
      if (!patchedSameSite?.data?.id) {
        const { data: siteSpecific, error: siteErr } = await supabase.from('vehicles').select('id').eq('vehicle_no_norm', normalized).eq('site_id', siteKey).maybeSingle();
        if (siteErr && siteErr.code !== 'PGRST116') throw new Error(`Vehicle lookup failed: ${siteErr.message}`);
        if (!siteSpecific?.id) {
        }
      }
    }
    return existing.id;
  }
  const payload = { vehicle_no: String(vehicleNo).trim(), site_id: siteKey, current_odometer: Number.isFinite(meterReading) ? meterReading : 0 };
  const { data: created, error: createError } = await supabase.from('vehicles').insert(payload).select('id').single();
  if (!createError) return created.id;
  const msg = String(createError.message || '').toLowerCase();
  const code = String(createError.code || '');
  const isDuplicate = code === '23505' || msg.includes('idx_vehicles') || msg.includes('duplicate key') || msg.includes('already exists');
  if (isDuplicate) {
    const raced = await tryFindVehicle().catch(() => null);
    if (raced?.id) {
      if (Number.isFinite(meterReading) && meterReading > safeNumber(raced.current_odometer, 0)) await supabase.from('vehicles').update({ current_odometer: meterReading }).eq('id', raced.id);
      if (!raced.site_id && siteKey) await supabase.from('vehicles').update({ site_id: siteKey }).eq('id', raced.id);
      return raced.id;
    }
    try {
      const { data: upserted, error: upsertError } = await supabase.from('vehicles').upsert(payload, { onConflict: 'site_id,vehicle_no_norm' }).select('id').single();
      if (!upsertError && upserted?.id) return upserted.id;
    } catch {}
    try {
      const { data: upserted2, error: upsertError2 } = await supabase.from('vehicles').upsert(payload, { onConflict: 'vehicle_no' }).select('id').single();
      if (!upsertError2 && upserted2?.id) return upserted2.id;
    } catch {}
  }
  throw new Error(`Vehicle create failed: ${createError.message}`);
}

async function ensureTyre(supabase, { tyreSerial, make, size, otd }) {
  const serial = String(tyreSerial || '').trim().toUpperCase();
  if (!serial) {
    throw new Error('Missing tyre serial for compatibility write');
  }

  const { data: existing, error: existingError } = await supabase
    .from('tyres')
    .select('id, total_life_run')
    .ilike('tyre_no', serial)
    .maybeSingle();

  if (existingError && existingError.code !== 'PGRST116') {
    throw new Error(`Tyre lookup failed: ${existingError.message}`);
  }

  if (existing?.id) {
    const patch = {};
    if (make) patch.make = make;
    if (size) patch.size = size;
    if (Number.isFinite(otd)) patch.otd = otd;
    if (Object.keys(patch).length > 0) {
      await supabase.from('tyres').update(patch).eq('id', existing.id);
    }
    return { id: existing.id, total_life_run: safeNumber(existing.total_life_run, 0) };
  }

  const { data: created, error: createError } = await supabase
    .from('tyres')
    .insert({
      tyre_no: serial,
      make: make || 'MRF',
      size: size || 'Unknown',
      otd: Number.isFinite(otd) ? otd : 0,
      status: 'Running'
    })
    .select('id, total_life_run')
    .single();

  if (createError) {
    throw new Error(`Tyre create failed: ${createError.message}`);
  }

  return { id: created.id, total_life_run: safeNumber(created.total_life_run, 0) };
}

async function resolveLatestFitmentReading(supabase, tyreId) {
  if (!tyreId) {
    return NaN;
  }

  const { data, error } = await supabase
    .from('tyre_activity_log')
    .select('meter_reading, activity_date, created_at')
    .eq('tyre_id', tyreId)
    .eq('activity_type', 'FITMENT')
    .order('activity_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NaN;
  }

  const meter = safeNumber(data?.meter_reading, NaN);
  return Number.isFinite(meter) ? meter : NaN;
}

async function resolveSiteCustomerId(supabase, siteId) {
  if (!siteId) return null;
  const { data, error } = await supabase
    .from('sites')
    .select('customer_id')
    .eq('id', siteId)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data?.customer_id || null;
}

function buildFitterCommonRow({ submission, extraction, approvalMode, pipelineStatus }) {
  return {
    submission_id: submission.id,
    site_id: submission.site_id,
    user_id: submission.user_id,
    device_id: submission.device_id || null,
    local_submission_id: submission.local_submission_id || null,
    capture_started_at: submission.capture_started_at || null,
    capture_completed_at: submission.capture_completed_at || submission.created_at || null,
    approval_mode: approvalMode || null,
    pipeline_status: pipelineStatus || null,
    raw_payload: {
      form_type: submission.form_type,
      context: extraction?.context || {},
      extracted: extraction?.extracted || {},
      field_confidence: extraction?.field_confidence || {},
      overall_confidence: Number.isFinite(Number(extraction?.overall_confidence))
        ? Number(extraction.overall_confidence)
        : null,
      validation: extraction?.validation || null
    }
  };
}

async function upsertFitterFormEntry({ supabase, submission, extraction, approvalMode, pipelineStatus }) {
  const extracted = extraction?.extracted || {};
  const context = extraction?.context || {};
  const common = buildFitterCommonRow({
    submission,
    extraction,
    approvalMode,
    pipelineStatus
  });

  const vehicleNo = textOrNull(extracted.vehicle_no, { upper: true })
    || textOrNull(context.vehicle_no, { upper: true });
  const positionCode = textOrNull(extracted.position_code, { upper: true })
    || textOrNull(context.position_code, { upper: true });

  let table = null;
  let row = null;

  if (submission.form_type === 'tyre_card') {
    table = 'fitter_tyre_card_entries';
    row = {
      ...common,
      tyre_serial: textOrNull(extracted.tyre_serial, { upper: true }),
      make: cleanTyreMake(extracted.make),
      size: cleanTyreSize(extracted.size),
      vehicle_no: vehicleNo,
      position_code: positionCode,
      meter_reading: numberOrNull(extracted.meter_reading),
      rtd1: numberOrNull(extracted.rtd1),
      rtd2: numberOrNull(extracted.rtd2),
      fitment_type: normalizeFitmentType(extracted.fitment_type) || textOrNull(extracted.fitment_type)
    };
  } else if (submission.form_type === 'pressure_check') {
    table = 'fitter_pressure_check_entries';
    row = {
      ...common,
      tyre_serial: textOrNull(extracted.tyre_serial, { upper: true }),
      vehicle_no: vehicleNo,
      position_code: positionCode,
      found_psi: numberOrNull(extracted.found_psi),
      target_psi: numberOrNull(extracted.target_psi) ?? FIXED_TARGET_PSI,
      variance: numberOrNull(extracted.variance),
      adjusted: extracted.adjusted === null || extracted.adjusted === undefined
        ? null
        : Boolean(extracted.adjusted),
      action: textOrNull(extracted.action)
    };
  } else if (submission.form_type === 'tyre_inspection') {
    table = 'fitter_tyre_inspection_entries';
    row = {
      ...common,
      tyre_serial: textOrNull(extracted.tyre_serial, { upper: true }),
      vehicle_no: vehicleNo,
      position_code: positionCode,
      meter_reading: numberOrNull(extracted.meter_reading),
      rtd1: numberOrNull(extracted.rtd1),
      rtd2: numberOrNull(extracted.rtd2),
      damage_class: textOrNull(extracted.damage_class),
      severity: normalizeSeverity(extracted.severity),
      remarks: textOrNull(extracted.remarks)
    };
  } else if (submission.form_type === 'tyre_removal') {
    table = 'fitter_tyre_removal_entries';

    const fitmentReading = numberOrNull(extracted.fitment_reading);
    const currentReading = numberOrNull(extracted.current_reading);
    const explicitLife = numberOrNull(extracted.life_achieved);
    const computedLife = Number.isFinite(fitmentReading) && Number.isFinite(currentReading)
      ? Number((currentReading - fitmentReading).toFixed(2))
      : null;

    row = {
      ...common,
      tyre_serial: textOrNull(extracted.tyre_serial, { upper: true }),
      vehicle_no: vehicleNo,
      position_code: positionCode,
      fitment_reading: fitmentReading,
      current_reading: currentReading,
      life_achieved: explicitLife ?? computedLife,
      removal_reason: textOrNull(extracted.removal_reason),
      disposition: textOrNull(extracted.disposition),
      rtd1: numberOrNull(extracted.rtd1),
      rtd2: numberOrNull(extracted.rtd2),
      remarks: textOrNull(extracted.remarks)
    };
  } else if (submission.form_type === 'observation') {
    table = 'fitter_observation_entries';
    row = {
      ...common,
      vehicle_no: vehicleNo,
      position_code: positionCode,
      category: textOrNull(extracted.category),
      subcategory: textOrNull(extracted.subcategory),
      summary_text: textOrNull(extracted.summary_text),
      risk_level: normalizeRiskLevel(extracted.risk_level),
      suggested_action: textOrNull(extracted.suggested_action)
    };
  }

  if (!table || !row) {
    return null;
  }

  const { error } = await supabase
    .from(table)
    .upsert(row, { onConflict: 'submission_id' });

  if (error) {
    throw new Error(`Fitter tab table write failed (${table}): ${error.message}`);
  }

  return table;
}

export async function writeCompatibilityPayload({
  supabase,
  submission,
  extraction,
  actorId,
  approvalMode = 'auto',
  pipelineStatus = 'completed'
}) {
  const extracted = extraction.extracted;
  const context = extraction.context;
  const safeUserId = await resolveUserIdForLog(supabase, submission.user_id);
  const activityDate = toIsoDate(submission.capture_completed_at || submission.created_at);
  const marker = 'Auto-generated from voice evidence';

  const fitterTable = await upsertFitterFormEntry({
    supabase,
    submission,
    extraction,
    approvalMode,
    pipelineStatus
  });

  if (submission.form_type === 'observation') {
    const vehicleId = await ensureVehicle(supabase, {
      vehicleNo: extracted.vehicle_no || context.vehicle_no,
      siteId: submission.site_id,
      meterReading: NaN
    });

    const customerId = await resolveSiteCustomerId(supabase, submission.site_id);

    const { error: obsError } = await supabase
      .from('observation_entries')
      .insert({
        customer_id: customerId,
        site_id: submission.site_id,
        vehicle_id: vehicleId,
        tyre_id: null,
        category: extracted.category,
        observation_category: extracted.category,
        observation_type: extracted.subcategory,
        observation: `${extracted.summary_text}. ${marker}`,
        severity: extracted.risk_level === 'High' ? 'High' : 'Medium'
      });

    if (obsError) {
      throw new Error(`Observation write failed: ${obsError.message}`);
    }

    return {
      table: 'observation_entries',
      activity_type: 'OBSERVATION',
      fitter_table: fitterTable
    };
  }

  const vehicleId = await ensureVehicle(supabase, {
    vehicleNo: extracted.vehicle_no || context.vehicle_no,
    siteId: submission.site_id,
    meterReading: safeNumber(extracted.meter_reading || extracted.current_reading, NaN)
  });

  const tyreData = await ensureTyre(supabase, {
    tyreSerial: extracted.tyre_serial,
    make: extracted.make,
    size: extracted.size,
    otd: safeNumber(extracted.otd, NaN)
  });

  const position = extracted.position_code || context.position_code;

  if (submission.form_type === 'tyre_card') {
    const meter = safeNumber(extracted.meter_reading, 0);
    const { error } = await supabase.from('tyre_activity_log').insert({
      activity_type: 'FITMENT',
      activity_date: activityDate,
      tyre_id: tyreData.id,
      vehicle_id: vehicleId,
      position,
      meter_reading: meter,
      rtd1: safeNumber(extracted.rtd1, normalizeFitmentType(extracted.fitment_type) === 'old' ? 15 : 20),
      rtd2: safeNumber(extracted.rtd2, normalizeFitmentType(extracted.fitment_type) === 'old' ? 15 : 20),
      remarks: marker,
      user_id: safeUserId
    });

    if (error) {
      throw new Error(`Tyre card write failed: ${error.message}`);
    }

    await supabase
      .from('tyres')
      .update({
        current_vehicle_id: vehicleId,
        current_position: position,
        status: 'Running'
      })
      .eq('id', tyreData.id);

    if (meter > 0) {
      await supabase.from('vehicles').update({ current_odometer: meter }).eq('id', vehicleId);
    }

    return {
      table: 'tyre_activity_log',
      activity_type: 'FITMENT',
      fitter_table: fitterTable
    };
  }

  if (submission.form_type === 'pressure_check') {
    const found = safeNumber(extracted.found_psi, 0);
    const recommended = safeNumber(extracted.target_psi, FIXED_TARGET_PSI);
    const actionLower = String(extracted.action || '').toLowerCase();
    const corrected = actionLower.includes('not corrected') ? found : recommended;
    const actionText = `${extracted.action || 'Checked OK'} [Auto]`;

    const { error } = await supabase.from('tyre_activity_log').insert({
      activity_type: 'PRESSURE_CHECK',
      activity_date: activityDate,
      tyre_id: tyreData.id,
      vehicle_id: vehicleId,
      position,
      psi_found: found,
      psi_corrected: corrected,
      remarks: actionText,
      user_id: safeUserId
    });

    if (error) {
      throw new Error(`Pressure write failed: ${error.message}`);
    }

    await supabase
      .from('tyres')
      .update({
        current_vehicle_id: vehicleId,
        current_position: position,
        status: 'Running'
      })
      .eq('id', tyreData.id);

    const alertPayload = (found > 0 && found < recommended)
      ? {
          tyreNo: extracted.tyre_serial || 'Unknown',
          position: position || 'Unknown',
          currentPsi: found,
          targetPsi: recommended,
          truckNo: extracted.vehicle_no || context.vehicle_no || 'Unknown'
        }
      : null;

    if (alertPayload) {
      checkAndDispatchAlerts(supabase, {
        siteId: submission.site_id,
        eventType: 'pressure_drop',
        payload: alertPayload
      }).catch(() => {});
    }

    return {
      table: 'tyre_activity_log',
      activity_type: 'PRESSURE_CHECK',
      fitter_table: fitterTable,
      alert_payload: alertPayload
    };
  }

  if (submission.form_type === 'tyre_inspection') {
    const meter = safeNumber(extracted.meter_reading, 0);
    const { error } = await supabase.from('tyre_activity_log').insert({
      activity_type: 'INSPECTION',
      activity_date: activityDate,
      tyre_id: tyreData.id,
      vehicle_id: vehicleId,
      position,
      meter_reading: meter,
      rtd1: safeNumber(extracted.rtd1, 0),
      rtd2: safeNumber(extracted.rtd2, 0),
      remarks: `${extracted.remarks || 'Inspection auto-generated'} [Damage: ${extracted.damage_class || 'None'}]`,
      user_id: safeUserId
    });

    if (error) {
      throw new Error(`Inspection write failed: ${error.message}`);
    }

    await supabase
      .from('tyres')
      .update({
        current_vehicle_id: vehicleId,
        current_position: position,
        status: 'Running'
      })
      .eq('id', tyreData.id);

    if (meter > 0) {
      await supabase.from('vehicles').update({ current_odometer: meter }).eq('id', vehicleId);
    }

    checkAndDispatchAlerts(supabase, {
      siteId: submission.site_id,
      eventType: 'rtd_threshold',
      payload: {
        tyreNo: extracted.tyre_serial || 'Unknown',
        currentRtd: Math.min(safeNumber(extracted.rtd1, 0), safeNumber(extracted.rtd2, 0)),
        thresholdRtd: 3,
        truckNo: extracted.vehicle_no || context.vehicle_no || 'Unknown',
        position: position || 'Unknown'
      }
    }).catch(() => {});

    return {
      table: 'tyre_activity_log',
      activity_type: 'INSPECTION',
      fitter_table: fitterTable
    };
  }

  if (submission.form_type === 'tyre_removal') {
    const currentReading = safeNumber(extracted.current_reading, NaN);
    const explicitFitmentReading = safeNumber(extracted.fitment_reading, NaN);
    const derivedFitmentReading = Number.isFinite(explicitFitmentReading)
      ? explicitFitmentReading
      : await resolveLatestFitmentReading(supabase, tyreData.id);
    const fallbackLife = Math.max(0, safeNumber(extracted.life_achieved, 0));
    const lifeAchieved = Number.isFinite(currentReading)
      && Number.isFinite(derivedFitmentReading)
      && currentReading >= derivedFitmentReading
      ? Number((currentReading - derivedFitmentReading).toFixed(2))
      : fallbackLife;
    const newTotalLife = safeNumber(tyreData.total_life_run, 0) + lifeAchieved;

    const fitterRemovalPatch = {
      life_achieved: lifeAchieved
    };
    if (Number.isFinite(derivedFitmentReading)) {
      fitterRemovalPatch.fitment_reading = derivedFitmentReading;
    }

    const { error: removalPatchError } = await supabase
      .from('fitter_tyre_removal_entries')
      .update(fitterRemovalPatch)
      .eq('submission_id', submission.id);

    if (removalPatchError) {
      console.warn('Failed to patch fitter removal lifecycle fields:', removalPatchError.message);
    }

    const { error } = await supabase.from('tyre_activity_log').insert({
      activity_type: 'REMOVAL',
      activity_date: activityDate,
      tyre_id: tyreData.id,
      vehicle_id: vehicleId,
      position,
      meter_reading: safeNumber(currentReading, 0),
      rtd1: safeNumber(extracted.rtd1, 0),
      rtd2: safeNumber(extracted.rtd2, 0),
      life_achieved_in_this_run: lifeAchieved,
      removal_reason: extracted.removal_reason,
      remarks: extracted.remarks || marker,
      user_id: safeUserId
    });

    if (error) {
      throw new Error(`Removal write failed: ${error.message}`);
    }

    await supabase
      .from('tyres')
      .update({
        current_vehicle_id: null,
        current_position: null,
        status: extracted.disposition || 'Spare',
        total_life_run: newTotalLife
      })
      .eq('id', tyreData.id);

    if (Number.isFinite(currentReading) && currentReading > 0) {
      await supabase.from('vehicles').update({ current_odometer: currentReading }).eq('id', vehicleId);
    }

    checkAndDispatchAlerts(supabase, {
      siteId: submission.site_id,
      eventType: 'tyre_removed',
      payload: {
        tyreNo: extracted.tyre_serial || 'Unknown',
        position: position || 'Unknown',
        truckNo: extracted.vehicle_no || context.vehicle_no || 'Unknown',
        reason: extracted.removal_reason || 'Not specified'
      }
    }).catch(() => {});

    return {
      table: 'tyre_activity_log',
      activity_type: 'REMOVAL',
      fitter_table: fitterTable
    };
  }

  await createAuditEvent(supabase, {
    entityType: 'offline_submission',
    entityId: submission.id,
    eventType: 'compatibility_write_skipped',
    actorId,
    payload: {
      form_type: submission.form_type
    }
  });

  return {
    table: null,
    activity_type: null,
    fitter_table: fitterTable
  };
}

export async function projectSubmissionToDomain({
  supabase,
  submission,
  extraction,
  actorId,
  approvalMode = 'auto',
  pipelineStatus = 'completed',
  sourceType = 'offline_submission',
  sourcePk = null,
  projectionVersion = 1
}) {
  const resolvedSourcePk = String(sourcePk || submission?.id || '').trim();
  const resolvedProjectionVersion = Number.isFinite(Number(projectionVersion))
    ? Number(projectionVersion)
    : 1;

  if (!resolvedSourcePk) {
    throw new Error('Projection source key is required');
  }

  let journalEnabled = true;
  let journalRow = null;

  try {
    const upsertJournal = await supabase
      .schema('ops')
      .from('domain_projection_journal')
      .upsert({
        source_type: sourceType,
        source_pk: resolvedSourcePk,
        submission_id: submission?.id || null,
        projection_version: resolvedProjectionVersion,
        status: 'running',
        error_message: null,
        meta_json: {
          form_type: submission?.form_type || null,
          approval_mode: approvalMode,
          pipeline_status: pipelineStatus
        },
        applied_at: null
      }, {
        onConflict: 'source_type,source_pk,projection_version'
      })
      .select('id, status, applied_at, error_message, meta_json')
      .maybeSingle();

    if (upsertJournal.error) {
      if (isCompatibilitySchemaError(upsertJournal.error)) {
        journalEnabled = false;
      } else {
        throw new Error(`Domain projection journal write failed: ${upsertJournal.error.message}`);
      }
    } else {
      journalRow = upsertJournal.data || null;
      if (journalRow?.status === 'applied') {
        return {
          table: null,
          activity_type: null,
          skipped: true,
          reason: 'Domain projection already applied',
          projection: {
            source_type: sourceType,
            source_pk: resolvedSourcePk,
            projection_version: resolvedProjectionVersion,
            status: 'applied'
          }
        };
      }
    }
  } catch (error) {
    throw error;
  }

  try {
    const compatibilityWrite = await writeCompatibilityPayload({
      supabase,
      submission,
      extraction,
      actorId,
      approvalMode,
      pipelineStatus
    });

    if (journalEnabled) {
      await supabase
        .schema('ops')
        .from('domain_projection_journal')
        .update({
          status: 'applied',
          applied_at: new Date().toISOString(),
          error_message: null,
          meta_json: {
            form_type: submission?.form_type || null,
            approval_mode: approvalMode,
            pipeline_status: pipelineStatus,
            compatibility_write: compatibilityWrite
          }
        })
        .eq('source_type', sourceType)
        .eq('source_pk', resolvedSourcePk)
        .eq('projection_version', resolvedProjectionVersion);
    }

    await supabase
      .schema('ops')
      .from('offline_submissions')
      .update({
        projected_to_domain: true,
        projected_at: new Date().toISOString(),
        projection_version: resolvedProjectionVersion,
        projection_error: null
      })
      .eq('id', submission.id);

    return {
      ...compatibilityWrite,
      projection: {
        source_type: sourceType,
        source_pk: resolvedSourcePk,
        projection_version: resolvedProjectionVersion,
        status: 'applied'
      }
    };
  } catch (error) {
    if (journalEnabled) {
      await supabase
        .schema('ops')
        .from('domain_projection_journal')
        .update({
          status: 'failed',
          error_message: error?.message || 'Domain projection failed',
          meta_json: {
            form_type: submission?.form_type || null,
            approval_mode: approvalMode,
            pipeline_status: pipelineStatus,
            journal_id: journalRow?.id || null
          }
        })
        .eq('source_type', sourceType)
        .eq('source_pk', resolvedSourcePk)
        .eq('projection_version', resolvedProjectionVersion);
    }

    await supabase
      .schema('ops')
      .from('offline_submissions')
      .update({
        projected_to_domain: false,
        projection_version: resolvedProjectionVersion,
        projection_error: error?.message || 'Domain projection failed'
      })
      .eq('id', submission.id);

    throw error;
  }
}

async function upsertReviewQueue(supabase, submissionId, reason, priority, actorId) {
  const { data: existing } = await supabase
    .schema('ops')
    .from('review_queue')
    .select('id, status')
    .eq('submission_id', submissionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id && (existing.status === 'pending' || existing.status === 'in_progress')) {
    await supabase
      .schema('ops')
      .from('review_queue')
      .update({
        reason,
        priority,
        status: 'pending',
        resolved_at: null
      })
      .eq('id', existing.id);
    return existing.id;
  }

  const { data: created, error } = await supabase
    .schema('ops')
    .from('review_queue')
    .insert({
      submission_id: submissionId,
      reason,
      priority,
      status: 'pending'
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Review queue insert failed: ${error.message}`);
  }

  await createAuditEvent(supabase, {
    entityType: 'review_queue',
    entityId: created.id,
    eventType: 'review_enqueued',
    actorId,
    payload: {
      submission_id: submissionId,
      reason,
      priority
    }
  });

  return created.id;
}

function buildReviewReason(extraction) {
  if (!extraction.validation?.is_valid) {
    return `Validation failed: ${extraction.validation.errors.join('; ')}`;
  }
  if (extraction.overall_confidence < 0.6) {
    return `Low extraction confidence (${Math.round(extraction.overall_confidence * 100)}%)`;
  }
  return `Manager verification required (${Math.round(extraction.overall_confidence * 100)}% confidence)`;
}

function normalizeMetaJson(metaJson) {
  if (metaJson && typeof metaJson === 'object' && !Array.isArray(metaJson)) {
    return { ...metaJson };
  }
  return {};
}

async function persistMediaPipelineMetadata({ supabase, mediaRows, ocrByStep }) {
  for (const row of mediaRows || []) {
    const stepResult = ocrByStep?.[row.step_id];
    if (!stepResult) continue;

    const metaJson = normalizeMetaJson(row.meta_json);
    const pipeline = normalizeMetaJson(metaJson.pipeline);

    if (String(row.media_kind || '').toLowerCase() === 'audio') {
      pipeline.asr_enabled = true;
      pipeline.asr_model = stepResult.model || null;
      pipeline.asr_error = stepResult.error || null;
      pipeline.asr_transcript = stepResult.transcript || stepResult.full_text || '';
      pipeline.asr_confidence = Number.isFinite(Number(stepResult.confidence))
        ? Number(clamp(Number(stepResult.confidence), 0, 1).toFixed(4))
        : null;
      pipeline.asr_alternatives = Array.isArray(stepResult.alternatives) ? stepResult.alternatives : [];
      pipeline.asr_duration_seconds = Number.isFinite(Number(stepResult.duration_seconds))
        ? Number(stepResult.duration_seconds)
        : null;
      pipeline.extracted_data = stepResult.extracted_data || null;
      pipeline.processed_at = new Date().toISOString();
      metaJson.pipeline = pipeline;

      const { error } = await supabase
        .schema('ops')
        .from('submission_media')
        .update({ meta_json: metaJson })
        .eq('id', row.id);

      if (error) {
        throw new Error(`Failed to persist media pipeline metadata: ${error.message}`);
      }
      continue;
    }

    pipeline.photo_category = stepResult.photo_category || pipeline.photo_category || 'Miscellaneous';
    pipeline.classifier = stepResult.classifier || pipeline.classifier || 'guided_step_router_v1';

    const confidence = Number(stepResult.category_confidence);
    if (Number.isFinite(confidence)) {
      pipeline.category_confidence = Number(clamp(confidence, 0.01, 0.99).toFixed(4));
    }

    if (Array.isArray(stepResult.classifier_labels)) {
      pipeline.classifier_labels = stepResult.classifier_labels;
    } else if (!Array.isArray(pipeline.classifier_labels)) {
      pipeline.classifier_labels = [];
    }

    pipeline.ocr_enabled = Boolean(stepResult.ocr_enabled);
    pipeline.ocr_text = stepResult.full_text || '';
    pipeline.ocr_tokens = Array.isArray(stepResult.tokens) ? stepResult.tokens : [];
    pipeline.ocr_error = stepResult.error || null;
    pipeline.classifier_error = stepResult.classifier_error || null;
    pipeline.ocr_model = stepResult.model || pipeline.ocr_model || null;
    pipeline.exif_datetime_original = stepResult.exif_datetime_original
      || pipeline.exif_datetime_original
      || metaJson.exif_datetime_original
      || null;
    pipeline.processed_at = new Date().toISOString();

    metaJson.pipeline = pipeline;

    const { error } = await supabase
      .schema('ops')
      .from('submission_media')
      .update({ meta_json: metaJson })
      .eq('id', row.id);

    if (error) {
      throw new Error(`Failed to persist media pipeline metadata: ${error.message}`);
    }
  }
}

export async function runDeepProcessingForSubmission({ supabase, submissionId, actorId }) {
  const { data: submission, error: submissionError } = await supabase
    .schema('ops')
    .from('offline_submissions')
    .select('id, form_type, site_id, user_id, device_id, local_submission_id, context_json, capture_started_at, capture_completed_at, created_at, sync_status, processing_status, projection_version')
    .eq('id', submissionId)
    .maybeSingle();

  if (submissionError) {
    throw new Error(`Submission lookup failed: ${submissionError.message}`);
  }
  if (!submission) {
    throw new Error('Submission not found for processing');
  }

  const { data: existingFinal } = await supabase
    .schema('ops')
    .from('final_reports')
    .select('id, final_payload, approval_mode, approved_at')
    .eq('submission_id', submission.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingFinal?.id) {
    await supabase
      .schema('ops')
      .from('offline_submissions')
      .update({ processing_status: 'completed' })
      .eq('id', submission.id);

    await supabase
      .schema('ops')
      .from('processing_jobs')
      .update({ status: 'completed', last_error: null })
      .eq('submission_id', submission.id)
      .eq('job_type', 'extract_and_validate');

    return {
      submission_id: submission.id,
      pipeline_status: 'completed',
      processing_status: 'completed',
      decision: 'auto_approve',
      extracted: existingFinal.final_payload?.extracted || null,
      final_report: existingFinal
    };
  }

  await supabase
    .schema('ops')
    .from('offline_submissions')
    .update({ processing_status: 'running' })
    .eq('id', submission.id);

  const { data: jobs } = await supabase
    .schema('ops')
    .from('processing_jobs')
    .select('id, attempt_count')
    .eq('submission_id', submission.id)
    .eq('job_type', 'extract_and_validate')
    .limit(1);

  const job = Array.isArray(jobs) && jobs.length > 0 ? jobs[0] : null;

  if (job?.id) {
    await supabase
      .schema('ops')
      .from('processing_jobs')
      .update({
        status: 'running',
        attempt_count: safeNumber(job.attempt_count, 0) + 1,
        last_error: null,
        next_run_at: new Date().toISOString()
      })
      .eq('id', job.id);
  }

  const { data: mediaRows, error: mediaError } = await supabase
    .schema('ops')
    .from('submission_media')
    .select('id, step_id, sha256, storage_path, media_kind, meta_json')
    .eq('submission_id', submission.id)
    .order('captured_at', { ascending: true });

  if (mediaError) {
    throw new Error(`Media lookup failed: ${mediaError.message}`);
  }
  if (!mediaRows || mediaRows.length === 0) {
    throw new Error('No media rows found for processing');
  }

  const bucket = getBucketName();
  const ocrByStep = await runOcrForMediaRows({
    supabase,
    mediaRows,
    bucket,
    formType: submission.form_type
  });

  const asrByStep = await runAsrForMediaRows({
    supabase,
    mediaRows,
    bucket,
    formType: submission.form_type
  });

  const mediaInsightsByStep = {
    ...ocrByStep,
    ...asrByStep
  };

  await persistMediaPipelineMetadata({
    supabase,
    mediaRows,
    ocrByStep: mediaInsightsByStep
  });

  const ocrHints = parseOcrHints(submission.form_type, mediaInsightsByStep, mediaRows);

  const categoryCounts = Object.values(ocrByStep).reduce((acc, entry) => {
    const key = entry?.photo_category || 'Miscellaneous';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const ocrAttempted = Object.values(ocrByStep).filter((entry) => entry?.ocr_enabled).length;
  const ocrSucceeded = Object.values(ocrByStep)
    .filter((entry) => entry?.ocr_enabled && !entry?.error)
    .length;
  const asrAttempted = Object.keys(asrByStep).length;
  const asrSucceeded = Object.values(asrByStep).filter((entry) => !entry?.error && entry?.transcript).length;

  const extraction = buildExtractionPayload(submission, mediaRows, ocrHints);
  extraction.ocr_summary = {
    total_steps: Object.keys(mediaInsightsByStep).length,
    extracted_tokens: Object.values(mediaInsightsByStep).reduce((count, entry) => count + (entry?.tokens?.length || 0), 0),
    errors: Object.values(mediaInsightsByStep).filter((entry) => entry?.error).length,
    ocr_attempted: ocrAttempted,
    ocr_succeeded: ocrSucceeded,
    asr_attempted: asrAttempted,
    asr_succeeded: asrSucceeded,
    category_counts: categoryCounts
  };

  await upsertExtractedFields(supabase, submission.id, extraction);

  await createAuditEvent(supabase, {
    entityType: 'offline_submission',
    entityId: submission.id,
    eventType: 'extraction_completed',
    actorId,
    payload: {
      decision: extraction.decision,
      overall_confidence: extraction.overall_confidence,
      validation: extraction.validation,
      blur_score: extraction.blur_score,
      ocr_summary: extraction.ocr_summary
    }
  });

  if (extraction.decision !== 'auto_approve') {
    let reviewFitterTable = null;
    try {
      reviewFitterTable = await upsertFitterFormEntry({
        supabase,
        submission,
        extraction,
        approvalMode: 'auto',
        pipelineStatus: 'needs_review'
      });
    } catch (error) {
      console.warn('Failed to upsert fitter review entry:', error?.message || error);
    }

    const reason = buildReviewReason(extraction);
    const priority = extraction.overall_confidence < 0.6 ? 'high' : 'normal';
    await upsertReviewQueue(supabase, submission.id, reason, priority, actorId);

    await supabase
      .schema('ops')
      .from('offline_submissions')
      .update({ processing_status: 'needs_review' })
      .eq('id', submission.id);

    await supabase
      .schema('ops')
      .from('processing_jobs')
      .update({ status: 'completed', last_error: null })
      .eq('submission_id', submission.id)
      .eq('job_type', 'extract_and_validate');

    await createAuditEvent(supabase, {
      entityType: 'offline_submission',
      entityId: submission.id,
      eventType: 'fitter_review_entry_upserted',
      actorId,
      payload: {
        fitter_table: reviewFitterTable,
        pipeline_status: 'needs_review'
      }
    });

    return {
      submission_id: submission.id,
      pipeline_status: 'needs_review',
      processing_status: 'needs_review',
      decision: extraction.decision,
      extracted: extraction.extracted,
      validation: extraction.validation,
      overall_confidence: extraction.overall_confidence
    };
  }

  let compatibilityWrite;
  try {
    compatibilityWrite = await projectSubmissionToDomain({
      supabase,
      submission,
      extraction,
      actorId,
      approvalMode: 'auto',
      pipelineStatus: 'completed',
      sourceType: 'offline_submission',
      sourcePk: submission.id,
      projectionVersion: submission.projection_version || 1
    });
  } catch (error) {
    const reason = error?.message || 'Compatibility write failed';

    await createAuditEvent(supabase, {
      entityType: 'offline_submission',
      entityId: submission.id,
      eventType: isCompatibilitySchemaError(error)
        ? 'compatibility_write_skipped_schema'
        : 'compatibility_write_skipped_runtime',
      actorId,
      payload: {
        reason
      }
    });

    await supabase
      .schema('ops')
      .from('offline_submissions')
      .update({ processing_status: 'failed' })
      .eq('id', submission.id);

    await supabase
      .schema('ops')
      .from('processing_jobs')
      .update({ status: 'failed', last_error: reason })
      .eq('submission_id', submission.id)
      .eq('job_type', 'extract_and_validate');

    throw new Error(`Compatibility write failed: ${reason}`);
  }

  const finalPayload = {
    generated_at: new Date().toISOString(),
    form_type: submission.form_type,
    context: extraction.context,
    extracted: extraction.extracted,
    field_confidence: extraction.field_confidence,
    overall_confidence: extraction.overall_confidence,
    validation: extraction.validation,
    decision: extraction.decision,
    ocr_summary: extraction.ocr_summary,
    ocr_hints: extraction.ocr_hints,
    compatibility_write: compatibilityWrite
  };

  const { data: finalReport, error: finalError } = await supabase
    .schema('ops')
    .from('final_reports')
    .insert({
      submission_id: submission.id,
      final_payload: finalPayload,
      approval_mode: 'auto',
      approved_by: null,
      approved_at: new Date().toISOString()
    })
    .select('id, approval_mode, approved_at, final_payload')
    .single();

  if (finalError) {
    throw new Error(`Final report insert failed: ${finalError.message}`);
  }

  await supabase
    .schema('ops')
    .from('offline_submissions')
    .update({ processing_status: 'completed' })
    .eq('id', submission.id);

  await supabase
    .schema('ops')
    .from('processing_jobs')
    .update({ status: 'completed', last_error: null })
    .eq('submission_id', submission.id)
    .eq('job_type', 'extract_and_validate');

  await createAuditEvent(supabase, {
    entityType: 'offline_submission',
    entityId: submission.id,
    eventType: 'submission_auto_approved',
    actorId,
    payload: {
      final_report_id: finalReport.id,
      compatibility_write: compatibilityWrite,
      overall_confidence: extraction.overall_confidence
    }
  });

  return {
    submission_id: submission.id,
    pipeline_status: 'completed',
    processing_status: 'completed',
    decision: extraction.decision,
    extracted: extraction.extracted,
    validation: extraction.validation,
    overall_confidence: extraction.overall_confidence,
    final_report: {
      id: finalReport.id,
      approval_mode: finalReport.approval_mode,
      approved_at: finalReport.approved_at
    }
  };
}
