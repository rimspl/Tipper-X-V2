begin;

-- ==========================================
-- VIEW 1: v_manager_tyre_records
-- Collapses hundreds of thousands of raw tyre logs into a 
-- single row per tyre, instantly resolving the required data 
-- for the Manager Dashboard Charts & Tyre Table.
-- ==========================================
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
),
evidence_candidates as (
    select distinct on (context_json->>'tyre_no')
        (context_json->>'tyre_no') as tyre_no_key, id as evidence_candidate_id
    from ops.offline_submissions
    order by context_json->>'tyre_no', created_at desc
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
    ec.evidence_candidate_id
from public.tyres t
left join fitment_data fd on fd.tyre_id = t.id
left join inspection_data id_data on id_data.tyre_id = t.id
left join removal_data rd on rd.tyre_id = t.id
left join public.vehicles v_active on v_active.id = t.current_vehicle_id
left join public.vehicles v_historical on v_historical.id = fd.vehicle_id
left join evidence_candidates ec on public.normalize_tyre_serial(ec.tyre_no_key) = public.normalize_tyre_serial(t.tyre_no);


-- ==========================================
-- VIEW 2: v_manager_inspection_records
-- Pre-formats the Inspection Table records so the frontend 
-- can natively paginate this view without downloading raw logs.
-- ==========================================
create or replace view public.v_manager_inspection_records as
select 
    l.id,
    v.site_id,
    t.tyre_no,
    v.vehicle_no as truck,
    coalesce(l.position_code_norm, l.position) as position,
    l.activity_date as date,
    l.meter_reading as odometer,
    l.rtd1,
    l.rtd2,
    abs(coalesce(l.rtd1, 0) - coalesce(l.rtd2, 0)) as rtd_difference,
    coalesce(l.psi_found, l.psi_corrected) as psi,
    coalesce(l.remarks, '') as remarks,
    l.activity_type
from public.tyre_activity_log l
join public.tyres t on t.id = l.tyre_id
left join public.vehicles v on v.id = l.vehicle_id;


-- ==========================================
-- VIEW 3: v_manager_pressure_events
-- Extracts only the essential minimum columns required for
-- the Pressure Interpolation Math, vastly shrinking payload size.
-- ==========================================
create or replace view public.v_manager_pressure_events as
select 
    l.id,
    v.site_id,
    l.tyre_id,
    t.tyre_no,
    v.vehicle_no as truck,
    coalesce(l.position_code_norm, l.position) as position,
    l.activity_date as date,
    l.psi_found as psi_found,
    l.psi_corrected as psi_corrected
from public.tyre_activity_log l
join public.tyres t on t.id = l.tyre_id
join public.vehicles v on v.id = l.vehicle_id
where l.activity_type = 'PRESSURE_CHECK'
   or l.activity_type = 'INSPECTION'
   or l.activity_type = 'FITMENT';

-- Apply Grants
grant select on public.v_manager_tyre_records to authenticated;
grant select on public.v_manager_inspection_records to authenticated;
grant select on public.v_manager_pressure_events to authenticated;

commit;
