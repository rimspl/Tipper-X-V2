import { POSITION_CODES } from '../../shared/field-masters.js';

const LEGACY_POSITION_ALIAS = {
  RLI: 'AX3LI',
  RLO: 'AX3LO',
  RRI: 'AX3RI',
  RRO: 'AX3RO',
  LII: 'AX3LI',
  LIO: 'AX3LO',
  RII: 'AX3RI',
  RIO: 'AX3RO'
};

export function canonicalVehicleNo(value) {
  const key = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return key || null;
}

export function normalizeVehicleNo(value, fallback = null) {
  const key = canonicalVehicleNo(value);
  if (!key) {
    return fallback;
  }

  if (/^[A-Z]{1,3}[0-9]{1,4}$/.test(key)) {
    return key.replace(/^([A-Z]+)([0-9]+)$/i, '$1-$2');
  }

  return key;
}

export function canonicalTyreSerial(value) {
  const key = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return key || null;
}

export function normalizeTyreSerial(value, fallback = null) {
  return canonicalTyreSerial(value) || fallback;
}

export function normalizePositionCode(value, fallback = null) {
  const cleaned = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  if (!cleaned) {
    return fallback;
  }

  if (LEGACY_POSITION_ALIAS[cleaned]) {
    return LEGACY_POSITION_ALIAS[cleaned];
  }

  if (POSITION_CODES.includes(cleaned)) {
    return cleaned;
  }

  const axleMatch = cleaned.match(/^AX([34])([LR])([OI])$/);
  if (axleMatch) {
    return `AX${axleMatch[1]}${axleMatch[2]}${axleMatch[3]}`;
  }

  return fallback;
}
