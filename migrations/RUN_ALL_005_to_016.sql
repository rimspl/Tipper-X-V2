-- DynaHaul X v2 � Consolidated Migrations 005-016
-- Paste this entire file into Supabase SQL Editor
-- Then run tools/seed-demo-site-and-profile.sql

-- ========== 005_manager_fuel_trip_entries.sql ==========

begin;

create extension if not exists pgcrypto;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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
  updated_at timestamptz not null default now(),
  check (total_trips >= 0),
  check (total_kms >= 0),
  check (total_fuel_consumed >= 0),
  check (total_production >= 0)
);

alter table if exists public.fuel_trip_entries
  add column if not exists site_id uuid,
  add column if not exists vehicle_id uuid,
  add column if not exists created_by uuid,
  add column if not exists truck_no text,
  add column if not exists entry_date date,
  add column if not exists total_trips numeric default 0,
  add column if not exists total_kms numeric default 0,
  add column if not exists total_fuel_consumed numeric default 0,
  add column if not exists total_production numeric default 0,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

drop trigger if exists trg_fuel_trip_entries_updated_at on public.fuel_trip_entries;
create trigger trg_fuel_trip_entries_updated_at
before update on public.fuel_trip_entries
for each row
execute function public.touch_updated_at();

create unique index if not exists idx_fuel_trip_entries_site_truck_date
  on public.fuel_trip_entries (site_id, truck_no, entry_date);

create index if not exists idx_fuel_trip_entries_site_date
  on public.fuel_trip_entries (site_id, entry_date desc);

grant usage on schema public to authenticated;
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.fuel_trip_entries to authenticated;
grant all privileges on table public.fuel_trip_entries to service_role;

commit;



-- ========== 006_fitter_form_updates.sql ==========

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



-- ========== 007_pressure_model_site_settings.sql ==========

begin;

alter table if exists public.sites
  add column if not exists pressure_model_enabled boolean default true,
  add column if not exists pressure_base_psi numeric default 120,
  add column if not exists pressure_temp_zone integer default 45,
  add column if not exists pressure_fuel_price numeric default 90,
  add column if not exists pressure_daily_km numeric default 250,
  add column if not exists pressure_tires_per_truck integer default 6,
  add column if not exists pressure_calibration_days integer default 30,
  add column if not exists pressure_max_interpolation_days integer default 7;

update public.sites
set
  pressure_model_enabled = coalesce(pressure_model_enabled, true),
  pressure_base_psi = coalesce(pressure_base_psi, 120),
  pressure_temp_zone = coalesce(pressure_temp_zone, 45),
  pressure_fuel_price = coalesce(pressure_fuel_price, 90),
  pressure_daily_km = coalesce(pressure_daily_km, 250),
  pressure_tires_per_truck = coalesce(pressure_tires_per_truck, 6),
  pressure_calibration_days = coalesce(pressure_calibration_days, 30),
  pressure_max_interpolation_days = coalesce(pressure_max_interpolation_days, 7);

commit;



-- ========== 008_pressure_model_formula_alignment.sql ==========

begin;

alter table if exists public.sites
  add column if not exists pressure_fuel_efficiency_kmpl numeric default 2.8,
  add column if not exists pressure_target_tyre_life_km numeric;

update public.sites
set
  pressure_fuel_efficiency_kmpl = coalesce(pressure_fuel_efficiency_kmpl, 2.8),
  pressure_target_tyre_life_km = coalesce(
    pressure_target_tyre_life_km,
    case
      when upper(coalesce(target_life_unit, '')) = 'KM' then target_tyre_life
      else null
    end
  );

commit;



-- ========== 009_domain_projection_and_canonical_read_models.sql ==========

begin;

create extension if not exists pgcrypto;

create or replace function public.normalize_vehicle_no(value text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(upper(coalesce(value, '')), '[^A-Z0-9]', '', 'g'), '');
$$;

