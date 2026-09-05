require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // Manager profile -> site
  const { data: profiles, error } = await s
    .from('user_profiles')
    .select('*')
    .order('email');
  if (error) { console.log('user_profiles ERR:', error.message); }
  console.log('USER PROFILES:');
  for (const p of profiles || []) {
    console.log(`  ${p.email} | role=${p.role} | site_id=${p.site_id || 'NULL'} | keys=${Object.keys(p).join(',')}`);
  }

  // Activity log rows grouped by which site their tyre/vehicle belongs to
  console.log('\nActivity log distribution:');
  const { data: acts } = await s.from('tyre_activity_log').select('id, tyre_id, vehicle_id, activity_type').limit(1000);
  const { data: allTyres } = await s.from('tyres').select('id, site_id').limit(2000);
  const { data: allVeh } = await s.from('vehicles').select('id, site_id').limit(2000);
  const tyreSite = new Map((allTyres||[]).map(t => [t.id, t.site_id]));
  const vehSite = new Map((allVeh||[]).map(v => [v.id, v.site_id]));
  const dist = {};
  for (const a of acts || []) {
    const sid = tyreSite.get(a.tyre_id) || vehSite.get(a.vehicle_id) || 'NULL';
    dist[sid] = dist[sid] || { n: 0, types: {} };
    dist[sid].n++;
    dist[sid].types[a.activity_type] = (dist[sid].types[a.activity_type]||0)+1;
  }
  for (const [k,v] of Object.entries(dist)) console.log(`  site ${k}: ${v.n} rows`, JSON.stringify(v.types));
}
main().catch(e => { console.error(e); process.exit(1); });
