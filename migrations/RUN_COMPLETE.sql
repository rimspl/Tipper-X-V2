-- =====================================================================
-- DynaHaul X v2 — CLEAN SCHEMA (Migrations 001–016 + seed)
-- Paste into Supabase SQL Editor → Run
-- Safe to re-run. Drops existing public tables and recreates correctly.
-- =====================================================================

-- =====================================================================
-- STEP 1: Ops schema (001–002)
-- =====================================================================
begin;
create extension if not exists pgcrypto;
create schema if not exists ops;

create or replace function ops.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create table if not exists ops.offline_submissions (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  device_id text not null,
  local_submission_id text not null,
  form_type text not null check (form_type in ('tyre_card','pressure_check','tyre_inspection','tyre_removal','observation')),
  site_id uuid not null,
  user_id uuid not null,
  context_json jsonb not null default '{}'::jsonb,
  capture_started_at timestamptz,
  capture_completed_at timestamptz,
  sync_status text not null default 'registered' check (sync_status in ('registered','uploading','uploaded','failed')),
  processing_status text not null default 'queued' check (processing_status in ('queued','running','needs_review','completed','failed')),
  app_version text,
  schema_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (device_id, local_submission_id, form_type)
);
drop trigger if exists trg_offline_submissions_updated_at on ops.offline_submissions;
create trigger trg_offline_submissions_updated_at before update on ops.offline_submissions for each row execute function ops.touch_updated_at();

create table if not exists ops.submission_media (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references ops.offline_submissions(id) on delete cascade,
  step_id text not null, storage_path text not null,
  media_kind text not null check (media_kind in ('image','video','audio')),
  sha256 text not null, captured_at timestamptz,
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists ops.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references ops.offline_submissions(id) on delete cascade,
  job_type text not null, status text not null default 'queued' check (status in ('queued','running','completed','failed','retry_wait')),
  attempt_count int not null default 0, last_error text,
  next_run_at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (submission_id, job_type)
);
drop trigger if exists trg_processing_jobs_updated_at on ops.processing_jobs;
create trigger trg_processing_jobs_updated_at before update on ops.processing_jobs for each row execute function ops.touch_updated_at();

