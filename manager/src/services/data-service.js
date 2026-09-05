const FUEL_TABLE = 'fuel_trip_entries';

function isSchemaMissingError(error) {
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
  );
}

export async function fetchSiteTargets(siteId) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('sites')
    .select('*')
    .eq('id', siteId)
    .maybeSingle();

  if (error) {
    if (isSchemaMissingError(error)) {
      return {
        siteName: 'Site',
        lifeUnit: 'KM',
        targetTyreLife: 0,
        pressureTargetTyreLifeKm: 0,
        tyrePrice: 0,
        fleetSize: 0,
        annualDemand: 0,
        targetFuelEfficiency: 0,
        pressureFuelEfficiencyKmpl: 0,
        pressureBasePsi: 120,
        pressureTempZone: 45,
        pressureFuelPrice: 90,
        pressureDailyKm: 250,
        pressureTiresPerTruck: 6,
        pressureCalibrationDays: 30,
        pressureMaxInterpolationDays: 7,
        pressureModelEnabled: true,
        targetAnnualSavings: 0,
        enabledReports: [],
        retreadCost: 0,
        ratePerKm: 0
      };
    }
    throw new Error(`Failed to load site targets: ${error.message}`);
  }

  const targetTyreLife = Number(data?.target_tyre_life || 0);
  const lifeUnit = String(data?.target_life_unit || 'KM').toUpperCase();
  const pressureTargetTyreLifeKm = Number(
    data?.pressure_target_tyre_life_km
      ?? (lifeUnit === 'KM' ? data?.target_tyre_life : 0)
      ?? 0
  );
  const pressureFuelEfficiencyKmpl = Number(data?.pressure_fuel_efficiency_kmpl || 0);
  const tyrePrice = Number(data?.tyre_price || 0);
  const fleetSize = Number(data?.fleet_size || 0);

  return {
    siteName: data?.site_name || 'Site',
    lifeUnit,
    targetTyreLife,
    pressureTargetTyreLifeKm,
    tyrePrice,
    fleetSize,
    annualDemand: Number(data?.annual_demand || 0),
    targetFuelEfficiency: pressureFuelEfficiencyKmpl,
    pressureFuelEfficiencyKmpl,
    pressureBasePsi: Number(data?.pressure_base_psi || 120),
    pressureTempZone: Number(data?.pressure_temp_zone || 45),
    pressureFuelPrice: Number(data?.pressure_fuel_price || 90),
    pressureDailyKm: Number(data?.pressure_daily_km || 250),
    pressureTiresPerTruck: Number(data?.pressure_tires_per_truck || 6),
    pressureCalibrationDays: Number(data?.pressure_calibration_days || 30),
    pressureMaxInterpolationDays: Number(data?.pressure_max_interpolation_days || 7),
    pressureModelEnabled: data?.pressure_model_enabled === false ? false : true,
    enabledReports: Array.isArray(data?.enabled_reports) ? data.enabled_reports : [],
    retreadCost: Number(data?.retread_cost || 0),
    ratePerKm: Number(data?.rate_per_km || 0),
    targetAnnualSavings: targetTyreLife > 0 && tyrePrice > 0
      ? Math.round((targetTyreLife * tyrePrice) / 10)
      : 0
  };
}

export async function fetchAiAccuracy(siteId) {
  const supabase = getSupabaseClient();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { data: submissions, error: submissionError } = await supabase
    .schema('ops')
    .from('offline_submissions')
    .select('id')
    .eq('site_id', siteId)
    .gte('created_at', monthStart.toISOString());

  if (submissionError) {
    throw new Error(`Failed to compute AI accuracy: ${submissionError.message}`);
  }

  const ids = Array.isArray(submissions) ? submissions.map((item) => item.id) : [];
  if (ids.length === 0) {
    return {
      total: 0,
      auto: 0,
      autoPercent: 0
    };
  }

  const { data: reports, error: reportError } = await supabase
    .schema('ops')
    .from('final_reports')
    .select('approval_mode')
    .in('submission_id', ids);

  if (reportError) {
    throw new Error(`Failed to compute AI accuracy: ${reportError.message}`);
  }

  const total = reports?.length || 0;
  const auto = (reports || []).filter((row) => row.approval_mode === 'auto').length;
  const autoPercent = total > 0 ? (auto / total) * 100 : 0;

  return {
    total,
    auto,
    autoPercent
  };
}

export async function fetchRetreadCounts(siteId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('tyre_activity_log')
    .select('tyre_id, removal_reason, disposition')
    .eq('activity_type', 'REMOVAL')
    .or('disposition.eq.RETREAD,removal_reason.ilike.%retread%');

  if (error) {
    console.warn('Could not fetch retread counts:', error.message);
    return {};
  }

  const counts = {};
  for (const row of data || []) {
    if (row.tyre_id) {
      counts[row.tyre_id] = (counts[row.tyre_id] || 0) + 1;
    }
  }
  return counts;
}

const DB_NAME = 'DynaHaulCacheDB';
const STORE_NAME = 'manager_datasets';

function openCacheDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

async function getFromCache(key) {
  try {
    const db = await openCacheDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return null;
  }
}

async function setToCache(key, value) {
  try {
    const db = await openCacheDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {}
}

async function removeFromCache(key) {
  try {
    const db = await openCacheDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      tx.oncomplete = () => resolve();
    });
  } catch (e) {}
}

const memoryCache = new Map();
const pendingManagerFetches = new Map();

export function invalidateManagerDataset(siteId) {
  const cacheKey = `rims_manager_dataset_${siteId}`;
  memoryCache.delete(cacheKey);
  removeFromCache(cacheKey).catch(() => {});
}

function managerDatasetHasData(data) {
  if (!data || typeof data !== 'object') return false;
  return (
    (Array.isArray(data.tyreRecords) && data.tyreRecords.length > 0) ||
    (Array.isArray(data.inspectionRecords) && data.inspectionRecords.length > 0) ||
    (Array.isArray(data.pressureEvents) && data.pressureEvents.length > 0)
  );
}

export async function fetchManagerDataset(siteId, onRevalidated) {
    const cacheKey = `rims_manager_dataset_${siteId}`;

  if (pendingManagerFetches.has(cacheKey)) {
    return pendingManagerFetches.get(cacheKey);
  }

  try {
    const cached = memoryCache.get(cacheKey) || await getFromCache(cacheKey);
    if (cached && cached.timestamp && cached.data) {
      const ageMs = Date.now() - cached.timestamp;
      const FRESH_TTL_MS = 30 * 1000;
      const STALE_TTL_MS = 24 * 60 * 60 * 1000;

      if (ageMs < FRESH_TTL_MS) {
        memoryCache.set(cacheKey, cached);
        return cached.data;
      } else if (ageMs < STALE_TTL_MS) {
        if (typeof onRevalidated === 'function') {
          loadLatestManagerDataset(siteId)
            .then(freshData => {
              if (managerDatasetHasData(freshData)) {
                const cacheObj = { timestamp: Date.now(), data: freshData };
                memoryCache.set(cacheKey, cacheObj);
                setToCache(cacheKey, cacheObj).catch(() => {});
              }
              onRevalidated(freshData);
            }).catch(console.warn);
        }
        memoryCache.set(cacheKey, cached);
        return cached.data;
      }
    }
  } catch (e) {}

  const fetchPromise = (async () => {
    const data = await loadLatestManagerDataset(siteId);

    if (managerDatasetHasData(data)) {
      const cacheObj = { timestamp: Date.now(), data };
      memoryCache.set(cacheKey, cacheObj);
      setToCache(cacheKey, cacheObj).catch(() => {});
    }
    return data;
  })().finally(() => {
    pendingManagerFetches.delete(cacheKey);
  });

  pendingManagerFetches.set(cacheKey, fetchPromise);
  return fetchPromise;
}

// ── Merge architecture (ported from v1 to ensure fitment + inspection records
//    from BOTH SQL views and fitter tables are surfaced, not lost) ──────────────
async function loadLatestManagerDataset(siteId) {
  let data;

  try {
    data = await fetchFastManagerDataset({ supabase: getSupabaseClient(), siteId });
  } catch (error) {
    if (error.message?.includes('relation "public.v_manager_tyre_records" does not exist') || isSchemaMissingError(error)) {
      console.warn('SQL views missing! Falling back to legacy tyre_activity_log.');
      try {
        data = await fetchLegacyManagerDataset({ supabase: getSupabaseClient(), siteId });
      } catch (fallbackError) {
        if (!isSchemaMissingError(fallbackError)) {
          throw new Error(`Failed to load manager dataset: ${fallbackError.message || fallbackError}`);
        }
        data = { tyreRecords: [], inspectionRecords: [], pressureEvents: [] };
      }
    } else {
      throw new Error(`Failed to load manager dataset: ${error.message || error}`);
    }
  }

  try {
    const fitterData = await fetchFitterManagerDataset({ supabase: getSupabaseClient(), siteId });
    return mergeManagerDatasets({ primary: data, supplement: fitterData });
  } catch (fitterError) {
    console.warn('Fitter supplement dataset unavailable:', fitterError?.message || fitterError);
    return finalizeManagerDataset(data);
  }
}

function finalizeManagerDataset(data) {
  if (!data || typeof data !== 'object') {
    return { tyreRecords: [], inspectionRecords: [], pressureEvents: [] };
  }

  const pressureEvents = Array.isArray(data.pressureEvents)
    ? [...data.pressureEvents].sort((a, b) => Number(a.checked_at_ms || 0) - Number(b.checked_at_ms || 0))
    : [];

  return {
    tyreRecords: Array.isArray(data.tyreRecords) ? data.tyreRecords : [],
    inspectionRecords: enrichInspectionRowsWithSameDayData(data.inspectionRecords || [], pressureEvents),
    pressureEvents
  };
}

function mergeManagerDatasets({ primary, supplement }) {
  const base = finalizeManagerDataset(primary);
  const overlay = finalizeManagerDataset(supplement);

  return finalizeManagerDataset({
    tyreRecords: mergeTyreRecordSets(base.tyreRecords, overlay.tyreRecords),
    inspectionRecords: mergeInspectionRecordSets(base.inspectionRecords, overlay.inspectionRecords),
    pressureEvents: mergePressureEventSets(base.pressureEvents, overlay.pressureEvents)
  });
}

function mergeTyreRecordSets(primary = [], supplement = []) {
  const map = new Map();

  for (const row of primary || []) {
    const key = normalizeKey(row.tyre_no);
    if (!key) continue;
    map.set(key, { ...row });
  }

  for (const row of supplement || []) {
    const key = normalizeKey(row.tyre_no);
    if (!key) continue;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...row });
      continue;
    }

    existing.make = pickDisplayValue(existing.make, row.make);
    existing.brand = pickDisplayValue(existing.brand, row.brand);
    existing.size = pickDisplayValue(existing.size, row.size);
    existing.vehicle_no = pickDisplayValue(existing.vehicle_no, row.vehicle_no);
    existing.truck = pickDisplayValue(existing.truck, row.truck);
    existing.position = pickDisplayValue(existing.position, row.position);
    existing.odometer = pickNullableNumericValue(existing.odometer, row.odometer);
    existing.current_rtd1 = pickNullableNumericValue(existing.current_rtd1, row.current_rtd1);
    existing.current_rtd2 = pickNullableNumericValue(existing.current_rtd2, row.current_rtd2);
    existing.initial_rtd_derived = pickNullableNumericValue(existing.initial_rtd_derived, row.initial_rtd_derived);
    existing.latest_rtd_derived = pickNullableNumericValue(existing.latest_rtd_derived, row.latest_rtd_derived);
    existing.otd = pickNullableNumericValue(existing.otd, row.otd);
    existing.total_life_run = pickLargerNumeric(existing.total_life_run, row.total_life_run);
    existing.life_achieved = pickLargerNumeric(existing.life_achieved, row.life_achieved);
    existing.first_fitment_date = pickEarlierDate(existing.first_fitment_date, row.first_fitment_date);
    existing.last_inspection_date = pickLaterDate(existing.last_inspection_date, row.last_inspection_date || row.latest_inspection_date);
    existing.latest_inspection_date = pickLaterDate(existing.latest_inspection_date, row.latest_inspection_date || row.last_inspection_date);
    existing.removal_date = pickLaterDate(existing.removal_date, row.removal_date);
    existing.removal_rtd = pickNullableNumericValue(existing.removal_rtd, row.removal_rtd);
    existing.status = pickStatusValue(existing.status, row.status);
    existing.evidence_submission_id = pickDisplayValue(existing.evidence_submission_id, row.evidence_submission_id);
    if ((!Array.isArray(existing.lifecycle_runs) || existing.lifecycle_runs.length === 0) && Array.isArray(row.lifecycle_runs) && row.lifecycle_runs.length > 0) {
      existing.lifecycle_runs = row.lifecycle_runs;
    }
  }

  return Array.from(map.values()).sort((a, b) => String(a.tyre_no || '').localeCompare(String(b.tyre_no || '')));
}

