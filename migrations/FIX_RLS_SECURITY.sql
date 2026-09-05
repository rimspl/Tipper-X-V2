-- =====================================================================
-- DynaHaul X v2 — RLS SECURITY FIX
-- Run AFTER RUN_COMPLETE.sql in Supabase SQL Editor
-- Fixes: Anon access, broken policies, fitter table grants, views
-- =====================================================================

BEGIN;

-- =====================================================================
-- 1. DROP SENTINEL TABLE
-- =====================================================================
DROP TABLE IF EXISTS public.rls_disabled_in_public;

-- =====================================================================
-- 2. FIX PUBLIC TABLE POLICIES (9 tables)
--    Drop broken "Service role full access" (applies to ALL roles)
--    Replace with role-scoped policies
-- =====================================================================

-- 2a. Drop ALL existing broken policies
DROP POLICY IF EXISTS "Service role full access" ON public.customers;
DROP POLICY IF EXISTS "Service role full access" ON public.licenses;
DROP POLICY IF EXISTS "Service role full access" ON public.sites;
DROP POLICY IF EXISTS "Service role full access" ON public.user_profiles;
DROP POLICY IF EXISTS "Service role full access" ON public.vehicles;
DROP POLICY IF EXISTS "Service role full access" ON public.tyres;
DROP POLICY IF EXISTS "Service role full access" ON public.tyre_activity_log;
DROP POLICY IF EXISTS "Service role full access" ON public.fuel_trip_entries;
DROP POLICY IF EXISTS "Service role full access" ON public.observation_entries;

-- 2b. service_role: FULL ACCESS (server-side operations via API)
CREATE POLICY "service_role_full_access" ON public.customers
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.licenses
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.sites
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.user_profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.vehicles
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.tyres
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.tyre_activity_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.fuel_trip_entries
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.observation_entries
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2c. authenticated: SITE-SCOPED READ (users see only their site's data)
-- Customers: read if user belongs to a site owned by this customer
CREATE POLICY "authenticated_select_customer" ON public.customers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.customer_id = customers.id
    )
  );

-- Licenses: read if user belongs to a site under this license
CREATE POLICY "authenticated_select_license" ON public.licenses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND (up.license_id = licenses.id OR up.customer_id = licenses.customer_id)
    )
  );

-- Sites: read own site only
CREATE POLICY "authenticated_select_site" ON public.sites
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.site_id = sites.id
    )
  );

-- User profiles: read own site's users
CREATE POLICY "authenticated_select_user_profiles" ON public.user_profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.site_id = user_profiles.site_id
    )
  );

-- Vehicles: read own site's vehicles
CREATE POLICY "authenticated_select_vehicles" ON public.vehicles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.site_id = vehicles.site_id
    )
  );

-- Tyres: read own site's tyres
CREATE POLICY "authenticated_select_tyres" ON public.tyres
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.site_id = tyres.site_id
    )
  );

-- Tyre activity log: read own site's entries (via tyres table)
CREATE POLICY "authenticated_select_tyre_activity_log" ON public.tyre_activity_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tyres t
      JOIN public.user_profiles up ON up.site_id = t.site_id
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND t.id = tyre_activity_log.tyre_id
    )
  );

-- Fuel trip entries: read own site's entries
CREATE POLICY "authenticated_select_fuel_trip_entries" ON public.fuel_trip_entries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.site_id = fuel_trip_entries.site_id
    )
  );

-- Observation entries: read own site's entries
CREATE POLICY "authenticated_select_observation_entries" ON public.observation_entries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.site_id = observation_entries.site_id
    )
  );

-- 2d. authenticated: MANAGERS CAN INSERT/UPDATE their site's data
CREATE POLICY "manager_insert_vehicles" ON public.vehicles
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.role = 'manager'
        AND up.site_id = vehicles.site_id
    )
  );
CREATE POLICY "manager_update_vehicles" ON public.vehicles
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.role = 'manager'
        AND up.site_id = vehicles.site_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.role = 'manager'
        AND up.site_id = vehicles.site_id
    )
  );

