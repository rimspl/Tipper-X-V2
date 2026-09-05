-- Migration 016: Create missing tables for V2 fitter app
-- Run this in Supabase SQL Editor

begin;

-- 1. Create fitter_observation_entries (missing from migration 006)
create table if not exists public.fitter_observation_entries (
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
  vehicle_no text,
  position_code text,
  category text,
  subcategory text,
  summary_text text,
  risk_level text,
  suggested_action text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fitter_obs_submission on public.fitter_observation_entries(submission_id);
create index if not exists idx_fitter_obs_site on public.fitter_observation_entries(site_id);

-- 2. Create licenses table (referenced by send-otp.js fetchProfileBundle)
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

-- 3. Insert a default license for KROC site (so existing users don't fail login)
insert into public.licenses (license_key, is_active, is_setup_complete, customer_id)
values ('DYNHAUL-DEFAULT', true, true, '4078a3d0-1834-4ac5-a798-1a15e9782c0b')
on conflict (license_key) do nothing;

-- 4. Grant permissions for Supabase API access
grant select, insert, update on public.fitter_observation_entries to anon, authenticated, service_role;
grant select, insert, update on public.licenses to anon, authenticated, service_role;

commit;
