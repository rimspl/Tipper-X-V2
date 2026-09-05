-- fix-trigger.sql
-- Recreate the trigger that was lost when tyre_activity_log was dropped/recreated

-- 1. Ensure the sync function exists (from RUN_COMPLETE.sql)
CREATE OR REPLACE FUNCTION public.sync_tyre_state_cache_from_ledger(p_tyre_id uuid default null)
RETURNS void LANGUAGE plpgsql AS $$
begin
  update public.tyres t set
    current_vehicle_id = case when le.activity_type = 'REMOVAL' then null else le.vehicle_id end,
    current_position = case when le.activity_type = 'REMOVAL' then null else le.position_code end,
    status = case when le.activity_type = 'REMOVAL' then coalesce(nullif(le.disposition, ''), 'Spare') when le.activity_type is not null then 'Running' else t.status end
  from lateral (
    select l.activity_type, l.vehicle_id, coalesce(l.position_code_norm, public.normalize_position_code(l.position)) as position_code, l.disposition
    from public.tyre_activity_log l where l.tyre_id = t.id
    order by l.activity_date desc nulls last, l.created_at desc nulls last, l.id desc limit 1
  ) le where (p_tyre_id is null or t.id = p_tyre_id);

  update public.tyres t set total_life_run = coalesce(src.life_total, 0)
  from (select tyre_id, sum(coalesce(life_achieved_in_this_run, 0)) as life_total from public.tyre_activity_log where tyre_id is not null and (p_tyre_id is null or tyre_id = p_tyre_id) group by tyre_id) src
  where t.id = src.tyre_id;
end;
$$;

-- 2. Ensure the trigger function exists
CREATE OR REPLACE FUNCTION public.trg_refresh_tyre_state_from_activity()
RETURNS trigger LANGUAGE plpgsql AS $$
begin
  if new.tyre_id is not null then perform public.sync_tyre_state_cache_from_ledger(new.tyre_id); end if;
  if new.vehicle_id is not null and new.meter_reading is not null then
    update public.vehicles set current_odometer = greatest(coalesce(current_odometer, 0), new.meter_reading) where id = new.vehicle_id;
  end if;
  return new;
end;
$$;

-- 3. Recreate the trigger
DROP TRIGGER IF EXISTS trg_refresh_tyre_state_from_activity ON public.tyre_activity_log;
CREATE TRIGGER trg_refresh_tyre_state_from_activity
AFTER INSERT OR UPDATE ON public.tyre_activity_log
FOR EACH ROW
EXECUTE FUNCTION public.trg_refresh_tyre_state_from_activity();

-- 4. Reload PostgREST schema
NOTIFY pgrst, 'reload schema';
