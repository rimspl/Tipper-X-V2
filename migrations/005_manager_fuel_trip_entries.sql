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
