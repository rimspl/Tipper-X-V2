import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

function readEnv(name) {
  return String(process.env[name] || '')
    .replace(/^['"]|['"]$/g, '')
    .replace(/\n/g, '')
    .trim();
}

const DEFAULT_SUPABASE_URL = 'https://ajbbcoygzoxdtejvhbfq.supabase.co';
const SUPABASE_URL = readEnv('SUPABASE_URL') || DEFAULT_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = readEnv('SUPABASE_SERVICE_ROLE_KEY');

const ALLOWED_SITE_ID = 'a6baef7b-a6b8-4db2-85bf-7b1f1619b92d';
const MAKES = ['JK', 'MRF', 'Michelin'];

function applyCors(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id');
}

function ensureServiceRoleConfigured() {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured on server');
  }
}

function createAdminClient() {
  ensureServiceRoleConfigured();
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function normalizeUuid(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeVehicle(value) {
  return normalizeText(value).toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9-]/g, '');
}

function normalizePosition(value) {
  return normalizeText(value).toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9]/g, '');
}

function normalizeTyreSerial(value) {
  return normalizeText(value).toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '');
}

function normalizeTyreSize(value) {
  const text = normalizeText(value);
  if (!text) return null;
  return text.toUpperCase().replace(/\u00D7/g, 'X').replace(/\s+/g, ' ').trim();
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickMake(tyreSerial, providedMake) {
  const direct = normalizeText(providedMake);
  if (direct && MAKES.includes(direct)) {
    return direct;
  }

  const serial = normalizeTyreSerial(tyreSerial);
  if (!serial) return MAKES[0];

  let hash = 0;
  for (let i = 0; i < serial.length; i += 1) {
    hash = (hash * 31 + serial.charCodeAt(i)) >>> 0;
  }
  return MAKES[hash % MAKES.length];
}

function buildSubmissionRecord({
  id,
  siteId,
  userId,
  formType,
  localId,
  captureAt,
  vehicleNo,
  positionCode,
  rowNo
}) {
  return {
    id,
    idempotency_key: `csv-${formType}-${siteId}-${localId}`,
    device_id: 'csv-import-device',
    local_submission_id: localId,
    form_type: formType,
    site_id: siteId,
    user_id: userId,
    context_json: {
      vehicle_no: vehicleNo,
      position_code: positionCode,
      source: 'csv_import_aug25',
      source_row_no: rowNo
    },
    capture_started_at: captureAt,
    capture_completed_at: captureAt,
    sync_status: 'uploaded',
    processing_status: 'completed',
    app_version: 'csv-import',
    schema_version: 'csv-v1'
  };
}

function buildRawPayload({ extracted, context }) {
  return {
    extracted,
    context,
    imported: true,
    source: 'Aug-25_combined_comp.csv'
  };
}

async function resolveManagerProfile(dbClient, identifier) {
  const candidate = normalizeText(identifier);
  if (!candidate) {
    throw new Error('actor_identifier is required');
  }

  const attempts = [
    { column: 'id', value: candidate },
    { column: 'user_id', value: candidate },
    { column: 'full_name', value: candidate }
  ];

  for (const attempt of attempts) {
    const { data, error } = await dbClient
      .from('user_profiles')
      .select('id, site_id, is_active, user_type, username, email')
      .eq(attempt.column, attempt.value)
      .maybeSingle();

    if (error) {
      throw new Error(`User profile lookup failed: ${error.message}`);
    }

    if (!data?.id) {
      continue;
    }

    if (data.is_active === false) {
      throw new Error('Actor account is inactive');
    }

    const explicitType = String(data.user_type || '').trim().toLowerCase();
    const isManager = explicitType === 'manager';
    if (!isManager) {
      throw new Error('Actor must be a manager account');
    }

    return data;
  }

  throw new Error('Manager profile not found for actor_identifier');
}

async function clearSiteEntries({ dbClient, siteId }) {
  const tables = [
    'fitter_tyre_card_entries',
    'fitter_pressure_check_entries',
    'fitter_tyre_inspection_entries',
    'fitter_tyre_removal_entries',
    'fitter_observation_entries'
  ];

  const deleted = {};

  for (const table of tables) {
    const { count, error: countError } = await dbClient
      .from(table)
      .select('id', { head: true, count: 'exact' })
      .eq('site_id', siteId);

    if (countError) {
      throw new Error(`Count failed for ${table}: ${countError.message}`);
    }

    const { error: deleteError } = await dbClient
      .from(table)
      .delete()
      .eq('site_id', siteId);

    if (deleteError) {
      throw new Error(`Delete failed for ${table}: ${deleteError.message}`);
    }

    deleted[table] = count || 0;
  }

  const { count: submissionCount, error: submissionCountError } = await dbClient
    .schema('ops')
    .from('offline_submissions')
    .select('id', { head: true, count: 'exact' })
    .eq('site_id', siteId);

  if (submissionCountError) {
    throw new Error(`Count failed for ops.offline_submissions: ${submissionCountError.message}`);
  }

  const { error: submissionDeleteError } = await dbClient
    .schema('ops')
    .from('offline_submissions')
    .delete()
    .eq('site_id', siteId);

  if (submissionDeleteError) {
    throw new Error(`Delete failed for ops.offline_submissions: ${submissionDeleteError.message}`);
  }

  deleted['ops.offline_submissions'] = submissionCount || 0;
  return deleted;
}

async function importBatch({ dbClient, siteId, userId, rows, fitmentRows }) {
  const cleanRows = Array.isArray(rows) ? rows : [];
  const cleanFitments = Array.isArray(fitmentRows) ? fitmentRows : [];

  if (cleanRows.length === 0 && cleanFitments.length === 0) {
    return {
      submissions: 0,
      pressure: 0,
      inspection: 0,
      fitment: 0
    };
  }

  const { data: siteData, error: siteError } = await dbClient
    .from('sites')
    .select('pressure_base_psi')
    .eq('id', siteId)
    .maybeSingle();

  if (siteError) {
    throw new Error(`Site lookup failed: ${siteError.message}`);
  }

  const targetPsi = Number.isFinite(Number(siteData?.pressure_base_psi))
    ? Number(siteData.pressure_base_psi)
    : 120;

  const submissions = [];
  const pressureEntries = [];
  const inspectionEntries = [];
  const fitmentEntries = [];

  for (const row of cleanRows) {
    const vehicleNo = normalizeVehicle(row.vehicle_no);
    const positionCode = normalizePosition(row.position_code);
    const tyreSerial = normalizeTyreSerial(row.tyre_serial);
    const size = normalizeTyreSize(row.size);
    const make = pickMake(tyreSerial, row.make);
    const captureAt = normalizeText(row.capture_at) || null;
    const odometer = numberOrNull(row.odometer);
    const rtd1 = numberOrNull(row.rtd1);
    const rtd2 = numberOrNull(row.rtd2);
    const foundPsi = numberOrNull(row.found_psi);
    const remark = normalizeText(row.remark) || null;
    const rowNo = numberOrNull(row.source_row_no);

    if (!vehicleNo || !positionCode || !tyreSerial || !captureAt) {
      continue;
    }

    if (Number.isFinite(foundPsi)) {
      const submissionId = crypto.randomUUID();
      const localId = `csv-pressure-${submissionId.slice(0, 12)}`;
      const variance = Number.isFinite(foundPsi) && Number.isFinite(targetPsi)
        ? Number((foundPsi - targetPsi).toFixed(2))
        : null;

      submissions.push(buildSubmissionRecord({
        id: submissionId,
        siteId,
        userId,
        formType: 'pressure_check',
        localId,
        captureAt,
        vehicleNo,
        positionCode,
        rowNo
      }));

      pressureEntries.push({
        submission_id: submissionId,
        site_id: siteId,
        user_id: userId,
        device_id: 'csv-import-device',
        local_submission_id: localId,
        capture_started_at: captureAt,
        capture_completed_at: captureAt,
        approval_mode: 'manager_approved',
        pipeline_status: 'completed',
        tyre_serial: tyreSerial,
        vehicle_no: vehicleNo,
        position_code: positionCode,
        found_psi: foundPsi,
        target_psi: targetPsi,
        variance,
        adjusted: Number.isFinite(variance) ? Math.abs(variance) > 0 : null,
        action: remark ? `Imported (${remark})` : 'Imported pressure check',
        raw_payload: buildRawPayload({
          extracted: {
            tyre_serial: tyreSerial,
            make,
            size,
            vehicle_no: vehicleNo,
            position_code: positionCode,
            meter_reading: odometer,
            found_psi: foundPsi,
            target_psi: targetPsi,
            variance,
            adjusted: Number.isFinite(variance) ? Math.abs(variance) > 0 : null,
            action: remark ? `Imported (${remark})` : 'Imported pressure check',
            remarks: remark
          },
          context: {
            vehicle_no: vehicleNo,
            position_code: positionCode,
            source_row_no: rowNo
          }
        })
      });
    }

    if (Number.isFinite(rtd1) || Number.isFinite(rtd2)) {
      const submissionId = crypto.randomUUID();
      const localId = `csv-inspection-${submissionId.slice(0, 12)}`;
      const damageClass = remark || null;

      submissions.push(buildSubmissionRecord({
        id: submissionId,
        siteId,
        userId,
        formType: 'tyre_inspection',
        localId,
        captureAt,
        vehicleNo,
        positionCode,
        rowNo
      }));

      inspectionEntries.push({
        submission_id: submissionId,
        site_id: siteId,
        user_id: userId,
        device_id: 'csv-import-device',
        local_submission_id: localId,
        capture_started_at: captureAt,
        capture_completed_at: captureAt,
        approval_mode: 'manager_approved',
        pipeline_status: 'completed',
        tyre_serial: tyreSerial,
        vehicle_no: vehicleNo,
        position_code: positionCode,
        meter_reading: odometer,
        rtd1,
        rtd2,
        damage_class: damageClass,
        severity: null,
        remarks: remark,
        raw_payload: buildRawPayload({
          extracted: {
            tyre_serial: tyreSerial,
            make,
            size,
            vehicle_no: vehicleNo,
            position_code: positionCode,
            meter_reading: odometer,
            rtd1,
            rtd2,
            damage_class: damageClass,
            remarks: remark
          },
          context: {
            vehicle_no: vehicleNo,
            position_code: positionCode,
            source_row_no: rowNo
          }
        })
      });
    }
  }

  for (const row of cleanFitments) {
    const vehicleNo = normalizeVehicle(row.vehicle_no);
    const positionCode = normalizePosition(row.position_code);
    const tyreSerial = normalizeTyreSerial(row.tyre_serial);
    const size = normalizeTyreSize(row.size);
    const make = pickMake(tyreSerial, row.make);
    const captureAt = normalizeText(row.capture_at) || null;
    const odometer = numberOrNull(row.odometer);
    const rtd1 = numberOrNull(row.rtd1);
    const rtd2 = numberOrNull(row.rtd2);
    const rowNo = numberOrNull(row.source_row_no);

    if (!vehicleNo || !positionCode || !tyreSerial || !captureAt) {
      continue;
    }

    const submissionId = crypto.randomUUID();
    const localId = `csv-fitment-${submissionId.slice(0, 12)}`;

    submissions.push(buildSubmissionRecord({
      id: submissionId,
      siteId,
      userId,
      formType: 'tyre_card',
      localId,
      captureAt,
      vehicleNo,
      positionCode,
      rowNo
    }));

    fitmentEntries.push({
      submission_id: submissionId,
      site_id: siteId,
      user_id: userId,
      device_id: 'csv-import-device',
      local_submission_id: localId,
      capture_started_at: captureAt,
      capture_completed_at: captureAt,
      approval_mode: 'manager_approved',
      pipeline_status: 'completed',
      tyre_serial: tyreSerial,
      make,
      size,
      vehicle_no: vehicleNo,
      position_code: positionCode,
      meter_reading: odometer,
      rtd1,
      rtd2,
      fitment_type: 'Old',
      raw_payload: buildRawPayload({
        extracted: {
          tyre_serial: tyreSerial,
          make,
          size,
          vehicle_no: vehicleNo,
          position_code: positionCode,
          meter_reading: odometer,
          rtd1,
          rtd2,
          fitment_type: 'Old'
        },
        context: {
          vehicle_no: vehicleNo,
          position_code: positionCode,
          source_row_no: rowNo
        }
      })
    });
  }

  if (submissions.length > 0) {
    const { error } = await dbClient
      .schema('ops')
      .from('offline_submissions')
      .insert(submissions);

    if (error) {
      throw new Error(`offline_submissions insert failed: ${error.message}`);
    }
  }

  if (fitmentEntries.length > 0) {
    const { error } = await dbClient
      .from('fitter_tyre_card_entries')
      .insert(fitmentEntries);

    if (error) {
      throw new Error(`fitter_tyre_card_entries insert failed: ${error.message}`);
    }
  }

  if (pressureEntries.length > 0) {
    const { error } = await dbClient
      .from('fitter_pressure_check_entries')
      .insert(pressureEntries);

    if (error) {
      throw new Error(`fitter_pressure_check_entries insert failed: ${error.message}`);
    }
  }

  if (inspectionEntries.length > 0) {
    const { error } = await dbClient
      .from('fitter_tyre_inspection_entries')
      .insert(inspectionEntries);

    if (error) {
      throw new Error(`fitter_tyre_inspection_entries insert failed: ${error.message}`);
    }
  }

  return {
    submissions: submissions.length,
    fitment: fitmentEntries.length,
    pressure: pressureEntries.length,
    inspection: inspectionEntries.length
  };
}

export default async function handler(request, response) {
  applyCors(response);

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  if (request.method !== 'POST') {
    return response.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const body = typeof request.body === 'string'
      ? JSON.parse(request.body || '{}')
      : (request.body || {});

    const action = normalizeText(body.action);
    const siteId = normalizeUuid(body.site_id);
    const actorIdentifier = normalizeText(body.actor_identifier);

    if (!action) {
      return response.status(400).json({ success: false, message: 'action is required' });
    }

    if (!siteId) {
      return response.status(400).json({ success: false, message: 'site_id is required' });
    }

    if (siteId !== ALLOWED_SITE_ID) {
      return response.status(403).json({ success: false, message: 'This import endpoint is scoped to configured site only.' });
    }

    const dbClient = createAdminClient();
    const actor = await resolveManagerProfile(dbClient, actorIdentifier);

    if (normalizeUuid(actor.site_id) !== siteId) {
      return response.status(403).json({ success: false, message: 'Actor is not mapped to requested site.' });
    }

    if (action === 'clear_site_entries') {
      if (body.confirm !== true) {
        return response.status(400).json({ success: false, message: 'confirm=true is required for clear_site_entries' });
      }

      const deleted = await clearSiteEntries({ dbClient, siteId });
      return response.status(200).json({
        success: true,
        action,
        site_id: siteId,
        deleted
      });
    }

    if (action === 'import_batch') {
      const rows = Array.isArray(body.rows) ? body.rows : [];
      const fitmentRows = Array.isArray(body.fitment_rows) ? body.fitment_rows : [];

      const inserted = await importBatch({
        dbClient,
        siteId,
        userId: actor.id,
        rows,
        fitmentRows
      });

      return response.status(200).json({
        success: true,
        action,
        site_id: siteId,
        inserted
      });
    }

    return response.status(400).json({ success: false, message: `Unsupported action: ${action}` });
  } catch (error) {
    console.error('import fitter csv error:', error);
    return response.status(500).json({
      success: false,
      message: error.message || 'Import failed'
    });
  }
}
