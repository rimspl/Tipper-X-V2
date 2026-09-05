-- Fix tyre_activity_log: drop old table with wrong schema, recreate correctly
DROP TABLE IF EXISTS public.tyre_activity_log CASCADE;

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

-- Also rebuild the views that depend on tyre_activity_log
CREATE OR REPLACE VIEW public.v_manager_inspection_records AS
SELECT l.id, v.site_id, t.tyre_no, v.vehicle_no as truck,
  coalesce(l.position_code_norm, l.position) as position, l.activity_date as date,
  l.meter_reading as odometer, l.rtd1, l.rtd2,
  abs(coalesce(l.rtd1, 0) - coalesce(l.rtd2, 0)) as rtd_difference,
  coalesce(l.psi_found, l.psi_corrected) as psi, coalesce(l.remarks, '') as remarks, l.activity_type
FROM public.tyre_activity_log l
JOIN public.tyres t on t.id = l.tyre_id
LEFT JOIN public.vehicles v on v.id = l.vehicle_id;

CREATE OR REPLACE VIEW public.v_manager_pressure_events AS
SELECT l.id, v.site_id, l.tyre_id, t.tyre_no, v.vehicle_no as truck,
  coalesce(l.position_code_norm, l.position) as position, l.activity_date as date,
  l.psi_found, l.psi_corrected
FROM public.tyre_activity_log l
JOIN public.tyres t on t.id = l.tyre_id
LEFT JOIN public.vehicles v on v.id = l.vehicle_id
WHERE l.activity_type = 'PRESSURE_CHECK' OR l.activity_type = 'INSPECTION' OR l.activity_type = 'FITMENT';

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
    t.id, coalesce(v_historical.site_id, v_active.site_id) AS site_id, coalesce(t.make, 'Unknown') AS brand, coalesce(t.size, 'Unknown') AS size,
    t.tyre_no, t.otd, coalesce(t.status, 'Stock') AS status,
    CASE WHEN t.current_vehicle_id IS NOT NULL THEN coalesce(v_active.vehicle_no, 'Unassigned') ELSE coalesce(v_historical.vehicle_no, 'Unassigned') END AS truck,
    CASE WHEN t.current_position IS NOT NULL THEN t.current_position WHEN fd.position IS NOT NULL THEN fd.position ELSE 'Stores' END AS position,
    id_data.latest_inspection_date, id_data.latest_rtd1, id_data.latest_rtd2,
    fd.first_fitment_date, rd.removal_date, rd.removal_rtd,
    coalesce(rd.removal_reason, '') AS removal_reason, coalesce(t.total_life_run, 0) AS life_achieved,
    NULL::uuid AS evidence_candidate_id
FROM public.tyres t
LEFT JOIN fitment_data fd ON fd.tyre_id = t.id
LEFT JOIN inspection_data id_data ON id_data.tyre_id = t.id
LEFT JOIN removal_data rd ON rd.tyre_id = t.id
LEFT JOIN public.vehicles v_active ON v_active.id = t.current_vehicle_id
LEFT JOIN public.vehicles v_historical ON v_historical.id = fd.vehicle_id;

-- Reload PostgREST schema
NOTIFY pgrst, 'reload schema';
