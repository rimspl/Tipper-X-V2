-- =====================================================================
-- Migration 015: RLS RECURSION FIX (no frontend changes required)
-- Run in Supabase SQL Editor as a single script.
--
-- Root cause of the empty Manager dashboard:
--   The policy "authenticated_select_user_profiles" self-referenced
--   public.user_profiles, and EVERY other policy sub-queried
--   public.user_profiles too. Postgres detected infinite recursion
--   and returned HTTP 500 on every authenticated read.
--
-- Fix: 3 SECURITY DEFINER helper functions read user_profiles WITHOUT
-- invoking RLS, so policies can use them instead of self-referencing
-- sub-queries. Modeled on the working v1 migration 012.
-- =====================================================================

begin;

-- ── 1. HELPER FUNCTIONS (SECURITY DEFINER = bypass RLS, no recursion) ──
create or replace function public.current_user_site_id()
returns uuid
language sql
stable
security definer
as $$
  select site_id from public.user_profiles where id = auth.uid();
$$;

create or replace function public.current_user_customer_id()
returns uuid
language sql
stable
security definer
as $$
  select customer_id from public.user_profiles where id = auth.uid();
$$;

create or replace function public.current_user_is_manager()
returns boolean
language sql
stable
security definer
as $$
  select coalesce(role = 'manager', false) from public.user_profiles where id = auth.uid();
$$;

-- ── 2. PUBLIC TABLE POLICIES (replace EXISTS(user_profiles) recursion) ──

-- customers
drop policy if exists authenticated_select_customer on public.customers;
create policy authenticated_select_customer on public.customers
  for select to authenticated
  using (id = public.current_user_customer_id());

-- licenses
drop policy if exists authenticated_select_license on public.licenses;
create policy authenticated_select_license on public.licenses
  for select to authenticated
  using (
    id = public.current_user_customer_id()
    or id in (select license_id from public.sites where id = public.current_user_site_id())
  );

-- sites
drop policy if exists authenticated_select_site on public.sites;
create policy authenticated_select_site on public.sites
  for select to authenticated
  using (id = public.current_user_site_id());

-- user_profiles  (THE recursive one — now self-reference free)
drop policy if exists authenticated_select_user_profiles on public.user_profiles;
create policy authenticated_select_user_profiles on public.user_profiles
  for select to authenticated
  using (
    id = auth.uid()
    or (site_id = public.current_user_site_id() and public.current_user_is_manager())
  );

-- vehicles
drop policy if exists authenticated_select_vehicles on public.vehicles;
create policy authenticated_select_vehicles on public.vehicles
  for select to authenticated
  using (site_id = public.current_user_site_id());

-- tyres
drop policy if exists authenticated_select_tyres on public.tyres;
create policy authenticated_select_tyres on public.tyres
  for select to authenticated
  using (site_id = public.current_user_site_id() or site_id is null);

-- tyre_activity_log
drop policy if exists authenticated_select_tyre_activity_log on public.tyre_activity_log;
create policy authenticated_select_tyre_activity_log on public.tyre_activity_log
  for select to authenticated
  using (
    vehicle_id in (select id from public.vehicles where site_id = public.current_user_site_id())
  );

-- fuel_trip_entries
drop policy if exists authenticated_select_fuel_trip_entries on public.fuel_trip_entries;
create policy authenticated_select_fuel_trip_entries on public.fuel_trip_entries
  for select to authenticated
  using (site_id = public.current_user_site_id());

-- observation_entries
drop policy if exists authenticated_select_observation_entries on public.observation_entries;
create policy authenticated_select_observation_entries on public.observation_entries
  for select to authenticated
  using (site_id = public.current_user_site_id());

-- ── 3. MANAGER WRITE POLICIES (vehicles / tyres / fuel / observation) ──
drop policy if exists manager_insert_vehicles on public.vehicles;
create policy manager_insert_vehicles on public.vehicles
  for insert to authenticated
  with check (public.current_user_is_manager() and site_id = public.current_user_site_id());

drop policy if exists manager_update_vehicles on public.vehicles;
create policy manager_update_vehicles on public.vehicles
  for update to authenticated
  using (public.current_user_is_manager() and site_id = public.current_user_site_id())
  with check (public.current_user_is_manager() and site_id = public.current_user_site_id());

drop policy if exists manager_insert_tyres on public.tyres;
create policy manager_insert_tyres on public.tyres
  for insert to authenticated
  with check (public.current_user_is_manager() and site_id = public.current_user_site_id());

drop policy if exists manager_update_tyres on public.tyres;
create policy manager_update_tyres on public.tyres
  for update to authenticated
  using (public.current_user_is_manager() and site_id = public.current_user_site_id())
  with check (public.current_user_is_manager() and site_id = public.current_user_site_id());

drop policy if exists manager_insert_fuel_trip_entries on public.fuel_trip_entries;
create policy manager_insert_fuel_trip_entries on public.fuel_trip_entries
  for insert to authenticated
  with check (public.current_user_is_manager() and site_id = public.current_user_site_id());