create or replace function public.format_vehicle_no(value text)
returns text
language plpgsql
immutable
as $$
declare
  key text := public.normalize_vehicle_no(value);
begin
  if key is null then
    return null;
  end if;

  if key ~ '^[A-Z]{1,3}[0-9]{1,4}$' then
    return regexp_replace(key, '^([A-Z]+)([0-9]+)$', '\1-\2');
  end if;

  return key;
end;
$$;

create or replace function public.normalize_tyre_serial(value text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(upper(coalesce(value, '')), '[^A-Z0-9]', '', 'g'), '');
$$;

create or replace function public.normalize_position_code(value text)
returns text
language plpgsql
immutable
as $$
declare
  key text := regexp_replace(upper(coalesce(value, '')), '[^A-Z0-9]', '', 'g');
begin
  if key = '' then
    return null;
  end if;

  if key = 'RLI' then return 'AX3LI'; end if;
  if key = 'RLO' then return 'AX3LO'; end if;
  if key = 'RRI' then return 'AX3RI'; end if;
  if key = 'RRO' then return 'AX3RO'; end if;

  if key in ('FL', 'FR', 'FL2', 'FR2', 'AX3LO', 'AX3LI', 'AX3RO', 'AX3RI', 'AX4LO', 'AX4LI', 'AX4RO', 'AX4RI') then
    return key;
  end if;

  return null;
end;
$$;

do $$
declare
  rec record;
  keep_id uuid;
  drop_ids uuid[];
begin
  for rec in
    select
      site_id,
      public.normalize_vehicle_no(vehicle_no) as vehicle_key,
      array_agg(id order by created_at asc, id asc) as ids
    from public.vehicles
    where public.normalize_vehicle_no(vehicle_no) is not null
    group by site_id, public.normalize_vehicle_no(vehicle_no)
    having count(*) > 1
  loop
    keep_id := rec.ids[1];
    drop_ids := rec.ids[2:array_length(rec.ids, 1)];

    update public.tyre_activity_log
      set vehicle_id = keep_id
    where vehicle_id = any(drop_ids);

    update public.tyres
      set current_vehicle_id = keep_id
    where current_vehicle_id = any(drop_ids);

    if to_regclass('public.fuel_trip_entries') is not null then
      update public.fuel_trip_entries
        set vehicle_id = keep_id
      where vehicle_id = any(drop_ids);
    end if;

    if to_regclass('public.observation_entries') is not null then
      update public.observation_entries
        set vehicle_id = keep_id
      where vehicle_id = any(drop_ids);
    end if;

    delete from public.vehicles where id = any(drop_ids);
  end loop;
end;
$$;

do $$
declare
  rec record;
  keep_id uuid;
  drop_ids uuid[];
begin
  for rec in
    select
      public.normalize_tyre_serial(tyre_no) as tyre_key,
      array_agg(id order by created_at asc, id asc) as ids
    from public.tyres
    where public.normalize_tyre_serial(tyre_no) is not null
    group by public.normalize_tyre_serial(tyre_no)
    having count(*) > 1
  loop
    keep_id := rec.ids[1];
    drop_ids := rec.ids[2:array_length(rec.ids, 1)];

    update public.tyre_activity_log
      set tyre_id = keep_id
    where tyre_id = any(drop_ids);

    if to_regclass('public.observation_entries') is not null then
      update public.observation_entries
        set tyre_id = keep_id
      where tyre_id = any(drop_ids);
    end if;

    delete from public.tyres where id = any(drop_ids);
  end loop;
end;
$$;

alter table public.vehicles
  add column if not exists vehicle_no_norm text;

alter table public.tyres
  add column if not exists tyre_no_norm text;

alter table public.tyre_activity_log
  add column if not exists source_type text,
  add column if not exists source_pk text,
  add column if not exists projection_version integer not null default 1,
  add column if not exists position_code_norm text,
  add column if not exists disposition text;

