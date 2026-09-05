/**
 * export-dashboard-xlsx.js
 *
 * Exports the REAL data for the manager's production site into a multi-sheet
 * Excel workbook. No synthetic data is created — every row comes from the DB
 * as-is, filtered to the single site.
 *
 * Run:  node tools/export-dashboard-xlsx.js
 * Output: exports/dashboard-real-export-<date>.xlsx
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

// The real data-rich site (348 tyres, 468 fuel, 4008 activity rows).
// NOTE: the manager login (dxuser1.rimspl@gmail.com) is currently mapped to a
// DIFFERENT empty site (4a68fb71). This export targets the site that actually
// holds the fleet data so the Excel reflects "current real data".
const SITE_ID = 'f8d09fa7-04e9-4429-b394-b969f1ea9a66';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Paginated fetch (Supabase caps single select at 1000 rows)
async function fetchAll(table, builder) {
  const all = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await builder.range(from, from + size - 1);
    if (error) throw new Error(`[${table}] ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < size) break;
  }
  return all;
}

function sanitize(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((row) => {
    const out = {};
    for (const [k, v] of Object.entries(row || {})) {
      if (v === null || v === undefined) out[k] = '';
      else if (typeof v === 'object') out[k] = JSON.stringify(v);
      else out[k] = v;
    }
    return out;
  });
}

async function main() {
  const out = {};

  // 1. Site settings (single row)
  const { data: site } = await supabase
    .from('sites')
    .select('*')
    .eq('id', SITE_ID)
    .maybeSingle();
  out['SiteSettings'] = site ? [site] : [];

  // 2. Tyres (by site) + orphaned tyres (null site_id) as a separate sheet
  const tyres = await fetchAll(
    'tyres',
    supabase.from('tyres').select('*').eq('site_id', SITE_ID)
  );
  out['Tyres'] = tyres;
  out['TyresNoSite'] = await fetchAll(
    'tyres_null_site',
    supabase.from('tyres').select('*').is('site_id', null)
  );
  const tyreIds = tyres.map((t) => t.id).filter(Boolean);

  // 3. Vehicles (by site)
  const vehicles = await fetchAll(
    'vehicles',
    supabase.from('vehicles').select('*').eq('site_id', SITE_ID)
  );
  out['Vehicles'] = vehicles;
  const vehIds = vehicles.map((v) => v.id).filter(Boolean);

  // 4. Fuel trips (by site)
  out['FuelTrips'] = await fetchAll(
    'fuel_trip_entries',
    supabase.from('fuel_trip_entries').select('*').eq('site_id', SITE_ID)
  );

  // 5. Fitter source tables (by site)
  out['FitterInspections'] = await fetchAll(
    'fitter_tyre_inspection_entries',
    supabase.from('fitter_tyre_inspection_entries').select('*').eq('site_id', SITE_ID)
  );
  out['FitterPressure'] = await fetchAll(
    'fitter_pressure_check_entries',
    supabase.from('fitter_pressure_check_entries').select('*').eq('site_id', SITE_ID)
  );
  out['FitterFitments'] = await fetchAll(
    'fitter_tyre_card_entries',
    supabase.from('fitter_tyre_card_entries').select('*').eq('site_id', SITE_ID)
  );
  out['FitterRemovals'] = await fetchAll(
    'fitter_tyre_removal_entries',
    supabase.from('fitter_tyre_removal_entries').select('*').eq('site_id', SITE_ID)
  );

  // 6. Activity log (no site_id column -> resolve via tyre/vehicle ids).
  // Chunk the IN() lists (large id arrays can fail the request).
  const chunk = (arr, n) => {
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  };
  let activity = [];
  for (const ids of chunk(tyreIds, 100)) {
    activity.push(
      ...(await fetchAll(
        'tyre_activity_log_tyres',
        supabase.from('tyre_activity_log').select('*').in('tyre_id', ids)
      ))
    );
  }
  for (const ids of chunk(vehIds, 100)) {
    activity.push(
      ...(await fetchAll(
        'tyre_activity_log_vehicles',
        supabase.from('tyre_activity_log').select('*').in('vehicle_id', ids)
      ))
    );
  }
  const seen = new Set();
  activity = activity.filter((r) => {
    if (r.id == null) return true;
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
  out['ActivityLog'] = activity;

  // Write workbook
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(out)) {
    const clean = sanitize(rows);
    const ws =
      clean && clean.length
        ? XLSX.utils.json_to_sheet(clean)
        : XLSX.utils.aoa_to_sheet([['(no rows for this site)']]);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }

  const dir = path.join(process.cwd(), 'exports');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `dashboard-real-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
  XLSX.writeFile(wb, file);

  console.log('Wrote:', file);
  console.log('Row counts:');
  for (const [k, v] of Object.entries(out)) {
    console.log(`  ${k}: ${Array.isArray(v) ? v.length : 0}`);
  }
}

main().catch((e) => {
  console.error('Export failed:', e.message || e);
  process.exit(1);
});
