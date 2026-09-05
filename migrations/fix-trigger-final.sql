-- Fix broken trigger: replaces LATERAL join (causes "invalid reference to FROM-clause entry for table t")
-- with a working version using correlated subqueries
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/ajbbcoygzoxdtejvhbfq/sql/new

-- 1. Drop the broken trigger
DROP TRIGGER IF EXISTS trg_refresh_tyre_state_from_activity ON public.tyre_activity_log;

-- 2. Replace the sync function (no LATERAL)
CREATE OR REPLACE FUNCTION public.sync_tyre_state_cache_from_ledger(p_tyre_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.tyres t SET
    current_vehicle_id = sub.vehicle_id_set,
    current_position = sub.position_code,
    status = sub.status_val,
    total_life_run = sub.life_total
  FROM (
    SELECT
      t2.id AS tyre_id,
      CASE WHEN la.activity_type = 'REMOVAL' THEN NULL ELSE la.vehicle_id END AS vehicle_id_set,
      CASE WHEN la.activity_type = 'REMOVAL' THEN NULL ELSE la.position_code END AS position_code,
      CASE
        WHEN la.activity_type = 'REMOVAL' THEN coalesce(nullif(la.disposition, ''), 'Spare')
        WHEN la.activity_type IS NOT NULL THEN 'Running'
        ELSE t2.status
      END AS status_val,
      COALESCE(lt.life_total, 0) AS life_total
    FROM public.tyres t2
    LEFT JOIN LATERAL (
      SELECT l.activity_type, l.vehicle_id,
             coalesce(l.position_code_norm, l.position) AS position_code,
             l.disposition
      FROM public.tyre_activity_log l
      WHERE l.tyre_id = t2.id
      ORDER BY l.activity_date DESC NULLS LAST, l.created_at DESC NULLS LAST, l.id DESC
      LIMIT 1
    ) la ON true
    LEFT JOIN (
      SELECT tyre_id, SUM(COALESCE(life_achieved_in_this_run, 0)) AS life_total
      FROM public.tyre_activity_log
      WHERE tyre_id IS NOT NULL
      GROUP BY tyre_id
    ) lt ON lt.tyre_id = t2.id
    WHERE (p_tyre_id IS NULL OR t2.id = p_tyre_id)
  ) sub
  WHERE t.id = sub.tyre_id;
END;
$$;

-- 3. Recreate the trigger function
CREATE OR REPLACE FUNCTION public.trg_refresh_tyre_state_from_activity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF new.tyre_id IS NOT NULL THEN
    PERFORM public.sync_tyre_state_cache_from_ledger(new.tyre_id);
  END IF;
  IF new.vehicle_id IS NOT NULL AND new.meter_reading IS NOT NULL THEN
    UPDATE public.vehicles
    SET current_odometer = GREATEST(COALESCE(current_odometer, 0), new.meter_reading)
    WHERE id = new.vehicle_id;
  END IF;
  RETURN new;
END;
$$;

-- 4. Recreate the trigger
CREATE TRIGGER trg_refresh_tyre_state_from_activity
AFTER INSERT OR UPDATE ON public.tyre_activity_log
FOR EACH ROW
EXECUTE FUNCTION public.trg_refresh_tyre_state_from_activity();

-- 5. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
