import { readFile } from 'node:fs/promises';

const DEFAULT_CSV_PATH = 'D:/Inspection_data/Inspection_data/Aug-25_combined_comp.csv';
const DEFAULT_SITE_ID = 'a6baef7b-a6b8-4db2-85bf-7b1f1619b92d';
const DEFAULT_ACTOR_IDENTIFIER = 'rimsplintern2@gmail.com';
const DEFAULT_CHUNK_SIZE = 200;

const POSITION_MAP = {
  FL: 'FL',
  FR: 'FR',
  RLI: 'AX3LI',
  RLO: 'AX3LO',
  RRI: 'AX3RI',
  RRO: 'AX3RO'
};

function parseArgs(argv) {
  const args = {
    csv: DEFAULT_CSV_PATH,
    endpoint: '',
    siteId: DEFAULT_SITE_ID,
    actor: DEFAULT_ACTOR_IDENTIFIER,
    chunkSize: DEFAULT_CHUNK_SIZE,
    dryRun: false,
    skipClear: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const part = String(argv[i] || '').trim();
    if (!part.startsWith('--')) continue;

    const [rawKey, inlineValue] = part.split('=', 2);
    const key = rawKey.slice(2);
    const nextValue = inlineValue ?? argv[i + 1];

    if (key === 'dry-run') {
      args.dryRun = true;
      continue;
    }

    if (key === 'skip-clear') {
      args.skipClear = true;
      continue;
    }

    if (inlineValue == null) {
      i += 1;
    }

    if (key === 'csv') args.csv = String(nextValue || '').trim();
    if (key === 'endpoint') args.endpoint = String(nextValue || '').trim();
    if (key === 'site-id') args.siteId = String(nextValue || '').trim();
    if (key === 'actor') args.actor = String(nextValue || '').trim();
    if (key === 'chunk-size') args.chunkSize = Number(nextValue) || DEFAULT_CHUNK_SIZE;
  }

  return args;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(cell);
      cell = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      continue;
    }

    cell += ch;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }

  if (rows.length === 0) return [];

  const header = rows[0].map((key) => String(key || '').trim());
  return rows.slice(1).map((cells) => {
    const item = {};
    for (let i = 0; i < header.length; i += 1) {
      item[header[i]] = String(cells[i] || '').trim();
    }
    return item;
  });
}

function toIsoDate(dateText) {
  const raw = String(dateText || '').trim();
  const match = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}T00:00:00.000Z`;
}

function toNumberOrNull(value) {
  const num = Number(String(value || '').replace(/,/g, '').trim());
  return Number.isFinite(num) ? num : null;
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function buildPayloadRows(csvRows) {
  const transformed = [];

  for (const row of csvRows) {
    const position = String(row['Position'] || '').trim().toUpperCase();
    const mappedPosition = POSITION_MAP[position] || '';
    const captureAt = toIsoDate(row['Date']);
    const vehicleNo = String(row['D.No'] || '').trim();
    const tyreSerial = String(row['Tyre No.'] || '').trim();

    if (!mappedPosition || !captureAt || !vehicleNo || !tyreSerial) {
      continue;
    }

    transformed.push({
      source_row_no: toNumberOrNull(row['S.no']),
      capture_at: captureAt,
      vehicle_no: vehicleNo,
      position_code: mappedPosition,
      tyre_serial: tyreSerial,
      size: String(row['Tyre Size'] || '').trim() || null,
      odometer: toNumberOrNull(row['KM']),
      rtd1: toNumberOrNull(row['Remaining Tread Depth A- mm']),
      rtd2: toNumberOrNull(row['Remaining Tread Depth B - mm']),
      found_psi: toNumberOrNull(row['Pressure']),
      remark: String(row['Remark'] || '').trim() || null
    });
  }

  return transformed;
}

function buildFitmentRows(rows) {
  const unique = new Map();
  const sorted = [...rows].sort((a, b) => String(a.capture_at).localeCompare(String(b.capture_at)));

  for (const row of sorted) {
    const key = `${row.vehicle_no}|${row.position_code}|${row.tyre_serial}`;
    if (unique.has(key)) continue;
    unique.set(key, {
      source_row_no: row.source_row_no,
      capture_at: row.capture_at,
      vehicle_no: row.vehicle_no,
      position_code: row.position_code,
      tyre_serial: row.tyre_serial,
      size: row.size,
      odometer: row.odometer,
      rtd1: row.rtd1,
      rtd2: row.rtd2
    });
  }

  return [...unique.values()];
}

async function postJson(endpoint, body) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(json)}`);
  }

  return json;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.endpoint && !args.dryRun) {
    throw new Error('--endpoint is required unless --dry-run is used');
  }

  const csvText = await readFile(args.csv, 'utf8');
  const parsedCsvRows = parseCsv(csvText);
  const rows = buildPayloadRows(parsedCsvRows);
  const fitmentRows = buildFitmentRows(rows);

  console.log(`CSV rows parsed: ${parsedCsvRows.length}`);
  console.log(`Import rows prepared: ${rows.length}`);
  console.log(`Fitment rows prepared: ${fitmentRows.length}`);

  const rowChunks = chunkArray(rows, Math.max(1, Math.floor(args.chunkSize)));
  const fitmentChunks = chunkArray(fitmentRows, Math.max(1, Math.floor(args.chunkSize)));

  if (args.dryRun) {
    console.log('Dry-run complete. No API calls executed.');
    return;
  }

  if (!args.skipClear) {
    const clearResult = await postJson(args.endpoint, {
      action: 'clear_site_entries',
      site_id: args.siteId,
      actor_identifier: args.actor,
      confirm: true
    });
    console.log('Clear result:', JSON.stringify(clearResult));
  }

  let totalFitment = 0;
  for (let i = 0; i < fitmentChunks.length; i += 1) {
    const result = await postJson(args.endpoint, {
      action: 'import_batch',
      site_id: args.siteId,
      actor_identifier: args.actor,
      rows: [],
      fitment_rows: fitmentChunks[i]
    });
    totalFitment += Number(result?.inserted?.fitment || 0);
    console.log(`Fitment chunk ${i + 1}/${fitmentChunks.length} inserted: ${JSON.stringify(result.inserted || {})}`);
  }

  let totalPressure = 0;
  let totalInspection = 0;
  let totalSubmissions = 0;
  for (let i = 0; i < rowChunks.length; i += 1) {
    const result = await postJson(args.endpoint, {
      action: 'import_batch',
      site_id: args.siteId,
      actor_identifier: args.actor,
      rows: rowChunks[i],
      fitment_rows: []
    });
    totalPressure += Number(result?.inserted?.pressure || 0);
    totalInspection += Number(result?.inserted?.inspection || 0);
    totalSubmissions += Number(result?.inserted?.submissions || 0);
    console.log(`Rows chunk ${i + 1}/${rowChunks.length} inserted: ${JSON.stringify(result.inserted || {})}`);
  }

  console.log('Import complete.');
  console.log(`Total fitment inserted: ${totalFitment}`);
  console.log(`Total pressure inserted: ${totalPressure}`);
  console.log(`Total inspection inserted: ${totalInspection}`);
  console.log(`Total submissions inserted: ${totalSubmissions}`);
}

main().catch((error) => {
  console.error('Import failed:', error.message || error);
  process.exitCode = 1;
});
