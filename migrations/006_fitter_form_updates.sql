begin;

create table if not exists public.fitter_tyre_card_entries (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid unique,
  site_id uuid,
  user_id uuid,
  device_id text,
  local_submission_id text,
  capture_started_at timestamptz,
  capture_completed_at timestamptz,
  approval_mode text,
  pipeline_status text,
  tyre_serial text,
  make text,
  size text,
  vehicle_no text,
  position_code text,
  meter_reading numeric,
  rtd1 numeric,
  rtd2 numeric,
  fitment_type text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.fitter_tyre_card_entries
  add column if not exists tyre_serial text,
  add column if not exists make text,
  add column if not exists size text,
  add column if not exists vehicle_no text,
  add column if not exists position_code text,
  add column if not exists meter_reading numeric,
  add column if not exists rtd1 numeric,
  add column if not exists rtd2 numeric,
  add column if not exists fitment_type text,
  add column if not exists raw_payload jsonb;

create table if not exists public.fitter_pressure_check_entries (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid unique,
  site_id uuid,
  user_id uuid,
  device_id text,
  local_submission_id text,
  capture_started_at timestamptz,
  capture_completed_at timestamptz,
  approval_mode text,
  pipeline_status text,
  tyre_serial text,
  vehicle_no text,
  position_code text,
  found_psi numeric,
  target_psi numeric default 120,
  variance numeric,
  adjusted boolean,
  action text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.fitter_pressure_check_entries
  add column if not exists tyre_serial text,
  add column if not exists vehicle_no text,
  add column if not exists position_code text,
  add column if not exists found_psi numeric,
  add column if not exists target_psi numeric default 120,
  add column if not exists variance numeric,
  add column if not exists adjusted boolean,
  add column if not exists action text,
  add column if not exists raw_payload jsonb;

alter table if exists public.fitter_pressure_check_entries
  alter column target_psi set default 120;

create table if not exists public.fitter_tyre_inspection_entries (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid unique,
  site_id uuid,
  user_id uuid,
  device_id text,
  local_submission_id text,
  capture_started_at timestamptz,
  capture_completed_at timestamptz,
  approval_mode text,
  pipeline_status text,
  tyre_serial text,
  vehicle_no text,
  position_code text,
  meter_reading numeric,
  rtd1 numeric,
  rtd2 numeric,
  damage_class text,
  severity text,
  remarks text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.fitter_tyre_inspection_entries
  add column if not exists tyre_serial text,
  add column if not exists vehicle_no text,
  add column if not exists position_code text,
  add column if not exists meter_reading numeric,
  add column if not exists rtd1 numeric,
  add column if not exists rtd2 numeric,
  add column if not exists damage_class text,
  add column if not exists severity text,
  add column if not exists remarks text,
  add column if not exists raw_payload jsonb;

create table if not exists public.fitter_tyre_removal_entries (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid unique,
  site_id uuid,
  user_id uuid,
  device_id text,
  local_submission_id text,
  capture_started_at timestamptz,
  capture_completed_at timestamptz,
  approval_mode text,
  pipeline_status text,
  tyre_serial text,
  vehicle_no text,
  position_code text,
  fitment_reading numeric,
  current_reading numeric,
  life_achieved numeric,
  removal_reason text,
  disposition text,
  rtd1 numeric,
  rtd2 numeric,
  remarks text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.fitter_tyre_removal_entries
  add column if not exists tyre_serial text,
  add column if not exists vehicle_no text,
  add column if not exists position_code text,
  add column if not exists fitment_reading numeric,
  add column if not exists current_reading numeric,
  add column if not exists life_achieved numeric,
  add column if not exists removal_reason text,
  add column if not exists disposition text,
  add column if not exists rtd1 numeric,
  add column if not exists rtd2 numeric,
  add column if not exists remarks text,
  add column if not exists raw_payload jsonb;

commit;
