/**
 * verify-dashboard.cjs
 * Quick verification of dashboard data state
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('=== Dashboard Data Verification ===\n');

  // 1. Sites
  const { data: sites } = await supabase.from('sites').select('id, site_name, target_tyre_life, fleet_size, annual_demand, tyre_price, retread_cost, rate_per_km, onboarding_completed');
  console.log('SITES:');
  for (const s of sites || []) {
    const issues = [];
    if (!s.target_tyre_life) issues.push('NO target_tyre_life');
    if (!s.fleet_size) issues.push('NO fleet_size');
    if (!s.tyre_price) issues.push('NO tyre_price');
    if (issues.length) console.log(`  ⚠ ${s.site_name} — ${issues.join(', ')}`);
    else console.log(`  ✓ ${s.site_name}: life=${s.target_tyre_life} fleet=${s.fleet_size} demand=${s.annual_demand} price=₹${s.tyre_price}`);
  }

  // 2. Tyres
  const { count: totalTyres } = await supabase.from('tyres').select('*', { count: 'exact', head: true });
  const { data: lifeRunSample } = await supabase.from('tyres').select('total_life_run').limit(200);
  const withLife = (lifeRunSample || []).filter(t => t.total_life_run > 0).length;
  const noLife = (lifeRunSample || []).filter(t => !t.total_life_run || t.total_life_run === 0).length;
  console.log(`\nTYRES: ${totalTyres || 0} total, sample: ${withLife} with life > 0, ${noLife} with life = 0`);

  // 3. Activity
  const { count: totalActivity } = await supabase.from('tyre_activity_log').select('*', { count: 'exact', head: true });
  console.log(`\nACTIVITY: ${totalActivity || 0} rows`);

  // 4. View
  const { data: viewRows, error: viewErr } = await supabase.from('v_manager_tyre_records').select('tyre_no, brand, life_achieved, removal_date, site_id').limit(5);
  if (viewErr) {
    console.log(`\nVIEW ERROR: ${viewErr.message}`);
  } else {
    console.log(`\nVIEW v_manager_tyre_records (sample):`);
    let withData = 0;
    for (const r of viewRows || []) {
      if (r.life_achieved > 0) withData++;
      console.log(`  ${r.tyre_no}: brand=${r.brand} life=${r.life_achieved} removal=${r.removal_date || 'none'} site=${r.site_id ? 'yes' : 'NO'}`);
    }
  }

  // 5. Check for tyres missing site_id
  const { count: noSiteId } = await supabase.from('tyres').select('*', { count: 'exact', head: true }).is('site_id', null);
  console.log(`\nTyres WITHOUT site_id: ${noSiteId || 0}`);

  // 6. Fuel
  const { count: fuelCount } = await supabase.from('fuel_trip_entries').select('*', { count: 'exact', head: true });
  console.log(`Fuel rows: ${fuelCount || 0}`);

  console.log('\n=== Summary ===');
  console.log('If all ✓ above, reload the dashboard to see charts.');
  console.log('If charts still blank after reload, the trigger SQL needs to be run (for future uploads only).');
}

run().catch(e => { console.error(e); process.exit(1); });
