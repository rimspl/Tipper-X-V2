/**
 * upload-service.js
 * Excel upload, parsing, column mapping, and template download for DynaHaul X Onboarding
 */

const COLUMN_MAPPINGS = {
  vehicles: {
    label: 'Vehicle Fleet',
    required: ['vehicle_no'],
    optional: ['model', 'status', 'current_odometer'],
    aliases: {
      vehicle_no: ['vehicle no', 'truck no', 'truck number', 'vehicle number', 'vehicle_number', 'truck_no', 'truck_number', 'registration', 'registration no'],
      model: ['model', 'tipper model', 'truck model', 'make', 'manufacturer'],
      status: ['status', 'vehicle status', 'state'],
      current_odometer: ['odometer', 'odo', 'meter reading', 'km', 'kilometers', 'current odometer']
    }
  },
  tyres: {
    label: 'Tyre Inventory',
    required: ['tyre_no'],
    optional: ['make', 'size', 'otd', 'status'],
    aliases: {
      tyre_no: ['tyre no', 'tyre number', 'tyre_no', 'serial', 'serial no', 'serial number', 'tyre_serial', 'tyre serial'],
      make: ['make', 'brand', 'manufacturer', 'tyre brand', 'tyre make'],
      size: ['size', 'tyre size', 'dimensions', 'spec'],
      otd: ['otd', 'original tread depth', 'original rtd', 'tread depth', 'original_tread_depth'],
      status: ['status', 'tyre status', 'condition']
    }
  },
  activity: {
    label: 'Activity History',
    required: ['activity_date', 'tyre_no', 'vehicle_no', 'activity_type'],
    optional: ['position', 'meter_reading', 'rtd1', 'rtd2', 'psi_found', 'psi_corrected', 'life_achieved', 'removal_reason', 'remarks'],
    aliases: {
      activity_date: ['date', 'activity date', 'entry date', 'inspection date', 'event date'],
      tyre_no: ['tyre no', 'tyre number', 'tyre_no', 'serial', 'serial no', 'tyre serial'],
      vehicle_no: ['vehicle no', 'truck no', 'vehicle number', 'truck number', 'vehicle_no', 'truck_no'],
      activity_type: ['type', 'activity type', 'event type', 'action', 'inspection type'],
      position: ['position', 'tyre position', 'position code', 'location', 'wheel position'],
      meter_reading: ['odometer', 'meter reading', 'odo', 'km', 'kilometers', 'reading'],
      rtd1: ['rtd1', 'rtd 1', 'tread depth 1', 'rt d1', 'tread depth right'],
      rtd2: ['rtd2', 'rtd 2', 'tread depth 2', 'rt d2', 'tread depth left'],
      psi_found: ['psi', 'psi found', 'pressure', 'pressure found', 'psi_found'],
      psi_corrected: ['psi corrected', 'corrected psi', 'psi_corrected', 'adjusted psi'],
      life_achieved: ['life achieved', 'km run', 'distance run', 'life_achieved_in_this_run'],
      removal_reason: ['removal reason', 'reason', 'disposition', 'removal_reason'],
      remarks: ['remarks', 'notes', 'comments', 'observation']
    }
  },
  fuel: {
    label: 'Fuel & Trip Data',
    required: ['truck_no', 'entry_date', 'total_trips', 'total_kms', 'total_fuel_consumed'],
    optional: ['total_production'],
    aliases: {
      truck_no: ['truck no', 'truck number', 'vehicle no', 'vehicle number', 'truck_no'],
      entry_date: ['date', 'entry date', 'month', 'period'],
      total_trips: ['trips', 'total trips', 'trip count', 'total_trips'],
      total_kms: ['kms', 'km', 'total kms', 'total km', 'distance', 'total_kms', 'total_km'],
      total_fuel_consumed: ['fuel', 'diesel', 'fuel consumed', 'total fuel', 'consumption', 'total_fuel_consumed'],
      total_production: ['production', 'total production', 'output', 'total_production']
    }
  }
};

const REPORT_UNLOCK_MAP = {
  vehicles: [
    'fleetHealth', 'tyreLifeCharts', 'rubberCharts', 'brandCharts',
    'pressureCharts', 'ageDist', 'defectTrend', 'removalReasons', 'tyreLifeForecast'
  ],
  tyres: [
    'tyreLife', 'rubberUtil', 'brandWise', 'brandCostPerKm',
    'tyrePnL', 'rtdScrapping', 'retreadEligible'
  ],
  activity: [
    'fleetHealth', 'tyreLife', 'rubberUtil', 'brandWise',
    'pressureLeakage', 'defectTrend', 'removalReasons'
  ],
  fuel: [
    'pressureFuelCost', 'pressureHeatmap', 'pressureCharts'
  ],
  financial: [
    'brandCostPerKm', 'tyrePnL', 'rtdScrapping', 'retreadEligible', 'savings'
  ]
};

