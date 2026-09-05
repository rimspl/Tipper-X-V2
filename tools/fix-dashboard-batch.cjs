/**
 * fix-dashboard-batch.cjs
 * 
 * Efficient batch fix using aggregation in JS, minimal DB round-trips
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DEMO_SITES = [
  'a3b359ca-1317-44b4-a128-e1c5f0a9b557',
  'dba713f3-807d-46d9-aafd-17434485c047',
  '7cb16dc2-bbf1-416e-b89a-d3787e6b250c'
];

async function fetchAll(supabase, table, filters = {}, select = '*') {
  let q = supabase.from(table).select(select);
  for (const [k, v] of Object.entries(filters)) {
    if (Array.isArray(v)) q = q.in(k, v);
    else q = q.eq(k, v);
  }
  const { data, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
}

async function run() {
  console.log('=== Efficient Dashboard Fix ===\n');

  // ── 1. Update site KPIs ──────────────────────────────────
  console.log('1. Updating site KPIs...');
  for (const siteId of DEMO_SITES) {
    const { error } = await supabase.from('sites').update({
      target_tyre_life: 100000,
      fleet_size: 31,
      annual_demand: 350
    }).eq('id', siteId);
    console.log(`  ${siteId}: ${error ? error.message : 'OK'}`);
  }

  // ── 2. Fetch all tyres + activity, aggregate in JS ───────
  console.log('\n2. Fetching tyres and activity data...');

  const [tyres, allActivity] = await Promise.all([
    fetchAll(supabase, 'tyres', { site_id: DEMO_SITES }, 'id, tyre_no'),
    (async () => {
      let all = [];
      let offset = 0;
      while (true) {
        const { data, error } = await supabase
          .from('tyre_activity_log')
          .select('tyre_id, activity_type, life_achieved_in_this_run, vehicle_id, position, position_code_norm, disposition, activity_date')
          .range(offset, offset + 999);
        if (error) throw new Error(`activity: ${error.message}`);
        all.push(...(data || []));
        if ((data || []).length < 1000) break;
        offset += data.length;
      }
      return all;
    })()
  ]);

  console.log(`  Tyres: ${tyres.length}, Activity rows: ${allActivity.length}`);

  // ── 3. Build a tyre_id → activity summary map ────────────
  console.log('\n3. Computing tyre state from activity...');

  const tyreMap = new Map();
  for (const t of tyres) {
    tyreMap.set(t.id, {
      tyre_no: t.tyre_no,
      total_life_run: 0,
      latest_activity_type: null,
      latest_vehicle_id: null,
      latest_position: null,
      latest_disposition: null
    });
  }

  // Sort activity by date descending so first match is latest
  allActivity.sort((a, b) => (b.activity_date || '').localeCompare(a.activity_date || ''));

  const latestByTyre = new Map();
  for (const act of allActivity) {
    if (!act.tyre_id || !tyreMap.has(act.tyre_id)) continue;

    // Sum life_achieved
    const entry = tyreMap.get(act.tyre_id);
    entry.total_life_run += Number(act.life_achieved_in_this_run || 0);

    // Track latest activity (first we see = most recent due to sort)
    if (!latestByTyre.has(act.tyre_id)) {
      latestByTyre.set(act.tyre_id, act);
    }
  }

  // Apply latest activity state
  for (const [tyreId, act] of latestByTyre) {
    const entry = tyreMap.get(tyreId);
    entry.latest_activity_type = act.activity_type;
    entry.latest_vehicle_id = act.vehicle_id;
    entry.latest_position = act.position_code_norm || act.position;
    entry.latest_disposition = act.disposition;
  }

  // Show some stats
  const withLife = [...tyreMap.values()].filter(e => e.total_life_run > 0);
  console.log(`  Tyres with life > 0: ${withLife.length}/${tyreMap.size}`);
  if (withLife.length > 0) {
    console.log(`  Sample: ${withLife[0].tyre_no} → ${withLife[0].total_life_run} km`);
  }

  // ── 4. Bulk update tyres ─────────────────────────────────
  console.log('\n4. Updating tyres...');

  let ok = 0, fail = 0;
  const updates = [...tyreMap.entries()].map(([tyreId, entry]) => ({
    id: tyreId,
    total_life_run: entry.total_life_run,
    current_vehicle_id: entry.latest_activity_type === 'REMOVAL' ? null : entry.latest_vehicle_id,
    current_position: entry.latest_activity_type === 'REMOVAL' ? null : entry.latest_position,
    status: entry.latest_activity_type === 'REMOVAL'
      ? (entry.latest_disposition || 'Spare')
      : (entry.latest_activity_type ? 'Running' : undefined)
  }));

  // Batch in groups of 50
  for (let i = 0; i < updates.length; i += 50) {
    const batch = updates.slice(i, i + 50);
    const promises = batch.map(u => {
      const data = { total_life_run: u.total_life_run };
      if (u.current_vehicle_id !== undefined) data.current_vehicle_id = u.current_vehicle_id;
      if (u.current_position !== undefined) data.current_position = u.current_position;
      if (u.status !== undefined) data.status = u.status;

      return supabase.from('tyres').update(data).eq('id', u.id)
        .then(r => { if (r.error) throw r.error; })
        .catch(e => { fail++; console.error(`  Failed ${u.id}: ${e.message}`); });
    });
    await Promise.all(promises);
    ok += batch.length - 0; // approximate
    if ((i + 50) % 200 === 0 || i + 50 >= updates.length) {
      console.log(`  Processed ${Math.min(i + 50, updates.length)}/${updates.length}`);
    }
  }

  console.log(`  Done: ~${ok - fail} updated, ${fail} failed`);

  // ── 5. Verify ────────────────────────────────────────────
  console.log('\n=== Verification ===');

  const { data: v1 } = await supabase
    .from('tyres')
    .select('tyre_no, total_life_run, status')
    .in('site_id', DEMO_SITES)
    .limit(10);

  console.log('\nTyres:');
  for (const t of v1 || []) console.log(`  ${t.tyre_no}: life=${t.total_life_run} status=${t.status}`);

  const { data: v2 } = await supabase
    .from('sites')
    .select('site_name, target_tyre_life, fleet_size, annual_demand')
    .in('id', DEMO_SITES);

  console.log('\nSites:');
  for (const s of v2 || []) console.log(`  ${s.site_name}: life=${s.target_tyre_life} fleet=${s.fleet_size} demand=${s.annual_demand}`);

  const { data: v3, error: v3e } = await supabase
    .from('v_manager_tyre_records')
    .select('tyre_no, brand, life_achieved, removal_date')
    .limit(5);

  console.log('\nView v_manager_tyre_records:');
  if (v3e) console.log(`  ERROR: ${v3e.message}`);
  else for (const r of v3 || []) console.log(`  ${r.tyre_no}: brand=${r.brand} life=${r.life_achieved} removal=${r.removal_date}`);

  console.log('\n=== DONE ===');
  console.log('Reload dashboard. If still blank, clear browser IndexedDB.');
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
