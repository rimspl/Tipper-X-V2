require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SITE = 'f8d09fa7-04e9-4429-b394-b969f1ea9a66';
const HOLD = '4a68fb71-9822-47b2-b07b-03f5b9eeee39';

async function main() {
  // 1. Find MRF tyres in SITE and the vehicles they're mounted on
  const { data: mrf } = await s.from('tyres').select('id, current_vehicle_id, make').eq('site_id', SITE);
  const mrfList = (mrf || []).filter(t => (t.make || 'MRF').toUpperCase() === 'MRF');
  const vehIds = [...new Set(mrfList.map(t => t.current_vehicle_id).filter(Boolean))];
  console.log('MRF tyres in site:', mrfList.length, '| distinct current vehicles:', vehIds.length);

  // 2. Move those MRF-bearing vehicles into SITE
  if (vehIds.length) {
    const { error } = await s.from('vehicles').update({ site_id: SITE }).in('id', vehIds);
    if (error) { console.log('vehicle move ERR:', error.message); }
    else { console.log('Moved', vehIds.length, 'MRF vehicles into', SITE.slice(0,8)); }
  }

  // 3. Unmount + hide non-MRF tyres from SITE (no deletion)
  const { data: nonMrf } = await s.from('tyres').select('id, make').eq('site_id', SITE).not('make', 'is', null);
  const nonMrfList = (nonMrf || []).filter(t => t.make.toUpperCase() !== 'MRF');
  console.log('non-MRF tyres to hide:', nonMrfList.length);
  const ids = nonMrfList.map(t => t.id);
  if (ids.length) {
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { error } = await s.from('tyres').update({ site_id: HOLD, current_vehicle_id: null, current_position: null }).in('id', chunk);
      if (error) { console.log('hide ERR:', error.message); break; }
    }
    console.log('Hid', ids.length, 'non-MRF tyres -> holding site', HOLD.slice(0,8));
  }

  // 4. Rename holding site for clarity
  const { error: re } = await s.from('sites').update({ site_name: 'Non-MRF Archive (excluded)' }).eq('id', HOLD);
  console.log('holding site rename:', re ? re.message : 'ok');

  // Verify
  const { count: mrfView } = await s.from('v_manager_tyre_records').select('*', { count: 'exact', head: true }).eq('site_id', SITE);
  const { data: mrfTyres } = await s.from('tyres').select('id', { count: 'exact', head: true }).eq('site_id', SITE);
  console.log('\nVERIFY -> v_manager_tyre_records for site:', mrfView, '| tyres with site_id in SITE:', mrfTyres);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