function getSupabaseClient() {
  if (typeof window !== 'undefined' && window.supabaseClient) {
    return window.supabaseClient;
  }
  return null;
}

function normalizeColumnName(raw) {
  return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchColumn(header, aliases) {
  const normalized = normalizeColumnName(header);
  for (const [canonical, aliasList] of Object.entries(aliases)) {
    if (normalized === normalizeColumnName(canonical)) return canonical;
    for (const alias of aliasList) {
      if (normalized === normalizeColumnName(alias)) return canonical;
    }
  }
  return null;
}

export function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });

        if (jsonData.length < 2) {
          reject(new Error('Excel file is empty or has no data rows'));
          return;
        }

        const headers = jsonData[0].map(h => String(h || '').trim());
        const rows = jsonData.slice(1).filter(row => row.some(cell => cell !== '' && cell !== null && cell !== undefined));

        resolve({
          headers,
          rows,
          totalRows: rows.length,
          sheetName: workbook.SheetNames[0]
        });
      } catch (err) {
        reject(new Error(`Failed to parse Excel: ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

export function autoMapColumns(headers, dataType) {
  const mapping = COLUMN_MAPPINGS[dataType];
  if (!mapping) return { mapped: {}, unmapped: [], missing: [] };

  const mapped = {};
  const unmapped = [];
  const usedTargets = new Set();

  for (const header of headers) {
    const target = matchColumn(header, mapping.aliases);
    if (target && !usedTargets.has(target)) {
      mapped[header] = target;
      usedTargets.add(target);
    } else {
      unmapped.push(header);
    }
  }

  const missing = mapping.required.filter(r => !usedTargets.has(r));

  return { mapped, unmapped, missing };
}

export function transformRows(rawRows, columnMap, dataType) {
  const mapping = COLUMN_MAPPINGS[dataType];
  if (!mapping) return [];

  return rawRows.map(row => {
    const obj = {};
    const headers = Object.keys(columnMap);

    headers.forEach((header, idx) => {
      const targetField = columnMap[header];
      let value = row[idx];

      if (value instanceof Date) {
        value = value.toISOString().split('T')[0];
      } else if (value !== null && value !== undefined) {
        value = String(value).trim();
      }

      obj[targetField] = value || null;
    });

    return obj;
  });
}

export async function uploadVehicleData(rows, siteId) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase client not available');

  const normalized = rows.map(r => ({
    vehicle_no: String(r.vehicle_no || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, ''),
    site_id: siteId
  }));

  const { data, error } = await supabase
    .from('vehicles')
    .upsert(normalized, { onConflict: 'vehicle_no', ignoreDuplicates: false })
    .select();

  if (error) throw new Error(`Vehicle upload failed: ${error.message}`);
  return { count: data?.length || normalized.length, table: 'vehicles' };
}

export async function uploadTyreData(rows, siteId) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase client not available');

  const normalized = rows.map(r => ({
    site_id: siteId,
    tyre_no: String(r.tyre_no || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, ''),
    make: r.make || null,
    size: r.size || null,
    otd: Number(r.otd || 0),
    status: r.status || 'New'
  }));

  const { data, error } = await supabase
    .from('tyres')
    .upsert(normalized, { onConflict: 'tyre_no', ignoreDuplicates: false })
    .select();

  if (error) throw new Error(`Tyre upload failed: ${error.message}`);
  return { count: data?.length || normalized.length, table: 'tyres' };
}

export async function uploadActivityData(rows, siteId) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase client not available');

  const vehicles = await supabase.from('vehicles').select('id, vehicle_no').eq('site_id', siteId);
  const tyres = await supabase.from('tyres').select('id, tyre_no');

  const vehicleMap = {};
  (vehicles.data || []).forEach(v => { vehicleMap[v.vehicle_no?.toUpperCase()] = v.id; });
  const tyreMap = {};
  (tyres.data || []).forEach(t => { tyreMap[t.tyre_no?.toUpperCase()] = t.id; });

  const normalized = rows.map(r => {
    const vehicleNo = String(r.vehicle_no || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    const tyreNo = String(r.tyre_no || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

    return {
      activity_date: r.activity_date || new Date().toISOString().split('T')[0],
      tyre_id: tyreMap[tyreNo] || null,
      vehicle_id: vehicleMap[vehicleNo] || null,
      activity_type: (r.activity_type || 'INSPECTION').toUpperCase(),
      position: r.position || null,
      meter_reading: Number(r.meter_reading || 0),
      rtd1: Number(r.rtd1 || 0),
      rtd2: Number(r.rtd2 || 0),
      psi_found: Number(r.psi_found || 0),
      psi_corrected: Number(r.psi_corrected || 0),
      life_achieved_in_this_run: Number(r.life_achieved || 0),
      removal_reason: r.removal_reason || null,
      remarks: r.remarks || null
    };
  });

    const BATCH_SIZE = 500;
  let inserted = 0;
  for (let i = 0; i < normalized.length; i += BATCH_SIZE) {
    const batch = normalized.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('tyre_activity_log')
      .insert(batch);
    if (error) throw new Error(`Activity upload batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${error.message}`);
    inserted += batch.length;
  }

  return { count: inserted, table: 'tyre_activity_log' };
}

export async function uploadFuelData(rows, siteId) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase client not available');

  const normalized = rows.map(r => ({
    site_id: siteId,
    truck_no: String(r.truck_no || '').trim().toUpperCase(),
    entry_date: r.entry_date || new Date().toISOString().split('T')[0],
    total_trips: Number(r.total_trips || 0),
    total_kms: Number(r.total_kms || 0),
    total_fuel_consumed: Number(r.total_fuel_consumed || 0),
    total_production: Number(r.total_production || 0)
  }));

  const { data, error } = await supabase
    .from('fuel_trip_entries')
    .upsert(normalized, { onConflict: 'site_id,truck_no,entry_date', ignoreDuplicates: false })
    .select();

  if (error) throw new Error(`Fuel upload failed: ${error.message}`);
  return { count: data?.length || normalized.length, table: 'fuel_trip_entries' };
}

export async function saveFinancialParameters(params, siteId) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase client not available');

  const updates = {};
  if (params.tyre_price != null) updates.tyre_price = Number(params.tyre_price);
  if (params.retread_cost != null) updates.retread_cost = Number(params.retread_cost);
  if (params.rate_per_km != null) updates.rate_per_km = Number(params.rate_per_km);

  if (Object.keys(updates).length === 0) return { count: 0, table: 'sites' };

  const { data, error } = await supabase
    .from('sites')
    .update(updates)
    .eq('id', siteId)
    .select();

  if (error) throw new Error(`Financial parameters save failed: ${error.message}`);
  return { count: 1, table: 'sites' };
}

export function countUnlockedReports(uploadStatus) {
  const allReports = new Set();
  for (const [key, reports] of Object.entries(REPORT_UNLOCK_MAP)) {
    if (uploadStatus[key]) {
      reports.forEach(r => allReports.add(r));
    }
  }
  return allReports.size;
}

export function getUnlockedReportIds(uploadStatus) {
  const reports = new Set();
  for (const [key, reportIds] of Object.entries(REPORT_UNLOCK_MAP)) {
    if (uploadStatus[key]) {
      reportIds.forEach(r => reports.add(r));
    }
  }
  return reports;
}

export function downloadTemplate(dataType) {
  const mapping = COLUMN_MAPPINGS[dataType];
  if (!mapping) return;

  const headers = [...mapping.required, ...mapping.optional];
  const sampleRow = headers.map(h => {
    switch (h) {
      case 'vehicle_no': return 'MH-1234';
      case 'tyre_no': return 'MRF12345';
      case 'make': return 'MRF';
      case 'size': return '295/95R20';
      case 'otd': return '15';
      case 'model': return 'Komatsu HD785';
      case 'status': return 'Active';
      case 'activity_date': return '2026-01-15';
      case 'activity_type': return 'INSPECTION';
      case 'position': return 'FL';
      case 'meter_reading': return '15000';
      case 'rtd1': return '12.5';
      case 'rtd2': return '12.0';
      case 'psi_found': return '118';
      case 'psi_corrected': return '120';
      case 'life_achieved': return '25000';
      case 'removal_reason': return 'Scrap';
      case 'remarks': return 'Normal wear';
      case 'truck_no': return 'MH-1234';
      case 'entry_date': return '2026-01-15';
      case 'total_trips': return '45';
      case 'total_kms': return '8500';
      case 'total_fuel_consumed': return '3200';
      case 'total_production': return '12000';
      case 'current_odometer': return '15000';
      default: return '';
    }
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, mapping.label);
  XLSX.writeFile(wb, `dynahaul-${dataType}-template.xlsx`);
}

export { COLUMN_MAPPINGS, REPORT_UNLOCK_MAP };
