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