function mergeInspectionRecordSets(primary = [], supplement = []) {
  const map = new Map();

  for (const row of primary || []) {
    const key = buildInspectionDedupKey(row);
    map.set(key, { ...row });
  }

  for (const row of supplement || []) {
    const key = buildInspectionDedupKey(row);
    const existing = map.get(key) || findInspectionMergeCandidate(map, row);
    if (!existing) {
      map.set(key, { ...row });
      continue;
    }

    existing.truck = pickDisplayValue(existing.truck, row.truck);
    existing.brand = pickDisplayValue(existing.brand, row.brand);
    existing.position = pickDisplayValue(existing.position, row.position);
    existing.odometer = pickNumericValue(existing.odometer, row.odometer);
    existing.rtd1 = pickNumericValue(existing.rtd1, row.rtd1);
    existing.rtd2 = pickNumericValue(existing.rtd2, row.rtd2);
    existing.psi_found = pickNumericValue(existing.psi_found, row.psi_found);
    existing.psi_corrected = pickNumericValue(existing.psi_corrected, row.psi_corrected);
    existing.remarks = pickDisplayValue(existing.remarks, row.remarks);
    existing.evidence_submission_id = pickDisplayValue(existing.evidence_submission_id, row.evidence_submission_id);
    existing._activity_at_ms = Math.max(Number(existing._activity_at_ms || 0), Number(row._activity_at_ms || 0));
  }

  return Array.from(map.values())
    .sort((a, b) => {
      const left = Number(a._activity_at_ms || 0);
      const right = Number(b._activity_at_ms || 0);
      if (left !== right) {
        return right - left;
      }
      return String(b.id || '').localeCompare(String(a.id || ''));
    });
}

function mergePressureEventSets(primary = [], supplement = []) {
  const map = new Map();

  for (const row of [...(primary || []), ...(supplement || [])]) {
    const key = buildPressureDedupKey(row);
    const existing = map.get(key) || findPressureMergeCandidate(map, row);
    if (!existing) {
      map.set(key, { ...row });
      continue;
    }

    existing.tyre_serial = pickDisplayValue(existing.tyre_serial, row.tyre_serial);
    existing.vehicle_no = pickDisplayValue(existing.vehicle_no, row.vehicle_no);
    existing.position_code = pickDisplayValue(existing.position_code, row.position_code);
    existing.found_psi = pickNumericValue(existing.found_psi, row.found_psi);
    existing.corrected_psi = pickNumericValue(existing.corrected_psi, row.corrected_psi);
    existing.action = pickDisplayValue(existing.action, row.action);
    existing.evidence_submission_id = pickDisplayValue(existing.evidence_submission_id, row.evidence_submission_id);
    existing.checked_at_ms = Math.max(Number(existing.checked_at_ms || 0), Number(row.checked_at_ms || 0));
  }

  return Array.from(map.values()).sort((a, b) => Number(a.checked_at_ms || 0) - Number(b.checked_at_ms || 0));
}

function findInspectionMergeCandidate(map, row) {
  const activity = String(row.activity_type || '').trim().toUpperCase();
  const date = normalizeDateKey(row.activity_date || row.date);
  const tyre = normalizeComparableKey(row.tyre_no);
  const odometer = numberOrNull(row.odometer);
  const truck = normalizeComparableVehicleIdentity(row.truck);
  const position = normalizeComparableKey(row.position);
  const evidenceSubmissionId = normalizeComparableKey(row.evidence_submission_id);

  if (!activity || !date || !tyre) {
    return null;
  }

  const matches = [];

  for (const candidate of map.values()) {
    if (String(candidate.activity_type || '').trim().toUpperCase() !== activity) continue;
    if (normalizeDateKey(candidate.activity_date || candidate.date) !== date) continue;
    if (normalizeComparableKey(candidate.tyre_no) !== tyre) continue;

    const candidateTruck = normalizeComparableVehicleIdentity(candidate.truck);
    const candidatePosition = normalizeComparableKey(candidate.position);

    if (truck && candidateTruck && truck !== candidateTruck) continue;
    if (position && candidatePosition && position !== candidatePosition) continue;

    const candidateOdometer = numberOrNull(candidate.odometer);
    if (Number.isFinite(odometer) && Number.isFinite(candidateOdometer) && odometer !== candidateOdometer) continue;

    let score = 0;
    const candidateEvidenceSubmissionId = normalizeComparableKey(candidate.evidence_submission_id);
    if (evidenceSubmissionId && candidateEvidenceSubmissionId && evidenceSubmissionId === candidateEvidenceSubmissionId) {
      score += 8;
    }
    if (truck && candidateTruck && truck === candidateTruck) {
      score += 4;
    }
    if (position && candidatePosition && position === candidatePosition) {
      score += 4;
    }
    if (Number.isFinite(odometer) && Number.isFinite(candidateOdometer) && odometer === candidateOdometer) {
      score += 2;
    }

    if (score > 0) {
      matches.push({ candidate, score });
    }
  }

  return selectUnambiguousBestCandidate(matches);
}

function findPressureMergeCandidate(map, row) {
  const date = normalizeDateKey(row.checked_date || row.activity_date || row.date);
  const tyre = normalizeComparableKey(row.tyre_serial || row.tyre_no);
  const truck = normalizeComparableVehicleIdentity(row.vehicle_no || row.truck);
  const position = normalizeComparableKey(row.position_code || row.position);
  const foundPsi = numberOrNull(row.found_psi);
  const correctedPsi = numberOrNull(row.corrected_psi);
  const evidenceSubmissionId = normalizeComparableKey(row.evidence_submission_id);

  if (!date) {
    return null;
  }

  const matches = [];

  for (const candidate of map.values()) {
    if (normalizeDateKey(candidate.checked_date || candidate.activity_date || candidate.date) !== date) continue;
    const candidateTyre = normalizeComparableKey(candidate.tyre_serial || candidate.tyre_no);
    const candidateTruck = normalizeComparableVehicleIdentity(candidate.vehicle_no || candidate.truck);
    const candidatePosition = normalizeComparableKey(candidate.position_code || candidate.position);
    const candidateFoundPsi = numberOrNull(candidate.found_psi);
    const candidateCorrectedPsi = numberOrNull(candidate.corrected_psi);

    if (tyre && candidateTyre && tyre !== candidateTyre) continue;
    if (truck && candidateTruck && truck !== candidateTruck) continue;
    if (position && candidatePosition && position !== candidatePosition) continue;

    if (Number.isFinite(foundPsi) && Number.isFinite(candidateFoundPsi) && foundPsi !== candidateFoundPsi) continue;
    if (Number.isFinite(correctedPsi) && Number.isFinite(candidateCorrectedPsi) && correctedPsi !== candidateCorrectedPsi) continue;

    const mountContextMatches = Boolean(
      truck && position && candidateTruck && candidatePosition && truck === candidateTruck && position === candidatePosition
    );
    const tyreMatches = Boolean(tyre && candidateTyre && tyre === candidateTyre);

    if (!mountContextMatches && !tyreMatches) continue;

    let score = 0;
    const candidateEvidenceSubmissionId = normalizeComparableKey(candidate.evidence_submission_id);
    if (evidenceSubmissionId && candidateEvidenceSubmissionId && evidenceSubmissionId === candidateEvidenceSubmissionId) {
      score += 8;
    }
    if (tyreMatches) {
      score += 5;
    }
    if (truck && candidateTruck && truck === candidateTruck) {
      score += 4;
    }
    if (position && candidatePosition && position === candidatePosition) {
      score += 4;
    }
    if (Number.isFinite(foundPsi) && Number.isFinite(candidateFoundPsi) && foundPsi === candidateFoundPsi) {
      score += 2;
    }
    if (Number.isFinite(correctedPsi) && Number.isFinite(candidateCorrectedPsi) && correctedPsi === candidateCorrectedPsi) {
      score += 2;
    }

    if (score > 0) {
      matches.push({ candidate, score });
    }
  }

  return selectUnambiguousBestCandidate(matches);
}

function selectUnambiguousBestCandidate(matches = []) {
  if (!Array.isArray(matches) || matches.length === 0) {
    return null;
  }

  const ranked = [...matches].sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score;
    }

    const leftAt = Number(left.candidate?._activity_at_ms || left.candidate?.checked_at_ms || 0);
    const rightAt = Number(right.candidate?._activity_at_ms || right.candidate?.checked_at_ms || 0);
    if (leftAt !== rightAt) {
      return rightAt - leftAt;
    }

    return String(right.candidate?.id || '').localeCompare(String(left.candidate?.id || ''));
  });

  if (ranked[0].score <= 0) {
    return null;
  }

  if (ranked.length > 1 && ranked[0].score === ranked[1].score) {
    return null;
  }

  return ranked[0].candidate;
}

function enrichInspectionRowsWithSameDayData(rows = [], pressureEvents = []) {
  const normalizedRows = (rows || []).map((row) => ({
    ...row,
    _activity_at_ms: Number(row?._activity_at_ms || toDateTimeMillis(row.activity_date || row.date))
  }));

  const bundles = new Map();
  const ensureBundle = (key) => {
    if (!bundles.has(key)) {
      bundles.set(key, { inspectionRows: [], pressureRows: [] });
    }
    return bundles.get(key);
  };

  for (const row of normalizedRows) {
    for (const key of buildDayIdentityKeys({
      date: row.activity_date || row.date,
      tyre: row.tyre_no,
      truck: row.truck,
      position: row.position
    })) {
      ensureBundle(key).inspectionRows.push(row);
    }
  }

  for (const row of pressureEvents || []) {
    if (!Number.isFinite(numberOrNull(row?.found_psi)) && !Number.isFinite(numberOrNull(row?.corrected_psi))) {
      continue;
    }

    for (const key of buildDayIdentityKeys({
      date: row.checked_date || row.activity_date || row.date,
      tyre: row.tyre_serial || row.tyre_no,
      truck: row.vehicle_no || row.truck,
      position: row.position_code || row.position
    })) {
      ensureBundle(key).pressureRows.push(row);
    }
  }

  return normalizedRows
    .map((row) => enrichInspectionRow(row, bundles))
    .sort((a, b) => {
      const left = Number(a._activity_at_ms || 0);
      const right = Number(b._activity_at_ms || 0);
      if (left !== right) {
        return right - left;
      }
      return String(b.id || '').localeCompare(String(a.id || ''));
    });
}

function enrichInspectionRow(row, bundles) {
  const bundle = resolveDayBundle(row, bundles);
  if (!bundle) {
    return row;
  }

  const inspectionRows = bundle.inspectionRows || [];
  const pressureRows = bundle.pressureRows || [];
  const peerRows = inspectionRows.filter((candidate) => candidate !== row);
  const inspectionPeers = peerRows.filter((candidate) => String(candidate.activity_type || '').toUpperCase() === 'INSPECTION');
  const fitmentPeers = peerRows.filter((candidate) => String(candidate.activity_type || '').toUpperCase() === 'FITMENT');
  const orderedPeers = [...inspectionPeers, ...fitmentPeers, ...peerRows];
  const pressureRow = pickLatestPressureRow(pressureRows);

  return {
    ...row,
    truck: pickDisplayValue(row.truck, pickFieldFromRows(orderedPeers, 'truck')),
    brand: pickDisplayValue(row.brand, pickFieldFromRows(orderedPeers, 'brand')),
    position: pickDisplayValue(row.position, pickFieldFromRows(orderedPeers, 'position')),
    odometer: pickNumericValue(row.odometer, pickFieldFromRows(orderedPeers, 'odometer')),
    rtd1: pickNumericValue(row.rtd1, pickFieldFromRows(orderedPeers, 'rtd1')),
    rtd2: pickNumericValue(row.rtd2, pickFieldFromRows(orderedPeers, 'rtd2')),
    psi_found: pickNumericValue(row.psi_found, pressureRow?.found_psi),
    psi_corrected: pickNumericValue(row.psi_corrected, pressureRow?.corrected_psi),
    remarks: pickDisplayValue(row.remarks, pressureRow?.action)
  };
}

function resolveDayBundle(row, bundles) {
  for (const key of buildDayIdentityKeys({
    date: row.activity_date || row.date,
    tyre: row.tyre_no,
    truck: row.truck,
    position: row.position
  })) {
    const bundle = bundles.get(key);
    if (bundle) {
      return bundle;
    }
  }
  return null;
}

function buildDayIdentityKeys({ date, tyre, truck, position }) {
  const dateKey = normalizeDateKey(date);
  if (!dateKey) {
    return [];
  }

  const keys = [];
  const tyreKey = normalizeKey(tyre);
  const truckKey = normalizeVehicleIdentity(truck);
  const positionKey = normalizeKey(position);

  if (truckKey && truckKey !== '-' && positionKey && positionKey !== '-') {
    keys.push(`${dateKey}|V|${truckKey}|${positionKey}`);
  }

  if (keys.length === 0 && tyreKey && tyreKey !== '-') {
    keys.push(`${dateKey}|T|${tyreKey}`);
  }

  return keys;
}

function pickLatestPressureRow(rows = []) {
  return [...rows]
    .filter((row) => Number.isFinite(numberOrNull(row?.found_psi)) || Number.isFinite(numberOrNull(row?.corrected_psi)))
    .sort((a, b) => Number(b.checked_at_ms || 0) - Number(a.checked_at_ms || 0))[0] || null;
}

