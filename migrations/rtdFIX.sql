-- =====================================================================
-- DynaHaul X — RTD Backfill & View Cleanup
-- Run in Supabase Dashboard -> SQL Editor (ops schema is only reachable here)
-- =====================================================================

-- ---------------------------------------------------------------------
-- STEP 1: Diagnostic — confirm RTD is recoverable & see its JSON shape
-- (If this returns 0 rows, RTD was never captured for those fitments)
-- ---------------------------------------------------------------------
select t.id,
       split_part(t.source_pk, ':', 2) as submission_id,
       ef.field_key,
       ef.field_value,
       jsonb_typeof(ef.field_value) as value_type
from public.tyre_activity_log t
left join ops.extracted_fields ef
  on ef.submission_id = split_part(t.source_pk, ':', 2)::uuid
where t.activity_type = 'FITMENT'
  and t.rtd1 is null
  and t.source_type = 'vehicle_layout_upsert'
  and ef.field_key in ('rtd1','rtd2')
limit 20;

-- ---------------------------------------------------------------------
-- STEP 2: Backfill RTD (run AFTER step 1)
-- Handles both a plain numeric field_value and an object like {"value": X}
-- ---------------------------------------------------------------------
update public.tyre_activity_log t
set rtd1 = coalesce(t.rtd1, (
  select case jsonb_typeof(ef.field_value)
           when 'number' then ef.field_value::numeric
           when 'object' then (ef.field_value->>'value')::numeric
           else null end
  from ops.extracted_fields ef
  where ef.submission_id = split_part(t.source_pk, ':', 2)::uuid
    and ef.field_key = 'rtd1'
)),
    rtd2 = coalesce(t.rtd2, (
  select case jsonb_typeof(ef.field_value)
           when 'number' then ef.field_value::numeric
           when 'object' then (ef.field_value->>'value')::numeric
           else null end
  from ops.extracted_fields ef
  where ef.submission_id = split_part(t.source_pk, ':', 2)::uuid
    and ef.field_key = 'rtd2'
))
where t.activity_type = 'FITMENT'
  and t.rtd1 is null
  and t.source_type = 'vehicle_layout_upsert'
  and split_part(t.source_pk, ':', 2) ~ '^[0-9a-fA-F-]{36}$';

-- ---------------------------------------------------------------------
-- STEP 3 (OPTIONAL): Remove ops.offline_submissions dependency from
-- v_manager_tyre_records. Not required (the proxy reads it fine via
-- service_role), but recommended cleanup.
-- ---------------------------------------------------------------------
create or replace view public.v_manager_tyre_records as
with fitment_data as (
    select distinct on (tyre_id)
        tyre_id, activity_date as first_fitment_date,
        vehicle_id, position
    from public.tyre_activity_log
    where activity_type = 'FITMENT'
    order by tyre_id, activity_date asc, created_at asc
),
inspection_data as (
    select distinct on (tyre_id)
        tyre_id, activity_date as latest_inspection_date,
        rtd1 as latest_rtd1, rtd2 as latest_rtd2
    from public.tyre_activity_log
    where activity_type = 'INSPECTION'
    order by tyre_id, activity_date desc, created_at desc
),
removal_data as (
    select distinct on (tyre_id)
        tyre_id, activity_date as removal_date,
        rtd1 as removal_rtd, removal_reason
    from public.tyre_activity_log
    where activity_type = 'REMOVAL'
    order by tyre_id, activity_date desc, created_at desc
)
select
    t.id,
    v_active.site_id,
    coalesce(t.make, 'Unknown') as brand,
    coalesce(t.size, 'Unknown') as size,
    t.tyre_no,
    t.otd,
    coalesce(t.status, 'Stock') as status,
    case
        when t.current_vehicle_id is not null then coalesce(v_active.vehicle_no, 'Unassigned')
        else coalesce(v_historical.vehicle_no, 'Unassigned')
    end as truck,
    case
        when t.current_position is not null then t.current_position
        when fd.position is not null then fd.position
        else 'Stores'
    end as position,
    id_data.latest_inspection_date,
    id_data.latest_rtd1,
    id_data.latest_rtd2,
    fd.first_fitment_date,
    rd.removal_date,
    rd.removal_rtd,
    coalesce(rd.removal_reason, '') as removal_reason,
    coalesce(t.total_life_run, 0) as life_achieved,
    NULL::text as evidence_candidate_id
from public.tyres t
left join fitment_data fd on fd.tyre_id = t.id
left join inspection_data id_data on id_data.tyre_id = t.id
left join removal_data rd on rd.tyre_id = t.id
left join public.vehicles v_active on v_active.id = t.current_vehicle_id
left join public.vehicles v_historical on v_historical.id = fd.vehicle_id;
