import { createClient } from '@supabase/supabase-js';
import {
  canonicalTyreSerial,
  canonicalVehicleNo,
  normalizePositionCode,
  normalizeTyreSerial,
  normalizeVehicleNo
} from '../services/domain/identity.js';

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim();
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const DEFAULT_BATCH = 300;
const PROJECTION_VERSION = 1;

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const args = parseArgs(process.argv.slice(2));

await main();

async function main() {
  const summary = {
    processed: 0,
    applied: 0,
    skipped: 0,
    failed: 0
  };

  const selectedForms = args.forms;
  const shouldRun = (formType) => {
    if (!selectedForms || selectedForms.length === 0) return true;
    return selectedForms.includes(formType);
  };

  if (shouldRun('tyre_card')) {
    await processTable({
      table: 'fitter_tyre_card_entries',
      formType: 'tyre_card',
      buildEvent: buildFitmentEvent,
      summary
    });
  }

  if (shouldRun('pressure_check')) {
    await processTable({
      table: 'fitter_pressure_check_entries',
      formType: 'pressure_check',
      buildEvent: buildPressureEvent,
      summary
    });
  }

  if (shouldRun('tyre_inspection')) {
    await processTable({
      table: 'fitter_tyre_inspection_entries',
      formType: 'tyre_inspection',
      buildEvent: buildInspectionEvent,
      summary
    });
  }

  if (shouldRun('tyre_removal')) {
    await processTable({
      table: 'fitter_tyre_removal_entries',
      formType: 'tyre_removal',
      buildEvent: buildRemovalEvent,
      summary
    });
  }

  console.log('Backfill complete');
  console.log(JSON.stringify(summary, null, 2));
}

async function processTable({ table, formType, buildEvent, summary }) {
  let offset = 0;
  const batchSize = args.batchSize;
  let tableProcessed = 0;
  const tableStartedAt = Date.now();

  console.log(`\n[${table}] Backfill start (batchSize=${batchSize}${args.siteId ? `, siteId=${args.siteId}` : ''})`);

  for (;;) {
    const query = supabase
      .from(table)
      .select('*')
      .order('capture_completed_at', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true, nullsFirst: true })
      .range(offset, offset + batchSize - 1);

    const scoped = args.siteId ? query.eq('site_id', args.siteId) : query;
    const { data, error } = await scoped;
    if (error) {
      throw new Error(`Failed to fetch ${table}: ${error.message}`);
    }

    const rows = Array.isArray(data) ? data : [];
    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      summary.processed += 1;
      tableProcessed += 1;
      const sourceType = 'fitter_entry';
      const sourcePk = `${formType}:${row.id}`;

      const replay = await isAlreadyApplied({ sourceType, sourcePk });
      if (replay) {
        summary.skipped += 1;
        continue;
      }

      try {
        const event = await buildEvent(row);
        if (!event) {
          await markJournal({ sourceType, sourcePk, status: 'skipped', row, errorMessage: 'Insufficient data' });
          summary.skipped += 1;
          continue;
        }

        await upsertEvent(event);
        await markJournal({ sourceType, sourcePk, status: 'applied', row, errorMessage: null });
        summary.applied += 1;
      } catch (error) {
        await markJournal({ sourceType, sourcePk, status: 'failed', row, errorMessage: error.message || String(error) });
        summary.failed += 1;
      }

      if (tableProcessed % 50 === 0) {
        const elapsed = Math.max(1, Math.round((Date.now() - tableStartedAt) / 1000));
        console.log(`[${table}] processed=${tableProcessed} applied=${summary.applied} skipped=${summary.skipped} failed=${summary.failed} (${elapsed}s)`);
      }
    }

    offset += rows.length;
    if (rows.length < batchSize) {
      break;
    }
  }

  const elapsedTotal = Math.max(1, Math.round((Date.now() - tableStartedAt) / 1000));
  console.log(`[${table}] Backfill done processed=${tableProcessed} (${elapsedTotal}s)`);
}