function pickFieldFromRows(rows = [], field) {
  for (const row of rows) {
    const candidate = row?.[field];
    if (field === 'odometer' || field === 'rtd1' || field === 'rtd2' || field === 'psi_found' || field === 'psi_corrected') {
      const numeric = numberOrNull(candidate);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
      continue;
    }

    if (!isDisplayEmpty(candidate)) {
      return candidate;
    }
  }
  return null;
}

function pickDisplayValue(currentValue, candidateValue) {
  return isDisplayEmpty(currentValue) && !isDisplayEmpty(candidateValue)
    ? candidateValue
    : currentValue;
}

function pickNumericValue(currentValue, candidateValue) {
  const current = numberOrNull(currentValue);
  if (Number.isFinite(current)) {
    return current;
  }
  const candidate = numberOrNull(candidateValue);
  return Number.isFinite(candidate) ? candidate : valueOrDash(currentValue);
}

function pickNullableNumericValue(currentValue, candidateValue) {
  const current = numberOrNull(currentValue);
  if (Number.isFinite(current)) {
    return current;
  }
  const candidate = numberOrNull(candidateValue);
  return Number.isFinite(candidate) ? candidate : currentValue;
}

function pickLargerNumeric(currentValue, candidateValue) {
  const current = numberOrNull(currentValue);
  const candidate = numberOrNull(candidateValue);
  if (!Number.isFinite(current)) return Number.isFinite(candidate) ? candidate : currentValue;
  if (!Number.isFinite(candidate)) return current;
  return Math.max(current, candidate);
}

function pickEarlierDate(currentValue, candidateValue) {
  const current = normalizeDateKey(currentValue);
  const candidate = normalizeDateKey(candidateValue);
  if (!current) return candidateValue || currentValue;
  if (!candidate) return currentValue;
  return candidate < current ? candidate : current;
}

function pickLaterDate(currentValue, candidateValue) {
  const current = normalizeDateKey(currentValue);
  const candidate = normalizeDateKey(candidateValue);
  if (!current) return candidateValue || currentValue;
  if (!candidate) return currentValue;
  return candidate > current ? candidate : current;
}

function pickStatusValue(currentValue, candidateValue) {
  const current = String(currentValue || '').trim();
  const candidate = String(candidateValue || '').trim();
  if (!current || current === 'Unknown' || current === 'New') {
    return candidate || currentValue;
  }
  return currentValue;
}

function buildInspectionDedupKey(row) {
  const date = normalizeDateKey(row.activity_date || row.date);
  return [
    String(row.activity_type || '').trim().toUpperCase(),
    date,
    normalizeKey(row.tyre_no),
    normalizeKey(row.truck),
    normalizeKey(row.position)
  ].join('|');
}

function buildPressureDedupKey(row) {
  return [
    normalizeDateKey(row.checked_date || row.activity_date || row.date),
    normalizeKey(row.tyre_serial || row.tyre_no),
    normalizeKey(row.vehicle_no || row.truck),
    normalizeKey(row.position_code || row.position),
    String(numberOrNull(row.found_psi) ?? '-'),
    String(numberOrNull(row.corrected_psi) ?? '-')
  ].join('|');
}

function normalizeDateKey(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toISOString().slice(0, 10);
}

function normalizeVehicleIdentity(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeComparableVehicleIdentity(value) {
  const normalized = normalizeVehicleIdentity(value);
  return normalized && normalized !== '-' ? normalized : '';
}

function normalizeComparableKey(value) {
  const normalized = normalizeKey(value);
  return normalized && normalized !== '-' ? normalized : '';
}

function isDisplayEmpty(value) {
  return value === undefined || value === null || value === '' || value === '-';
}

async function fetchAllViewRows(supabase, viewName, siteId) {
  let allRows = [];
  let offset = 0;
  const pageSize = 1000;

  for (;;) {
    const { data, error } = await supabase
      .from(viewName)
      .select('*')
      .eq('site_id', siteId)
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw error;
    }

    const rows = data || [];
    allRows.push(...rows);

    if (rows.length < pageSize) {
      break;
    }
    offset += rows.length;
  }
  return allRows;
}

async function fetchFastManagerDataset({ supabase, siteId, email }) {
  let tyreRecords;
  let inspectionRecords;
  let pressureEvents;

  if (!tyreRecords) {
    const client = supabase || getSupabaseClient();
    [tyreRecords, inspectionRecords, pressureEvents] = await Promise.all([
      fetchAllViewRows(client, 'v_manager_tyre_records', siteId),
      fetchAllViewRows(client, 'v_manager_inspection_records', siteId),
      fetchAllViewRows(client, 'v_manager_pressure_events', siteId)
    ]);
  }

  const mappedTyres = (tyreRecords || []).map(row => ({
    ...row,
    make: row.brand || 'Unknown',
    vehicle_no: row.truck || '-',
    last_inspection_date: row.latest_inspection_date || '-',
    last_activity_date: row.latest_activity_date ?? row.latest_inspection_date ?? '-',
    current_rtd1: row.latest_rtd1 ?? row.initial_rtd1 ?? '-',
    current_rtd2: row.latest_rtd2 ?? row.initial_rtd2 ?? '-',
    total_life_run: row.life_achieved || 0,
    odometer: numberOrNull(row.latest_odometer),
    initial_rtd_derived: numberOrNull(row.initial_rtd1) ?? numberOrNull(row.latest_rtd1),
    latest_rtd_derived: null
  }));

  const tyreMap = new Map();
  mappedTyres.forEach(t => tyreMap.set(t.tyre_no, t.make));

  const mappedInspections = (inspectionRecords || []).map(row => ({
    ...row,
    activity_date: row.date || '-',
    activity_type: row.activity_type || 'INSPECTION',
    brand: tyreMap.get(row.tyre_no) || '-',
    psi_found: row.psi ?? '-',
    psi_corrected: row.psi_corrected_merged ?? row.psi ?? '-',
    evidence_submission_id: row.source_submission_id || row.evidence_submission_id || null,
    _activity_at_ms: toDateTimeMillis(row.date)
  }));

  const mappedPressure = (pressureEvents || []).map(row => {
    const checkedAtMs = row.date ? new Date(row.date).getTime() : Date.now();
    return {
      ...row,
      tyre_serial: row.tyre_no,
      vehicle_no: row.truck || '-',
      position_code: row.position || '-',
      checked_at_ms: checkedAtMs,
      checked_at: new Date(checkedAtMs).toISOString(),
      checked_date: row.date,
      found_psi: row.psi_found,
      corrected_psi: row.psi_corrected,
      action: null,
      evidence_submission_id: null
    };
  });

  return {
    tyreRecords: mappedTyres,
    inspectionRecords: mappedInspections,
    pressureEvents: mappedPressure
  };
}

async function fetchLegacyManagerDataset({ supabase, siteId }) {
  const { data: vehicles, error: vehicleError } = await supabase
    .from('vehicles')
    .select('id, vehicle_no')
    .eq('site_id', siteId);

  if (vehicleError) {
    throw vehicleError;
  }

  const vehicleMap = new Map((vehicles || []).map((vehicle) => [vehicle.id, vehicle.vehicle_no]));
  const vehicleIds = Array.from(vehicleMap.keys());

  const logs = await fetchActivityLogs(supabase, vehicleIds);
  const tyres = await fetchTyresForSite(supabase, vehicleIds, logs);
  const tyreMap = new Map(tyres.map((tyre) => [tyre.id, tyre]));

  const evidenceCandidates = await fetchEvidenceCandidates(supabase, siteId);
  const tyreRecords = buildTyreRecords({ tyres, logs, vehicleMap, evidenceCandidates });
  const inspectionRecords = buildInspectionRecords({ logs, tyreMap, vehicleMap, evidenceCandidates });

  return {
    tyreRecords,
    inspectionRecords,
    pressureEvents: buildLegacyPressureEvents({ logs, tyreMap, vehicleMap })
  };
}

export async function fetchFuelRows(siteId) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from(FUEL_TABLE)
    .select('id, truck_no, entry_date, total_trips, total_kms, total_fuel_consumed, total_production, created_at')
    .eq('site_id', siteId)
    .order('entry_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    if (isSchemaMissingError(error)) {
      throw new Error('Fuel DB table is missing. Run migration 005_manager_fuel_trip_entries.sql.');
    }
    throw new Error(`Failed to load fuel rows: ${error.message}`);
  }

  return (data || []).map((row) => ({
    id: row.id,
    truck_no: String(row.truck_no || '').trim().toUpperCase(),
    date: row.entry_date,
    total_trips: Number(row.total_trips || 0),
    total_kms: Number(row.total_kms || 0),
    total_fuel_consumed: Number(row.total_fuel_consumed || 0),
    total_production: Number(row.total_production || 0)
  }));
}

export async function appendFuelRow(siteId, row, actorId = null) {
  const supabase = getSupabaseClient();
  const truckNo = String(row?.truck_no || '').trim().toUpperCase();
  const entryDate = String(row?.date || '').trim();

  if (!truckNo || !entryDate) {
    throw new Error('Truck and date are required.');
  }

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id')
    .eq('site_id', siteId)
    .eq('vehicle_no', truckNo)
    .limit(1)
    .maybeSingle();

  const payload = {
    site_id: siteId,
    vehicle_id: vehicle?.id || null,
    created_by: actorId || null,
    truck_no: truckNo,
    entry_date: entryDate,
    total_trips: Number(row.total_trips || 0),
    total_kms: Number(row.total_kms || 0),
    total_fuel_consumed: Number(row.total_fuel_consumed || 0),
    total_production: Number(row.total_production || 0)
  };

  const { error } = await supabase
    .from(FUEL_TABLE)
    .upsert(payload, { onConflict: 'site_id,truck_no,entry_date' });

  if (error) {
    if (isSchemaMissingError(error)) {
      throw new Error('Fuel DB table is missing. Run migration 005_manager_fuel_trip_entries.sql.');
    }
    throw new Error(`Failed to save fuel row: ${error.message}`);
  }

  return fetchFuelRows(siteId);
}

export async function appendFuelRows(siteId, rows, actorId = null) {
  const supabase = getSupabaseClient();
  const inputRows = Array.isArray(rows) ? rows : [];

  if (!siteId) {
    throw new Error('Site ID is required for fuel import.');
  }

  if (inputRows.length === 0) {
    return fetchFuelRows(siteId);
  }

  const truckNos = Array.from(
    new Set(
      inputRows
        .map((row) => String(row?.truck_no || '').trim().toUpperCase())
        .filter(Boolean)
    )
  );

  const vehicleMap = new Map();
  if (truckNos.length > 0) {
    const { data: vehicles, error: vehicleError } = await supabase
      .from('vehicles')
      .select('id, vehicle_no')
      .eq('site_id', siteId)
      .in('vehicle_no', truckNos);

    if (vehicleError) {
      throw new Error(`Failed to map trucks for fuel import: ${vehicleError.message}`);
    }

    for (const vehicle of vehicles || []) {
      vehicleMap.set(String(vehicle.vehicle_no || '').trim().toUpperCase(), vehicle.id);
    }
  }

  const payload = inputRows.map((row) => {
    const truckNo = String(row?.truck_no || '').trim().toUpperCase();
    const entryDate = String(row?.date || '').trim();
    return {
      site_id: siteId,
      vehicle_id: vehicleMap.get(truckNo) || null,
      created_by: actorId || null,
      truck_no: truckNo,
      entry_date: entryDate,
      total_trips: Number(row?.total_trips || 0),
      total_kms: Number(row?.total_kms || 0),
      total_fuel_consumed: Number(row?.total_fuel_consumed || 0),
      total_production: Number(row?.total_production || 0)
    };
  });

  const chunkSize = 250;
  for (let index = 0; index < payload.length; index += chunkSize) {
    const chunk = payload.slice(index, index + chunkSize);
    const { error } = await supabase
      .from(FUEL_TABLE)
      .upsert(chunk, { onConflict: 'site_id,truck_no,entry_date' });

    if (error) {
      if (isSchemaMissingError(error)) {
        throw new Error('Fuel DB table is missing. Run migration 005_manager_fuel_trip_entries.sql.');
      }
      throw new Error(`Failed to import fuel rows: ${error.message}`);
    }
  }

  return fetchFuelRows(siteId);
}