update public.vehicles
set
  vehicle_no = coalesce(public.format_vehicle_no(vehicle_no), vehicle_no),
  vehicle_no_norm = public.normalize_vehicle_no(vehicle_no)
where true;

update public.tyres
set
  tyre_no = coalesce(public.normalize_tyre_serial(tyre_no), tyre_no),
  tyre_no_norm = public.normalize_tyre_serial(tyre_no),
  current_position = public.normalize_position_code(current_position)
where true;

update public.tyre_activity_log
set
  activity_type = upper(coalesce(activity_type, '')),
  position_code_norm = public.normalize_position_code(position),
  position = coalesce(public.normalize_position_code(position), position),
  source_type = case when source_type is null then null else lower(trim(source_type)) end,
  source_pk = case when source_pk is null then null else trim(source_pk) end
where true;

create or replace function public.trg_normalize_vehicle_identity()
returns trigger
language plpgsql
as $$
begin
  new.vehicle_no := public.format_vehicle_no(new.vehicle_no);
  new.vehicle_no_norm := public.normalize_vehicle_no(new.vehicle_no);
  if new.vehicle_no_norm is null then
    raise exception 'vehicle_no is required';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_normalize_vehicle_identity on public.vehicles;
create trigger trg_normalize_vehicle_identity
before insert or update on public.vehicles
for each row
execute function public.trg_normalize_vehicle_identity();

create or replace function public.trg_normalize_tyre_identity()
returns trigger
language plpgsql
as $$
begin
  new.tyre_no := public.normalize_tyre_serial(new.tyre_no);
  new.tyre_no_norm := public.normalize_tyre_serial(new.tyre_no);
  if new.tyre_no_norm is null then
    raise exception 'tyre_no is required';
  end if;

  if new.current_position is not null then
    new.current_position := public.normalize_position_code(new.current_position);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_normalize_tyre_identity on public.tyres;
create trigger trg_normalize_tyre_identity
before insert or update on public.tyres
for each row
execute function public.trg_normalize_tyre_identity();

create or replace function public.trg_normalize_tyre_activity_log()
returns trigger
language plpgsql
as $$
begin
  new.activity_type := upper(coalesce(new.activity_type, ''));
  new.position_code_norm := public.normalize_position_code(new.position);
  if new.position_code_norm is not null then
    new.position := new.position_code_norm;
  end if;

  if new.source_type is not null then
    new.source_type := lower(trim(new.source_type));
  end if;

  if new.source_pk is not null then
    new.source_pk := trim(new.source_pk);
  end if;

  if new.projection_version is null then
    new.projection_version := 1;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_normalize_tyre_activity_log on public.tyre_activity_log;
create trigger trg_normalize_tyre_activity_log
before insert or update on public.tyre_activity_log
for each row
execute function public.trg_normalize_tyre_activity_log();

create or replace function public.sync_tyre_state_cache_from_ledger(p_tyre_id uuid default null)
returns void
language plpgsql
as $$
begin
  update public.tyres t
  set
    current_vehicle_id = case when le.activity_type = 'REMOVAL' then null else le.vehicle_id end,
    current_position = case when le.activity_type = 'REMOVAL' then null else le.position_code end,
    status = case
      when le.activity_type = 'REMOVAL' then coalesce(nullif(le.disposition, ''), 'Spare')
      when le.activity_type is not null then 'Running'
      else t.status
    end
  from lateral (
    select
      l.activity_type,
      l.vehicle_id,
      coalesce(l.position_code_norm, public.normalize_position_code(l.position)) as position_code,
      l.disposition
    from public.tyre_activity_log l
    where l.tyre_id = t.id
    order by l.activity_date desc nulls last, l.created_at desc nulls last, l.id desc
    limit 1
  ) le
  where (p_tyre_id is null or t.id = p_tyre_id);

  update public.tyres t
  set total_life_run = coalesce(src.life_total, 0)
  from (
    select
      l.tyre_id,
      sum(coalesce(l.life_achieved_in_this_run, 0)) as life_total
    from public.tyre_activity_log l
    where l.tyre_id is not null
      and (p_tyre_id is null or l.tyre_id = p_tyre_id)
    group by l.tyre_id
  ) src
  where t.id = src.tyre_id;
