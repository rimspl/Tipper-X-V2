-- FIX: Add RLS to scheduled_reports and report_deliveries
BEGIN;

ALTER TABLE public.scheduled_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_deliveries ENABLE ROW LEVEL SECURITY;

-- service_role: full access
CREATE POLICY "service_role_full_access" ON public.scheduled_reports
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.report_deliveries
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- authenticated managers: read/write own site's reports
CREATE POLICY "manager_select_scheduled_reports" ON public.scheduled_reports
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.role = 'manager'
        AND up.site_id = scheduled_reports.site_id
    )
  );

CREATE POLICY "manager_select_report_deliveries" ON public.report_deliveries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.scheduled_reports sr
      JOIN public.user_profiles up ON up.site_id = sr.site_id
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.role = 'manager'
        AND sr.id = report_deliveries.report_id
    )
  );

-- Revoke anon
REVOKE ALL ON public.scheduled_reports FROM anon;
REVOKE ALL ON public.report_deliveries FROM anon;

COMMIT;