export function buildAnalyticsSnapshot({ tyreRecords, fuelRows, targets, pressureEvents = [] }) {
  const lifecycleRuns = collectLifecycleRuns(tyreRecords);
  const targetLife = Number(targets.targetTyreLife || 0);
  const tyreCost = Number(targets.tyrePrice || 0);
  const pressure = buildPressureLossAnalytics({
    pressureEvents,
    tyreRecords,
    targets
  });

  const sectionA = lifecycleRuns.map((run) => {
    const actualLife = Number(run.life_achieved || 0);
    const variance = actualLife - targetLife;
    const performance = variance > 0
      ? 'Above Target'
      : (variance === 0 ? 'On Target' : 'Below Target');

    return {
      tyre_no: run.tyre_no,
      brand: run.brand,
      truck: run.truck,
      fitment_date: run.fitment_date,
      removal_date: run.removal_date,
      target_life: targetLife,
      actual_life: actualLife,
      variance,
      tyre_status: run.tyre_status,
      performance_status: performance,
      tyre_cost: tyreCost,
      cpk: actualLife > 0 ? tyreCost / actualLife : 0
    };
  });

  const sectionB = lifecycleRuns
    .filter(run => run.removal_date && run.removal_date !== '-')
    .map((run) => {
      const initialRtdCandidate = numberOrNull(run.initial_rtd);
      if (!Number.isFinite(initialRtdCandidate) || Number(initialRtdCandidate) <= 0) {
        return null;
      }

      const initialRtd = Number(initialRtdCandidate);
      const removalCandidate = numberOrNull(run.removal_rtd);
      const removalRtd = Number.isFinite(removalCandidate)
        ? clamp(Number(removalCandidate), 0, initialRtd)
        : initialRtd;

      const rubberUsed = clamp(((initialRtd - removalRtd) / initialRtd) * 100, 0, 100);
      const rubberWaste = clamp((removalRtd / initialRtd) * 100, 0, 100);
      const valueLost = tyreCost * (rubberWaste / 100);

      return {
        tyre_no: run.tyre_no,
        brand: run.brand,
        truck: run.truck,
        tyre_life: Number(run.life_achieved || 0),
        original_rtd: initialRtd,
        removal_rtd: removalRtd,
        rubber_used_pct: rubberUsed,
        rubber_wasted_pct: rubberWaste,
        tyre_cost: tyreCost,
        value_lost: valueLost,
        tyre_status: run.tyre_status
      };
    })
    .filter(Boolean);

  const sectionC = buildBrandSummary({ tyreRecords, targets, lifecycleRuns });
  const sectionD = buildFuelMonthlySummary({ fuelRows, truckCount: countUniqueTrucks(tyreRecords) || Number(targets.fleetSize || 0) });
  const sectionPressureDaily = pressure.daily;
  const sectionPressureTyres = pressure.tyres;

  const tyreLifeImpact = sectionA.reduce((sum, row) => {
    if (row.target_life <= 0 || row.variance <= 0) return sum;
    const perKmCost = row.tyre_cost / row.target_life;
    return sum + row.variance * perKmCost;
  }, 0);

  const rubberLoss = sectionB.reduce((sum, row) => sum + row.value_lost, 0);
  const fuelImpact = buildFuelImpact(sectionD);
  const pressureImpact = -Number(pressure.summary.cumulative_loss || 0);
  const hasFuelUploads = sectionD.length > 0;
  const modeledFuelKmpl = Number(pressure.summary.estimated_km_per_l || targets.targetFuelEfficiency || 0);
  const currentFuelKmpl = hasFuelUploads
    ? Number(sectionD[sectionD.length - 1]?.km_per_litre || 0)
    : modeledFuelKmpl;
  const fuelVariance = currentFuelKmpl - Number(targets.targetFuelEfficiency || 0);

  const savings = [
    {
      parameter: 'Tyre Life Performance',
      target: `${formatNumber(targets.targetTyreLife)} ${targets.lifeUnit}`,
      current: `${formatNumber(avg(sectionA.map((row) => row.actual_life)))} ${targets.lifeUnit}`,
      variance: `${formatNumber(avg(sectionA.map((row) => row.variance)))} ${targets.lifeUnit}`,
      impact: tyreLifeImpact
    },
    {
      parameter: 'Rubber Utilisation',
      target: '100%',
      current: `${formatNumber(avg(sectionB.map((row) => row.rubber_used_pct)))}%`,
      variance: `${formatNumber(avg(sectionB.map((row) => row.rubber_wasted_pct)))}% wasted`,
      impact: -rubberLoss
    },
    {
      parameter: 'Fuel Efficiency',
      target: `${formatNumber(targets.targetFuelEfficiency)} Km/L`,
      current: `${formatNumber(currentFuelKmpl)} Km/L${hasFuelUploads ? '' : ' (modeled)'}`,
      variance: `${formatNumber(fuelVariance)} Km/L`,
      impact: fuelImpact
    },
    {
      parameter: 'Pressure Leakage',
      target: 'INR 0/day',
      current: `${formatNumber(pressure.summary.avg_daily_loss || 0)} INR/day`,
      variance: `${formatNumber(pressure.summary.cumulative_loss || 0)} INR cumulative loss`,
      impact: pressureImpact
    }
  ];

  const totalImpact = savings.reduce((sum, row) => sum + row.impact, 0);

  return {
    sectionA,
    sectionB,
    sectionC,
    sectionD,
    sectionPressureDaily,
    sectionPressureTyres,
    pressure,
    savings,
    totalImpact
  };
}

async function fetchActivityLogs(supabase, vehicleIds) {
  if (!Array.isArray(vehicleIds) || vehicleIds.length === 0) {
    return [];
  }

  const allRows = [];
  const pageSize = 1000;
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('tyre_activity_log')
      .select('id, tyre_id, vehicle_id, activity_type, activity_date, position, meter_reading, rtd1, rtd2, psi_found, psi_corrected, life_achieved_in_this_run, remarks, created_at')
      .in('vehicle_id', vehicleIds)
      .order('activity_date', { ascending: true })
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(`Failed to load activity logs: ${error.message}`);
    }

    const rows = data || [];
    allRows.push(...rows);

    if (rows.length < pageSize) {
      break;
    }

    offset += rows.length;
  }

  return allRows;
}

async function fetchTyresForSite(supabase, vehicleIds, logs) {
  const tyreIdsFromLogs = Array.from(new Set((logs || []).map((log) => log.tyre_id).filter(Boolean)));
  const output = new Map();

  if (tyreIdsFromLogs.length > 0) {
    const { data, error } = await supabase
      .from('tyres')
      .select('id, tyre_no, make, size, otd, status, total_life_run, current_vehicle_id, current_position, created_at')
      .in('id', tyreIdsFromLogs);

    if (error) {
      throw new Error(`Failed to load tyres by log: ${error.message}`);
    }

    for (const tyre of data || []) {
      output.set(tyre.id, tyre);
    }
  }

  if (vehicleIds.length > 0) {
    const { data, error } = await supabase
      .from('tyres')
      .select('id, tyre_no, make, size, otd, status, total_life_run, current_vehicle_id, current_position, created_at')
      .in('current_vehicle_id', vehicleIds);

    if (error) {
      throw new Error(`Failed to load active tyres: ${error.message}`);
    }

    for (const tyre of data || []) {
      output.set(tyre.id, tyre);
    }
  }

  return Array.from(output.values());
}

async function fetchEvidenceCandidates(supabase, siteId) {
  const { data, error } = await supabase
    .schema('ops')
    .from('offline_submissions')
    .select('id, form_type, context_json, capture_completed_at, created_at')
    .eq('site_id', siteId)
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) {
    console.warn('Evidence candidate lookup failed:', error.message);
    return new Map();
  }

  const map = new Map();
  for (const row of data || []) {
    const vehicle = normalizeKey(row.context_json?.vehicle_no || row.context_json?.vehicleNo || '');
    const position = normalizeKey(row.context_json?.position_code || row.context_json?.positionCode || '');
    const key = `${row.form_type}|${vehicle}|${position}`;
    if (!map.has(key)) {
      map.set(key, row.id);
    }
  }
  return map;
}

function buildTyreRecords({ tyres, logs, vehicleMap, evidenceCandidates }) {
  const logsByTyre = new Map();
  for (const log of logs) {
    if (!logsByTyre.has(log.tyre_id)) logsByTyre.set(log.tyre_id, []);
    logsByTyre.get(log.tyre_id).push(log);
  }

  return tyres.map((tyre) => {
    const tyreLogs = logsByTyre.get(tyre.id) || [];
    const fitments = tyreLogs.filter((log) => log.activity_type === 'FITMENT');
    const inspections = tyreLogs.filter((log) => log.activity_type === 'INSPECTION');
    const removals = tyreLogs.filter((log) => log.activity_type === 'REMOVAL');

    const firstFitment = fitments[0] || null;
    const lastInspection = inspections[inspections.length - 1] || null;
    const lastRemoval = removals[removals.length - 1] || null;

    const activeVehicleNo = vehicleMap.get(tyre.current_vehicle_id) || null;
    const logVehicleNo = vehicleMap.get(lastInspection?.vehicle_id) || vehicleMap.get(firstFitment?.vehicle_id) || null;
    const resolvedVehicleNo = activeVehicleNo || logVehicleNo || '-';
    const status = tyre.status || 'Unknown';
    const hideVehicleNo = status !== 'Running';

    const latestMeterLog = [...tyreLogs].reverse().find((log) => Number.isFinite(Number(log.meter_reading)));
    const odometer = latestMeterLog ? Number(latestMeterLog.meter_reading) : null;

    const rtdTimeline = tyreLogs
      .map((log) => numberOrNull(log.rtd1 ?? log.rtd2))
      .filter((value) => Number.isFinite(value));
    const derivedInitialRtd = rtdTimeline.length > 0 ? Number(rtdTimeline[0]) : null;
    const derivedLatestRtd = rtdTimeline.length > 0 ? Number(rtdTimeline[rtdTimeline.length - 1]) : null;

    const position = tyre.current_position || lastInspection?.position || firstFitment?.position || '-';
    const vehicleNo = hideVehicleNo ? '-' : resolvedVehicleNo;

    const evidenceKey = `tyre_card|${normalizeKey(resolvedVehicleNo)}|${normalizeKey(position)}`;

    return {
      id: tyre.id,
      tyre_no: tyre.tyre_no,
      make: tyre.make || 'Unknown',
      size: tyre.size || '-',
      otd: Number(tyre.otd || 0),
      vehicle_no: vehicleNo,
      position,
      status,
      first_fitment_date: firstFitment?.activity_date || '-',
      last_inspection_date: lastInspection?.activity_date || '-',
      current_rtd1: valueOrDash(lastInspection?.rtd1),
      current_rtd2: valueOrDash(lastInspection?.rtd2),
      odometer,
      total_life_run: Number(tyre.total_life_run || 0),
      removal_date: lastRemoval?.activity_date || '-',
      removal_rtd: numberOrNull(lastRemoval?.rtd1 ?? lastRemoval?.rtd2),
      initial_rtd_derived: derivedInitialRtd,
      latest_rtd_derived: derivedLatestRtd,
      evidence_submission_id: evidenceCandidates.get(evidenceKey) || null
    };
  }).sort((a, b) => a.tyre_no.localeCompare(b.tyre_no));
}

function buildInspectionRecords({ logs, tyreMap, vehicleMap, evidenceCandidates }) {
  const rows = (logs || []).map((log) => {
    const tyre = tyreMap.get(log.tyre_id);
    const vehicleNo = vehicleMap.get(log.vehicle_id) || '-';
    const formType = mapActivityToForm(log.activity_type);
    const evidenceKey = `${formType}|${normalizeKey(vehicleNo)}|${normalizeKey(log.position || '')}`;

    return {
      id: log.id,
      activity_date: log.activity_date,
      activity_type: log.activity_type,
      truck: vehicleNo,
      tyre_no: tyre?.tyre_no || '-',
      brand: tyre?.make || '-',
      position: log.position || '-',
      odometer: numberOrNull(log.meter_reading),
      rtd1: numberOrNull(log.rtd1),
      rtd2: numberOrNull(log.rtd2),
      psi_found: numberOrNull(log.psi_found),
      psi_corrected: numberOrNull(log.psi_corrected),
      remarks: log.remarks || '-',
      evidence_submission_id: evidenceCandidates.get(evidenceKey) || null,
      _activity_at_ms: toDateTimeMillis(log.created_at || log.activity_date)
    };
  });

  const rowsByTyre = new Map();
  for (const row of rows) {
    const key = normalizeKey(row.tyre_no);
    if (!key || key === '-') {
      continue;
    }
    if (!rowsByTyre.has(key)) {
      rowsByTyre.set(key, []);
    }
    rowsByTyre.get(key).push(row);
  }

  for (const list of rowsByTyre.values()) {
    list.sort((a, b) => {
      if (a._activity_at_ms !== b._activity_at_ms) {
        return a._activity_at_ms - b._activity_at_ms;
      }
      return String(a.id || '').localeCompare(String(b.id || ''));
    });

    const carry = {
      odometer: null,
      rtd1: null,
      rtd2: null,
      psi_found: null,
      psi_corrected: null
    };

    for (const row of list) {
      if (!Number.isFinite(row.odometer) && Number.isFinite(carry.odometer)) row.odometer = carry.odometer;
      if (!Number.isFinite(row.rtd1) && Number.isFinite(carry.rtd1)) row.rtd1 = carry.rtd1;
      if (!Number.isFinite(row.rtd2) && Number.isFinite(carry.rtd2)) row.rtd2 = carry.rtd2;
      if (!Number.isFinite(row.psi_found) && Number.isFinite(carry.psi_found)) row.psi_found = carry.psi_found;
      if (!Number.isFinite(row.psi_corrected) && Number.isFinite(carry.psi_corrected)) row.psi_corrected = carry.psi_corrected;

      if (Number.isFinite(row.odometer)) carry.odometer = row.odometer;
      if (Number.isFinite(row.rtd1)) carry.rtd1 = row.rtd1;
      if (Number.isFinite(row.rtd2)) carry.rtd2 = row.rtd2;
      if (Number.isFinite(row.psi_found)) carry.psi_found = row.psi_found;
      if (Number.isFinite(row.psi_corrected)) carry.psi_corrected = row.psi_corrected;
    }

    const backfill = {
      odometer: null,
      rtd1: null,
      rtd2: null,
      psi_found: null,
      psi_corrected: null
    };

    for (let index = list.length - 1; index >= 0; index -= 1) {
      const row = list[index];

      if (!Number.isFinite(row.odometer) && Number.isFinite(backfill.odometer)) row.odometer = backfill.odometer;
      if (!Number.isFinite(row.rtd1) && Number.isFinite(backfill.rtd1)) row.rtd1 = backfill.rtd1;
      if (!Number.isFinite(row.rtd2) && Number.isFinite(backfill.rtd2)) row.rtd2 = backfill.rtd2;
      if (!Number.isFinite(row.psi_found) && Number.isFinite(backfill.psi_found)) row.psi_found = backfill.psi_found;
      if (!Number.isFinite(row.psi_corrected) && Number.isFinite(backfill.psi_corrected)) row.psi_corrected = backfill.psi_corrected;

      if (Number.isFinite(row.odometer)) backfill.odometer = row.odometer;
      if (Number.isFinite(row.rtd1)) backfill.rtd1 = row.rtd1;
      if (Number.isFinite(row.rtd2)) backfill.rtd2 = row.rtd2;
      if (Number.isFinite(row.psi_found)) backfill.psi_found = row.psi_found;
      if (Number.isFinite(row.psi_corrected)) backfill.psi_corrected = row.psi_corrected;
    }
  }

  return rows
    .sort((a, b) => {
      if (a._activity_at_ms !== b._activity_at_ms) {
        return b._activity_at_ms - a._activity_at_ms;
      }
      return String(b.id || '').localeCompare(String(a.id || ''));
    })
    .map((row) => ({
      id: row.id,
      activity_date: row.activity_date,
      activity_type: row.activity_type,
      truck: row.truck,
      tyre_no: row.tyre_no,
      brand: row.brand,
      position: row.position,
      odometer: valueOrDash(row.odometer),
      rtd1: valueOrDash(row.rtd1),
      rtd2: valueOrDash(row.rtd2),
      psi_found: valueOrDash(row.psi_found),
      psi_corrected: valueOrDash(row.psi_corrected),
      remarks: row.remarks,
      evidence_submission_id: row.evidence_submission_id
    }));
}

