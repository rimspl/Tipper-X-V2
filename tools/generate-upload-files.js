/**
 * generate-upload-files.js
 *
 * Reads the GRN Excel and produces 4 upload-ready Excel files + a JSON
 * that the manager onboarding wizard (Page 3) expects:
 *
 *   upload-vehicles.xlsx   — vehicle_no column only
 *   upload-tyres.xlsx      — tyre_no, make, size, otd, status
 *   upload-activity.xlsx   — activity_date, tyre_no, vehicle_no, activity_type,
 *                            position, meter_reading, rtd1, rtd2, psi_found,
 *                            psi_corrected, life_achieved, removal_reason, remarks
 *   upload-fuel.xlsx       — truck_no, entry_date, total_trips, total_kms,
 *                            total_fuel_consumed, total_production (synthetic)
 *   upload-financial.json  — tyre_price, retread_cost, rate_per_km
 *
 * Hours → km conversion: × 10
 * Run:   node tools/generate-upload-files.js
 */
import XLSX from 'xlsx';
import { writeFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Brand mapping from Tyre Type codes ──────────────────────────────
const BRAND_MAP = {
  'XDR3-B':        'Michelin',
  'V-STEEL R-LUG S':'Bridgestone',
  'VREP':           'Bridgestone',
  'MS 403':         'MAXAM',
};

// ── Status mapping from Remarks column ──────────────────────────────
function normaliseStatus(raw) {
  const r = String(raw || '').trim().toUpperCase();
  if (r === 'RUNNING')          return 'Running';
  if (r === 'SCRAP')            return 'Scrapped';
  if (r === 'SPARE')            return 'Spare';
  if (r === 'FOR REPAIR')       return 'Spare';
  if (r.includes('ZAMBIA'))     return 'Scrapped';
  return 'Running';               // default for blank / unknown
}

// ── Helpers ─────────────────────────────────────────────────────────
const HRS_TO_KM = 10;

function toDateStr(serial) {
  if (!serial) return null;
  if (serial instanceof Date) return serial.toISOString().slice(0, 10);
  if (typeof serial === 'number') {
    // Excel serial date
    const epoch = new Date(1899, 11, 30);
    const d = new Date(epoch.getTime() + serial * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(serial).trim();
  // Already ISO-ish?
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function num(v) {
  const n = Number(String(v || '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

// ── Main ────────────────────────────────────────────────────────────
const OUT_DIR = resolve('.');
const files = readdirSync('.').filter(f => f.endsWith('.xlsx'));
const GRN_FILE = files.find(f => f.includes('BASE FILE'));
if (!GRN_FILE) { console.error('GRN Excel not found'); process.exit(1); }

console.log(`Reading: ${GRN_FILE}`);
const wb = XLSX.readFile(GRN_FILE);
const ws = wb.Sheets['MOTHER DATA_GRN'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
const headers = rows[0];
const data = rows.slice(1).filter(r => String(r[4] || '').trim() !== ''); // rows with Tyre No.

console.log(`Data rows with tyre serial: ${data.length}`);

// Column indices (from earlier inspection)
const COL = {
  tyreType:    2,
  tyreNo:      4,
  tyreSize:    5,
  make:        6,   // empty in source
  truckMake:   7,
  truckModel:  8,
  truckNo:     9,
  position:    10,
  firstFitDate:11,
  fitHrs:      15,
  removalDate: 16,
  remHrs:      19,
  lifeHrs:     20,
  rtdA:        24,
  rtdB:        26,
  avgRtd:      28,
  cost:        33,
  cphr:        34,
  remarks:     35,
  otd:         36,
};

// ─── 1. VEHICLES ───────────────────────────────────────────────────
const truckSet = new Map();
for (const r of data) {
  const truck = String(r[COL.truckNo] || '').trim();
  if (!truck) continue;
  const model = String(r[COL.truckModel] || '').trim();
  const odo = Math.max(num(r[COL.remHrs]), num(r[COL.fitHrs])) * HRS_TO_KM;
  if (!truckSet.has(truck)) {
    truckSet.set(truck, { vehicle_no: truck, model: model || 'HD-785-7', current_odometer: odo });
  } else {
    const existing = truckSet.get(truck);
    if (odo > existing.current_odometer) existing.current_odometer = odo;
  }
}
const vehicleRows = [...truckSet.values()].map(v => ({
  vehicle_no: v.vehicle_no,
}));
console.log(`Vehicles: ${vehicleRows.length}`);

// ─── 2. TYRES ──────────────────────────────────────────────────────
const tyreMap = new Map();
for (const r of data) {
  const serial = String(r[COL.tyreNo] || '').trim();
  if (!serial) continue;
  const tyreType = String(r[COL.tyreType] || '').trim();
  const brand = BRAND_MAP[tyreType] || tyreType || 'Unknown';
  const size = String(r[COL.tyreSize] || '').trim() || '27.00 R 49';
  const otd = num(r[COL.otd]) || 90;
  const status = normaliseStatus(r[COL.remarks]);
  if (!tyreMap.has(serial)) {
    tyreMap.set(serial, { tyre_no: serial, make: brand, size, otd, status });
  }
}
const tyreRows = [...tyreMap.values()];
console.log(`Tyres: ${tyreRows.length}`);

// ─── 3. ACTIVITY (FITMENT + REMOVAL + INSPECTION) ──────────────────
const activityRows = [];
const seenRemoval = new Set();

for (const r of data) {
  const serial = String(r[COL.tyreNo] || '').trim();
  const truck  = String(r[COL.truckNo] || '').trim();
  const pos    = String(r[COL.position] || '').trim();
  if (!serial || !truck) continue;

  const tyreType = String(r[COL.tyreType] || '').trim();
  const brand = BRAND_MAP[tyreType] || tyreType || 'Unknown';

  // FITMENT
  const fitDate = toDateStr(r[COL.firstFitDate]);
  const fitHrs  = num(r[COL.fitHrs]);
  const fitRtdA = num(r[COL.rtdA]);
  const fitRtdB = num(r[COL.rtdB]);

  if (fitDate) {
    activityRows.push({
      activity_date:   fitDate,
      tyre_no:         serial,
      vehicle_no:      truck,
      activity_type:   'FITMENT',
      position:        pos,
      meter_reading:   fitHrs * HRS_TO_KM,
      rtd1:            fitRtdA || null,
      rtd2:            fitRtdB || null,
      psi_found:       null,
      psi_corrected:   null,
      life_achieved:   null,
      removal_reason:  null,
      remarks:         `Initial fitment — ${brand}`,
    });
  }

  // REMOVAL (if tyre was removed)
  const remDate = toDateStr(r[COL.removalDate]);
  const remHrs  = num(r[COL.remHrs]);
  const remarks = String(r[COL.remarks] || '').trim();
  const isScrap = remarks.toUpperCase() === 'SCRAP' || remarks.includes('ZAMBIA');

  if (remDate && remHrs > 0) {
    const remKey = `${serial}|${remDate}`;
    if (!seenRemoval.has(remKey)) {
      seenRemoval.add(remKey);
      activityRows.push({
        activity_date:   remDate,
        tyre_no:         serial,
        vehicle_no:      truck,
        activity_type:   'REMOVAL',
        position:        pos,
        meter_reading:   remHrs * HRS_TO_KM,
        rtd1:            fitRtdA || null,
        rtd2:            fitRtdB || null,
        psi_found:       null,
        psi_corrected:   null,
        life_achieved:   num(r[COL.lifeHrs]) * HRS_TO_KM || null,
        removal_reason:  isScrap ? 'Scrap' : remarks || 'End of life',
        remarks:         remarks || null,
      });
    }
  }

  // INSPECTION (one per tyre, using the latest RTD data)
  if (fitDate) {
    const inspDate = remDate || fitDate;
    activityRows.push({
      activity_date:   inspDate,
      tyre_no:         serial,
      vehicle_no:      truck,
      activity_type:   'INSPECTION',
      position:        pos,
      meter_reading:   (remDate ? remHrs : fitHrs) * HRS_TO_KM,
      rtd1:            fitRtdA || null,
      rtd2:            fitRtdB || null,
      psi_found:       null,
      psi_corrected:   null,
      life_achieved:   null,
      removal_reason:  null,
      remarks:         `Periodic inspection — avg RTD ${num(r[COL.avgRtd]).toFixed(1)}mm`,
    });
  }
}

console.log(`Activity rows: ${activityRows.length} (FITMENT + REMOVAL + INSPECTION)`);

// ─── 4. FUEL (synthetic) ───────────────────────────────────────────
const fuelRows = [];
const allTrucks = [...truckSet.keys()].sort();
const months = [
  { label: 'Jan', year: 2026, days: 31 },
  { label: 'Feb', year: 2026, days: 28 },
  { label: 'Mar', year: 2026, days: 31 },
  { label: 'Apr', year: 2026, days: 30 },
  { label: 'May', year: 2026, days: 31 },
  { label: 'Jun', year: 2026, days: 30 },
];

for (const truck of allTrucks) {
  let seed = 0;
  for (let i = 0; i < truck.length; i++) seed += truck.charCodeAt(i);

  for (const m of months) {
    // 2-3 entries per truck per month (weekly-ish)
    const entriesPerMonth = 2 + (seed % 2);
    for (let e = 0; e < entriesPerMonth; e++) {
      const day = Math.min(1 + Math.floor((seed + e * 7) % m.days), m.days);
      const dateStr = `${m.year}-${String(m.months || 0).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const trips = 20 + (seed + e) % 30;
      const kms = 1800 + (seed + e * 100) % 1200;
      const fuelConsumed = Math.round(kms / (2.2 + ((seed + e) % 8) * 0.1));
      const production = trips * 28;

      fuelRows.push({
        truck_no:           truck,
        entry_date:         `${m.year}-${String(m.months + 1 || 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        total_trips:        trips,
        total_kms:          kms,
        total_fuel_consumed: fuelConsumed,
        total_production:   production,
      });
    }
  }
}

// Fix: use proper month numbering
const fuelRowsFixed = [];
const monthNums = [1, 2, 3, 4, 5, 6];
for (const truck of allTrucks) {
  let seed = 0;
  for (let i = 0; i < truck.length; i++) seed += truck.charCodeAt(i);

  for (let mi = 0; mi < months.length; mi++) {
    const m = months[mi];
    const monthNum = monthNums[mi];
    const entriesPerMonth = 2 + (seed % 2);
    for (let e = 0; e < entriesPerMonth; e++) {
      const day = 1 + ((seed + e * 7) % m.days);
      const dateStr = `${m.year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const trips = 20 + (seed + e) % 30;
      const kms = 1800 + (seed + e * 100) % 1200;
      const fuelConsumed = Math.round(kms / (2.2 + ((seed + e) % 8) * 0.1));
      const production = trips * 28;

      fuelRowsFixed.push({
        truck_no:            truck,
        entry_date:          dateStr,
        total_trips:         trips,
        total_kms:           kms,
        total_fuel_consumed: fuelConsumed,
        total_production:    production,
      });
    }
  }
}

console.log(`Fuel rows (synthetic): ${fuelRowsFixed.length}`);

// ─── 5. FINANCIAL PARAMETERS ────────────────────────────────────────
const costRows = data.filter(r => num(r[COL.cost]) > 0);
const avgCost = costRows.length > 0
  ? Math.round(costRows.reduce((s, r) => s + num(r[COL.cost]), 0) / costRows.length)
  : 45000;

const financial = {
  tyre_price:    avgCost,
  retread_cost:  Math.round(avgCost * 0.15),
  rate_per_km:   12.50,
};
console.log(`Financial: tyre_price=₹${financial.tyre_price}, retread=₹${financial.retread_cost}, rate/km=₹${financial.rate_per_km}`);

// ─── WRITE FILES ────────────────────────────────────────────────────
function writeSheet(rows, name, fileName) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wbNew = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbNew, ws, name);
  const outPath = resolve(OUT_DIR, fileName);
  XLSX.writeFile(wbNew, outPath);
  console.log(`  Written: ${fileName} (${rows.length} rows)`);
}

writeSheet(vehicleRows, 'Vehicles',      'upload-vehicles.xlsx');
writeSheet(tyreRows,    'Tyres',         'upload-tyres.xlsx');
writeSheet(activityRows,'Activity',      'upload-activity.xlsx');
writeSheet(fuelRowsFixed,'Fuel',         'upload-fuel.xlsx');

const finPath = resolve(OUT_DIR, 'upload-financial.json');
writeFileSync(finPath, JSON.stringify(financial, null, 2));
console.log(`  Written: upload-financial.json`);

console.log('\nDone! Files ready for onboarding upload.');