CREATE POLICY "manager_insert_tyres" ON public.tyres
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.role = 'manager'
        AND up.site_id = tyres.site_id
    )
  );
CREATE POLICY "manager_update_tyres" ON public.tyres
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.role = 'manager'
        AND up.site_id = tyres.site_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.role = 'manager'
        AND up.site_id = tyres.site_id
    )
  );

CREATE POLICY "manager_insert_fuel_trip_entries" ON public.fuel_trip_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.role = 'manager'
        AND up.site_id = fuel_trip_entries.site_id
    )
  );
CREATE POLICY "manager_update_fuel_trip_entries" ON public.fuel_trip_entries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.role = 'manager'
        AND up.site_id = fuel_trip_entries.site_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.role = 'manager'
        AND up.site_id = fuel_trip_entries.site_id
    )
  );

CREATE POLICY "manager_insert_observation_entries" ON public.observation_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.role = 'manager'
        AND up.site_id = observation_entries.site_id
    )
  );
CREATE POLICY "manager_update_observation_entries" ON public.observation_entries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.role = 'manager'
        AND up.site_id = observation_entries.site_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.role = 'manager'
        AND up.site_id = observation_entries.site_id
    )
  );

-- =====================================================================
-- 3. FIX FITTER TABLE GRANTS & RLS
--    Remove anon access, enable RLS, add proper policies
-- =====================================================================

-- 3a. Revoke anon from all fitter tables + licenses
REVOKE ALL ON public.fitter_tyre_card_entries FROM anon;
REVOKE ALL ON public.fitter_pressure_check_entries FROM anon;
REVOKE ALL ON public.fitter_tyre_inspection_entries FROM anon;
REVOKE ALL ON public.fitter_tyre_removal_entries FROM anon;
REVOKE ALL ON public.fitter_observation_entries FROM anon;
REVOKE ALL ON public.licenses FROM anon;

-- 3b. Enable RLS on all fitter tables
ALTER TABLE public.fitter_tyre_card_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fitter_pressure_check_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fitter_tyre_inspection_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fitter_tyre_removal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fitter_observation_entries ENABLE ROW LEVEL SECURITY;

-- 3c. service_role: FULL ACCESS
CREATE POLICY "service_role_full_access" ON public.fitter_tyre_card_entries
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.fitter_pressure_check_entries
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.fitter_tyre_inspection_entries
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.fitter_tyre_removal_entries
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.fitter_observation_entries
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3d. authenticated: SITE-SCOPED READ + INSERT
-- Fitters and managers can read their site's fitter entries
CREATE POLICY "authenticated_select_fitter_tyre_card" ON public.fitter_tyre_card_entries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.site_id = fitter_tyre_card_entries.site_id
    )
  );
CREATE POLICY "authenticated_insert_fitter_tyre_card" ON public.fitter_tyre_card_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.site_id = fitter_tyre_card_entries.site_id
    )
  );

CREATE POLICY "authenticated_select_fitter_pressure" ON public.fitter_pressure_check_entries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.site_id = fitter_pressure_check_entries.site_id
    )
  );
CREATE POLICY "authenticated_insert_fitter_pressure" ON public.fitter_pressure_check_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.site_id = fitter_pressure_check_entries.site_id
    )
  );

CREATE POLICY "authenticated_select_fitter_inspection" ON public.fitter_tyre_inspection_entries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.site_id = fitter_tyre_inspection_entries.site_id
    )
  );
CREATE POLICY "authenticated_insert_fitter_inspection" ON public.fitter_tyre_inspection_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.site_id = fitter_tyre_inspection_entries.site_id
    )
  );

CREATE POLICY "authenticated_select_fitter_removal" ON public.fitter_tyre_removal_entries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.site_id = fitter_tyre_removal_entries.site_id
    )
  );
CREATE POLICY "authenticated_insert_fitter_removal" ON public.fitter_tyre_removal_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.site_id = fitter_tyre_removal_entries.site_id
    )
  );

CREATE POLICY "authenticated_select_fitter_observation" ON public.fitter_observation_entries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.site_id = fitter_observation_entries.site_id
    )
  );
CREATE POLICY "authenticated_insert_fitter_observation" ON public.fitter_observation_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.site_id = fitter_observation_entries.site_id
    )
  );