end;
$$;

create or replace function public.trg_refresh_tyre_state_from_activity()
returns trigger
language plpgsql
as $$
begin
  if new.tyre_id is not null then
    perform public.sync_tyre_state_cache_from_ledger(new.tyre_id);
  end if;

  if new.vehicle_id is not null and new.meter_reading is not null then
    update public.vehicles
    set current_odometer = greatest(coalesce(current_odometer, 0), new.meter_reading)
    where id = new.vehicle_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_refresh_tyre_state_from_activity on public.tyre_activity_log;
create trigger trg_refresh_tyre_state_from_activity
after insert or update on public.tyre_activity_log
for each row
execute function public.trg_refresh_tyre_state_from_activity();

create unique index if not exists idx_vehicles_site_vehicle_no_norm
  on public.vehicles (site_id, vehicle_no_norm)
  where vehicle_no_norm is not null;

create unique index if not exists idx_tyres_tyre_no_norm
  on public.tyres (tyre_no_norm)
  where tyre_no_norm is not null;

create unique index if not exists idx_tyre_activity_source_unique
  on public.tyre_activity_log (source_type, source_pk, activity_type, projection_version)
  ;

create index if not exists idx_tyre_activity_norm_position
  on public.tyre_activity_log (vehicle_id, position_code_norm, activity_date desc, created_at desc);

create index if not exists idx_tyre_activity_source_lookup
  on public.tyre_activity_log (source_type, source_pk, activity_date desc);

create table if not exists ops.domain_projection_journal (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_pk text not null,
  submission_id uuid references ops.offline_submissions(id) on delete set null,
  projection_version integer not null default 1,
  status text not null default 'running' check (status in ('running', 'applied', 'failed', 'skipped')),
  applied_at timestamptz,
  error_message text,
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_pk, projection_version)
);

drop trigger if exists trg_domain_projection_journal_updated_at on ops.domain_projection_journal;
create trigger trg_domain_projection_journal_updated_at
before update on ops.domain_projection_journal
for each row
execute function ops.touch_updated_at();

alter table ops.offline_submissions
  add column if not exists projection_version integer not null default 1,
  add column if not exists projected_to_domain boolean not null default false,
  add column if not exists projected_at timestamptz,
  add column if not exists projection_error text;

create index if not exists idx_offline_submissions_projected
  on ops.offline_submissions (projected_to_domain, projection_version, created_at desc);

create index if not exists idx_domain_projection_journal_status
  on ops.domain_projection_journal (status, created_at desc);

create or replace view public.v_tyre_event_ledger as
select
  l.id as event_id,
  l.activity_date,
  l.created_at,
  l.activity_type,
  l.source_type,
  l.source_pk,
  l.projection_version,
  l.tyre_id,
  t.tyre_no,
  t.tyre_no_norm,
  t.make,
  t.size,
  l.vehicle_id,
  v.site_id,
  v.vehicle_no,
  v.vehicle_no_norm,
  coalesce(l.position_code_norm, public.normalize_position_code(l.position)) as position_code,
  l.meter_reading,
  l.rtd1,
  l.rtd2,
  l.psi_found,
  l.psi_corrected,
  l.life_achieved_in_this_run,
  l.removal_reason,
  l.disposition,
  l.remarks,
  l.user_id
from public.tyre_activity_log l
left join public.tyres t on t.id = l.tyre_id
left join public.vehicles v on v.id = l.vehicle_id;

