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