create table if not exists ops.extracted_fields (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references ops.offline_submissions(id) on delete cascade,
  field_key text not null, field_value jsonb not null, confidence numeric(5,4),
  source_media_id uuid references ops.submission_media(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists ops.review_queue (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references ops.offline_submissions(id) on delete cascade,
  reason text not null, priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'pending' check (status in ('pending','in_progress','resolved','rejected')),
  assigned_to uuid, created_at timestamptz not null default now(), resolved_at timestamptz
);
create table if not exists ops.final_reports (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references ops.offline_submissions(id) on delete cascade,
  final_payload jsonb not null,
  approval_mode text not null check (approval_mode in ('auto','manager_approved','manager_corrected')),
  approved_by uuid, approved_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists ops.audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null, entity_id uuid not null, event_type text not null,
  actor_id uuid, payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_ops_submission_media_unique_step on ops.submission_media (submission_id, step_id);
create index if not exists idx_ops_offline_submissions_site_form_created on ops.offline_submissions (site_id, form_type, created_at desc);
create index if not exists idx_ops_offline_submissions_sync_processing on ops.offline_submissions (sync_status, processing_status);
create index if not exists idx_ops_offline_submissions_user_created on ops.offline_submissions (user_id, created_at desc);
create index if not exists idx_ops_offline_submissions_context_gin on ops.offline_submissions using gin (context_json);
commit;

-- =====================================================================
-- STEP 2: Drop ALL existing public tables (wrong schema from old query)
-- =====================================================================
DROP VIEW IF EXISTS public.v_manager_tyre_records CASCADE;
DROP VIEW IF EXISTS public.v_manager_inspection_records CASCADE;
DROP VIEW IF EXISTS public.v_manager_pressure_events CASCADE;
DROP VIEW IF EXISTS public.v_tyre_event_ledger CASCADE;
DROP VIEW IF EXISTS public.v_current_vehicle_tyre_layout CASCADE;
DROP VIEW IF EXISTS public.v_tyre_latest_pressure CASCADE;
DROP VIEW IF EXISTS public.v_tyre_latest_inspection CASCADE;
DROP VIEW IF EXISTS public.v_tyre_lifecycle_summary CASCADE;
DROP TABLE IF EXISTS public.tyre_removals CASCADE;
DROP TABLE IF EXISTS public.tyre_installations CASCADE;
DROP TABLE IF EXISTS public.fuel_trip_entries CASCADE;
DROP TABLE IF EXISTS public.observation_entries CASCADE;
DROP TABLE IF EXISTS public.fitter_tyre_card_entries CASCADE;
DROP TABLE IF EXISTS public.fitter_pressure_check_entries CASCADE;
DROP TABLE IF EXISTS public.fitter_tyre_inspection_entries CASCADE;
DROP TABLE IF EXISTS public.fitter_tyre_removal_entries CASCADE;
DROP TABLE IF EXISTS public.fitter_observation_entries CASCADE;
DROP TABLE IF EXISTS public.alert_logs CASCADE;
DROP TABLE IF EXISTS public.alert_rules CASCADE;
DROP TABLE IF EXISTS public.subscriber_contacts CASCADE;
DROP TABLE IF EXISTS public.scheduled_reports CASCADE;
DROP TABLE IF EXISTS public.report_deliveries CASCADE;
DROP TABLE IF EXISTS public.tyre_activity_log CASCADE;
DROP TABLE IF EXISTS public.tyres CASCADE;
DROP TABLE IF EXISTS public.vehicles CASCADE;
DROP TABLE IF EXISTS public.user_profiles CASCADE;
DROP TABLE IF EXISTS public.sites CASCADE;
DROP TABLE IF EXISTS public.licenses CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;

-- =====================================================================
-- STEP 3: Create all public tables with CORRECT schema (004)
-- =====================================================================
begin;
create extension if not exists pgcrypto;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Default Customer',
  created_at timestamptz not null default now()
);

create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  license_key text unique not null,
  is_active boolean default true,
  is_setup_complete boolean default false,
  customer_id uuid references public.customers(id),
  max_managers int default 2,
  max_fitters int default 5,
  created_at timestamptz not null default now()
);

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id),
  license_id uuid references public.licenses(id),
  site_name text not null default 'Default Site',
  created_at timestamptz not null default now(),
  target_tyre_life numeric,
  target_life_unit text default 'HMR',
  tyre_price numeric,
  annual_demand numeric,
  fleet_size numeric,
  default_tipper_model_id uuid,
  invite_code text,
  pressure_model_enabled boolean default false,
  pressure_base_psi numeric,
  pressure_fuel_price numeric,
  pressure_daily_km numeric,
  pressure_fuel_efficiency_kmpl numeric,
  pressure_target_tyre_life_km numeric,
  pressure_temp_zone integer default 45,
  pressure_tires_per_truck integer default 6,
  pressure_calibration_days integer default 30,
  pressure_max_interpolation_days integer default 7,
  retread_cost numeric,
  rate_per_km numeric,
  enabled_reports jsonb,
  onboarding_completed boolean default false
);

create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique,
  site_id uuid references public.sites(id),
  customer_id uuid references public.customers(id),
  license_id uuid references public.licenses(id),
  username text,
  full_name text,
  email text,
  role text,
  user_type text,
  is_active boolean default true,
  created_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  site_id uuid references public.sites(id),
  tipper_model_id uuid,
  vehicle_no text not null,
  vehicle_no_norm text,
  current_odometer numeric default 0,
  status text default 'Active',
  created_at timestamptz not null default now()
);
create unique index if not exists idx_vehicles_vehicle_no on public.vehicles (vehicle_no);
create index if not exists idx_vehicles_site on public.vehicles (site_id);

create table if not exists public.tyres (
  id uuid primary key default gen_random_uuid(),
  site_id uuid,
  tyre_no text not null,
  tyre_no_norm text,
  make text,
  model text,
  size text,
  otd numeric,
  current_vehicle_id uuid references public.vehicles(id),
  current_position text,
  status text default 'New',
  total_life_run numeric default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_tyres_tyre_no on public.tyres (tyre_no);
create index if not exists idx_tyres_vehicle on public.tyres (current_vehicle_id);

create table if not exists public.tyre_activity_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  activity_date date default current_date,
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
  life_achieved_in_this_run numeric default 0,
  removal_reason text,
  disposition text,
  remarks text,
  user_id uuid,
  source_type text,
  source_pk text,
  projection_version integer not null default 1
);
create index if not exists idx_activity_tyre_date on public.tyre_activity_log (tyre_id, activity_date desc);
create index if not exists idx_activity_vehicle_date on public.tyre_activity_log (vehicle_id, activity_date desc);