create or replace view public.v_current_vehicle_tyre_layout as
with latest_per_tyre as (
  select
    l.tyre_id,
    l.vehicle_id,
    coalesce(l.position_code_norm, public.normalize_position_code(l.position)) as position_code,
    l.activity_type,
    l.activity_date,
    l.created_at,
    l.id,
    row_number() over (
      partition by l.tyre_id
      order by l.activity_date desc nulls last, l.created_at desc nulls last, l.id desc
    ) as rn
  from public.tyre_activity_log l
  where l.tyre_id is not null
), active_mounts as (
  select *
  from latest_per_tyre
  where rn = 1
    and activity_type <> 'REMOVAL'
    and vehicle_id is not null
    and position_code is not null
), unique_slots as (
  select
    m.*,
    row_number() over (
      partition by m.vehicle_id, m.position_code
      order by m.activity_date desc nulls last, m.created_at desc nulls last, m.id desc
    ) as slot_rank
  from active_mounts m
)
select
  v.site_id,
  v.id as vehicle_id,
  v.vehicle_no,
  v.vehicle_no_norm,
  u.position_code,
  t.id as tyre_id,
  t.tyre_no,
  t.tyre_no_norm,
  t.make,
  t.size,
  u.activity_date as mounted_activity_date,
  u.created_at as mounted_created_at
from unique_slots u
join public.tyres t on t.id = u.tyre_id
join public.vehicles v on v.id = u.vehicle_id
where u.slot_rank = 1;

create or replace view public.v_tyre_latest_pressure as
select distinct on (l.tyre_id)
  l.tyre_id,
  t.tyre_no,
  l.vehicle_id,
  v.vehicle_no,
  coalesce(l.position_code_norm, public.normalize_position_code(l.position)) as position_code,
  l.activity_date,
  l.created_at,
  l.psi_found,
  l.psi_corrected,
  l.remarks
from public.tyre_activity_log l
join public.tyres t on t.id = l.tyre_id
left join public.vehicles v on v.id = l.vehicle_id
where l.activity_type = 'PRESSURE_CHECK'
order by l.tyre_id, l.activity_date desc nulls last, l.created_at desc nulls last, l.id desc;

create or replace view public.v_tyre_latest_inspection as
select distinct on (l.tyre_id)
  l.tyre_id,
  t.tyre_no,
  l.vehicle_id,
  v.vehicle_no,
  coalesce(l.position_code_norm, public.normalize_position_code(l.position)) as position_code,
  l.activity_date,
  l.created_at,
  l.rtd1,
  l.rtd2,
  l.remarks
from public.tyre_activity_log l
join public.tyres t on t.id = l.tyre_id
left join public.vehicles v on v.id = l.vehicle_id
where l.activity_type = 'INSPECTION'
order by l.tyre_id, l.activity_date desc nulls last, l.created_at desc nulls last, l.id desc;

create or replace view public.v_tyre_lifecycle_summary as
with fitment_stats as (
  select
    tyre_id,
    min(activity_date) filter (where activity_type = 'FITMENT') as first_fitment_date,
    max(activity_date) filter (where activity_type = 'FITMENT') as last_fitment_date,
    max(activity_date) filter (where activity_type = 'INSPECTION') as last_inspection_date,
    max(activity_date) filter (where activity_type = 'REMOVAL') as last_removal_date,
    sum(coalesce(life_achieved_in_this_run, 0)) as total_life_run_from_log
  from public.tyre_activity_log
  where tyre_id is not null
  group by tyre_id
)
select
  t.id as tyre_id,
  t.tyre_no,
  t.tyre_no_norm,
  t.make,
  t.size,
  t.status,
  t.current_vehicle_id,
  v.vehicle_no,
  t.current_position,
  fs.first_fitment_date,
  fs.last_fitment_date,
  fs.last_inspection_date,
  fs.last_removal_date,
  coalesce(fs.total_life_run_from_log, 0) as total_life_run_from_log,
  coalesce(t.total_life_run, 0) as total_life_run_cached
