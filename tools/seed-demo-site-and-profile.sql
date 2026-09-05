-- =====================================================================
-- DynaHaul X v2 — Demo Seed
-- Idempotent. Safe to re-run. No secrets.
-- Run target: Supabase Dashboard → SQL Editor → New query → paste → Run
-- Project   : rbqqdyzccgbssjcyibbx (matches SUPABASE_URL in .env)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Missing columns on `sites` (idempotent). Skipped automatically
--    if migrations have already added them.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 1b. Missing columns on `user_profiles` (idempotent).
-- ---------------------------------------------------------------------
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS email     text;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS user_type text;

-- ---------------------------------------------------------------------
-- 2. A demo customer (skipped if already present).
-- ---------------------------------------------------------------------
INSERT INTO public.customers (name)
SELECT 'Demo Mining Co'
WHERE NOT EXISTS (SELECT 1 FROM public.customers WHERE name = 'Demo Mining Co');

-- ---------------------------------------------------------------------
-- 3. A demo site owned by that customer (skipped if invite_code exists).
-- ---------------------------------------------------------------------
INSERT INTO public.sites (
    site_name, customer_id, invite_code,
    fleet_size, annual_demand,
    tyre_price, target_tyre_life, target_life_unit,
    pressure_base_psi, pressure_fuel_price,
    pressure_daily_km, pressure_fuel_efficiency_kmpl,
    pressure_target_tyre_life_km, pressure_model_enabled,
    retread_cost, rate_per_km,
    enabled_reports
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

-- ---------------------------------------------------------------------
-- 4. Sanity probes — should return 1 row each if seed succeeded.
-- ---------------------------------------------------------------------
SELECT 'customer' AS what, name FROM public.customers WHERE name='Demo Mining Co';
SELECT 'site'    AS what, site_name, invite_code FROM public.sites WHERE invite_code='DEMO0001';

-- =====================================================================
-- AUTH USER + MANAGER PROFILE
-- Run this AFTER step 3 returns the site row.
--
-- (a) Create the auth user in Supabase Dashboard:
--     Authentication → Users → Add user → Create new user
--       Email         : abhishek.demo@dynahaulx.com
--       Password      : Pass@2026
--       Auto Confirm  : ON
--     Click "Create user", then copy the new user's UUID (long hex).
--
-- (b) Replace 'PASTE-USER-UUID-HERE' below with that UUID, then Run.
-- =====================================================================

INSERT INTO public.user_profiles (
    id, username, email, role, user_type,
    site_id, customer_id, is_active
)
VALUES (
    'PASTE-USER-UUID-HERE',
    'Abhishek Demo',
    'abhishek.demo@dynahaulx.com',
    'manager',
    'manager',
    (SELECT id FROM public.sites  WHERE invite_code='DEMO0001' LIMIT 1),
    (SELECT id FROM public.customers WHERE name='Demo Mining Co'    LIMIT 1),
    true
)
ON CONFLICT (id) DO UPDATE
SET site_id   = EXCLUDED.site_id,
    customer_id = EXCLUDED.customer_id,
    user_type   = 'manager',
    is_active   = true;

-- (c) Verify the row was linked to the demo site.
SELECT up.email, up.user_type, up.is_active, s.site_name, s.invite_code
FROM public.user_profiles up
JOIN public.sites s ON s.id = up.site_id
WHERE up.email = 'abhishek.demo@dynahaulx.com';

----------------------------------------------------------------------
-- After running this script successfully:
--   1. Open http://127.0.0.1:3000/fitter/login.html
--   2. Email    : abhishek.demo@dynahaulx.com
--   3. Password : Pass@2026
--   4. OTP comes from Resend (resend_api_key present in .env) — check
--      spam if not in inbox; cross-check with Amit sir if Resend sender
--      domain is not yet verified for rimspl.com.
-- =====================================================================