create table if not exists public.observation_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  customer_id uuid, site_id uuid, vehicle_id uuid, tyre_id uuid,
  category text, observation_category text, observation_type text,
  observation text, severity text default 'Medium'
);

create table if not exists public.fuel_trip_entries (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  created_by uuid references public.user_profiles(id) on delete set null,
  truck_no text not null,
  entry_date date not null,
  total_trips numeric not null default 0,
  total_kms numeric not null default 0,
  total_fuel_consumed numeric not null default 0,
  total_production numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_fuel_trip_entries_site_truck_date on public.fuel_trip_entries (site_id, truck_no, entry_date);
drop trigger if exists trg_fuel_trip_entries_updated_at on public.fuel_trip_entries;
create trigger trg_fuel_trip_entries_updated_at before update on public.fuel_trip_entries for each row execute function public.touch_updated_at();
commit;

-- =====================================================================
-- STEP 4: Fitter form tables (006)
-- =====================================================================
begin;
create table if not exists public.fitter_tyre_card_entries (
  id uuid primary key default gen_random_uuid(), submission_id uuid unique,
  site_id uuid, user_id uuid, device_id text, local_submission_id text,
  capture_started_at timestamptz, capture_completed_at timestamptz,
  approval_mode text, pipeline_status text,
  tyre_serial text, make text, size text, vehicle_no text, position_code text,
  meter_reading numeric, rtd1 numeric, rtd2 numeric, fitment_type text,
  raw_payload jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.fitter_pressure_check_entries (
  id uuid primary key default gen_random_uuid(), submission_id uuid unique,
  site_id uuid, user_id uuid, device_id text, local_submission_id text,
  capture_started_at timestamptz, capture_completed_at timestamptz,
  approval_mode text, pipeline_status text,
  tyre_serial text, vehicle_no text, position_code text,
  found_psi numeric, target_psi numeric default 120, variance numeric,
  adjusted boolean, action text, raw_payload jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.fitter_tyre_inspection_entries (
  id uuid primary key default gen_random_uuid(), submission_id uuid unique,
  site_id uuid, user_id uuid, device_id text, local_submission_id text,
  capture_started_at timestamptz, capture_completed_at timestamptz,
  approval_mode text, pipeline_status text,
  tyre_serial text, vehicle_no text, position_code text,
  meter_reading numeric, rtd1 numeric, rtd2 numeric, damage_class text,
  severity text, remarks text, raw_payload jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.fitter_tyre_removal_entries (
  id uuid primary key default gen_random_uuid(), submission_id uuid unique,
  site_id uuid, user_id uuid, device_id text, local_submission_id text,
  capture_started_at timestamptz, capture_completed_at timestamptz,
  approval_mode text, pipeline_status text,
  tyre_serial text, vehicle_no text, position_code text,
  fitment_reading numeric, current_reading numeric, life_achieved numeric,
  removal_reason text, disposition text, rtd1 numeric, rtd2 numeric, remarks text,
  raw_payload jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.fitter_observation_entries (
  id uuid primary key default gen_random_uuid(), submission_id uuid unique,
  site_id uuid, user_id uuid, device_id text, local_submission_id text,
  capture_started_at timestamptz, capture_completed_at timestamptz,
  approval_mode text, pipeline_status text,
  vehicle_no text, position_code text, category text, subcategory text,
  summary_text text, risk_level text, suggested_action text,
  raw_payload jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_fitter_obs_submission on public.fitter_observation_entries(submission_id);
create index if not exists idx_fitter_obs_site on public.fitter_observation_entries(site_id);
grant select, insert, update on public.fitter_tyre_card_entries to anon, authenticated, service_role;
grant select, insert, update on public.fitter_pressure_check_entries to anon, authenticated, service_role;
grant select, insert, update on public.fitter_tyre_inspection_entries to anon, authenticated, service_role;
grant select, insert, update on public.fitter_tyre_removal_entries to anon, authenticated, service_role;
grant select, insert, update on public.fitter_observation_entries to anon, authenticated, service_role;
grant select, insert, update on public.licenses to anon, authenticated, service_role;
commit;

-- =====================================================================
-- STEP 5: Normalize functions + triggers (009)
-- =====================================================================
begin;

create or replace function public.normalize_vehicle_no(value text)
returns text language sql immutable as $$
  select nullif(regexp_replace(upper(coalesce(value, '')), '[^A-Z0-9]', '', 'g'), '');
$$;

create or replace function public.format_vehicle_no(value text)
returns text language plpgsql immutable as $$
declare key text := public.normalize_vehicle_no(value);
begin
  if key is null then return null; end if;
  if key ~ '^[A-Z]{1,3}[0-9]{1,4}$' then return regexp_replace(key, '^([A-Z]+)([0-9]+)$', '\1-\2'); end if;
  return key;
end;
$$;

create or replace function public.normalize_tyre_serial(value text)
returns text language sql immutable as $$
  select nullif(regexp_replace(upper(coalesce(value, '')), '[^A-Z0-9]', '', 'g'), '');
$$;

create or replace function public.normalize_position_code(value text)
returns text language plpgsql immutable as $$
declare key text := regexp_replace(upper(coalesce(value, '')), '[^A-Z0-9]', '', 'g');
begin
  if key = '' then return null; end if;
  if key = 'RLI' then return 'AX3LI'; end if;
  if key = 'RLO' then return 'AX3LO'; end if;
  if key = 'RRI' then return 'AX3RI'; end if;
  if key = 'RRO' then return 'AX3RO'; end if;
  if key in ('FL','FR','FL2','FR2','AX3LO','AX3LI','AX3RO','AX3RI','AX4LO','AX4LI','AX4RO','AX4RI') then return key; end if;
  return null;
end;
$$;

create or replace function public.trg_normalize_vehicle_identity()
returns trigger language plpgsql as $$
begin
  new.vehicle_no := public.format_vehicle_no(new.vehicle_no);
  new.vehicle_no_norm := public.normalize_vehicle_no(new.vehicle_no);
  if new.vehicle_no_norm is null then raise exception 'vehicle_no is required'; end if;
  return new;
end;
$$;
drop trigger if exists trg_normalize_vehicle_identity on public.vehicles;
create trigger trg_normalize_vehicle_identity before insert or update on public.vehicles for each row execute function public.trg_normalize_vehicle_identity();

create or replace function public.trg_normalize_tyre_identity()
returns trigger language plpgsql as $$
begin
  new.tyre_no := public.normalize_tyre_serial(new.tyre_no);
  new.tyre_no_norm := public.normalize_tyre_serial(new.tyre_no);
  if new.tyre_no_norm is null then raise exception 'tyre_no is required'; end if;
  if new.current_position is not null then new.current_position := public.normalize_position_code(new.current_position); end if;
  return new;
end;
$$;
drop trigger if exists trg_normalize_tyre_identity on public.tyres;
create trigger trg_normalize_tyre_identity before insert or update on public.tyres for each row execute function public.trg_normalize_tyre_identity();

create or replace function public.trg_normalize_tyre_activity_log()
returns trigger language plpgsql as $$
begin
  new.activity_type := upper(coalesce(new.activity_type, ''));
  new.position_code_norm := public.normalize_position_code(new.position);
  if new.position_code_norm is not null then new.position := new.position_code_norm; end if;
  if new.projection_version is null then new.projection_version := 1; end if;
  return new;
end;
$$;
drop trigger if exists trg_normalize_tyre_activity_log on public.tyre_activity_log;
create trigger trg_normalize_tyre_activity_log before insert or update on public.tyre_activity_log for each row execute function public.trg_normalize_tyre_activity_log();

create or replace function public.sync_tyre_state_cache_from_ledger(p_tyre_id uuid default null)
returns void language plpgsql as $$
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

create or replace function public.trg_refresh_tyre_state_from_activity()
returns trigger language plpgsql as $$
begin
  if new.tyre_id is not null then perform public.sync_tyre_state_cache_from_ledger(new.tyre_id); end if;
  if new.vehicle_id is not null and new.meter_reading is not null then
    update public.vehicles set current_odometer = greatest(coalesce(current_odometer, 0), new.meter_reading) where id = new.vehicle_id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_refresh_tyre_state_from_activity on public.tyre_activity_log;
create trigger trg_refresh_tyre_state_from_activity after insert or update on public.tyre_activity_log for each row execute function public.trg_refresh_tyre_state_from_activity();

create unique index if not exists idx_vehicles_site_vehicle_no_norm on public.vehicles (site_id, vehicle_no_norm) where vehicle_no_norm is not null;
create unique index if not exists idx_tyres_tyre_no_norm on public.tyres (tyre_no_norm) where tyre_no_norm is not null;
create index if not exists idx_tyre_activity_norm_position on public.tyre_activity_log (vehicle_id, position_code_norm, activity_date desc, created_at desc);

create table if not exists ops.domain_projection_journal (
  id uuid primary key default gen_random_uuid(),
  source_type text not null, source_pk text not null,
  submission_id uuid references ops.offline_submissions(id) on delete set null,
  projection_version integer not null default 1,
  status text not null default 'running' check (status in ('running','applied','failed','skipped')),
  applied_at timestamptz, error_message text,
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (source_type, source_pk, projection_version)
);
drop trigger if exists trg_domain_projection_journal_updated_at on ops.domain_projection_journal;
create trigger trg_domain_projection_journal_updated_at before update on ops.domain_projection_journal for each row execute function ops.touch_updated_at();

alter table ops.offline_submissions
  add column if not exists projection_version integer not null default 1,
  add column if not exists projected_to_domain boolean not null default false,
  add column if not exists projected_at timestamptz,
  add column if not exists projection_error text;

create index if not exists idx_offline_submissions_projected on ops.offline_submissions (projected_to_domain, projection_version, created_at desc);
grant all privileges on table ops.domain_projection_journal to service_role;
commit;

-- =====================================================================
-- STEP 6: Manager analytics views (011)
-- =====================================================================
begin;

create or replace view public.v_manager_tyre_records as
with fitment_data as (
    select distinct on (tyre_id) tyre_id, activity_date as first_fitment_date, vehicle_id, position
    from public.tyre_activity_log where activity_type = 'FITMENT' order by tyre_id, activity_date asc, created_at asc
),
inspection_data as (
    select distinct on (tyre_id) tyre_id, activity_date as latest_inspection_date, rtd1 as latest_rtd1, rtd2 as latest_rtd2
    from public.tyre_activity_log where activity_type = 'INSPECTION' order by tyre_id, activity_date desc, created_at desc
),
removal_data as (
    select distinct on (tyre_id) tyre_id, activity_date as removal_date, rtd1 as removal_rtd, removal_reason
    from public.tyre_activity_log where activity_type = 'REMOVAL' order by tyre_id, activity_date desc, created_at desc
),
evidence_candidates as (
    select distinct on (context_json->>'tyre_no') (context_json->>'tyre_no') as tyre_no_key, id as evidence_candidate_id
    from ops.offline_submissions order by context_json->>'tyre_no', created_at desc
)
select
    t.id, v_active.site_id, coalesce(t.make, 'Unknown') as brand, coalesce(t.size, 'Unknown') as size,
    t.tyre_no, t.otd, coalesce(t.status, 'Stock') as status,
    case when t.current_vehicle_id is not null then coalesce(v_active.vehicle_no, 'Unassigned') else coalesce(v_historical.vehicle_no, 'Unassigned') end as truck,
    case when t.current_position is not null then t.current_position when fd.position is not null then fd.position else 'Stores' end as position,
    id_data.latest_inspection_date, id_data.latest_rtd1, id_data.latest_rtd2,
    fd.first_fitment_date, rd.removal_date, rd.removal_rtd,
    coalesce(rd.removal_reason, '') as removal_reason, coalesce(t.total_life_run, 0) as life_achieved,
    ec.evidence_candidate_id
from public.tyres t
left join fitment_data fd on fd.tyre_id = t.id
left join inspection_data id_data on id_data.tyre_id = t.id
left join removal_data rd on rd.tyre_id = t.id
left join public.vehicles v_active on v_active.id = t.current_vehicle_id
left join public.vehicles v_historical on v_historical.id = fd.vehicle_id
left join evidence_candidates ec on public.normalize_tyre_serial(ec.tyre_no_key) = public.normalize_tyre_serial(t.tyre_no);

create or replace view public.v_manager_inspection_records as
select l.id, v.site_id, t.tyre_no, v.vehicle_no as truck,
  coalesce(l.position_code_norm, l.position) as position, l.activity_date as date,
  l.meter_reading as odometer, l.rtd1, l.rtd2,
  abs(coalesce(l.rtd1, 0) - coalesce(l.rtd2, 0)) as rtd_difference,
  coalesce(l.psi_found, l.psi_corrected) as psi, coalesce(l.remarks, '') as remarks, l.activity_type
from public.tyre_activity_log l
join public.tyres t on t.id = l.tyre_id
left join public.vehicles v on v.id = l.vehicle_id;

create or replace view public.v_manager_pressure_events as
select l.id, v.site_id, l.tyre_id, t.tyre_no, v.vehicle_no as truck,
  coalesce(l.position_code_norm, l.position) as position, l.activity_date as date,
  l.psi_found as psi_found, l.psi_corrected as psi_corrected
from public.tyre_activity_log l
join public.tyres t on t.id = l.tyre_id
join public.vehicles v on v.id = l.vehicle_id
where l.activity_type = 'PRESSURE_CHECK' or l.activity_type = 'INSPECTION' or l.activity_type = 'FITMENT';

grant select on public.v_manager_tyre_records to authenticated;
grant select on public.v_manager_inspection_records to authenticated;
grant select on public.v_manager_pressure_events to authenticated;

create or replace view public.v_tyre_event_ledger as
select l.id as event_id, l.activity_date, l.created_at, l.activity_type, l.source_type, l.source_pk, l.projection_version,
  l.tyre_id, t.tyre_no, t.tyre_no_norm, t.make, t.size,
  l.vehicle_id, v.site_id, v.vehicle_no, v.vehicle_no_norm,
  coalesce(l.position_code_norm, public.normalize_position_code(l.position)) as position_code,
  l.meter_reading, l.rtd1, l.rtd2, l.psi_found, l.psi_corrected,
  l.life_achieved_in_this_run, l.removal_reason, l.disposition, l.remarks, l.user_id
from public.tyre_activity_log l
left join public.tyres t on t.id = l.tyre_id
left join public.vehicles v on v.id = l.vehicle_id;

create or replace view public.v_tyre_lifecycle_summary as
with fitment_stats as (
  select tyre_id,
    min(activity_date) filter (where activity_type = 'FITMENT') as first_fitment_date,
    max(activity_date) filter (where activity_type = 'FITMENT') as last_fitment_date,
    max(activity_date) filter (where activity_type = 'INSPECTION') as last_inspection_date,
    max(activity_date) filter (where activity_type = 'REMOVAL') as last_removal_date,
    sum(coalesce(life_achieved_in_this_run, 0)) as total_life_run_from_log
  from public.tyre_activity_log where tyre_id is not null group by tyre_id
)
select t.id as tyre_id, t.tyre_no, t.tyre_no_norm, t.make, t.size, t.status,
  t.current_vehicle_id, v.vehicle_no, t.current_position,
  fs.first_fitment_date, fs.last_fitment_date, fs.last_inspection_date, fs.last_removal_date,
  coalesce(fs.total_life_run_from_log, 0) as total_life_run_from_log,
  coalesce(t.total_life_run, 0) as total_life_run_cached
from public.tyres t left join fitment_stats fs on fs.tyre_id = t.id left join public.vehicles v on v.id = t.current_vehicle_id;

grant select on public.v_tyre_event_ledger to authenticated;
grant select on public.v_tyre_lifecycle_summary to authenticated;
commit;

-- =====================================================================
-- STEP 7: Alert tables (015 — uses 'enabled' column, 'sites' FK)
-- =====================================================================
CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('pressure_drop','fitment_overdue','inspection_due','tyre_removed','rtd_threshold')),
  alert_type TEXT,
  threshold_value NUMERIC,
  threshold_unit TEXT,
  is_active BOOLEAN DEFAULT true,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alert_rules_site ON alert_rules(site_id);
CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON alert_rules(enabled) WHERE enabled = true;

CREATE TABLE IF NOT EXISTS subscriber_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  full_name TEXT, name TEXT, phone TEXT, mobile TEXT,
  role TEXT, channels jsonb DEFAULT '["sms"]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subscriber_contacts_site ON subscriber_contacts(site_id);

CREATE TABLE IF NOT EXISTS alert_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES alert_rules(id) ON DELETE SET NULL,
  subscriber_id UUID REFERENCES subscriber_contacts(id) ON DELETE SET NULL,
  alert_type TEXT, event_type TEXT NOT NULL,
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('sms','email','whatsapp')),
  recipient TEXT NOT NULL,
  message_snippet TEXT, message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','delivered','failed')),
  provider_response TEXT, error_message TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alert_logs_site ON alert_logs(site_id);
CREATE INDEX IF NOT EXISTS idx_alert_logs_status ON alert_logs(status);
CREATE INDEX IF NOT EXISTS idx_alert_logs_created ON alert_logs(created_at DESC);

-- =====================================================================
-- STEP 8: Scheduled reports (013)
-- =====================================================================
CREATE TABLE IF NOT EXISTS scheduled_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL DEFAULT 'weekly_fleet_summary',
  schedule TEXT NOT NULL,
  recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_site ON scheduled_reports(site_id);

CREATE TABLE IF NOT EXISTS report_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES scheduled_reports(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  recipient TEXT NOT NULL,
  delivered_at TIMESTAMPTZ, error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_report_deliveries_report ON report_deliveries(report_id);
CREATE INDEX IF NOT EXISTS idx_report_deliveries_status ON report_deliveries(status);

-- =====================================================================
-- STEP 9: RLS (003) — service_role full access on all public tables
-- =====================================================================
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tyres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tyre_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_trip_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.observation_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON public.customers;
DROP POLICY IF EXISTS "Service role full access" ON public.licenses;
DROP POLICY IF EXISTS "Service role full access" ON public.sites;
DROP POLICY IF EXISTS "Service role full access" ON public.user_profiles;
DROP POLICY IF EXISTS "Service role full access" ON public.vehicles;
DROP POLICY IF EXISTS "Service role full access" ON public.tyres;
DROP POLICY IF EXISTS "Service role full access" ON public.tyre_activity_log;
DROP POLICY IF EXISTS "Service role full access" ON public.fuel_trip_entries;
DROP POLICY IF EXISTS "Service role full access" ON public.observation_entries;

CREATE POLICY "Service role full access" ON public.customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.licenses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.sites FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.user_profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.vehicles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.tyres FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.tyre_activity_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.fuel_trip_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.observation_entries FOR ALL USING (true) WITH CHECK (true);

-- =====================================================================
-- STEP 10: Seed default data
-- =====================================================================
INSERT INTO public.licenses (license_key, is_active, is_setup_complete)
VALUES ('DYNHAUL-DEFAULT', true, true)
ON CONFLICT (license_key) DO NOTHING;

INSERT INTO public.customers (name)
SELECT 'Demo Mining Co'
WHERE NOT EXISTS (SELECT 1 FROM public.customers WHERE name = 'Demo Mining Co');

INSERT INTO public.sites (
    site_name, customer_id, invite_code,
    fleet_size, annual_demand,
    tyre_price, target_tyre_life, target_life_unit,
    pressure_base_psi, pressure_fuel_price,
    pressure_daily_km, pressure_fuel_efficiency_kmpl,
    pressure_target_tyre_life_km, pressure_model_enabled,
    retread_cost, rate_per_km, enabled_reports
)
SELECT
    'Bharat West Mine',
    (SELECT id FROM public.customers WHERE name = 'Demo Mining Co' LIMIT 1),
    'DEMO0001',
    25, 120,
    45000, 120000, 'KM',
    120, 90,
    250, 2.8,
    120000, true,
    12000, 0.75,
    '["tyreRecords","inspectionRecords","savings","fleetHealth","tyreLife","rubberUtil","brandWise","pressureLeakage","ageDist","defectTrend","removalReasons","pressureFuelCost","pressureHeatmap","rtdScrapping","retreadEligible","brandCostPerKm","tyrePnL"]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.sites WHERE invite_code = 'DEMO0001');

-- =====================================================================
-- DONE. All tables, views, indexes, triggers, and seed data created.
-- =====================================================================
