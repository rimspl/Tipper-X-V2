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
