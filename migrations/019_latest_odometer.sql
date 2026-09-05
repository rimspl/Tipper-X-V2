begin;

-- ==========================================
-- Add latest_odometer to v_manager_tyre_records.
-- The manager Tyre Records table showed Odometer = 0 for every tyre
-- because the view exposed no odometer column and the frontend
-- hard-coded odometer: null. Source of truth is tyre_activity_log.meter_reading
-- (the Tyre History view reads it directly and showed 10,493 for tyre 101).
-- New column is appended at the END of the select list so that
-- CREATE OR REPLACE VIEW keeps existing column positions/names.
-- ==========================================

create or replace view public.v_manager_tyre_records as
with fitment_data as (
    select distinct on (tyre_id)
        tyre_id, activity_date as first_fitment_date,
        vehicle_id, position, rtd1, rtd2
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
),
evidence_candidates as (
    select distinct on (context_json->>'tyre_no')
        (context_json->>'tyre_no') as tyre_no_key, id as evidence_candidate_id
    from ops.offline_submissions
    order by context_json->>'tyre_no', created_at desc
),
odometer_data as (
    select distinct on (tyre_id)
        tyre_id, meter_reading as latest_odometer
    from public.tyre_activity_log
    where meter_reading is not null
    order by tyre_id, activity_date desc, created_at desc
),
latest_activity_data as (
    select distinct on (tyre_id)
        tyre_id, activity_date as latest_activity_date
    from public.tyre_activity_log
    order by tyre_id, activity_date desc, created_at desc
)
select
    t.id,
    v_active.site_id,
    coalesce(t.make, 'MRF') as brand,
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
    ec.evidence_candidate_id,
    fd.rtd1 as initial_rtd1,
    fd.rtd2 as initial_rtd2,
    od.latest_odometer,
    la.latest_activity_date
from public.tyres t
left join fitment_data fd on fd.tyre_id = t.id
left join inspection_data id_data on id_data.tyre_id = t.id
left join removal_data rd on rd.tyre_id = t.id
left join public.vehicles v_active on v_active.id = t.current_vehicle_id
left join public.vehicles v_historical on v_historical.id = fd.vehicle_id
left join evidence_candidates ec on public.normalize_tyre_serial(ec.tyre_no_key) = public.normalize_tyre_serial(t.tyre_no)
left join odometer_data od on od.tyre_id = t.id
left join latest_activity_data la on la.tyre_id = t.id;

grant select on public.v_manager_tyre_records to authenticated;

commit;
