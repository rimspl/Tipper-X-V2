require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function seed() {
  // 1. Create license
  const { error: licErr } = await s.from('licenses').upsert(
    { license_key: 'DYNHAUL-DEFAULT', is_active: true, is_setup_complete: true },
    { onConflict: 'license_key', ignoreDuplicates: true }
  );
  console.log('license:', licErr ? 'ERR: ' + licErr.message : 'OK');

  // 2. Create customer
  const { data: existing } = await s.from('customers').select('id').eq('name', 'Demo Mining Co').limit(1);
  let customerId;
  if (existing && existing.length > 0) {
    customerId = existing[0].id;
    console.log('customer: already exists, id=' + customerId);
  } else {
    const { data: cust, error: custErr } = await s.from('customers').insert({ name: 'Demo Mining Co' }).select('id').single();
    if (custErr) { console.log('customer ERR:', custErr.message); return; }
    customerId = cust.id;
    console.log('customer: created, id=' + customerId);
  }

  // 3. Create site
  const { data: existingSite } = await s.from('sites').select('id').eq('invite_code', 'DEMO0001').limit(1);
  if (existingSite && existingSite.length > 0) {
    console.log('site: already exists, id=' + existingSite[0].id);
  } else {
    const { data: site, error: siteErr } = await s.from('sites').insert({
      site_name: 'Bharat West Mine',
      customer_id: customerId,
      invite_code: 'DEMO0001',
      fleet_size: 25,
      annual_demand: 120,
      tyre_price: 45000,
      target_tyre_life: 120000,
      target_life_unit: 'KM',
      pressure_base_psi: 120,
      pressure_fuel_price: 90,
      pressure_daily_km: 250,
      pressure_fuel_efficiency_kmpl: 2.8,
      pressure_target_tyre_life_km: 120000,
      pressure_model_enabled: true,
      retread_cost: 12000,
      rate_per_km: 0.75,
      enabled_reports: JSON.stringify(["tyreRecords","inspectionRecords","savings","fleetHealth","tyreLife","rubberUtil","brandWise","pressureLeakage","ageDist","defectTrend","removalReasons","pressureFuelCost","pressureHeatmap","rtdScrapping","retreadEligible","brandCostPerKm","tyrePnL"])
    }).select('id').single();
    if (siteErr) { console.log('site ERR:', siteErr.message); return; }
    console.log('site: created, id=' + site.id);
  }

  // 4. Verify
  const { count: c1 } = await s.from('customers').select('*', { count: 'exact', head: true });
  const { count: c2 } = await s.from('sites').select('*', { count: 'exact', head: true });
  console.log('Verification - customers:', c1, 'sites:', c2);
}

seed().catch(e => console.error('FATAL:', e.message));
