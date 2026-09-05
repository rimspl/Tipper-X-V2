begin;

create extension if not exists pgcrypto;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Default Customer',
  created_at timestamptz not null default now()
);

alter table if exists public.customers
  add column if not exists name text,
  add column if not exists created_at timestamptz default now();

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid,
  site_name text not null default 'Default Site',
  created_at timestamptz not null default now(),
  target_tyre_life numeric,
  target_life_unit text default 'HMR',
  tyre_price numeric,
  annual_demand numeric,
  fleet_size numeric,
  default_tipper_model_id uuid
);

alter table if exists public.sites
  add column if not exists customer_id uuid,
  add column if not exists site_name text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists target_tyre_life numeric,
  add column if not exists target_life_unit text default 'HMR',
  add column if not exists tyre_price numeric,
  add column if not exists annual_demand numeric,
  add column if not exists fleet_size numeric,
  add column if not exists default_tipper_model_id uuid;

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  vehicle_no text not null unique,
  site_id uuid,
  tipper_model_id uuid,
  current_odometer numeric default 0,
  status text default 'Active',
  created_at timestamptz not null default now()
);

alter table if exists public.vehicles
  add column if not exists vehicle_no text,
  add column if not exists site_id uuid,
  add column if not exists tipper_model_id uuid,
  add column if not exists current_odometer numeric default 0,
  add column if not exists status text default 'Active',
  add column if not exists created_at timestamptz default now();

create table if not exists public.tyres (
  id uuid primary key default gen_random_uuid(),
  tyre_no text not null unique,
  make text,
  model text,
  size text,
  otd numeric,
  current_vehicle_id uuid,
  current_position text,
  status text default 'New',
  total_life_run numeric default 0,
  created_at timestamptz not null default now()
);

alter table if exists public.tyres
  add column if not exists tyre_no text,
  add column if not exists make text,
  add column if not exists model text,
  add column if not exists size text,
  add column if not exists otd numeric,
  add column if not exists current_vehicle_id uuid,
  add column if not exists current_position text,
  add column if not exists status text default 'New',
  add column if not exists total_life_run numeric default 0,
  add column if not exists created_at timestamptz default now();

create table if not exists public.tyre_activity_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  activity_date date default current_date,
  tyre_id uuid,
  vehicle_id uuid,
  activity_type text,
  position text,
  meter_reading numeric,
  rtd1 numeric,
  rtd2 numeric,
  psi_found numeric,
  psi_corrected numeric,
  life_achieved_in_this_run numeric default 0,
  removal_reason text,
  remarks text,
  user_id uuid
);

alter table if exists public.tyre_activity_log
  add column if not exists created_at timestamptz default now(),
  add column if not exists activity_date date default current_date,
  add column if not exists tyre_id uuid,
  add column if not exists vehicle_id uuid,
  add column if not exists activity_type text,
  add column if not exists position text,
  add column if not exists meter_reading numeric,
  add column if not exists rtd1 numeric,
  add column if not exists rtd2 numeric,
  add column if not exists psi_found numeric,
  add column if not exists psi_corrected numeric,
  add column if not exists life_achieved_in_this_run numeric default 0,
  add column if not exists removal_reason text,
  add column if not exists remarks text,
  add column if not exists user_id uuid;

create table if not exists public.observation_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  customer_id uuid,
  site_id uuid,
  vehicle_id uuid,
  tyre_id uuid,
  category text,
  observation_category text,
  observation_type text,
  observation text,
  severity text default 'Medium'
);

alter table if exists public.observation_entries
  add column if not exists created_at timestamptz default now(),
  add column if not exists customer_id uuid,
  add column if not exists site_id uuid,
  add column if not exists vehicle_id uuid,
  add column if not exists tyre_id uuid,
  add column if not exists category text,
  add column if not exists observation_category text,
  add column if not exists observation_type text,
  add column if not exists observation text,
  add column if not exists severity text default 'Medium';

create table if not exists public.user_profiles (
  id uuid primary key,
  username text,
  role text,
  site_id uuid,
  customer_id uuid,
  is_active boolean default true,
  created_at timestamptz not null default now()
);

alter table if exists public.user_profiles
  add column if not exists username text,
  add column if not exists role text,
  add column if not exists site_id uuid,
  add column if not exists customer_id uuid,
  add column if not exists is_active boolean default true,
  add column if not exists created_at timestamptz default now();

create index if not exists idx_public_tyres_tyre_no on public.tyres (tyre_no);
create index if not exists idx_public_vehicles_vehicle_no on public.vehicles (vehicle_no);
create index if not exists idx_public_activity_tyre_date on public.tyre_activity_log (tyre_id, activity_date desc);
create index if not exists idx_public_activity_vehicle_date on public.tyre_activity_log (vehicle_id, activity_date desc);
create index if not exists idx_public_observation_site_created on public.observation_entries (site_id, created_at desc);

commit;