async function buildFitmentEvent(row) {
  const siteId = row.site_id;
  const vehicleNoRaw = row.vehicle_no || row.raw_payload?.extracted?.vehicle_no || row.raw_payload?.context?.vehicle_no;
  const tyreRaw = row.tyre_serial || row.raw_payload?.extracted?.tyre_serial;
  const positionRaw = row.position_code || row.raw_payload?.extracted?.position_code || row.raw_payload?.context?.position_code;
  const meter = toNumberOrNull(row.meter_reading ?? row.raw_payload?.extracted?.meter_reading);

  const vehicleNo = normalizeVehicleNo(vehicleNoRaw);
  const tyreSerial = normalizeTyreSerial(tyreRaw);
  const position = normalizePositionCode(positionRaw);
  if (!siteId || !vehicleNo || !tyreSerial || !position) {
    return null;
  }

  const vehicleId = await ensureVehicle({ siteId, vehicleNo, meterReading: meter });
  const tyreId = await ensureTyre({
    tyreSerial,
    make: row.make || row.raw_payload?.extracted?.make,
    size: row.size || row.raw_payload?.extracted?.size
  });

  return {
    source_type: 'fitter_entry',
    source_pk: `tyre_card:${row.id}`,
    projection_version: PROJECTION_VERSION,
    activity_type: 'FITMENT',
    activity_date: toIsoDate(row.capture_completed_at || row.created_at),
    tyre_id: tyreId,
    vehicle_id: vehicleId,
    position,
    meter_reading: meter,
    rtd1: toNumberOrNull(row.rtd1),
    rtd2: toNumberOrNull(row.rtd2),
    remarks: row.raw_payload?.extracted?.remarks || 'Backfilled from fitter_tyre_card_entries',
    user_id: row.user_id || null
  };
}

async function buildPressureEvent(row) {
  const siteId = row.site_id;
  const vehicleNo = normalizeVehicleNo(row.vehicle_no || row.raw_payload?.extracted?.vehicle_no || row.raw_payload?.context?.vehicle_no);
  const tyreSerial = normalizeTyreSerial(row.tyre_serial || row.raw_payload?.extracted?.tyre_serial);
  const position = normalizePositionCode(row.position_code || row.raw_payload?.extracted?.position_code || row.raw_payload?.context?.position_code);
  const found = toNumberOrNull(row.found_psi ?? row.raw_payload?.extracted?.found_psi);
  const corrected = toNumberOrNull(row.target_psi ?? row.raw_payload?.extracted?.target_psi);

  if (!siteId || !vehicleNo || !tyreSerial || !position || !Number.isFinite(found)) {
    return null;
  }

  const vehicleId = await ensureVehicle({ siteId, vehicleNo, meterReading: null });
  const tyreId = await ensureTyre({
    tyreSerial,
    make: row.raw_payload?.extracted?.make,
    size: row.raw_payload?.extracted?.size
  });

  return {
    source_type: 'fitter_entry',
    source_pk: `pressure_check:${row.id}`,
    projection_version: PROJECTION_VERSION,
    activity_type: 'PRESSURE_CHECK',
    activity_date: toIsoDate(row.capture_completed_at || row.created_at),
    tyre_id: tyreId,
    vehicle_id: vehicleId,
    position,
    psi_found: found,
    psi_corrected: corrected,
    remarks: row.action || row.raw_payload?.extracted?.action || 'Backfilled from fitter_pressure_check_entries',
    user_id: row.user_id || null
  };
}

