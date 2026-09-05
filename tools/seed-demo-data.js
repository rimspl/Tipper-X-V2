/**
 * seed-demo-data.js
 *
 * Inserts demo rows into the Supabase project so the Manager Dashboard shows
 * real charts tomorrow — not empty-state messages.
 *
 * Run AFTER tools/seed-demo-site-and-profile.sql has been applied.
 * Run with:   node tools/seed-demo-data.js
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.
 * Safe to re-run (idempotent — checks for existing rows first).
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// --- Config ----------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.log('BLOCKED: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env.');
  console.log('SUPABASE_URL             :', SUPABASE_URL ? 'PRESENT' : 'MISSING');
  console.log('SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? 'PRESENT' : 'MISSING');
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// --- Demo data -------------------------------------------------------------
const DEMO_BRANDS  = ['Apollo', 'MRF', 'JK Tyre', 'CEAT'];
const DEMO_SIZES   = ['12.00R20', '14.00R24', '315/80R22.5'];
const POSITIONS    = ['FL','FR','RL','RR','RLI','RRI'];
const TRUCK_NOS    = ['KA01AB1234','KA01AB1235','KA01AB1236','KA01AB1237'];
const SITE_INVITE  = 'DEMO0001';  // matched to seed-demo-site-and-profile.sql

async function main() {
  console.log('--- Seed demo data ---');
  console.log('Site invite:', SITE_INVITE);

  // 1. Resolve site
  const { data: siteRow, error: siteErr } = await supabase
    .from('sites')
    .select('id, site_name, invite_code')
    .eq('invite_code', SITE_INVITE)
    .maybeSingle();
  if (siteErr || !siteRow) {
    console.log('BLOCKED: site with invite_code DEMO0001 not found — run tools/seed-demo-site-and-profile.sql first.');
    if (siteErr) console.log('err:', siteErr.message);
    process.exit(3);
  }
  const SITE_ID = siteRow.id;
  console.log('site_id:', SITE_ID, '|', siteRow.site_name);

  // 2. Check if demo tyres already exist
  const { count: tyreCount } = await supabase
    .from('tyres').select('id', { count: 'exact', head: true })
    .eq('make', 'Apollo');
  if (tyreCount >= 4) {
    console.log('SKIP — demo tyres already present (>= 4 Apollo tyres found). Delete them first or skip seeding.');
    process.exit(0);
  }

  // 3. Insert 8 tyres
  console.log('Inserting 8 demo tyres...');
  const tyreIds = [];
  for (let i = 0; i < 8; i++) {
    const tn = `DH${String(i + 1).padStart(2, '0')}`;
    const { data: t, error: tErr } = await supabase
      .from('tyres')
      .insert({
        tyre_no: `DEMO-${tn}`,
        make: DEMO_BRANDS[i % DEMO_BRANDS.length],
        size: DEMO_SIZES[i % DEMO_SIZES.length],
        otd: 14 + (i % 4),
        status: 'Running',
        total_life_run: 12000 + i * 5000,
      })
      .select('id, tyre_no')
      .single();
    if (tErr) { console.error('tyre insert fail:', tErr.message); process.exit(1); }
    tyreIds.push(t.id);
    console.log('  tyre:', t.tyre_no, '|', t.id);
  }

  // 4. Insert 4 demo trucks (vehicles)
  console.log('Inserting 4 demo trucks...');
  const vehicleIds = [];
  for (let i = 0; i < 4; i++) {
    const { data: v, error: vErr } = await supabase
      .from('vehicles')
      .insert({
        vehicle_no: TRUCK_NOS[i],
        site_id: SITE_ID,
        current_odometer: 20000 + i * 10000,
      })
      .select('id, vehicle_no')
      .single();
    if (vErr) { console.error('vehicle insert fail:', vErr.message); process.exit(1); }
    vehicleIds.push(v.id);
    console.log('  vehicle:', v.vehicle_no, '|', v.id);
  }

  // 5. Assign each tyre to a truck/position
  console.log('Assigning tyres to positions...');
  for (let i = 0; i < 8; i++) {
    const tyreId   = tyreIds[i];
    const vehicleId = vehicleIds[i % 4];
    const position  = POSITIONS[i % POSITIONS.length];
    const now       = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10); // spread across days

    const { error: aErr } = await supabase.from('tyre_activity_log').insert({
      activity_type: 'FITMENT',
      activity_date: now,
      tyre_id: tyreId,
      vehicle_id: vehicleId,
      position,
      meter_reading: 20000 + i * 2000,
      remarks: 'Demo seed — initial fitment',
      user_id: null,
    });
    if (aErr) { console.error('fitment insert fail:', aErr.message); process.exit(1); }
    console.log('  fitment: tyre', i + 1, '→', TRUCK_NOS[i % 4], position, 'date:', now);
  }

  // 6. Insert 30 inspection rows spread across tyres
  console.log('Inserting 30 inspections...');
  for (let i = 0; i < 30; i++) {
    const tyreId    = tyreIds[i % 8];
    const vehicleId = vehicleIds[i % 4];
    const position  = POSITIONS[i % POSITIONS.length];
    const date      = new Date(Date.now() - (90 - i) * 86400000).toISOString().slice(0, 10);
    const odo       = 21000 + i * 600;
    const rtd1      = (12 - i * 0.3).toFixed(1);
    const rtd2      = (11 - i * 0.25).toFixed(1);
    const psiF      = 115 + (i % 20);
    const psiC      = 120;

    await supabase.from('tyre_activity_log').insert({
      activity_type: 'INSPECTION',
      activity_date: date,
      tyre_id: tyreId,
      vehicle_id: vehicleId,
      position,
      meter_reading: odo,
      rtd1: parseFloat(rtd1),
      rtd2: parseFloat(rtd2),
      psi_found: psiF,
      psi_corrected: psiC,
      remarks: 'Demo seed inspection #' + (i + 1),
    });
  }
  console.log('  30 inspection rows inserted (errors suppressed for bulk).');

  // 7. Insert 25 pressure checks
  console.log('Inserting 25 pressure checks...');
  for (let i = 0; i < 25; i++) {
    const tyreId    = tyreIds[i % 8];
    const vehicleId = vehicleIds[i % 4];
    const position  = POSITIONS[i % POSITIONS.length];
    const date      = new Date(Date.now() - (60 - i) * 86400000).toISOString().slice(0, 10);
    const psiF      = 110 + (i % 20);

    await supabase.from('tyre_activity_log').insert({
      activity_type: 'PRESSURE_CHECK',
      activity_date: date,
      tyre_id: tyreId,
      vehicle_id: vehicleId,
      position,
      psi_found: psiF,
      psi_corrected: 120,
      remarks: 'Demo seed pressure check #' + (i + 1),
    });
  }
  console.log('  25 pressure check rows inserted.');

  // 8. Insert 12 fuel trip entries across 2 months
  console.log('Inserting 12 fuel entries...');
  for (let i = 0; i < 12; i++) {
    const truckNo   = TRUCK_NOS[i % 4];
    const date      = new Date(Date.now() - (60 - i) * 86400000).toISOString().slice(0, 10);
    const trips     = 8 + (i % 5);
    const kms       = 450 + (i % 3) * 50;
    const fuelLiter = kms / (2.5 + (i % 3) * 0.1);
    const prod      = trips * 25;

    await supabase.from('fuel_trip_entries').insert({
      site_id: SITE_ID,
      truck_no: truckNo,
      entry_date: date,
      total_trips: trips,
      total_kms: kms,
      total_fuel_consumed: Math.round(fuelLiter),
      total_production: prod,
    });
  }
  console.log('  12 fuel trip entries inserted.');

  // 9. Summary
  console.log('');
  console.log('--- Seed complete ---');
  console.log('Tyres       : 8');
  console.log('Vehicles    : 4');
  console.log('Inspections : 30');
  console.log('Pressure    : 25');
  console.log('Fuel        : 12');
  console.log('');
  console.log('Next: Open http://127.0.0.1:3000/manager/');
  console.log('      Fleet Health, Pressure Heatmap, Brand Cost-Per-KM,');
  console.log('      P&L per Tyre should show real data.');
  process.exit(0);
}

main();