from public.tyres t
left join fitment_stats fs on fs.tyre_id = t.id
left join public.vehicles v on v.id = t.current_vehicle_id;

grant select on public.v_tyre_event_ledger to authenticated;
grant select on public.v_current_vehicle_tyre_layout to authenticated;
grant select on public.v_tyre_latest_pressure to authenticated;
grant select on public.v_tyre_latest_inspection to authenticated;
grant select on public.v_tyre_lifecycle_summary to authenticated;

grant all privileges on table ops.domain_projection_journal to service_role;

commit;



-- ========== 010_fix_tyre_activity_upsert_index.sql ==========

begin;

-- Fix idempotent upsert support for tyre_activity_log.
-- PostgREST uses `ON CONFLICT (columns)` without an index predicate,
-- so the unique index must be non-partial.

drop index if exists public.idx_tyre_activity_source_unique;

create unique index if not exists idx_tyre_activity_source_unique
  on public.tyre_activity_log (source_type, source_pk, activity_type, projection_version);

commit;



-- ========== 011_manager_analytics_views.sql ==========

begin;

-- ==========================================
-- VIEW 1: v_manager_tyre_records
-- Collapses hundreds of thousands of raw tyre logs into a 
-- single row per tyre, instantly resolving the required data 
-- for the Manager Dashboard Charts & Tyre Table.
-- ==========================================
create or replace view public.v_manager_tyre_records as
with fitment_data as (
    select distinct on (tyre_id)
        tyre_id, activity_date as first_fitment_date,
        vehicle_id, position
    from public.tyre_activity_log
    where activity_type = 'FITMENT'
    order by tyre_id, activity_date asc, created_at asc
),
inspection_data as (
    select distinct on (tyre_id)
        tyre_id, activity_date as latest_inspection_date,
        rtd1 as latest_rtd1, rtd2 as latest_rtd2
    from public.tyre_activity_log
    where activity_type = 'INSPECTION'
    order by tyre_id, activity_date desc, created_at desc
),
removal_data as (
    select distinct on (tyre_id)
        tyre_id, activity_date as removal_date,
        rtd1 as removal_rtd, removal_reason
    from public.tyre_activity_log
    where activity_type = 'REMOVAL'
    order by tyre_id, activity_date desc, created_at desc
),
evidence_candidates as (
    select distinct on (context_json->>'tyre_no')
        (context_json->>'tyre_no') as tyre_no_key, id as evidence_candidate_id
    from ops.offline_submissions
    order by context_json->>'tyre_no', created_at desc
)
select 
    t.id,
    v_active.site_id,
    coalesce(t.make, 'Unknown') as brand,
    coalesce(t.size, 'Unknown') as size,
    t.tyre_no,
    t.otd,
    coalesce(t.status, 'Stock') as status,
    case
        when t.current_vehicle_id is not null then coalesce(v_active.vehicle_no, 'Unassigned')
        else coalesce(v_historical.vehicle_no, 'Unassigned')
    end as truck,
    case
        when t.current_position is not null then t.current_position
        when fd.position is not null then fd.position
        else 'Stores'
    end as position,
    id_data.latest_inspection_date,
    id_data.latest_rtd1,
    id_data.latest_rtd2,
    fd.first_fitment_date,
    rd.removal_date,
    rd.removal_rtd,
    coalesce(rd.removal_reason, '') as removal_reason,
    coalesce(t.total_life_run, 0) as life_achieved,
    ec.evidence_candidate_id
from public.tyres t
left join fitment_data fd on fd.tyre_id = t.id
left join inspection_data id_data on id_data.tyre_id = t.id
left join removal_data rd on rd.tyre_id = t.id
left join public.vehicles v_active on v_active.id = t.current_vehicle_id
left join public.vehicles v_historical on v_historical.id = fd.vehicle_id
left join evidence_candidates ec on public.normalize_tyre_serial(ec.tyre_no_key) = public.normalize_tyre_serial(t.tyre_no);


