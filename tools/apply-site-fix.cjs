require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const NEW_SITE = 'f8d09fa7-04e9-4429-b394-b969f1ea9a66';

async function main() {
  // 1. Reassign manager login to the real data site
  const { data: m, error: me } = await s
    .from('user_profiles')
    .update({ site_id: NEW_SITE })
    .eq('email', 'dxuser1.rimspl@gmail.com')
    .select('email, site_id, role');
  if (me) console.log('manager update ERR:', me.message);
  else console.log('manager reassigned:', JSON.stringify(m));

  // 2. Attach orphaned (null site_id) tyres to the real data site
  const { error: te } = await s
    .from('tyres')
    .update({ site_id: NEW_SITE })
    .is('site_id', null);
  if (te) console.log('tyres update ERR:', te.message);
  else console.log('orphan tyres attached (site_id set to ' + NEW_SITE + ')');

  // Verify
  const { count: tyreCount } = await s
    .from('tyres').select('*', { count: 'exact', head: true })
    .eq('site_id', NEW_SITE);
  const { data: p } = await s
    .from('user_profiles').select('email, site_id').eq('email', 'dxuser1.rimspl@gmail.com');
  console.log('tyres now in f8d09fa7:', tyreCount);
  console.log('manager profile now:', JSON.stringify(p));
}
main().catch((e) => { console.error(e); process.exit(1); });