drop policy if exists manager_update_fuel_trip_entries on public.fuel_trip_entries;
create policy manager_update_fuel_trip_entries on public.fuel_trip_entries
  for update to authenticated
  using (public.current_user_is_manager() and site_id = public.current_user_site_id())
  with check (public.current_user_is_manager() and site_id = public.current_user_site_id());

drop policy if exists manager_insert_observation_entries on public.observation_entries;
create policy manager_insert_observation_entries on public.observation_entries
  for insert to authenticated
  with check (public.current_user_is_manager() and site_id = public.current_user_site_id());

drop policy if exists manager_update_observation_entries on public.observation_entries;
create policy manager_update_observation_entries on public.observation_entries
  for update to authenticated
  using (public.current_user_is_manager() and site_id = public.current_user_site_id())
  with check (public.current_user_is_manager() and site_id = public.current_user_site_id());

-- ── 4. FITTER STAGING TABLE POLICIES ──
drop policy if exists authenticated_select_fitter_tyre_card on public.fitter_tyre_card_entries;
create policy authenticated_select_fitter_tyre_card on public.fitter_tyre_card_entries
  for select to authenticated
  using (site_id = public.current_user_site_id());
drop policy if exists authenticated_insert_fitter_tyre_card on public.fitter_tyre_card_entries;
create policy authenticated_insert_fitter_tyre_card on public.fitter_tyre_card_entries
  for insert to authenticated
  with check (user_id = auth.uid() and site_id = public.current_user_site_id());
drop policy if exists manager_update_fitter_tyre_card on public.fitter_tyre_card_entries;
create policy manager_update_fitter_tyre_card on public.fitter_tyre_card_entries
  for update to authenticated
  using (public.current_user_is_manager() and site_id = public.current_user_site_id())
  with check (public.current_user_is_manager() and site_id = public.current_user_site_id());

drop policy if exists authenticated_select_fitter_pressure on public.fitter_pressure_check_entries;
create policy authenticated_select_fitter_pressure on public.fitter_pressure_check_entries
  for select to authenticated
  using (site_id = public.current_user_site_id());
drop policy if exists authenticated_insert_fitter_pressure on public.fitter_pressure_check_entries;
create policy authenticated_insert_fitter_pressure on public.fitter_pressure_check_entries
  for insert to authenticated
  with check (user_id = auth.uid() and site_id = public.current_user_site_id());
drop policy if exists manager_update_fitter_pressure on public.fitter_pressure_check_entries;
create policy manager_update_fitter_pressure on public.fitter_pressure_check_entries
  for update to authenticated
  using (public.current_user_is_manager() and site_id = public.current_user_site_id())
  with check (public.current_user_is_manager() and site_id = public.current_user_site_id());

drop policy if exists authenticated_select_fitter_inspection on public.fitter_tyre_inspection_entries;
create policy authenticated_select_fitter_inspection on public.fitter_tyre_inspection_entries
  for select to authenticated
  using (site_id = public.current_user_site_id());
drop policy if exists authenticated_insert_fitter_inspection on public.fitter_tyre_inspection_entries;
create policy authenticated_insert_fitter_inspection on public.fitter_tyre_inspection_entries
  for insert to authenticated
  with check (user_id = auth.uid() and site_id = public.current_user_site_id());
drop policy if exists manager_update_fitter_inspection on public.fitter_tyre_inspection_entries;
create policy manager_update_fitter_inspection on public.fitter_tyre_inspection_entries
  for update to authenticated
  using (public.current_user_is_manager() and site_id = public.current_user_site_id())
  with check (public.current_user_is_manager() and site_id = public.current_user_site_id());

drop policy if exists authenticated_select_fitter_removal on public.fitter_tyre_removal_entries;
create policy authenticated_select_fitter_removal on public.fitter_tyre_removal_entries
  for select to authenticated
  using (site_id = public.current_user_site_id());
drop policy if exists authenticated_insert_fitter_removal on public.fitter_tyre_removal_entries;
create policy authenticated_insert_fitter_removal on public.fitter_tyre_removal_entries
  for insert to authenticated
  with check (user_id = auth.uid() and site_id = public.current_user_site_id());
drop policy if exists manager_update_fitter_removal on public.fitter_tyre_removal_entries;
create policy manager_update_fitter_removal on public.fitter_tyre_removal_entries
  for update to authenticated
  using (public.current_user_is_manager() and site_id = public.current_user_site_id())
  with check (public.current_user_is_manager() and site_id = public.current_user_site_id());

drop policy if exists authenticated_select_fitter_observation on public.fitter_observation_entries;
create policy authenticated_select_fitter_observation on public.fitter_observation_entries
  for select to authenticated
  using (site_id = public.current_user_site_id());
