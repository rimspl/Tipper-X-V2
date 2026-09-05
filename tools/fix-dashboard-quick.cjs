/**
 * fix-dashboard-quick.cjs
 * 
 * Quick targeted fix using direct SQL queries via RPC
 * Focuses on the 3 critical fixes
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log('=== Quick Dashboard Fix ===\n');

  // ── Fix 1: Update site KPI values ────────────────────────
  console.log('Fix 1: Updating site KPI values...');

  // Site with tyre_price=45000, retread_cost=8000, rate_per_km=12 — that's our demo site
  const demoSites = ['a3b359ca-1317-44b4-a128-e1c5f0a9b557', 'dba713f3-807d-46d9-aafd-17434485c047', '7cb16dc2-bbf1-416e-b89a-d3787e6b250c'];

  for (const siteId of demoSites) {
    const { error } = await supabase
      .from('sites')
      .update({
        target_tyre_life: 100000,
        fleet_size: 31,
        annual_demand: 350
      })
      .eq('id', siteId);

    if (error) console.error(`  Failed for ${siteId}:`, error.message);
    else console.log(`  Updated site ${siteId}`);
  }

  // ── Fix 2: Bulk update tyres.total_life_run from activity ─
  console.log('\nFix 2: Syncing tyre life totals from activity log...');

  // Get all tyres for the demo sites
  const { data: tyres } = await supabase
    .from('tyres')
    .select('id, tyre_no')
    .in('site_id', demoSites);

  console.log(`  Found ${tyres?.length || 0} tyres to process`);

  // Process in batches of 20
  let updated = 0;
  const BATCH = 20;

  for (let i = 0; i < (tyres || []).length; i += BATCH) {
    const batch = tyres.slice(i, i + BATCH);

    for (const tyre of batch) {
      // Get max life_achieved from activity log for this tyre
      const { data: acts } = await supabase
        .from('tyre_activity_log')
        .select('life_achieved_in_this_run, activity_type, vehicle_id, position, position_code_norm, disposition')
        .eq('tyre_id', tyre.id)
        .order('activity_date', { ascending: false });

      if (!acts || acts.length === 0) continue;

      const totalLife = acts.reduce((sum, r) => sum + Number(r.life_achieved_in_this_run || 0), 0);
      const latest = acts[0];

      const updateData = { total_life_run: totalLife };

      // Also sync current_vehicle_id and status from latest activity
      if (latest.activity_type === 'REMOVAL') {
        updateData.current_vehicle_id = null;
        updateData.current_position = null;
        updateData.status = latest.disposition || 'Spare';
      } else {
        updateData.current_vehicle_id = latest.vehicle_id;
        updateData.current_position = latest.position_code_norm || latest.position || null;
        updateData.status = 'Running';
      }

      const { error } = await supabase
        .from('tyres')
        .update(updateData)
        .eq('id', tyre.id);

      if (error) {
        console.error(`  Failed to update ${tyre.tyre_no}:`, error.message);
      } else {
        updated++;
      }
    }

    console.log(`  Processed ${Math.min(i + BATCH, tyres.length)}/${tyres.length} tyres`);
  }

  console.log(`  Updated ${updated} tyres`);

  // ── Fix 3: Verify ────────────────────────────────────────
  console.log('\n=== Verification ===');

  const { data: sampleTyres } = await supabase
    .from('tyres')
    .select('tyre_no, total_life_run, status')
    .in('site_id', demoSites)
    .limit(10);

  console.log('\nTyre sample after fix:');
  for (const t of sampleTyres || []) {
    console.log(`  ${t.tyre_no}: life=${t.total_life_run}, status=${t.status}`);
  }

  const { data: siteCheck } = await supabase
    .from('sites')
    .select('site_name, target_tyre_life, fleet_size, annual_demand')
    .in('id', demoSites);

  console.log('\nSite KPIs:');
  for (const s of siteCheck || []) {
    console.log(`  ${s.site_name}: target=${s.target_tyre_life}, fleet=${s.fleet_size}, demand=${s.annual_demand}`);
  }

  // Check view
  const { data: viewSample, error: viewErr } = await supabase
    .from('v_manager_tyre_records')
    .select('tyre_no, brand, life_achieved, removal_date')
    .limit(5);

  if (viewErr) {
    console.error('\nView error:', viewErr.message);
  } else {
    console.log('\nv_manager_tyre_records after fix:');
    for (const v of viewSample || []) {
      console.log(`  ${v.tyre_no}: brand=${v.brand}, life=${v.life_achieved}, removal=${v.removal_date}`);
    }
  }

  console.log('\n=== Fix Complete ===');
  console.log('Reload the dashboard. If still blank, clear IndexedDB:');
  console.log('  DevTools → Application → Storage → Clear site data');
}

run().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