async function buildInspectionEvent(row) {
  const siteId = row.site_id;
  const vehicleNo = normalizeVehicleNo(row.vehicle_no || row.raw_payload?.extracted?.vehicle_no || row.raw_payload?.context?.vehicle_no);
  const tyreSerial = normalizeTyreSerial(row.tyre_serial || row.raw_payload?.extracted?.tyre_serial);
  const position = normalizePositionCode(row.position_code || row.raw_payload?.extracted?.position_code || row.raw_payload?.context?.position_code);

  if (!siteId || !vehicleNo || !tyreSerial || !position) {
    return null;
  }

  const vehicleId = await ensureVehicle({
    siteId,
    vehicleNo,
    meterReading: toNumberOrNull(row.meter_reading ?? row.raw_payload?.extracted?.meter_reading)
  });
  const tyreId = await ensureTyre({
    tyreSerial,
    make: row.raw_payload?.extracted?.make,
    size: row.raw_payload?.extracted?.size
  });

  return {
    source_type: 'fitter_entry',
    source_pk: `tyre_inspection:${row.id}`,
    projection_version: PROJECTION_VERSION,
    activity_type: 'INSPECTION',
    activity_date: toIsoDate(row.capture_completed_at || row.created_at),
    tyre_id: tyreId,
    vehicle_id: vehicleId,
    position,
    meter_reading: toNumberOrNull(row.meter_reading ?? row.raw_payload?.extracted?.meter_reading),
    rtd1: toNumberOrNull(row.rtd1 ?? row.raw_payload?.extracted?.rtd1),
    rtd2: toNumberOrNull(row.rtd2 ?? row.raw_payload?.extracted?.rtd2),
    remarks: row.remarks || row.damage_class || row.raw_payload?.extracted?.remarks || 'Backfilled from fitter_tyre_inspection_entries',
    user_id: row.user_id || null
  };
}

async function buildRemovalEvent(row) {
  const siteId = row.site_id;
  const vehicleNo = normalizeVehicleNo(row.vehicle_no || row.raw_payload?.extracted?.vehicle_no || row.raw_payload?.context?.vehicle_no);
  const tyreSerial = normalizeTyreSerial(row.tyre_serial || row.raw_payload?.extracted?.tyre_serial);
  const position = normalizePositionCode(row.position_code || row.raw_payload?.extracted?.position_code || row.raw_payload?.context?.position_code);

  if (!siteId || !vehicleNo || !tyreSerial || !position) {
    return null;
  }

  const vehicleId = await ensureVehicle({
    siteId,
    vehicleNo,
    meterReading: toNumberOrNull(row.current_reading ?? row.raw_payload?.extracted?.current_reading)
  });
  const tyreId = await ensureTyre({
    tyreSerial,
    make: row.raw_payload?.extracted?.make,
    size: row.raw_payload?.extracted?.size
  });

  return {
    source_type: 'fitter_entry',
    source_pk: `tyre_removal:${row.id}`,
    projection_version: PROJECTION_VERSION,
    activity_type: 'REMOVAL',
    activity_date: toIsoDate(row.capture_completed_at || row.created_at),
    tyre_id: tyreId,
    vehicle_id: vehicleId,
    position,
    meter_reading: toNumberOrNull(row.current_reading ?? row.raw_payload?.extracted?.current_reading),
    rtd1: toNumberOrNull(row.rtd1 ?? row.raw_payload?.extracted?.rtd1),
    rtd2: toNumberOrNull(row.rtd2 ?? row.raw_payload?.extracted?.rtd2),
    life_achieved_in_this_run: toNumberOrNull(row.life_achieved ?? row.raw_payload?.extracted?.life_achieved),
    removal_reason: row.removal_reason || row.raw_payload?.extracted?.removal_reason || null,
    disposition: row.disposition || row.raw_payload?.extracted?.disposition || null,
    remarks: row.remarks || row.raw_payload?.extracted?.remarks || 'Backfilled from fitter_tyre_removal_entries',
    user_id: row.user_id || null
  };
}

