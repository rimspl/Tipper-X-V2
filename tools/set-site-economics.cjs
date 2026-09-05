require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SITE = 'f8d09fa7-04e9-4429-b394-b969f1ea9a66';

(async () => {
  const { error } = await s.from('sites').update({
    site_name: 'DynaHaul X — MRF Fleet (Production)',
    tyre_price: 45000,
    retread_cost: 12000,
    rate_per_km: 0.75,
    target_tyre_life: 120000,
    target_life_unit: 'KM',
    pressure_base_psi: 120,
    pressure_fuel_price: 90,
    pressure_fuel_efficiency_kmpl: 2.8,
    pressure_daily_km: 250,
    pressure_model_enabled: true
  }).eq('id', SITE);
  if (error) { console.log('ERR:', error.message); process.exit(1); }
  const { data } = await s.from('sites').select('*').eq('id', SITE).maybeSingle();
  console.log('site updated:', JSON.stringify({ name: data.site_name, tyre_price: data.tyre_price, retread: data.retread_cost, rate: data.rate_per_km, life: data.target_tyre_life, psi: data.pressure_base_psi, eff: data.pressure_fuel_efficiency_kmpl }));
  process.exit(0);
})();