-- ==========================================
-- VIEW 2: v_manager_inspection_records
-- Pre-formats the Inspection Table records so the frontend 
-- can natively paginate this view without downloading raw logs.
-- ==========================================
create or replace view public.v_manager_inspection_records as
select 
    l.id,
    v.site_id,
    t.tyre_no,
    v.vehicle_no as truck,
    coalesce(l.position_code_norm, l.position) as position,
    l.activity_date as date,
    l.meter_reading as odometer,
    l.rtd1,
    l.rtd2,
    abs(coalesce(l.rtd1, 0) - coalesce(l.rtd2, 0)) as rtd_difference,
    coalesce(l.psi_found, l.psi_corrected) as psi,
    coalesce(l.remarks, '') as remarks,
    l.activity_type
from public.tyre_activity_log l
join public.tyres t on t.id = l.tyre_id
left join public.vehicles v on v.id = l.vehicle_id;


-- ==========================================
-- VIEW 3: v_manager_pressure_events
-- Extracts only the essential minimum columns required for
-- the Pressure Interpolation Math, vastly shrinking payload size.
-- ==========================================
create or replace view public.v_manager_pressure_events as
select 
    l.id,
    v.site_id,
    l.tyre_id,
    t.tyre_no,
    v.vehicle_no as truck,
    coalesce(l.position_code_norm, l.position) as position,
    l.activity_date as date,
    l.psi_found as psi_found,
    l.psi_corrected as psi_corrected
from public.tyre_activity_log l
join public.tyres t on t.id = l.tyre_id
join public.vehicles v on v.id = l.vehicle_id
where l.activity_type = 'PRESSURE_CHECK'
   or l.activity_type = 'INSPECTION'
   or l.activity_type = 'FITMENT';

-- Apply Grants
grant select on public.v_manager_tyre_records to authenticated;
grant select on public.v_manager_inspection_records to authenticated;
grant select on public.v_manager_pressure_events to authenticated;

commit;



-- ========== 012_alert_config.sql ==========

-- ═══════════════════════════════════════════════════════════
-- Migration 012: Alert Configuration
-- Tables: alert_rules, subscriber_contacts, alert_logs
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'pressure_drop',
    'fitment_overdue',
    'inspection_due',
    'tyre_removed',
    'rtd_threshold'
  )),
  threshold_value NUMERIC,
  threshold_unit TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_site ON alert_rules(site_id);
