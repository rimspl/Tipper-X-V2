/**
 * fix-trigger.cjs
 * Create trigger via Supabase client - use alternative SQL approach
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function tryExec(sql, label) {
  const { data, error } = await supabase.rpc('exec_sql', { query: sql });
  if (error) {
    console.log(`  ${label}: RPC failed (${error.message}), trying alternative...`);
    return false;
  }
  console.log(`  ${label}: OK`);
  return true;
}

async function run() {
  console.log('=== Trigger Recreation ===\n');

  // Try via exec_sql
  const ok = await tryExec('SELECT 1', 'test exec_sql');
  if (!ok) {
    console.log('\nexec_sql RPC not available.');
    console.log('Please run the following SQL in Supabase SQL Editor:');
    console.log('https://supabase.com/dashboard/project/ajbbcoygzoxdtejvhbfq/sql/new');
    console.log('');
    console.log('--- BEGIN SQL ---');
    console.log(`
-- Recreate sync function (simplified version without problematic lateral join)
CREATE OR REPLACE FUNCTION public.sync_tyre_state_cache_from_ledger(p_tyre_id uuid default null)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  rec RECORD;
  latest_act RECORD;
  life_total numeric;
BEGIN
  FOR rec IN
    SELECT t.id FROM public.tyres t
    WHERE (p_tyre_id IS NULL OR t.id = p_tyre_id)
  LOOP
    -- Get latest activity
    SELECT activity_type, vehicle_id,
           coalesce(position_code_norm, position) as pos,
           disposition
    INTO latest_act
    FROM public.tyre_activity_log
    WHERE tyre_id = rec.id
    ORDER BY activity_date DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    LIMIT 1;

    -- Sum life_achieved
    SELECT coalesce(sum(life_achieved_in_this_run), 0) INTO life_total
    FROM public.tyre_activity_log
    WHERE tyre_id = rec.id;

    -- Update tyre
    UPDATE public.tyres SET
      current_vehicle_id = CASE WHEN latest_act.activity_type = 'REMOVAL' THEN NULL ELSE latest_act.vehicle_id END,
      current_position = CASE WHEN latest_act.activity_type = 'REMOVAL' THEN NULL ELSE latest_act.pos END,
      status = CASE
        WHEN latest_act.activity_type = 'REMOVAL' THEN coalesce(nullif(latest_act.disposition, ''), 'Spare')
        WHEN latest_act.activity_type IS NOT NULL THEN 'Running'
        ELSE status
      END,
      total_life_run = life_total
    WHERE id = rec.id;
  END LOOP;
END;
$$;

-- Recreate trigger function
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

-- Recreate trigger
DROP TRIGGER IF EXISTS trg_refresh_tyre_state_from_activity ON public.tyre_activity_log;
CREATE TRIGGER trg_refresh_tyre_state_from_activity
AFTER INSERT OR UPDATE ON public.tyre_activity_log
FOR EACH ROW
EXECUTE FUNCTION public.trg_refresh_tyre_state_from_activity();

NOTIFY pgrst, 'reload schema';
`);
    console.log('--- END SQL ---');
    console.log('\nAfter pasting the SQL, click "Run" in the SQL Editor.');
    return;
  }

  // If exec_sql works, run the SQL
  const sql = `
CREATE OR REPLACE FUNCTION public.sync_tyre_state_cache_from_ledger(p_tyre_id uuid default null)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  rec RECORD;
  latest_act RECORD;
  life_total numeric;
BEGIN
  FOR rec IN SELECT t.id FROM public.tyres t WHERE (p_tyre_id IS NULL OR t.id = p_tyre_id) LOOP
    SELECT activity_type, vehicle_id, coalesce(position_code_norm, position) as pos, disposition
    INTO latest_act
    FROM public.tyre_activity_log WHERE tyre_id = rec.id
    ORDER BY activity_date DESC NULLS LAST, created_at DESC NULLS LAST, id DESC LIMIT 1;

    SELECT coalesce(sum(life_achieved_in_this_run), 0) INTO life_total
    FROM public.tyre_activity_log WHERE tyre_id = rec.id;

    UPDATE public.tyres SET
      current_vehicle_id = CASE WHEN latest_act.activity_type = 'REMOVAL' THEN NULL ELSE latest_act.vehicle_id END,
      current_position = CASE WHEN latest_act.activity_type = 'REMOVAL' THEN NULL ELSE latest_act.pos END,
      status = CASE WHEN latest_act.activity_type = 'REMOVAL' THEN coalesce(nullif(latest_act.disposition, ''), 'Spare') WHEN latest_act.activity_type IS NOT NULL THEN 'Running' ELSE status END,
      total_life_run = life_total
    WHERE id = rec.id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_refresh_tyre_state_from_activity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF new.tyre_id IS NOT NULL THEN PERFORM public.sync_tyre_state_cache_from_ledger(new.tyre_id); END IF;
  IF new.vehicle_id IS NOT NULL AND new.meter_reading IS NOT NULL THEN
    UPDATE public.vehicles SET current_odometer = GREATEST(COALESCE(current_odometer, 0), new.meter_reading) WHERE id = new.vehicle_id;
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_tyre_state_from_activity ON public.tyre_activity_log;
CREATE TRIGGER trg_refresh_tyre_state_from_activity
AFTER INSERT OR UPDATE ON public.tyre_activity_log
FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_tyre_state_from_activity();

NOTIFY pgrst, 'reload schema';
`;

  const { error } = await supabase.rpc('exec_sql', { query: sql });
  if (error) {
    console.error('SQL execution failed:', error.message);
  } else {
    console.log('Trigger and function created successfully!');
  }
}

run().catch(e => { console.error('Failed:', e); process.exit(1); });