-- 3e. Manager: can also UPDATE fitter entries (for corrections)
CREATE POLICY "manager_update_fitter_tyre_card" ON public.fitter_tyre_card_entries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.role = 'manager'
        AND up.site_id = fitter_tyre_card_entries.site_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.role = 'manager'
        AND up.site_id = fitter_tyre_card_entries.site_id
    )
  );

CREATE POLICY "manager_update_fitter_pressure" ON public.fitter_pressure_check_entries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.role = 'manager'
        AND up.site_id = fitter_pressure_check_entries.site_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.role = 'manager'
        AND up.site_id = fitter_pressure_check_entries.site_id
    )
  );

CREATE POLICY "manager_update_fitter_inspection" ON public.fitter_tyre_inspection_entries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.role = 'manager'
        AND up.site_id = fitter_tyre_inspection_entries.site_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.role = 'manager'
        AND up.site_id = fitter_tyre_inspection_entries.site_id
    )
  );

CREATE POLICY "manager_update_fitter_removal" ON public.fitter_tyre_removal_entries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.role = 'manager'
        AND up.site_id = fitter_tyre_removal_entries.site_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.role = 'manager'
        AND up.site_id = fitter_tyre_removal_entries.site_id
    )
  );

CREATE POLICY "manager_update_fitter_observation" ON public.fitter_observation_entries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.role = 'manager'
        AND up.site_id = fitter_observation_entries.site_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.role = 'manager'
        AND up.site_id = fitter_observation_entries.site_id
    )
  );

-- =====================================================================
-- 4. FIX ALERT TABLES — ADD RLS
-- =====================================================================
ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriber_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_logs ENABLE ROW LEVEL SECURITY;

-- service_role: full access
CREATE POLICY "service_role_full_access" ON public.alert_rules
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.subscriber_contacts
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.alert_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- authenticated managers: read/write own site's alert config
CREATE POLICY "manager_select_alert_rules" ON public.alert_rules
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.role = 'manager'
        AND up.site_id = alert_rules.site_id
    )
  );
CREATE POLICY "manager_insert_alert_rules" ON public.alert_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.role = 'manager'
        AND up.site_id = alert_rules.site_id
    )
  );

CREATE POLICY "manager_select_subscriber_contacts" ON public.subscriber_contacts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.role = 'manager'
        AND up.site_id = subscriber_contacts.site_id
    )
  );

CREATE POLICY "manager_select_alert_logs" ON public.alert_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND up.role = 'manager'
        AND up.site_id = alert_logs.site_id
    )
  );

-- =====================================================================
-- 5. SECURE VIEWS — ADD RLS
-- =====================================================================
ALTER VIEW public.v_manager_tyre_records SET (security_invoker = true);
ALTER VIEW public.v_manager_inspection_records SET (security_invoker = true);
ALTER VIEW public.v_manager_pressure_events SET (security_invoker = true);

-- =====================================================================
-- 6. REVOKE PUBLIC ANON ACCESS FROM NON-ESSENTIAL TABLES
--    Only keep service_role and authenticated
-- =====================================================================
REVOKE ALL ON public.alert_rules FROM anon;
REVOKE ALL ON public.subscriber_contacts FROM anon;
REVOKE ALL ON public.alert_logs FROM anon;
REVOKE ALL ON public.fuel_trip_entries FROM anon;
REVOKE ALL ON public.observation_entries FROM anon;
REVOKE ALL ON public.tyre_activity_log FROM anon;

COMMIT;

-- =====================================================================
-- VERIFICATION QUERIES (run these AFTER applying the migration)
-- =====================================================================
-- 1. Verify no anon access on sensitive tables:
-- SELECT grantee, table_name FROM information_schema.role_grants
-- WHERE grantee = 'anon' AND table_schema = 'public';
--
-- 2. Verify RLS enabled on all tables:
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public' ORDER BY tablename;
--
-- 3. Verify policies exist:
-- SELECT schemaname, tablename, policyname, roles FROM pg_policies
-- WHERE schemaname = 'public' ORDER BY tablename, policyname;