function buildLegacyPressureEvents({ logs, tyreMap, vehicleMap }) {
  return (logs || [])
    .filter((log) => log.activity_type === 'PRESSURE_CHECK')
    .map((log) => {
      const tyre = tyreMap.get(log.tyre_id);
      const tyreNo = normalizeKey(tyre?.tyre_no);
      const vehicleNo = normalizeKey(vehicleMap.get(log.vehicle_id) || '-');
      const position = normalizeKey(log.position || '-');
      const foundPsi = numberOrNull(log.psi_found);
      const correctedPsi = numberOrNull(log.psi_corrected);

      if (!tyreNo || (!Number.isFinite(foundPsi) && !Number.isFinite(correctedPsi))) {
        return null;
      }

      const checkedAtMs = toDateTimeMillis(log.activity_date || log.created_at);
      return {
        id: String(log.id || `legacy-pressure-${tyreNo}-${checkedAtMs}`),
        tyre_serial: tyreNo,
        vehicle_no: vehicleNo || '-',
        position_code: position || '-',
        checked_at_ms: checkedAtMs,
        checked_at: new Date(checkedAtMs).toISOString(),
        checked_date: toDateString(log.activity_date || log.created_at),
        found_psi: Number.isFinite(foundPsi) ? foundPsi : null,
        corrected_psi: Number.isFinite(correctedPsi) ? correctedPsi : null,
        action: null,
        evidence_submission_id: null
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.checked_at_ms - b.checked_at_ms);
}

async function fetchFitterManagerDataset({ supabase, siteId }) {
  const [cardsRes, pressureRes, inspectionRes, removalRes] = await Promise.all([
    supabase
      .from('fitter_tyre_card_entries')
      .select('id, submission_id, tyre_serial, make, size, vehicle_no, position_code, meter_reading, rtd1, rtd2, fitment_type, raw_payload, capture_completed_at, created_at')
      .eq('site_id', siteId)
      .order('capture_completed_at', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(3000),
    supabase
      .from('fitter_pressure_check_entries')
      .select('id, submission_id, vehicle_no, position_code, found_psi, target_psi, action, raw_payload, capture_completed_at, created_at')
      .eq('site_id', siteId)
      .order('capture_completed_at', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(3000),
    supabase
      .from('fitter_tyre_inspection_entries')
      .select('id, submission_id, tyre_serial, vehicle_no, position_code, rtd1, rtd2, damage_class, remarks, raw_payload, capture_completed_at, created_at')
      .eq('site_id', siteId)
      .order('capture_completed_at', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(3000),
    supabase
      .from('fitter_tyre_removal_entries')
      .select('id, submission_id, tyre_serial, current_reading, life_achieved, disposition, rtd1, rtd2, removal_reason, remarks, raw_payload, capture_completed_at, created_at')
      .eq('site_id', siteId)
      .order('capture_completed_at', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(3000)
  ]);

  const queryErrors = [cardsRes.error, pressureRes.error, inspectionRes.error, removalRes.error].filter(Boolean);
  if (queryErrors.length > 0) {
    const first = queryErrors[0];
    if (isSchemaMissingError(first)) {
      return {
        tyreRecords: [],
        inspectionRecords: [],
        pressureEvents: []
      };
    }
    throw new Error(`Fitter table dataset query failed: ${first.message}`);
  }

  const cards = cardsRes.data || [];
  const pressureChecks = pressureRes.data || [];
  const inspections = inspectionRes.data || [];
  const removals = removalRes.data || [];

  const events = [];

  for (const row of cards) {
    const payload = parsePayloadRecord(row.raw_payload);
    const extracted = payload.extracted;
    const context = payload.context;
    const serial = normalizeKey(row.tyre_serial || extracted.tyre_serial);
    if (!serial) continue;

    events.push({
      id: `fitment-${row.submission_id || row.id}`,
      submission_id: row.submission_id || null,
      activity_type: 'FITMENT',
      activity_at_ms: toDateTimeMillis(row.capture_completed_at || row.created_at),
      activity_date: toDateString(row.capture_completed_at || row.created_at),
      serial,
      vehicle_no: normalizeKey(row.vehicle_no || extracted.vehicle_no || context.vehicle_no) || '-',
      position_code: normalizeKey(row.position_code || extracted.position_code || context.position_code) || '-',
      make: String(row.make || extracted.make || '').trim() || null,
      size: String(row.size || extracted.size || '').trim() || null,
      odometer: numberOrNull(row.meter_reading ?? extracted.meter_reading),
      rtd1: numberOrNull(row.rtd1 ?? extracted.rtd1),
      rtd2: numberOrNull(row.rtd2 ?? extracted.rtd2),
      psi_found: null,
      psi_corrected: null,
      fitment_type: String(row.fitment_type || extracted.fitment_type || '').trim() || null,
      removal_reason: null,
      disposition: null,
      fitment_reading: null,
      life_achieved: null,
      remarks: null,
      source_order: 1
    });
  }

  for (const row of pressureChecks) {
    const payload = parsePayloadRecord(row.raw_payload);
    const extracted = payload.extracted;
    const context = payload.context;

    events.push({
      id: `pressure-${row.submission_id || row.id}`,
      submission_id: row.submission_id || null,
      activity_type: 'PRESSURE_CHECK',
      activity_at_ms: toDateTimeMillis(row.capture_completed_at || row.created_at),
      activity_date: toDateString(row.capture_completed_at || row.created_at),
      serial: normalizeKey(row.tyre_serial || extracted.tyre_serial) || null,
      vehicle_no: normalizeKey(row.vehicle_no || extracted.vehicle_no || context.vehicle_no) || '-',
      position_code: normalizeKey(row.position_code || extracted.position_code || context.position_code) || '-',
      make: String(extracted.make || '').trim() || null,
      size: String(extracted.size || '').trim() || null,
      odometer: numberOrNull(row.meter_reading ?? extracted.meter_reading),
      rtd1: numberOrNull(extracted.rtd1),
      rtd2: numberOrNull(extracted.rtd2),
      psi_found: numberOrNull(row.found_psi ?? extracted.found_psi),
      psi_corrected: numberOrNull(row.target_psi ?? extracted.target_psi),
      fitment_type: null,
      removal_reason: null,
      disposition: null,
      fitment_reading: null,
      life_achieved: null,
      remarks: String(row.action || extracted.action || '').trim() || null,
      source_order: 2
    });
  }

  for (const row of inspections) {
    const payload = parsePayloadRecord(row.raw_payload);
    const extracted = payload.extracted;
    const context = payload.context;
    const serial = normalizeKey(row.tyre_serial || extracted.tyre_serial);
    if (!serial) continue;

    events.push({
      id: `inspection-${row.submission_id || row.id}`,
      submission_id: row.submission_id || null,
    activity_type: row.activity_type || 'INSPECTION',
      activity_at_ms: toDateTimeMillis(row.capture_completed_at || row.created_at),
      activity_date: toDateString(row.capture_completed_at || row.created_at),
      serial,
      vehicle_no: normalizeKey(row.vehicle_no || extracted.vehicle_no || context.vehicle_no) || '-',
      position_code: normalizeKey(row.position_code || extracted.position_code || context.position_code) || '-',
      make: String(extracted.make || '').trim() || null,
      size: String(extracted.size || '').trim() || null,
      odometer: numberOrNull(row.meter_reading ?? extracted.meter_reading),
      rtd1: numberOrNull(row.rtd1 ?? extracted.rtd1),
      rtd2: numberOrNull(row.rtd2 ?? extracted.rtd2),
      psi_found: numberOrNull(extracted.found_psi),
      psi_corrected: numberOrNull(extracted.target_psi),
      fitment_type: null,
      removal_reason: null,
      disposition: null,
      fitment_reading: null,
      life_achieved: null,
      remarks: String(row.remarks || extracted.remarks || row.damage_class || extracted.damage_class || '').trim() || null,
      source_order: 3
    });
  }

  for (const row of removals) {
    const payload = parsePayloadRecord(row.raw_payload);
    const extracted = payload.extracted;
    const context = payload.context;
    const serial = normalizeKey(row.tyre_serial || extracted.tyre_serial);
    if (!serial) continue;

    events.push({
      id: `removal-${row.submission_id || row.id}`,
      submission_id: row.submission_id || null,
      activity_type: 'REMOVAL',
      activity_at_ms: toDateTimeMillis(row.capture_completed_at || row.created_at),
      activity_date: toDateString(row.capture_completed_at || row.created_at),
      serial,
      vehicle_no: normalizeKey(row.vehicle_no || extracted.vehicle_no || context.vehicle_no) || '-',
      position_code: normalizeKey(row.position_code || extracted.position_code || context.position_code) || '-',
      make: String(extracted.make || '').trim() || null,
      size: String(extracted.size || '').trim() || null,
      odometer: numberOrNull(row.current_reading ?? extracted.current_reading ?? extracted.meter_reading),
      rtd1: numberOrNull(row.rtd1 ?? extracted.rtd1),
      rtd2: numberOrNull(row.rtd2 ?? extracted.rtd2),
      psi_found: numberOrNull(extracted.found_psi),
      psi_corrected: numberOrNull(extracted.target_psi),
      fitment_type: null,
      removal_reason: String(row.removal_reason || extracted.removal_reason || '').trim() || null,
      disposition: String(row.disposition || extracted.disposition || '').trim() || null,
      fitment_reading: numberOrNull(row.fitment_reading ?? extracted.fitment_reading),
      life_achieved: numberOrNull(row.life_achieved ?? extracted.life_achieved),
      remarks: String(row.remarks || extracted.remarks || row.removal_reason || extracted.removal_reason || '').trim() || null,
      source_order: 4
    });
  }

  events.sort((a, b) => {
    if (a.activity_at_ms !== b.activity_at_ms) return a.activity_at_ms - b.activity_at_ms;
    if (a.source_order !== b.source_order) return a.source_order - b.source_order;
    return String(a.id).localeCompare(String(b.id));
  });

  const tyreBySerial = new Map();
  const serialByVehiclePosition = new Map();
  const inspectionRecords = [];
  const pressureEvents = [];

  const ensureTyreRecord = (serial) => {
    const key = normalizeKey(serial);
    if (!key) return null;
    if (!tyreBySerial.has(key)) {
      tyreBySerial.set(key, {
        id: key,
        tyre_no: key,
        make: '-',
        size: '-',
        otd: 0,
        vehicle_no: '-',
        position: '-',
        status: 'Unknown',
        first_fitment_date: '-',
        last_inspection_date: '-',
        current_rtd1: '-',
        current_rtd2: '-',
        total_life_run: 0,
        removal_date: '-',
        removal_rtd: 0,
        evidence_submission_id: null,
        lifecycle_runs: [],
        _completed_life: 0,
        _open_run: null,
        _last_inspection_at_ms: 0,
        _latest_odometer: null,
        _latest_rtd1: null,
        _latest_rtd2: null,
        _latest_psi_found: null,
        _latest_psi_corrected: null
      });
    }
    return tyreBySerial.get(key);
  };

  for (const event of events) {
    let serial = event.serial;
    if (!serial) {
      const key = makeVehiclePositionKey(event.vehicle_no, event.position_code);
      serial = key ? serialByVehiclePosition.get(key) : null;
    }
    if (!serial) continue;

    const record = ensureTyreRecord(serial);
    if (!record) continue;

    if (event.make) record.make = event.make;
    if (event.size) record.size = event.size;
    if (event.vehicle_no && event.vehicle_no !== '-') record.vehicle_no = event.vehicle_no;
    if (event.position_code && event.position_code !== '-') record.position = event.position_code;

    const rawOdometer = numberOrNull(event.odometer);
    const rawRtd1 = numberOrNull(event.rtd1);
    const rawRtd2 = numberOrNull(event.rtd2);
    const rawPsiFound = numberOrNull(event.psi_found);
    const rawPsiCorrected = numberOrNull(event.psi_corrected);

    const odometer = Number.isFinite(rawOdometer) ? rawOdometer : record._latest_odometer;
    const rtd1 = Number.isFinite(rawRtd1) ? rawRtd1 : record._latest_rtd1;
    const rtd2 = Number.isFinite(rawRtd2) ? rawRtd2 : record._latest_rtd2;
    const psiFound = Number.isFinite(rawPsiFound) ? rawPsiFound : record._latest_psi_found;
    const psiCorrected = Number.isFinite(rawPsiCorrected) ? rawPsiCorrected : record._latest_psi_corrected;

    if (Number.isFinite(rawOdometer)) record._latest_odometer = rawOdometer;
    if (Number.isFinite(rawRtd1)) record._latest_rtd1 = rawRtd1;
    if (Number.isFinite(rawRtd2)) record._latest_rtd2 = rawRtd2;
    if (Number.isFinite(rawPsiFound)) record._latest_psi_found = rawPsiFound;
    if (Number.isFinite(rawPsiCorrected)) record._latest_psi_corrected = rawPsiCorrected;

    if (event.activity_type === 'FITMENT') {
      if (record.first_fitment_date === '-' || event.activity_at_ms < toDateTimeMillis(record.first_fitment_date)) {
        record.first_fitment_date = event.activity_date;
      }

      record.status = 'Running';
      record.removal_date = '-';
      record.removal_rtd = 0;
      record.evidence_submission_id = event.submission_id || record.evidence_submission_id;

      if (record._open_run
        && Number.isFinite(record._open_run.fitment_odometer)
        && Number.isFinite(odometer)
        && odometer >= record._open_run.fitment_odometer) {
        const staleLife = round2(odometer - record._open_run.fitment_odometer);
        record._completed_life += staleLife;
        record.lifecycle_runs.push({
          tyre_no: record.tyre_no,
          brand: record.make,
          truck: record._open_run.truck || record.vehicle_no,
          fitment_date: record._open_run.fitment_date,
          removal_date: event.activity_date,
          life_achieved: staleLife,
          initial_rtd: numberOrNull(record._open_run.initial_rtd),
          removal_rtd: numberOrNull(rtd1),
          tyre_status: 'Running',
          evidence_submission_id: record._open_run.evidence_submission_id || record.evidence_submission_id || null
        });
      }

      record._open_run = {
        fitment_date: event.activity_date,
        fitment_odometer: Number.isFinite(odometer) ? odometer : null,
        initial_rtd: Number.isFinite(rawRtd1) ? rawRtd1 : rtd1,
        truck: event.vehicle_no && event.vehicle_no !== '-' ? event.vehicle_no : record.vehicle_no,
        evidence_submission_id: event.submission_id || null
      };

      const fitmentKey = makeVehiclePositionKey(event.vehicle_no, event.position_code);
      if (fitmentKey) {
        serialByVehiclePosition.set(fitmentKey, serial);
      }
    }

    if (event.activity_type === 'INSPECTION') {
      if (event.activity_at_ms >= record._last_inspection_at_ms) {
        record._last_inspection_at_ms = event.activity_at_ms;
        record.last_inspection_date = event.activity_date;
        record.current_rtd1 = valueOrDash(rtd1);
        record.current_rtd2 = valueOrDash(rtd2);
      }

      if (record.status === 'Unknown') {
        record.status = 'Running';
      }

      const inspectionKey = makeVehiclePositionKey(event.vehicle_no, event.position_code);
      if (inspectionKey) {
        serialByVehiclePosition.set(inspectionKey, serial);
      }
    }

    if (event.activity_type === 'PRESSURE_CHECK') {
      if (record.status === 'Unknown') {
        record.status = 'Running';
      }

      const pressureKey = makeVehiclePositionKey(event.vehicle_no, event.position_code);
      if (pressureKey) {
        serialByVehiclePosition.set(pressureKey, serial);
      }

      pressureEvents.push({
        id: event.id,
        tyre_serial: record.tyre_no,
        vehicle_no: event.vehicle_no && event.vehicle_no !== '-' ? event.vehicle_no : (record.vehicle_no || '-'),
        position_code: event.position_code && event.position_code !== '-' ? event.position_code : (record.position || '-'),
        checked_at_ms: event.activity_at_ms,
        checked_at: new Date(event.activity_at_ms).toISOString(),
        checked_date: event.activity_date,
        found_psi: Number.isFinite(rawPsiFound) ? rawPsiFound : null,
        corrected_psi: Number.isFinite(rawPsiCorrected) ? rawPsiCorrected : null,
        action: event.remarks || null,
        evidence_submission_id: event.submission_id || null
      });
    }

    if (event.activity_type === 'REMOVAL') {
      const currentReading = Number.isFinite(rawOdometer) ? rawOdometer : odometer;
      const explicitFitmentReading = numberOrNull(event.fitment_reading);
      const baseline = Number.isFinite(explicitFitmentReading)
        ? explicitFitmentReading
        : numberOrNull(record._open_run?.fitment_odometer);
      const explicitLife = numberOrNull(event.life_achieved);

      let runLife = 0;
      if (Number.isFinite(currentReading) && Number.isFinite(baseline) && currentReading >= baseline) {
        runLife = round2(currentReading - baseline);
      } else if (Number.isFinite(explicitLife) && explicitLife >= 0) {
        runLife = round2(explicitLife);
      }

      record._completed_life += runLife;
      record.status = event.disposition || 'Spare';
      record.removal_date = event.activity_date;
      record.removal_rtd = Number.isFinite(rtd1) ? rtd1 : 0;
      record.evidence_submission_id = event.submission_id || record.evidence_submission_id;

      record.lifecycle_runs.push({
        tyre_no: record.tyre_no,
        brand: record.make,
        truck: event.vehicle_no && event.vehicle_no !== '-'
          ? event.vehicle_no
          : (record._open_run?.truck || record.vehicle_no),
        fitment_date: record._open_run?.fitment_date || '-',
        removal_date: event.activity_date,
        life_achieved: runLife,
        initial_rtd: numberOrNull(record._open_run?.initial_rtd),
        removal_rtd: numberOrNull(rtd1),
        tyre_status: record.status,
        evidence_submission_id: event.submission_id || record._open_run?.evidence_submission_id || null
      });

      record._open_run = null;

      const removalKey = makeVehiclePositionKey(event.vehicle_no, event.position_code);
      if (removalKey && serialByVehiclePosition.get(removalKey) === serial) {
        serialByVehiclePosition.delete(removalKey);
      }
    }

    const fitmentRemark = event.fitment_type
      ? `Tyre ${event.fitment_type}`
      : 'Fitment captured by fitter';

    inspectionRecords.push({
      id: event.id,
      _activity_at_ms: event.activity_at_ms,
      activity_date: event.activity_date,
      activity_type: event.activity_type,
      truck: event.vehicle_no && event.vehicle_no !== '-' ? event.vehicle_no : (record.vehicle_no || '-'),
      tyre_no: record.tyre_no,
      brand: record.make || '-',
      position: event.position_code && event.position_code !== '-' ? event.position_code : (record.position || '-'),
      odometer: Number.isFinite(odometer) ? odometer : '-',
      rtd1: valueOrDash(rtd1),
      rtd2: valueOrDash(rtd2),
      psi_found: valueOrDash(psiFound),
      psi_corrected: valueOrDash(psiCorrected),
      remarks: event.activity_type === 'FITMENT'
        ? fitmentRemark
        : (event.remarks || event.removal_reason || '-'),
      evidence_submission_id: event.submission_id || null
    });
  }

  const tyreRecords = Array.from(tyreBySerial.values())
    .map((record) => {
      let ongoingLife = 0;
      if (
        record._open_run
        && Number.isFinite(numberOrNull(record._open_run.fitment_odometer))
        && Number.isFinite(numberOrNull(record._latest_odometer))
        && Number(record._latest_odometer) >= Number(record._open_run.fitment_odometer)
      ) {
        ongoingLife = round2(Number(record._latest_odometer) - Number(record._open_run.fitment_odometer));
        record.lifecycle_runs.push({
          tyre_no: record.tyre_no,
          brand: record.make,
          truck: record._open_run.truck || record.vehicle_no,
          fitment_date: record._open_run.fitment_date,
          removal_date: '-',
          life_achieved: ongoingLife,
          initial_rtd: numberOrNull(record._open_run.initial_rtd),
          removal_rtd: null,
          tyre_status: 'Running',
          evidence_submission_id: record._open_run.evidence_submission_id || record.evidence_submission_id || null
        });
      }

      record.total_life_run = round2(record._completed_life + ongoingLife);

      // Expose latest odometer reading for UI and analytics
      record.odometer = Number.isFinite(record._latest_odometer) ? Number(record._latest_odometer) : null;

      if (record.current_rtd1 === '-' && Number.isFinite(numberOrNull(record._latest_rtd1))) {
        record.current_rtd1 = Number(record._latest_rtd1);
      }
      if (record.current_rtd2 === '-' && Number.isFinite(numberOrNull(record._latest_rtd2))) {
        record.current_rtd2 = Number(record._latest_rtd2);
      }

      if (Number(record.otd || 0) <= 0) {
        const firstRunWithRtd = (record.lifecycle_runs || []).find((run) => Number.isFinite(numberOrNull(run.initial_rtd)));
        if (firstRunWithRtd) {
          record.otd = Number(firstRunWithRtd.initial_rtd || 0);
        }
      }

      if (record.status === 'Unknown') {
        record.status = record._open_run ? 'Running' : 'Spare';
      }

      delete record._completed_life;
      delete record._open_run;
      delete record._last_inspection_at_ms;
      delete record._latest_odometer;
      delete record._latest_rtd1;
      delete record._latest_rtd2;
      delete record._latest_psi_found;
      delete record._latest_psi_corrected;

      return record;
    })
    .sort((a, b) => a.tyre_no.localeCompare(b.tyre_no));

  inspectionRecords.sort((a, b) => {
    if (a._activity_at_ms !== b._activity_at_ms) {
      return b._activity_at_ms - a._activity_at_ms;
    }
    return String(b.id).localeCompare(String(a.id));
  });

  const normalizedInspectionRecords = inspectionRecords.map((row) => {
    const copy = { ...row };
    delete copy._activity_at_ms;
    // Alias fitter-event fields to the canonical dashboard shape so the merge
    // dedup/enrichment (which keys on tyre_no/truck/_activity_at_ms) works.
    if (copy.tyre_no === undefined && copy.serial) copy.tyre_no = copy.serial;
    if (copy.truck === undefined && copy.vehicle_no) copy.truck = copy.vehicle_no;
    if (copy.position === undefined && copy.position_code) copy.position = copy.position_code;
    if (copy._activity_at_ms === undefined && copy.activity_at_ms) copy._activity_at_ms = copy.activity_at_ms;
    return copy;
  });

  return {
    tyreRecords,
    inspectionRecords: normalizedInspectionRecords,
    pressureEvents: pressureEvents.sort((a, b) => a.checked_at_ms - b.checked_at_ms)
  };
}

function buildBrandSummary({ tyreRecords, targets, lifecycleRuns = [] }) {
  const grouped = new Map();

  if (Array.isArray(lifecycleRuns) && lifecycleRuns.length > 0) {
    for (const run of lifecycleRuns) {
      const brand = String(run.brand || '-').trim() || '-';
      const year = String(run.fitment_date || '').slice(0, 4) || 'Unknown';
      const key = `${brand}|${year}`;

      if (!grouped.has(key)) {
        grouped.set(key, {
          brand,
          year,
          tyres: new Set(),
          totalLife: 0
        });
      }

      const group = grouped.get(key);
      group.tyres.add(String(run.tyre_no || '').trim() || `${brand}-${year}-${group.tyres.size + 1}`);
      group.totalLife += Number(run.life_achieved || 0);
    }
  } else {
    for (const record of tyreRecords) {
      const year = String(record.first_fitment_date || '').slice(0, 4) || 'Unknown';
      const brand = String(record.make || '-').trim() || '-';
      const key = `${brand}|${year}`;

      if (!grouped.has(key)) {
        grouped.set(key, {
          brand,
          year,
          tyres: new Set(),
          totalLife: 0
        });
      }

      const group = grouped.get(key);
      group.tyres.add(String(record.tyre_no || '').trim() || `${brand}-${year}-${group.tyres.size + 1}`);
      group.totalLife += Number(record.total_life_run || 0);
    }
  }

  return Array.from(grouped.values())
    .map((group) => {
      const tyreCount = group.tyres.size;
      const avgLife = tyreCount > 0 ? group.totalLife / tyreCount : 0;
      const targetLife = Number(targets.targetTyreLife || 0);
      const avgCost = Number(targets.tyrePrice || 0);

      return {
        brand: group.brand,
        year: group.year,
        tyre_count: tyreCount,
        avg_life_achieved: avgLife,
        target_life: targetLife,
        achievement_pct: targetLife > 0 ? (avgLife / targetLife) * 100 : 0,
        avg_tyre_cost: avgCost,
        cpk: avgLife > 0 ? avgCost / avgLife : 0
      };
    })
    .sort((a, b) => a.brand.localeCompare(b.brand));
}

function buildFuelMonthlySummary({ fuelRows, truckCount }) {
  const grouped = new Map();

  for (const row of fuelRows) {
    const month = String(row.date || '').slice(0, 7);
    if (!month) continue;

    if (!grouped.has(month)) {
      grouped.set(month, {
        month,
        total_trucks: truckCount,
        total_trips: 0,
        total_kms: 0,
        diesel_consumed: 0
      });
    }

    const group = grouped.get(month);
    group.total_trips += Number(row.total_trips || 0);
    group.total_kms += Number(row.total_kms || 0);
    group.diesel_consumed += Number(row.total_fuel_consumed || 0);
  }

  const sorted = Array.from(grouped.values()).sort((a, b) => a.month.localeCompare(b.month));
  const base = sorted[0]?.total_kms > 0 && sorted[0]?.diesel_consumed > 0
    ? sorted[0].total_kms / sorted[0].diesel_consumed
    : 0;

  for (let index = 0; index < sorted.length; index += 1) {
    const row = sorted[index];
    row.km_per_litre = row.diesel_consumed > 0 ? row.total_kms / row.diesel_consumed : 0;
    row.fuel_per_truck = row.total_trucks > 0 ? row.diesel_consumed / row.total_trucks : 0;
    row.variance_vs_base = row.km_per_litre - base;

    const previous = sorted[index - 1];
    row.variance_vs_previous = previous ? row.km_per_litre - previous.km_per_litre : 0;
  }

  return sorted;
}

function buildFuelImpact(sectionD) {
  if (!Array.isArray(sectionD) || sectionD.length < 2) {
    return 0;
  }

  const latest = sectionD[sectionD.length - 1];
  const base = sectionD[0];
  if (!latest || !base || base.km_per_litre <= 0 || latest.km_per_litre <= 0) {
    return 0;
  }

  const kms = Number(latest.total_kms || 0);
  const baseFuelNeeded = kms / base.km_per_litre;
  const currentFuelNeeded = kms / latest.km_per_litre;
  // Allow negative impact (fuel loss) if efficiency has degraded
  const fuelDiff = baseFuelNeeded - currentFuelNeeded;

  const dieselRate = 95;
  return fuelDiff * dieselRate;
}

function mapActivityToForm(activityType) {
  const map = {
    FITMENT: 'tyre_card',
    PRESSURE_CHECK: 'pressure_check',
    INSPECTION: 'tyre_inspection',
    REMOVAL: 'tyre_removal'
  };
  return map[activityType] || 'tyre_inspection';
}

function toDateString(value) {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

function toDateTimeMillis(value) {
  const date = value ? new Date(value) : new Date();
  const millis = date.getTime();
  if (Number.isNaN(millis)) {
    return Date.now();
  }
  return millis;
}

function makeVehiclePositionKey(vehicleNo, positionCode) {
  const vehicle = normalizeKey(vehicleNo);
  const position = normalizeKey(positionCode);
  if (!vehicle || !position) {
    return null;
  }
  return `${vehicle}|${position}`;
}

function normalizeKey(value) {
  return String(value || '').trim().toUpperCase();
}

function valueOrDash(value) {
  if (value === undefined || value === null || value === '') return '-';
  return value;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number;
}

function round2(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Number(number.toFixed(2));
}

function parsePayloadRecord(rawPayload) {
  const payload = rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
    ? rawPayload
    : {};

  return {
    extracted: payload.extracted && typeof payload.extracted === 'object' && !Array.isArray(payload.extracted)
      ? payload.extracted
      : {},
    context: payload.context && typeof payload.context === 'object' && !Array.isArray(payload.context)
      ? payload.context
      : {}
  };
}

function collectLifecycleRuns(tyreRecords) {
  const runs = [];

  for (const row of tyreRecords || []) {
    const mappedRuns = Array.isArray(row.lifecycle_runs) ? row.lifecycle_runs : [];

    if (mappedRuns.length > 0) {
      for (const run of mappedRuns) {
        runs.push({
          tyre_no: run.tyre_no || row.tyre_no,
          brand: run.brand || row.make || '-',
          size: run.size || row.size || '-',
          truck: run.truck || row.vehicle_no || '-',
          fitment_date: run.fitment_date || row.first_fitment_date || '-',
          removal_date: run.removal_date || '-',
          life_achieved: Number(run.life_achieved || 0),
          initial_rtd: numberOrNull(run.initial_rtd),
          removal_rtd: numberOrNull(run.removal_rtd),
          tyre_status: run.tyre_status || row.status || 'Unknown'
        });
      }
      continue;
    }

    runs.push({
      tyre_no: row.tyre_no,
      brand: row.make || '-',
      size: row.size || '-',
      truck: row.vehicle_no || '-',
      fitment_date: row.first_fitment_date || '-',
      removal_date: row.removal_date || '-',
      life_achieved: Number(row.total_life_run || 0),
      initial_rtd: numberOrNull(row.otd)
        ?? numberOrNull(row.initial_rtd_derived),
      removal_rtd: numberOrNull(row.removal_rtd)
        ?? numberOrNull(row.latest_rtd_derived)
        ?? numberOrNull(row.current_rtd1)
        ?? numberOrNull(row.current_rtd2),
      tyre_status: row.status || 'Unknown'
    });
  }

  return runs;
}

function buildPressureLossAnalytics({ pressureEvents, tyreRecords, targets }) {
  const empty = {
    summary: {
      mtd_loss: 0,
      cumulative_loss: 0,
      avg_daily_loss: 0,
      avg_psi_drop_per_day: 0,
      active_tyres: 0
    },
    daily: [],
    tyres: []
  };

  if (!targets || targets.pressureModelEnabled === false) {
    return empty;
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const basePsi = Math.max(1, Number(targets.pressureBasePsi || 120));
  const temperatureZone = normalizeTemperatureZone(targets.pressureTempZone);
  const fuelPrice = Math.max(0, Number(targets.pressureFuelPrice || 90));
  const dailyKm = Math.max(0, Number(targets.pressureDailyKm || 250));
  const tiresPerTruck = Math.max(1, Number(targets.pressureTiresPerTruck || 6));
  const calibrationDays = Math.max(1, Number(targets.pressureCalibrationDays || 30));
  const maxInterpolationDays = Math.max(1, Number(targets.pressureMaxInterpolationDays || 7));
  const targetTyreLifeKm = Math.max(0, Number(targets.pressureTargetTyreLifeKm || 0));
  const tyrePrice = Math.max(0, Number(targets.tyrePrice || 0));
  const fuelEfficiency = Math.max(0.1, Number(targets.pressureFuelEfficiencyKmpl || targets.targetFuelEfficiency || 0));
  const minIntervalDays = Math.max(0.05, Number(targets.pressureMinIntervalHours || 6) / 24);

  const lifeTempMultiplierMap = {
    20: 1.0,
    35: 1.15,
    45: 1.35,
    55: 1.6
  };

  const rrTempMultiplierMap = {
    20: 1.0,
    35: 1.05,
    45: 1.1,
    55: 1.18
  };

  const lifeTempMultiplier = lifeTempMultiplierMap[temperatureZone] || 1.0;
  const rrTempMultiplier = rrTempMultiplierMap[temperatureZone] || 1.0;
  const baselineFuelLitersTruck = dailyKm / fuelEfficiency;

  const groupedByTyre = new Map();
  for (const row of pressureEvents || []) {
    const serial = normalizeKey(row?.tyre_serial);
    const checkedAtMs = Number(row?.checked_at_ms || 0);
    const foundPsi = numberOrNull(row?.found_psi);
    const correctedPsi = numberOrNull(row?.corrected_psi);

    if (!serial || !Number.isFinite(checkedAtMs) || (!Number.isFinite(foundPsi) && !Number.isFinite(correctedPsi))) {
      continue;
    }

    if (!groupedByTyre.has(serial)) {
      groupedByTyre.set(serial, []);
    }

    groupedByTyre.get(serial).push({
      id: row.id,
      tyre_serial: serial,
      vehicle_no: normalizeKey(row.vehicle_no || '-'),
      position_code: normalizeKey(row.position_code || '-'),
      checked_at_ms: checkedAtMs,
      checked_date: toDateString(row.checked_at || row.checked_date || checkedAtMs),
      found_psi: foundPsi,
      corrected_psi: correctedPsi
    });
  }

  const tyreStatusMap = new Map();
  for (const row of tyreRecords || []) {
    const serial = normalizeKey(row?.tyre_no);
    if (!serial) continue;
    tyreStatusMap.set(serial, {
      status: String(row?.status || 'Unknown'),
      truck: normalizeKey(row?.vehicle_no || '-'),
      position: normalizeKey(row?.position || '-')
    });
  }

  const dailyMap = new Map();
  const detailedDailyRows = [];
  const tyreLossMap = new Map();
  const nowMs = Date.now();
  const currentMonthPrefix = new Date(nowMs).toISOString().slice(0, 7);
  let totalRrIncreasePct = 0;
  let totalFuelIncreasePct = 0;
  let fuelIncreasePoints = 0;

  const applyDailyImpact = ({
    serial,
    truck,
    position,
    metricMs,
    psiDropPerDay,
    estimatedPsi,
    impactPsi,
    confidence,
    lastObservedPsi,
    lastCheckedMs
  }) => {
    const effectivePsi = Number.isFinite(numberOrNull(impactPsi)) ? Number(impactPsi) : Number(estimatedPsi);
    const pressureLossPct = clamp(((basePsi - effectivePsi) / basePsi) * 100, 0, 100);
    const lifeLossFactor = lifeLossPiecewise(pressureLossPct) * lifeTempMultiplier;
    const dailyLifeLossPct = lifeLossFactor / calibrationDays;
    const lifeLossKm = (dailyLifeLossPct / 100) * targetTyreLifeKm;

    const crrIncreasePct = rollingResistanceIncrease(pressureLossPct) * rrTempMultiplier;
    const fuelIncreasePct = crrIncreasePct * 0.6;
    const extraFuelLitersTyre = baselineFuelLitersTruck * (fuelIncreasePct / 100) / tiresPerTruck;
    const fuelLossInr = extraFuelLitersTyre * fuelPrice;
    const tyreValueLossInr = (dailyLifeLossPct / 100) * tyrePrice;
    const totalLossInr = fuelLossInr + tyreValueLossInr;

    totalRrIncreasePct += crrIncreasePct;
    totalFuelIncreasePct += fuelIncreasePct;
    fuelIncreasePoints += 1;

    const metricDate = new Date(metricMs).toISOString().slice(0, 10);

    if (!dailyMap.has(metricDate)) {
      dailyMap.set(metricDate, {
        metric_date: metricDate,
        tyres_count: 0,
        total_psi_drop_per_day: 0,
        total_fuel_loss_inr: 0,
        total_tyre_value_loss_inr: 0,
        total_loss_inr: 0,
        total_confidence: 0
      });
    }

    const daily = dailyMap.get(metricDate);
    daily.tyres_count += 1;
    daily.total_psi_drop_per_day += psiDropPerDay;
    daily.total_fuel_loss_inr += fuelLossInr;
    daily.total_tyre_value_loss_inr += tyreValueLossInr;
    daily.total_loss_inr += totalLossInr;
    daily.total_confidence += confidence;

    detailedDailyRows.push({
      metric_date: metricDate,
      tyre_no: serial,
      truck: truck || '-',
      position: position || '-',
      pressure_psi: estimatedPsi,
      psi_drop_per_day: psiDropPerDay,
      fuel_loss_inr: fuelLossInr,
      tyre_value_loss_inr: tyreValueLossInr,
      total_loss_inr: totalLossInr,
      confidence_pct: confidence * 100,
      rolling_resistance_increase_pct: crrIncreasePct,
      fuel_increase_pct: fuelIncreasePct,
      cumulative_loss_inr: 0
    });

    if (!tyreLossMap.has(serial)) {
      tyreLossMap.set(serial, {
        tyre_no: serial,
        truck: truck || '-',
        position: position || '-',
        last_psi: Number.isFinite(lastObservedPsi) ? lastObservedPsi : null,
        estimated_daily_psi_drop: 0,
        days_since_check: 0,
        estimated_pressure: Number.isFinite(estimatedPsi) ? estimatedPsi : null,
        daily_loss_inr: 0,
        mtd_loss_inr: 0,
        total_loss_inr: 0,
        avg_confidence_pct: 0,
        _points: 0,
        _confidence_sum: 0,
        _latest_metric_ms: 0,
        _latest_daily_loss_inr: 0,
        _latest_rr_increase_pct: 0,
        _latest_fuel_increase_pct: 0,
        _last_checked_ms: Number.isFinite(lastCheckedMs) ? lastCheckedMs : 0
      });
    }

    const tyre = tyreLossMap.get(serial);
    tyre.truck = truck || tyre.truck;
    tyre.position = position || tyre.position;
    tyre.estimated_daily_psi_drop = Math.max(tyre.estimated_daily_psi_drop, psiDropPerDay);
    tyre.last_psi = Number.isFinite(lastObservedPsi) ? lastObservedPsi : tyre.last_psi;
    tyre.total_loss_inr += totalLossInr;
    tyre._points += 1;
    tyre._confidence_sum += confidence;

    if (metricDate.startsWith(currentMonthPrefix)) {
      tyre.mtd_loss_inr += totalLossInr;
    }

    if (metricMs >= tyre._latest_metric_ms) {
      tyre._latest_metric_ms = metricMs;
      tyre.estimated_pressure = Number.isFinite(estimatedPsi) ? estimatedPsi : tyre.estimated_pressure;
      tyre._latest_daily_loss_inr = totalLossInr;
      tyre._latest_rr_increase_pct = crrIncreasePct;
      tyre._latest_fuel_increase_pct = fuelIncreasePct;
    }

    if (Number.isFinite(lastCheckedMs) && lastCheckedMs > 0) {
      tyre._last_checked_ms = Math.max(tyre._last_checked_ms, lastCheckedMs);
    }
  };

  for (const [serial, rawEvents] of groupedByTyre.entries()) {
    const events = rawEvents
      .slice()
      .sort((a, b) => a.checked_at_ms - b.checked_at_ms);

    if (events.length === 0) continue;

    const statusMeta = tyreStatusMap.get(serial) || {};
    const observedDrops = [];

    for (let index = 0; index < events.length - 1; index += 1) {
      const previous = events[index];
      const current = events[index + 1];
      const startPsi = numberOrNull(previous.corrected_psi ?? previous.found_psi);
      const endPsi = numberOrNull(current.found_psi ?? current.corrected_psi);
      if (!Number.isFinite(startPsi) || !Number.isFinite(endPsi)) {
        continue;
      }

      const gapDaysExact = dateDiffDaysExact(previous.checked_at_ms, current.checked_at_ms);
      if (!Number.isFinite(gapDaysExact) || gapDaysExact < minIntervalDays) {
        continue;
      }
      // Use only observed checkpoints (no interpolated daily assumptions)
      const daysToProject = 1;
      const dailyDrop = Math.max(0, (startPsi - endPsi) / gapDaysExact);
      if (dailyDrop > 0) {
        observedDrops.push(dailyDrop);
      }

      const confidence = computePressureConfidence(gapDaysExact, false);
      const intervalImpactPsi = clamp(endPsi, 0, basePsi);

      for (let day = 1; day <= daysToProject; day += 1) {
        const metricMs = current.checked_at_ms;
        const estimatedPsi = clamp(endPsi, 0, basePsi);
        applyDailyImpact({
          serial,
          truck: current.vehicle_no || previous.vehicle_no || statusMeta.truck || '-',
          position: current.position_code || previous.position_code || statusMeta.position || '-',
          metricMs,
          psiDropPerDay: dailyDrop,
          estimatedPsi,
          impactPsi: intervalImpactPsi,
          confidence,
          lastObservedPsi: numberOrNull(current.found_psi ?? current.corrected_psi),
          lastCheckedMs: current.checked_at_ms
        });
      }
    }

    const lastEvent = events[events.length - 1];
    const lastBasePsi = numberOrNull(lastEvent.corrected_psi ?? lastEvent.found_psi);
    const status = String(statusMeta.status || '').toLowerCase();
    const isRunning = status === 'running' || status === '' || status === 'unknown';

    // Do not extrapolate to "now"; keep model anchored to observed checks only.
    if (false && isRunning && Number.isFinite(lastBasePsi)) {
      const gapToNowDays = dateDiffDaysExact(lastEvent.checked_at_ms, nowMs);
      const daysToProject = gapToNowDays >= minIntervalDays
        ? Math.min(Math.max(1, Math.floor(gapToNowDays)), maxInterpolationDays)
        : 0;

      if (daysToProject > 0) {
        const avgDrop = observedDrops.length > 0 ? avg(observedDrops) : 0;
        const tailDrop = Math.max(0, avgDrop);
        const confidence = computePressureConfidence(gapToNowDays, true);
        const tailImpactPsi = clamp(lastBasePsi - tailDrop, 0, basePsi);

        for (let day = 1; day <= daysToProject; day += 1) {
          const metricMs = Math.min(lastEvent.checked_at_ms + (day * dayMs), nowMs);
          const estimatedPsi = clamp(lastBasePsi - (tailDrop * day), 0, basePsi);
          applyDailyImpact({
            serial,
            truck: lastEvent.vehicle_no || statusMeta.truck || '-',
            position: lastEvent.position_code || statusMeta.position || '-',
            metricMs,
            psiDropPerDay: tailDrop,
            estimatedPsi,
            impactPsi: tailImpactPsi,
            confidence,
            lastObservedPsi: numberOrNull(lastEvent.found_psi ?? lastEvent.corrected_psi),
            lastCheckedMs: lastEvent.checked_at_ms
          });
        }
      }
    }
  }

  const dailyRows = Array.from(dailyMap.values())
    .sort((a, b) => a.metric_date.localeCompare(b.metric_date))
    .map((row) => ({
      metric_date: row.metric_date,
      tyres_count: row.tyres_count,
      avg_psi_drop_per_day: row.tyres_count > 0 ? row.total_psi_drop_per_day / row.tyres_count : 0,
      fuel_loss_inr: row.total_fuel_loss_inr,
      tyre_value_loss_inr: row.total_tyre_value_loss_inr,
      total_loss_inr: row.total_loss_inr,
      confidence_pct: row.tyres_count > 0 ? (row.total_confidence / row.tyres_count) * 100 : 0,
      cumulative_loss_inr: 0
    }));

  const dailyDetailRows = detailedDailyRows
    .slice()
    .sort((a, b) => {
      if (a.tyre_no !== b.tyre_no) {
        return a.tyre_no.localeCompare(b.tyre_no);
      }
      if (a.metric_date !== b.metric_date) {
        return a.metric_date.localeCompare(b.metric_date);
      }
      if (a.truck !== b.truck) {
        return String(a.truck || '').localeCompare(String(b.truck || ''));
      }
      return String(a.position || '').localeCompare(String(b.position || ''));
    });

  const cumulativeByTyre = new Map();
  let runningDetailLoss = 0;
  for (const row of dailyDetailRows) {
    const key = String(row.tyre_no || '-');
    const previous = Number(cumulativeByTyre.get(key) || 0);
    const next = previous + row.total_loss_inr;
    cumulativeByTyre.set(key, next);
    row.cumulative_loss_inr = next;

    runningDetailLoss += row.total_loss_inr;
    row.fleet_cumulative_loss_inr = runningDetailLoss;
  }

  let runningLoss = 0;
  for (const row of dailyRows) {
    runningLoss += row.total_loss_inr;
    row.cumulative_loss_inr = runningLoss;
  }

  const tyreRows = Array.from(tyreLossMap.values())
    .map((row) => {
      const daysSinceExact = dateDiffDaysExact(row._last_checked_ms, nowMs);
      const daysSince = daysSinceExact > 0 ? round2(daysSinceExact) : 0;
      const hoursSince = daysSinceExact > 0 ? Math.max(0, Math.round(daysSinceExact * 24)) : 0;
      return {
        tyre_no: row.tyre_no,
        truck: row.truck,
        position: row.position,
        last_psi: row.last_psi,
        estimated_daily_psi_drop: row.estimated_daily_psi_drop,
        rolling_resistance_increase_pct: row._latest_rr_increase_pct || 0,
        fuel_increase_pct: row._latest_fuel_increase_pct || 0,
        days_since_check: daysSince,
        hours_since_check: hoursSince,
        estimated_pressure: row.estimated_pressure,
        daily_loss_inr: row._latest_daily_loss_inr || 0,
        mtd_loss_inr: row.mtd_loss_inr,
        total_loss_inr: row.total_loss_inr,
        confidence_pct: row._points > 0 ? (row._confidence_sum / row._points) * 100 : 0
      };
    })
    .sort((a, b) => b.mtd_loss_inr - a.mtd_loss_inr);

  const pressureKnownTyres = new Set(tyreRows.map((row) => normalizeKey(row.tyre_no)));
  for (const record of tyreRecords || []) {
    const serial = normalizeKey(record?.tyre_no);
    if (!serial || pressureKnownTyres.has(serial)) {
      continue;
    }

    tyreRows.push({
      tyre_no: record.tyre_no || serial,
      truck: record.vehicle_no || '-',
      position: record.position || '-',
      last_psi: null,
      estimated_daily_psi_drop: 0,
      rolling_resistance_increase_pct: 0,
      fuel_increase_pct: 0,
      days_since_check: 0,
      hours_since_check: 0,
      estimated_pressure: null,
      daily_loss_inr: 0,
      mtd_loss_inr: 0,
      total_loss_inr: 0,
      confidence_pct: null
    });
    pressureKnownTyres.add(serial);
  }

  tyreRows.sort((a, b) => {
    const byLoss = Number(b.mtd_loss_inr || 0) - Number(a.mtd_loss_inr || 0);
    if (byLoss !== 0) return byLoss;
    return String(a.tyre_no || '').localeCompare(String(b.tyre_no || ''));
  });

  const mtdLoss = dailyRows
    .filter((row) => row.metric_date.startsWith(currentMonthPrefix))
    .reduce((sum, row) => sum + row.total_loss_inr, 0);

  const cumulativeLoss = dailyRows.reduce((sum, row) => sum + row.total_loss_inr, 0);
  const avgDailyLoss = dailyRows.length > 0 ? cumulativeLoss / dailyRows.length : 0;
  const avgPsiDrop = dailyRows.length > 0 ? avg(dailyRows.map((row) => row.avg_psi_drop_per_day)) : 0;
  const avgRrIncreasePct = fuelIncreasePoints > 0 ? totalRrIncreasePct / fuelIncreasePoints : 0;
  const avgFuelIncreasePct = fuelIncreasePoints > 0 ? totalFuelIncreasePct / fuelIncreasePoints : 0;
  const estimatedFuelEfficiency = fuelEfficiency / (1 + (avgFuelIncreasePct / 100));

  return {
    summary: {
      mtd_loss: round2(mtdLoss),
      cumulative_loss: round2(cumulativeLoss),
      avg_daily_loss: round2(avgDailyLoss),
      avg_psi_drop_per_day: round2(avgPsiDrop),
      avg_rr_increase_pct: round2(avgRrIncreasePct),
      avg_fuel_increase_pct: round2(avgFuelIncreasePct),
      estimated_km_per_l: round2(estimatedFuelEfficiency),
      active_tyres: tyreRows.length
    },
    daily: dailyDetailRows,
    tyres: tyreRows
  };
}

function normalizeTemperatureZone(value) {
  const allowed = [20, 35, 45, 55];
  const input = Number(value || 45);
  if (!Number.isFinite(input)) return 45;

  let nearest = allowed[0];
  for (const zone of allowed) {
    if (Math.abs(zone - input) < Math.abs(nearest - input)) {
      nearest = zone;
    }
  }
  return nearest;
}

function lifeLossPiecewise(percentLoss) {
  const value = Math.max(0, Number(percentLoss || 0));
  if (value <= 10) {
    return value * 1.0;
  }
  if (value <= 20) {
    return (10 * 1.0) + ((value - 10) * 1.5);
  }
  return (10 * 1.0) + (10 * 1.5) + ((value - 20) * 2.0);
}

function rollingResistanceIncrease(percentLoss) {
  const value = Math.max(0, Number(percentLoss || 0));
  return 0.25 * (value ** 1.3);
}

function computePressureConfidence(gapDays, isExtrapolated) {
  let confidence = 0.35;
  if (gapDays <= 2) {
    confidence = 0.95;
  } else if (gapDays <= 4) {
    confidence = 0.82;
  } else if (gapDays <= 7) {
    confidence = 0.62;
  }

  if (isExtrapolated) {
    confidence *= 0.8;
  }

  return clamp(confidence, 0.1, 0.99);
}

function dateDiffDaysExact(startMs, endMs) {
  const start = Number(startMs || 0);
  const end = Number(endMs || 0);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0;
  }

  return (end - start) / (24 * 60 * 60 * 1000);
}

function dateDiffDays(startMs, endMs) {
  return Math.floor(dateDiffDaysExact(startMs, endMs));
}

function countUniqueTrucks(tyreRecords) {
  const trucks = new Set(tyreRecords.map((row) => row.vehicle_no).filter((value) => value && value !== '-'));
  return trucks.size;
}

function avg(values) {
  const list = values.filter((value) => Number.isFinite(value));
  if (list.length === 0) return 0;
  return list.reduce((sum, value) => sum + value, 0) / list.length;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value) {
  if (!Number.isFinite(Number(value))) return '0';
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function getSupabaseClient() {
  if (!window.supabaseClient) {
    throw new Error('Supabase client is not initialized');
  }
  return window.supabaseClient;
}