async function ensureVehicle({ siteId, vehicleNo, meterReading }) {
  const key = canonicalVehicleNo(vehicleNo);
  if (!key) {
    throw new Error('Vehicle number is empty after normalization');
  }

  const displayNo = normalizeVehicleNo(vehicleNo);
  const { data: existing, error: existingError } = await supabase
    .from('vehicles')
    .select('id, current_odometer')
    .eq('site_id', siteId)
    .eq('vehicle_no_norm', key)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Vehicle lookup failed: ${existingError.message}`);
  }

  if (existing?.id) {
    if (Number.isFinite(meterReading)) {
      await supabase
        .from('vehicles')
        .update({ current_odometer: Math.max(Number(existing.current_odometer || 0), Number(meterReading)) })
        .eq('id', existing.id);
    }
    return existing.id;
  }

  const { data: created, error: createError } = await supabase
    .from('vehicles')
    .insert({
      site_id: siteId,
      vehicle_no: displayNo,
      current_odometer: Number.isFinite(meterReading) ? Number(meterReading) : 0
    })
    .select('id')
    .single();

  if (createError) {
    throw new Error(`Vehicle create failed: ${createError.message}`);
  }

  return created.id;
}

async function ensureTyre({ tyreSerial, make, size }) {
  const key = canonicalTyreSerial(tyreSerial);
  if (!key) {
    throw new Error('Tyre serial is empty after normalization');
  }

  const display = normalizeTyreSerial(tyreSerial);
  const { data: existing, error: existingError } = await supabase
    .from('tyres')
    .select('id')
    .eq('tyre_no_norm', key)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Tyre lookup failed: ${existingError.message}`);
  }

  if (existing?.id) {
    const patch = {};
    if (make) patch.make = String(make).trim();
    if (size) patch.size = String(size).trim();
    if (Object.keys(patch).length > 0) {
      await supabase.from('tyres').update(patch).eq('id', existing.id);
    }
    return existing.id;
  }

  const { data: created, error: createError } = await supabase
    .from('tyres')
    .insert({
      tyre_no: display,
      make: make ? String(make).trim() : 'Unknown',
      size: size ? String(size).trim() : 'Unknown',
      status: 'Running'
    })
    .select('id')
    .single();

  if (createError) {
    throw new Error(`Tyre create failed: ${createError.message}`);
  }

  return created.id;
}

async function upsertEvent(event) {
  const { error } = await supabase
    .from('tyre_activity_log')
    .upsert(event, {
      onConflict: 'source_type,source_pk,activity_type,projection_version'
    });

  if (error) {
    throw new Error(`Activity log write failed: ${error.message}`);
  }
}

async function isAlreadyApplied({ sourceType, sourcePk }) {
  const { data, error } = await supabase
    .schema('ops')
    .from('domain_projection_journal')
    .select('status')
    .eq('source_type', sourceType)
    .eq('source_pk', sourcePk)
    .eq('projection_version', PROJECTION_VERSION)
    .maybeSingle();

  if (error) {
    throw new Error(`Projection journal lookup failed: ${error.message}`);
  }

  return data?.status === 'applied';
}

async function markJournal({ sourceType, sourcePk, status, row, errorMessage }) {
  const payload = {
    source_type: sourceType,
    source_pk: sourcePk,
    projection_version: PROJECTION_VERSION,
    submission_id: row.submission_id || null,
    status,
    applied_at: status === 'applied' ? new Date().toISOString() : null,
    error_message: errorMessage || null,
    meta_json: {
      table_id: row.id,
      site_id: row.site_id,
      capture_completed_at: row.capture_completed_at || null
    }
  };

  const { error } = await supabase
    .schema('ops')
    .from('domain_projection_journal')
    .upsert(payload, {
      onConflict: 'source_type,source_pk,projection_version'
    });

  if (error) {
    throw new Error(`Projection journal upsert failed: ${error.message}`);
  }
}

function toIsoDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

function toNumberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseArgs(argv) {
  const argsOut = {
    siteId: null,
    batchSize: DEFAULT_BATCH,
    forms: null
  };

  for (let i = 0; i < argv.length; i += 1) {
    const part = String(argv[i] || '').trim();
    if (part === '--site-id') {
      argsOut.siteId = String(argv[i + 1] || '').trim() || null;
      i += 1;
      continue;
    }

    if (part === '--batch-size') {
      argsOut.batchSize = Math.max(50, Number(argv[i + 1] || DEFAULT_BATCH) || DEFAULT_BATCH);
      i += 1;
      continue;
    }

    if (part === '--forms') {
      const raw = String(argv[i + 1] || '').trim();
      argsOut.forms = raw
        ? raw.split(',').map((item) => String(item || '').trim()).filter(Boolean)
        : null;
      i += 1;
      continue;
    }
  }

  return argsOut;
}
