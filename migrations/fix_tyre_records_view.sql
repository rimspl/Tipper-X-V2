-- Fix v_manager_tyre_records view: use activity log vehicle for site_id
-- instead of tyres.current_vehicle_id (which is null after onboarding upload)

CREATE OR REPLACE VIEW public.v_manager_tyre_records AS
WITH fitment_data AS (
    SELECT DISTINCT ON (tyre_id) tyre_id, activity_date AS first_fitment_date, vehicle_id, position
    FROM public.tyre_activity_log WHERE activity_type = 'FITMENT' ORDER BY tyre_id, activity_date ASC, created_at ASC
),
inspection_data AS (
    SELECT DISTINCT ON (tyre_id) tyre_id, activity_date AS latest_inspection_date, rtd1 AS latest_rtd1, rtd2 AS latest_rtd2
    FROM public.tyre_activity_log WHERE activity_type = 'INSPECTION' ORDER BY tyre_id, activity_date DESC, created_at DESC
),
removal_data AS (
    SELECT DISTINCT ON (tyre_id) tyre_id, activity_date AS removal_date, rtd1 AS removal_rtd, removal_reason
    FROM public.tyre_activity_log WHERE activity_type = 'REMOVAL' ORDER BY tyre_id, activity_date DESC, created_at DESC
)
SELECT
    t.id,
    coalesce(v_historical.site_id, v_active.site_id) AS site_id,
    coalesce(t.make, 'Unknown') AS brand,
    coalesce(t.size, 'Unknown') AS size,
    t.tyre_no,
    t.otd,
    coalesce(t.status, 'Stock') AS status,
    CASE WHEN t.current_vehicle_id IS NOT NULL THEN coalesce(v_active.vehicle_no, 'Unassigned') ELSE coalesce(v_historical.vehicle_no, 'Unassigned') END AS truck,
    CASE WHEN t.current_position IS NOT NULL THEN t.current_position WHEN fd.position IS NOT NULL THEN fd.position ELSE 'Stores' END AS position,
    id_data.latest_inspection_date,
    id_data.latest_rtd1,
    id_data.latest_rtd2,
    fd.first_fitment_date,
    rd.removal_date,
    rd.removal_rtd,
    coalesce(rd.removal_reason, '') AS removal_reason,
    coalesce(t.total_life_run, 0) AS life_achieved,
    NULL::uuid AS evidence_candidate_id
FROM public.tyres t
LEFT JOIN fitment_data fd ON fd.tyre_id = t.id
LEFT JOIN inspection_data id_data ON id_data.tyre_id = t.id
LEFT JOIN removal_data rd ON rd.tyre_id = t.id
LEFT JOIN public.vehicles v_active ON v_active.id = t.current_vehicle_id
LEFT JOIN public.vehicles v_historical ON v_historical.id = fd.vehicle_id;

NOTIFY pgrst, 'reload schema';
