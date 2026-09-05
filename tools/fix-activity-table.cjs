require('dotenv').config();
const {createClient} = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fix() {
  console.log('=== Fixing tyre_activity_log table ===');
  
  // 1. Drop old table (it has wrong columns from old migration)
  console.log('Dropping old tyre_activity_log...');
  const {error: dropErr} = await s.rpc('exec_sql', {p_query: 'DROP TABLE IF EXISTS public.tyre_activity_log CASCADE'});
  if (dropErr) {
    console.log('exec_sql not available, trying direct approach...');
    // If exec_sql doesn't exist, we need the user to paste the SQL manually
    console.log('PLEASE PASTE THIS IN SUPABASE SQL EDITOR:');
    console.log('');
    console.log('DROP TABLE IF EXISTS public.tyre_activity_log CASCADE;');
    console.log('');
    console.log('CREATE TABLE public.tyre_activity_log (');
    console.log('  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),');
    console.log('  created_at timestamptz NOT NULL DEFAULT now(),');
    console.log('  activity_date date DEFAULT current_date,');
    console.log('  tyre_id uuid,');
    console.log('  vehicle_id uuid,');
    console.log('  activity_type text,');
    console.log('  position text,');
    console.log('  position_code_norm text,');
    console.log('  meter_reading numeric,');
    console.log('  rtd1 numeric,');
    console.log('  rtd2 numeric,');
    console.log('  psi_found numeric,');
    console.log('  psi_corrected numeric,');
    console.log('  life_achieved_in_this_run numeric DEFAULT 0,');
    console.log('  removal_reason text,');
    console.log('  disposition text,');
    console.log('  remarks text,');
    console.log('  user_id uuid,');
    console.log('  source_type text,');
    console.log('  source_pk text,');
    console.log('  projection_version integer NOT NULL DEFAULT 1');
    console.log(');');
    console.log('');
    console.log('CREATE INDEX idx_activity_tyre_date ON public.tyre_activity_log (tyre_id, activity_date DESC);');
    console.log('CREATE INDEX idx_activity_vehicle_date ON public.tyre_activity_log (vehicle_id, activity_date DESC);');
    console.log('');
    console.log('ALTER TABLE public.tyre_activity_log ENABLE ROW LEVEL SECURITY;');
    console.log('DROP POLICY IF EXISTS "Service role full access" ON public.tyre_activity_log;');
    console.log('CREATE POLICY "Service role full access" ON public.tyre_activity_log FOR ALL USING (true) WITH CHECK (true);');
    console.log('');
    console.log('NOTIFY pgrst, ''reload schema'';');
    return;
  }
  
  // 2. Recreate with correct schema
  console.log('Creating new tyre_activity_log...');
  const createSQL = `
    CREATE TABLE public.tyre_activity_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at timestamptz NOT NULL DEFAULT now(),
      activity_date date DEFAULT current_date,
      tyre_id uuid,
      vehicle_id uuid,
      activity_type text,
      position text,
      position_code_norm text,
      meter_reading numeric,
      rtd1 numeric,
      rtd2 numeric,
      psi_found numeric,
      psi_corrected numeric,
      life_achieved_in_this_run numeric DEFAULT 0,
      removal_reason text,
      disposition text,
      remarks text,
      user_id uuid,
      source_type text,
      source_pk text,
      projection_version integer NOT NULL DEFAULT 1
    );
    CREATE INDEX idx_activity_tyre_date ON public.tyre_activity_log (tyre_id, activity_date DESC);
    CREATE INDEX idx_activity_vehicle_date ON public.tyre_activity_log (vehicle_id, activity_date DESC);
    ALTER TABLE public.tyre_activity_log ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Service role full access" ON public.tyre_activity_log;
    CREATE POLICY "Service role full access" ON public.tyre_activity_log FOR ALL USING (true) WITH CHECK (true);
  `;
  const {error: createErr} = await s.rpc('exec_sql', {p_query: createSQL});
  if (createErr) {
    console.log('CREATE failed:', createErr.message);
    return;
  }
  
  // 3. Reload PostgREST schema
  console.log('Reloading PostgREST schema...');
  await s.rpc('exec_sql', {p_query: "NOTIFY pgrst, 'reload schema'"});
  
  // 4. Verify
  const {data, error} = await s.from('tyre_activity_log').select('id').limit(1);
  console.log('Verification:', error ? 'ERROR: ' + error.message : 'OK - table is accessible');
  
  console.log('\nDone! tyre_activity_log recreated with correct schema.');
}

fix().catch(e => console.error('FATAL:', e.message));
