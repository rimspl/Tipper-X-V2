/**
 * fix-dashboard.cjs
 * 
 * Fixes the blank dashboard by:
 * 1. Syncing tyres.total_life_run from activity log
 * 2. Recreating the trigger that auto-syncs on future uploads
 * 3. Updating site KPI values
 * 
 * Run: node tools/fix-dashboard.cjs
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log('=== DynaHaul X Dashboard Fix ===\n');

  // ── Step 1: Check current state ──────────────────────────
  console.log('Step 1: Checking current state...');

  const { data: sites, error: siteErr } = await supabase
    .from('sites')
    .select('id, site_name, target_tyre_life, fleet_size, annual_demand, tyre_price, retread_cost, rate_per_km');

  if (siteErr) {
    console.error('Failed to fetch sites:', siteErr.message);
    process.exit(1);
  }

  console.log('Sites found:', sites?.length);
  for (const s of sites || []) {
    console.log(`  ${s.site_name} (${s.id})`);
    console.log(`    target_tyre_life=${s.target_tyre_life}, fleet_size=${s.fleet_size}, annual_demand=${s.annual_demand}`);
    console.log(`    tyre_price=${s.tyre_price}, retread_cost=${s.retread_cost}, rate_per_km=${s.rate_per_km}`);
  }

  // Check tyre totals
  const { data: tyreSample, error: tyreErr } = await supabase
    .from('tyres')
    .select('id, tyre_no, total_life_run, site_id')
    .limit(5);

  if (tyreErr) {
    console.error('Failed to fetch tyres:', tyreErr.message);
  } else {
    console.log(`\nTyre sample (first 5):`);
    for (const t of tyreSample || []) {
      console.log(`  ${t.tyre_no}: total_life_run=${t.total_life_run}, site_id=${t.site_id}`);
    }
  }

  // Check total_life_run distribution
  const { data: lifeRunSample } = await supabase
    .from('tyres')
    .select('total_life_run')
    .limit(100);

  const zeroCount = (lifeRunSample || []).filter(t => !t.total_life_run || t.total_life_run === 0).length;
  const nonZeroCount = (lifeRunSample || []).filter(t => t.total_life_run > 0).length;
  console.log(`\nTyre total_life_run distribution (sample of ${lifeRunSample?.length || 0}):`);
  console.log(`  Zero/NULL: ${zeroCount}`);
  console.log(`  Non-zero: ${nonZeroCount}`);

  // Check activity log
  const { count: activityCount, error: actErr } = await supabase
    .from('tyre_activity_log')
    .select('*', { count: 'exact', head: true });

  console.log(`\nActivity log rows: ${activityCount || 0}`);

  // Check life_achieved_in_this_run values
  const { data: activitySample } = await supabase
    .from('tyre_activity_log')
    .select('activity_type, life_achieved_in_this_run')
    .limit(20);

  console.log('\nActivity sample (first 20):');
  const typeCounts = {};
  for (const a of activitySample || []) {
    typeCounts[a.activity_type] = (typeCounts[a.activity_type] || 0) + 1;
  }
  console.log('  Types:', typeCounts);
  const lifeValues = (activitySample || []).map(a => a.life_achieved_in_this_run);
  console.log('  life_achieved values:', lifeValues);

  // ── Step 2: Run sync_tyre_state_cache_from_ledger ────────
  console.log('\n\nStep 2: Syncing tyres.total_life_run from activity log...');

  const { data: syncResult, error: syncErr } = await supabase
    .rpc('sync_tyre_state_cache_from_ledger');

  if (syncErr) {
    console.error('Sync failed:', syncErr.message);
    console.log('Attempting manual SQL sync instead...');

    // Manual approach: directly update tyres from activity log
    const { data: allTyres } = await supabase.from('tyres').select('id');
    const tyreIds = (allTyres || []).map(t => t.id);

    for (const tyreId of tyreIds) {
      const { data: actRows } = await supabase
        .from('tyre_activity_log')
        .select('life_achieved_in_this_run, activity_type, vehicle_id, position, position_code_norm, disposition')
        .eq('tyre_id', tyreId)
        .order('activity_date', { ascending: false });

      if (!actRows || actRows.length === 0) continue;

      // Sum life_achieved
      const totalLife = actRows.reduce((sum, r) => sum + Number(r.life_achieved_in_this_run || 0), 0);

      // Get latest activity state
      const latest = actRows[0];

      await supabase
        .from('tyres')
        .update({
          total_life_run: totalLife,
          current_vehicle_id: latest.activity_type === 'REMOVAL' ? null : latest.vehicle_id,
          current_position: latest.activity_type === 'REMOVAL' ? null : (latest.position_code_norm || latest.position || null),
          status: latest.activity_type === 'REMOVAL'
            ? (latest.disposition || 'Spare')
            : (latest.activity_type ? 'Running' : undefined)
        })
        .eq('id', tyreId);
    }
    console.log('Manual sync completed for', tyreIds.length, 'tyres');
  } else {
    console.log('RPC sync succeeded');
  }

  // Verify sync result
  const { data: afterSync } = await supabase
    .from('tyres')
    .select('total_life_run')
    .limit(100);

  const zeroAfter = (afterSync || []).filter(t => !t.total_life_run || t.total_life_run === 0).length;
  const nonZeroAfter = (afterSync || []).filter(t => t.total_life_run > 0).length;
  console.log(`\nAfter sync - total_life_run distribution (sample of ${afterSync?.length || 0}):`);
  console.log(`  Zero/NULL: ${zeroAfter}`);
  console.log(`  Non-zero: ${nonZeroAfter}`);

  // ── Step 3: Recreate trigger ─────────────────────────────
  console.log('\n\nStep 3: Recreating trigger...');

  // First ensure the function exists
  const createFnSql = `
    CREATE OR REPLACE FUNCTION public.trg_refresh_tyre_state_from_activity()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF new.tyre_id IS NOT NULL THEN
        PERFORM public.sync_tyre_state_cache_from_ledger(new.tyre_id);
      END IF;
      IF new.vehicle_id IS NOT NULL AND new.meter_reading IS NOT NULL THEN
        UPDATE public.vehicles SET current_odometer = GREATEST(COALESCE(current_odometer, 0), new.meter_reading) WHERE id = new.vehicle_id;
      END IF;
      RETURN new;
    END;
    $$;
  `;

  const { error: fnErr } = await supabase.rpc('exec_sql', { sql: createFnSql });
  if (fnErr) {
    console.warn('Could not create function via RPC:', fnErr.message);
    console.log('Note: The function may need to be created via Supabase SQL Editor');
  } else {
    console.log('Function created/updated');
  }

  // Create trigger
  const createTriggerSql = `
    DROP TRIGGER IF EXISTS trg_refresh_tyre_state_from_activity ON public.tyre_activity_log;
    CREATE TRIGGER trg_refresh_tyre_state_from_activity
    AFTER INSERT OR UPDATE ON public.tyre_activity_log
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_refresh_tyre_state_from_activity();
  `;

  const { error: trigErr } = await supabase.rpc('exec_sql', { sql: createTriggerSql });
  if (trigErr) {
    console.warn('Could not create trigger via RPC:', trigErr.message);
    console.log('Note: The trigger may need to be created via Supabase SQL Editor');
  } else {
    console.log('Trigger created/updated');
  }

  // ── Step 4: Update site KPI values ───────────────────────
  console.log('\n\nStep 4: Updating site KPI values...');

  if (sites && sites.length > 0) {
    for (const site of sites) {
      const updates = {};
      let changed = false;

      if (!site.target_tyre_life || site.target_tyre_life === 0) {
        updates.target_tyre_life = 100000;
        changed = true;
      }
      if (!site.fleet_size || site.fleet_size === 0) {
        updates.fleet_size = 31;
        changed = true;
      }
      if (!site.annual_demand || site.annual_demand === 0) {
        updates.annual_demand = 350;
        changed = true;
      }

      if (changed) {
        const { error: updErr } = await supabase
          .from('sites')
          .update(updates)
          .eq('id', site.id);

        if (updErr) {
          console.error(`Failed to update site ${site.site_name}:`, updErr.message);
        } else {
          console.log(`Updated ${site.site_name}:`, updates);
        }
      } else {
        console.log(`${site.site_name} already has KPI values`);
      }
    }
  }

  // ── Step 5: Also ensure tyres have site_id set ───────────
  console.log('\n\nStep 5: Checking tyre site_ids...');

  const { data: tyresNoSite } = await supabase
    .from('tyres')
    .select('id, tyre_no, site_id')
    .is('site_id', null)
    .limit(5);

  if (tyresNoSite && tyresNoSite.length > 0) {
    console.log(`Found ${tyresNoSite.length} tyres without site_id (checking more...)`);
    const { count: noSiteCount } = await supabase
      .from('tyres')
      .select('*', { count: 'exact', head: true })
      .is('site_id', null);
    console.log(`Total tyres without site_id: ${noSiteCount || 0}`);

    if (noSiteCount > 0 && sites && sites.length > 0) {
      const siteId = sites[0].id;
      const { error: fixSiteErr } = await supabase
        .from('tyres')
        .update({ site_id: siteId })
        .is('site_id', null);
      if (fixSiteErr) {
        console.error('Failed to fix tyre site_ids:', fixSiteErr.message);
      } else {
        console.log(`Fixed ${noSiteCount} tyres → site_id = ${siteId}`);
      }
    }
  } else {
    console.log('All tyres have site_id set');
  }

  // ── Step 6: Final verification ───────────────────────────
  console.log('\n\n=== Final Verification ===');

  const { data: verifyTyres } = await supabase
    .from('tyres')
    .select('tyre_no, total_life_run, status, current_vehicle_id')
    .limit(10);

  console.log('\nTyre sample after fix:');
  for (const t of verifyTyres || []) {
    console.log(`  ${t.tyre_no}: life=${t.total_life_run}, status=${t.status}, vehicle=${t.current_vehicle_id || 'none'}`);
  }

  const { data: verifySites } = await supabase
    .from('sites')
    .select('site_name, target_tyre_life, fleet_size, annual_demand')
    .limit(5);

  console.log('\nSite KPIs after fix:');
  for (const s of verifySites || []) {
    console.log(`  ${s.site_name}: target_tyre_life=${s.target_tyre_life}, fleet_size=${s.fleet_size}, annual_demand=${s.annual_demand}`);
  }

  // Check view data
  const { data: viewSample, error: viewErr } = await supabase
    .from('v_manager_tyre_records')
    .select('tyre_no, brand, life_achieved, removal_date, site_id')
    .limit(5);

  if (viewErr) {
    console.error('\nView check failed:', viewErr.message);
  } else {
    console.log('\nv_manager_tyre_records sample:');
    for (const v of viewSample || []) {
      console.log(`  ${v.tyre_no}: brand=${v.brand}, life=${v.life_achieved}, removal=${v.removal_date}, site=${v.site_id}`);
    }
  }

  console.log('\n=== Fix Complete ===');
  console.log('Please reload the dashboard in your browser.');
  console.log('If charts are still blank, clear browser IndexedDB:');
  console.log('  Open DevTools → Application → Storage → Clear site data');
}

run().catch(err => {
  console.error('Fix script failed:', err);
  process.exit(1);
});
