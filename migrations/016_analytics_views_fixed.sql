-- =====================================================================
-- Migration 016: ANALYTICS VIEWS (rewrite of broken 014)
-- Run in Supabase SQL Editor AFTER 015.
--
-- The old 014 referenced tables that DO NOT EXIST
-- (pressure_readings, fleet_sites, tyre_activity, tyre_history) and
-- columns the frontend never asked for. These 4 views are rewritten
-- against REAL tables (tyres, vehicles, tyre_activity_log, sites,
-- v_manager_tyre_records) and expose EXACTLY the columns the manager
-- dashboard render code reads (see manager/src/lib/data-queries.js and
-- manager/src/pages/dashboard.js).
--
-- NOTE: These views use security_invoker so the authenticated manager
--       only sees their own site. They do NOT touch the `ops` schema.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. FLEET HEALTH SCORE  (one row per site)
--    Expected columns (dashboard.js renderFleetHealthScore):
--      site_id, health_score, pressure_compliance_score,
--      life_remaining_score, inspection_recency_score,
--      leakage_loss_score, defect_rate_score
--    (extra columns below are tolerated by the frontend)
-- ─────────────────────────────────────────────────────────────────────
create or replace view public.v_fleet_health_score as
with targets as (
  select id as site_id,
         coalesce(pressure_base_psi, 120) as tgt_psi,
         coalesce(pressure_target_tyre_life_km, 0) as tgt_life
  from public.sites
),
mounted as (
  select t.id as tyre_id, t.site_id, coalesce(t.total_life_run, 0) as total_life_run
  from public.tyres t
  where t.current_vehicle_id is not null
),
lp as (
  select distinct on (tyre_id) tyre_id, coalesce(psi_corrected, psi_found) as psi
  from public.tyre_activity_log
  where activity_type = 'PRESSURE_CHECK'
    and coalesce(psi_corrected, psi_found) > 0
  order by tyre_id, activity_date desc, created_at desc
),
insp as (
  select distinct on (tyre_id) tyre_id, activity_date as last_insp
  from public.tyre_activity_log
  where activity_type = 'INSPECTION'
  order by tyre_id, activity_date desc, created_at desc
),
defect_cnt as (
  select m.site_id, count(distinct m.tyre_id) as defect_tyres
  from mounted m
  join public.tyre_activity_log l on l.tyre_id = m.tyre_id
  join targets tg on tg.site_id = m.site_id
  where l.activity_type in ('INSPECTION', 'PRESSURE_CHECK')
    and l.activity_date >= now() - interval '90 days'
    and coalesce(l.psi_corrected, l.psi_found) > 0
    and coalesce(l.psi_corrected, l.psi_found) < 0.85 * tg.tgt_psi
  group by m.site_id
),
agg as (
  select m.site_id,
         count(*) as total,
         count(lp.psi) as with_pressure,
         count(*) filter (where lp.psi >= 0.85 * tg.tgt_psi) as compliant,
         count(*) filter (where lp.psi < 0.70 * tg.tgt_psi) as leaking,
         count(*) filter (where insp.last_insp >= now() - interval '7 days') as insp_7d,
         avg(coalesce(m.total_life_run, 0)) as avg_life
  from mounted m
  left join lp on lp.tyre_id = m.tyre_id
  left join insp on insp.tyre_id = m.tyre_id
  left join targets tg on tg.site_id = m.site_id
  group by m.site_id, tg.tgt_psi, tg.tgt_life
)
select
  s.id as site_id,
  round(least(100,
     coalesce(a.compliant::numeric / nullif(a.total, 0), 0) * 30
     + (1 - least(1, coalesce(a.avg_life, 0) / nullif(greatest(tg.tgt_life, 1), 0))) * 25
     + (1 - coalesce((a.total - a.insp_7d)::numeric / nullif(a.total, 0), 0)) * 20
     + greatest(0, 15 - coalesce(a.leaking, 0)::numeric * 0.3)
     + coalesce((1 - dc.defect_tyres::numeric / nullif(a.total, 0)), 0) * 10
  ), 1) as health_score,
  round(coalesce(a.compliant::numeric / nullif(a.total, 0), 0) * 30, 1) as pressure_compliance_score,
  round((1 - least(1, coalesce(a.avg_life, 0) / nullif(greatest(tg.tgt_life, 1), 0))) * 25, 1) as life_remaining_score,
  round((1 - coalesce((a.total - a.insp_7d)::numeric / nullif(a.total, 0), 0)) * 20, 1) as inspection_recency_score,
  round(greatest(0, 15 - coalesce(a.leaking, 0)::numeric * 0.3), 1) as leakage_loss_score,
  round(coalesce((1 - dc.defect_tyres::numeric / nullif(a.total, 0)), 0) * 10, 1) as defect_rate_score,
  coalesce(a.total, 0) as total_tyres_with_pressure,
  round(coalesce(a.avg_life / nullif(tg.tgt_life, 0), 0) * 100, 1) as avg_life_usage_pct,
  coalesce(a.insp_7d, 0) as tyres_inspected_last_7d,
  null::numeric as avg_pressure_drop_psi,
  coalesce(dc.defect_tyres, 0) as recent_defect_count,
  now() as computed_at