drop policy if exists authenticated_insert_fitter_observation on public.fitter_observation_entries;
create policy authenticated_insert_fitter_observation on public.fitter_observation_entries
  for insert to authenticated
  with check (user_id = auth.uid() and site_id = public.current_user_site_id());
drop policy if exists manager_update_fitter_observation on public.fitter_observation_entries;
create policy manager_update_fitter_observation on public.fitter_observation_entries
  for update to authenticated
  using (public.current_user_is_manager() and site_id = public.current_user_site_id())
  with check (public.current_user_is_manager() and site_id = public.current_user_site_id());

-- ── 5. ALERT TABLE POLICIES ──
drop policy if exists manager_select_alert_rules on public.alert_rules;
create policy manager_select_alert_rules on public.alert_rules
  for select to authenticated
  using (public.current_user_is_manager() and site_id = public.current_user_site_id());
drop policy if exists manager_insert_alert_rules on public.alert_rules;
create policy manager_insert_alert_rules on public.alert_rules
  for insert to authenticated
  with check (public.current_user_is_manager() and site_id = public.current_user_site_id());

drop policy if exists manager_select_subscriber_contacts on public.subscriber_contacts;
create policy manager_select_subscriber_contacts on public.subscriber_contacts
  for select to authenticated
  using (public.current_user_is_manager() and site_id = public.current_user_site_id());

drop policy if exists manager_select_alert_logs on public.alert_logs;
create policy manager_select_alert_logs on public.alert_logs
  for select to authenticated
  using (public.current_user_is_manager() and site_id = public.current_user_site_id());

-- ── 6. OPS SCHEMA POLICIES (also sub-queried user_profiles → fix them) ──
drop policy if exists ops_offline_submissions_select_site on ops.offline_submissions;
create policy ops_offline_submissions_select_site on ops.offline_submissions
  for select to authenticated
  using (site_id = public.current_user_site_id());

drop policy if exists ops_offline_submissions_insert_self on ops.offline_submissions;
create policy ops_offline_submissions_insert_self on ops.offline_submissions
  for insert to authenticated
  with check (user_id = auth.uid() and site_id = public.current_user_site_id());

drop policy if exists ops_offline_submissions_update_manager on ops.offline_submissions;
create policy ops_offline_submissions_update_manager on ops.offline_submissions
  for update to authenticated
  using (public.current_user_is_manager() and site_id = public.current_user_site_id())
  with check (public.current_user_is_manager() and site_id = public.current_user_site_id());

drop policy if exists ops_submission_media_select_site on ops.submission_media;
create policy ops_submission_media_select_site on ops.submission_media
  for select to authenticated
  using (
    exists (
      select 1 from ops.offline_submissions os
      where os.id = submission_media.submission_id
        and os.site_id = public.current_user_site_id()
    )
  );

drop policy if exists ops_processing_jobs_select_manager on ops.processing_jobs;
create policy ops_processing_jobs_select_manager on ops.processing_jobs
  for select to authenticated
  using (
    public.current_user_is_manager()
    and exists (
      select 1 from ops.offline_submissions os
      where os.id = processing_jobs.submission_id
        and os.site_id = public.current_user_site_id()
    )
  );

drop policy if exists ops_extracted_fields_select_site on ops.extracted_fields;
create policy ops_extracted_fields_select_site on ops.extracted_fields
  for select to authenticated
  using (
    exists (
      select 1 from ops.offline_submissions os
      where os.id = extracted_fields.submission_id
        and os.site_id = public.current_user_site_id()
    )
  );

drop policy if exists ops_review_queue_select_manager on ops.review_queue;
create policy ops_review_queue_select_manager on ops.review_queue
  for select to authenticated
  using (
    public.current_user_is_manager()
    and exists (
      select 1 from ops.offline_submissions os
      where os.id = review_queue.submission_id
        and os.site_id = public.current_user_site_id()
    )
  );

drop policy if exists ops_review_queue_update_manager on ops.review_queue;
create policy ops_review_queue_update_manager on ops.review_queue
  for update to authenticated
  using (
    public.current_user_is_manager()
    and exists (
      select 1 from ops.offline_submissions os
      where os.id = review_queue.submission_id
        and os.site_id = public.current_user_site_id()
    )
  )
  with check (
    public.current_user_is_manager()
    and exists (
      select 1 from ops.offline_submissions os
      where os.id = review_queue.submission_id
        and os.site_id = public.current_user_site_id()
    )
  );

drop policy if exists ops_final_reports_select_site on ops.final_reports;
create policy ops_final_reports_select_site on ops.final_reports
  for select to authenticated
  using (
    exists (
      select 1 from ops.offline_submissions os
      where os.id = final_reports.submission_id
        and os.site_id = public.current_user_site_id()
    )
  );

drop policy if exists ops_audit_log_select_manager on ops.audit_log;
create policy ops_audit_log_select_manager on ops.audit_log
  for select to authenticated
  using (public.current_user_is_manager());

-- ── 7. KEEP EXISTING service_role_full_access policies (they bypass RLS) ──

commit;
