require('dotenv').config();
const {createClient} = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function probe() {
  const tables = ['user_profiles','sites','vehicles','tyres','tyre_activity_log','fuel_entries','financial_config','tyre_pressure_checks','tyre_inspections','alert_rules','alerts'];
  for (const t of tables) {
    try {
      const {data, error, count} = await s.from(t).select('*', {count:'exact', head:true});
      if (error) console.log(`${t}: ERROR - ${error.message}`);
      else console.log(`${t}: OK (${count} rows)`);
    } catch(e) { console.log(`${t}: EXCEPTION - ${e.message}`); }
  }
}
probe();
