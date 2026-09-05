# Supabase SQL Queries — Run in SQL Editor

Open: https://supabase.com/dashboard → Select project → SQL Editor → New Query → Paste → Run

---

## Query 1: Create Missing Tables

```sql
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

-- 2. Create licenses table (referenced by login flow)
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

-- 3. Default license for KROC site
insert into public.licenses (license_key, is_active, is_setup_complete, customer_id)
values ('DYNHAUL-DEFAULT', true, true, '4078a3d0-1834-4ac5-a798-1a15e9782c0b')
on conflict (license_key) do nothing;

-- 4. Grant permissions
grant select, insert, update on public.fitter_observation_entries to anon, authenticated, service_role;
grant select, insert, update on public.licenses to anon, authenticated, service_role;

commit;
```

**Expected result:** `Success. No rows returned`

---

## Query 2: Create Fitter User Profile

After Query 1 succeeds, run this to create the fitter account:

```sql
insert into public.user_profiles (id, role, user_type, site_id, customer_id, is_active, username, email)
values (
  'a85727f2-4d22-4166-818d-2d03df3795fa',
  'user',
  'fitter',
  'af3ce2d5-b742-4b3d-a5e9-b148d081dc0a',
  '4078a3d0-1834-4ac5-a798-1a15e9782c0b',
  true,
  'Fitter Test',
  'fitter@dynahaul.test'
)
on conflict (id) do update set
  role = excluded.role,
  user_type = excluded.user_type,
  site_id = excluded.site_id,
  customer_id = excluded.customer_id,
  is_active = true,
  username = excluded.username,
  email = excluded.email;
```

**Expected result:** `Success. 1 row inserted`

---

## Query 3: Verify Everything Worked

```sql
-- Check fitter profile exists
select id, username, role, user_type, site_id, is_active
from public.user_profiles
where id = 'a85727f2-4d22-4166-818d-2d03df3795fa';

-- Check observation table exists
select exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'fitter_observation_entries'
) as observation_table_exists;

-- Check licenses table exists
select exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'licenses'
) as licenses_table_exists;
```

**Expected result:** All 3 queries return data (fitter row + true + true)