CREATE INDEX IF NOT EXISTS idx_alert_rules_active ON alert_rules(is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS subscriber_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  mobile TEXT NOT NULL CHECK (mobile ~ '^[6-9]\d{9}$'),
  role TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriber_contacts_site ON subscriber_contacts(site_id);
CREATE INDEX IF NOT EXISTS idx_subscriber_contacts_active ON subscriber_contacts(is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS alert_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES alert_rules(id) ON DELETE SET NULL,
  subscriber_id UUID REFERENCES subscriber_contacts(id) ON DELETE SET NULL,
  alert_type TEXT NOT NULL,
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
  recipient TEXT NOT NULL,
  message_snippet TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
  provider_response TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alert_logs_site ON alert_logs(site_id);
CREATE INDEX IF NOT EXISTS idx_alert_logs_status ON alert_logs(status);
CREATE INDEX IF NOT EXISTS idx_alert_logs_created ON alert_logs(created_at DESC);



-- ========== 013_scheduled_reports.sql ==========

-- ═══════════════════════════════════════════════════════════
-- Migration 013: Scheduled Reports
-- Tables: scheduled_reports, report_deliveries
-- ═══════════════════════════════════════════════════════════

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
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_active ON scheduled_reports(is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS report_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES scheduled_reports(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  recipient TEXT NOT NULL,
  delivered_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_deliveries_report ON report_deliveries(report_id);
CREATE INDEX IF NOT EXISTS idx_report_deliveries_status ON report_deliveries(status);



-- (014 skipped — views reference non-existent tables, not used by dashboard)

-- ========== 015_alert_tables_fix.sql ==========

-- ═══════════════════════════════════════════════════════════
-- Migration 015: Create alert config tables (fixed schema)
-- Matches application code in api/send-alert.js, ui/alert-settings.js
-- NOTE: This migration was generated because 012 was never applied
--       and had column name mismatches with the application code.
-- ═══════════════════════════════════════════════════════════

-- 1. Alert Rules
CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'pressure_drop',
    'fitment_overdue',
    'inspection_due',
    'tyre_removed',
    'rtd_threshold'
  )),
  threshold_value NUMERIC,
  threshold_unit TEXT,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_site ON alert_rules(site_id);
CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON alert_rules(enabled) WHERE enabled = true;

-- 2. Subscriber Contacts
CREATE TABLE IF NOT EXISTS subscriber_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name TEXT,
  phone TEXT NOT NULL CHECK (phone ~ '^[6-9]\d{9}$'),
  role TEXT,
  channels jsonb DEFAULT '["sms"]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriber_contacts_site ON subscriber_contacts(site_id);
CREATE INDEX IF NOT EXISTS idx_subscriber_contacts_active ON subscriber_contacts(is_active) WHERE is_active = true;

-- 3. Alert Logs
CREATE TABLE IF NOT EXISTS alert_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES alert_rules(id) ON DELETE SET NULL,
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'email', 'whatsapp')),
  recipient TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error_message TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alert_logs_site ON alert_logs(site_id);
CREATE INDEX IF NOT EXISTS idx_alert_logs_status ON alert_logs(status);
CREATE INDEX IF NOT EXISTS idx_alert_logs_created ON alert_logs(created_at DESC);

-- 4. Seed: One alert rule for KROC site (pressure_drop, enabled)
INSERT INTO alert_rules (site_id, event_type, threshold_value, threshold_unit, enabled)
SELECT id, 'pressure_drop', 100, 'PSI', true
FROM sites WHERE site_name = 'KROC'
AND NOT EXISTS (SELECT 1 FROM alert_rules WHERE event_type = 'pressure_drop' AND site_id = (SELECT id FROM sites WHERE site_name = 'KROC' LIMIT 1))
LIMIT 1;

-- 5. Seed: One subscriber for KROC (Abhishek, your phone number)
--    IMPORTANT: Replace 9999999999 with your actual 10-digit phone number
INSERT INTO subscriber_contacts (site_id, name, phone, role, channels, is_active)
SELECT id, 'Abhishek', '9997896484', 'manager', '["sms"]'::jsonb, true
FROM sites WHERE site_name = 'KROC'
AND NOT EXISTS (SELECT 1 FROM subscriber_contacts WHERE site_id = (SELECT id FROM sites WHERE site_name = 'KROC' LIMIT 1))
LIMIT 1;



-- ========== 016_fitter_observation_and_licenses.sql ==========

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


-- ========== SEED: Default Site + Customer ==========

-- Add columns that the app needs (idempotent)
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS invite_code                text;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS pressure_base_psi         numeric;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS pressure_fuel_price       numeric;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS pressure_daily_km         numeric;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS pressure_fuel_efficiency_kmpl numeric;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS pressure_target_tyre_life_km  numeric;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS pressure_model_enabled    boolean DEFAULT false;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS retread_cost              numeric;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS rate_per_km               numeric;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS enabled_reports           jsonb;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS onboarding_completed      boolean DEFAULT false;

ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS email     text;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS user_type text;

-- Default customer
INSERT INTO public.customers (name)
SELECT 'Demo Mining Co'
WHERE NOT EXISTS (SELECT 1 FROM public.customers WHERE name = 'Demo Mining Co');

-- Default site
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