from public.sites s
left join agg a on a.site_id = s.id
left join targets tg on tg.site_id = s.id
left join defect_cnt dc on dc.site_id = s.id;

-- ─────────────────────────────────────────────────────────────────────
-- 2. TYRE AGE DISTRIBUTION
--    Expected columns (dashboard.js renderTyreAgeDistribution):
--      age_bucket, tyre_count   (+ site_id, brand, size, avg_age_days)
-- ─────────────────────────────────────────────────────────────────────
create or replace view public.v_tyre_age_distribution as
with base as (
  select site_id, brand, size,
         count(*) as tyre_count,
         avg(extract(day from now() - first_fitment_date)) as avg_days
  from public.v_manager_tyre_records
  where first_fitment_date is not null
  group by site_id, brand, size
)
select
  site_id,
  brand,
  size,
  tyre_count,
  round(avg_days, 0) as avg_age_days,
  case
    when avg_days <= 90 then '0-90 days'
    when avg_days <= 180 then '91-180 days'
    when avg_days <= 365 then '181-365 days'
    else '365+ days'
  end as age_bucket
from base;

-- ─────────────────────────────────────────────────────────────────────
-- 3. DEFECT TREND BY POSITION (last 90 days)
--    Expected columns (dashboard.js renderDefectTrend):
--      vehicle_no, position_code, defect_count_90d, total_events_90d
--    Defect = inspection/pressure event under-inflated vs site target.
-- ─────────────────────────────────────────────────────────────────────
create or replace view public.v_defect_trend_by_position as
select
  v.site_id,
  v.vehicle_no,
  coalesce(l.position_code_norm, l.position) as position_code,
  count(*) filter (
    where coalesce(l.psi_corrected, l.psi_found) > 0
      and coalesce(l.psi_corrected, l.psi_found) < 0.85 * coalesce(s.pressure_base_psi, 120)
  ) as defect_count_90d,
  count(*) as total_events_90d
from public.tyre_activity_log l
join public.vehicles v on v.id = l.vehicle_id
left join public.sites s on s.id = v.site_id
where l.activity_type in ('INSPECTION', 'PRESSURE_CHECK', 'FITMENT')
  and l.activity_date >= now() - interval '90 days'
group by v.site_id, v.vehicle_no, position_code
order by defect_count_90d desc
limit 50;

-- ─────────────────────────────────────────────────────────────────────
-- 4. REMOVAL REASONS PIE (last 90 days)
--    Expected columns (dashboard.js renderRemovalReasons):
--      reason, count, pct
-- ─────────────────────────────────────────────────────────────────────
create or replace view public.v_removal_reasons_pie as
with rm as (
  select v.site_id,
         coalesce(nullif(l.removal_reason, ''), 'Not specified') as reason
  from public.tyre_activity_log l
  join public.vehicles v on v.id = l.vehicle_id
  where l.activity_type = 'REMOVAL'
    and l.activity_date >= now() - interval '90 days'
)
select
  site_id,
  reason,
  count(*) as count,
  round(
    count(*)::numeric / nullif(sum(count(*)) over (partition by site_id), 0) * 100,
    1
  ) as pct
from rm
group by site_id, reason
order by count desc;

-- ── security_invoker + grants ──
alter view public.v_fleet_health_score set (security_invoker = true);
alter view public.v_tyre_age_distribution set (security_invoker = true);
alter view public.v_defect_trend_by_position set (security_invoker = true);
alter view public.v_removal_reasons_pie set (security_invoker = true);

grant select on public.v_fleet_health_score to authenticated;
grant select on public.v_tyre_age_distribution to authenticated;
grant select on public.v_defect_trend_by_position to authenticated;
grant select on public.v_removal_reasons_pie to authenticated;
