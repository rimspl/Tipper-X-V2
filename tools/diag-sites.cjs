require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function count(table, col, val) {
  const { count, error } = await s.from(table).select('*', { count: 'exact', head: true }).eq(col, val);
  if (error) return 'ERR:' + error.message;
  return count;
}

async function main() {
  const { data: sites } = await s.from('sites').select('id, site_name, invite_code, target_tyre_life, fleet_size, tyre_price, rate_per_km, retread_cost');
  console.log('SITES:', sites.length);
  for (const site of sites) {
    const id = site.id;
    const tyres = await count('tyres', 'site_id', id);
    const veh = await count('vehicles', 'site_id', id);
    const fuel = await count('fuel_trip_entries', 'site_id', id);
    const insp = await count('fitter_tyre_inspection_entries', 'site_id', id);
    const pres = await count('fitter_pressure_check_entries', 'site_id', id);
    const card = await count('fitter_tyre_card_entries', 'site_id', id);
    const rem = await count('fitter_tyre_removal_entries', 'site_id', id);
    console.log('\n---');
    console.log('site_id :', id);
    console.log('name     :', site.site_name, '| invite:', site.invite_code);
    console.log('econ     : target_life=', site.target_tyre_life, 'fleet=', site.fleet_size, 'price=', site.tyre_price, 'rate/km=', site.rate_per_km, 'retread=', site.retread_cost);
    console.log('tyres    :', tyres, '| vehicles:', veh, '| fuel:', fuel);
    console.log('fitter   : insp=', insp, 'pressure=', pres, 'card=', card, 'removal=', rem);
  }

  // Also: how many tyres have NO site_id, and what brands/sample
  const { count: noSite } = await s.from('tyres').select('*', { count: 'exact', head: true }).is('site_id', null);
  console.log('\nTyres WITHOUT site_id:', noSite);

  // tyres grouped by site_id (including null)
  const { data: allTyres } = await s.from('tyres').select('site_id, make, status').limit(1000);
  const bySite = {};
  for (const t of allTyres || []) {
    const k = t.site_id || 'NULL';
    bySite[k] = bySite[k] || { n: 0, makes: {} };
    bySite[k].n++;
    bySite[k].makes[t.make || '?'] = (bySite[k].makes[t.make || '?'] || 0) + 1;
  }
  console.log('\nTyres by site_id (first 1000 sampled):');
  for (const [k, v] of Object.entries(bySite)) {
    console.log('  ', k, '=>', v.n, 'tyres', JSON.stringify(v.makes));
  }
}
main().catch(e => { console.error(e); process.exit(1); });
