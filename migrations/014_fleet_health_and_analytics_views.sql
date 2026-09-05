-- ═══════════════════════════════════════════════════════════
-- Migration 014: Fleet Health & Analytics Views
-- 4 new DB views for the Manager Dashboard upgrade.
-- ═══════════════════════════════════════════════════════════

-- 1. Fleet Health Score
CREATE OR REPLACE VIEW v_fleet_health_score AS
WITH pressure_compliance AS (
  SELECT
    t.site_id,
    COUNT(*) FILTER (WHERE pr.psi >= COALESCE(s.pressure_base_psi, 100) * 0.85)::float /
    NULLIF(COUNT(*), 0)::float AS compliance_pct
  FROM tyres t
  LEFT JOIN LATERAL (
    SELECT psi FROM pressure_readings
    WHERE tyre_id = t.id
    ORDER BY reading_time DESC LIMIT 1
  ) pr ON true
  LEFT JOIN fleet_sites s ON s.id = t.site_id
  WHERE t.status = 'active'
  GROUP BY t.site_id
),
life_remaining AS (
  SELECT
    site_id,
    COALESCE(AVG(life_remaining_pct), 0) AS avg_life_pct
  FROM v_manager_tyre_records
  WHERE status = 'active'
  GROUP BY site_id
),
inspection_recency AS (
  SELECT
    t.site_id,
    COUNT(*) FILTER WHERE (i.last_inspection IS NULL OR i.last_inspection < now() - interval '7 days')::float /
    NULLIF(COUNT(*), 0)::float AS recency_pct
  FROM tyres t
  LEFT JOIN LATERAL (
    SELECT MAX(created_at) AS last_inspection FROM tyre_activity
    WHERE tyre_id = t.id AND action_type IN ('inspection', 'pressure_check')
  ) i ON true
  WHERE t.status = 'active'
  GROUP BY t.site_id
),
leakage AS (
  SELECT
    t.site_id,
    COUNT(*) FILTER WHERE (
      SELECT psi FROM pressure_readings
      WHERE tyre_id = t.id ORDER BY reading_time DESC LIMIT 1
    ) < COALESCE(s.pressure_base_psi, 100) * 0.7
  ) AS leaking_count
  FROM tyres t
  LEFT JOIN fleet_sites s ON s.id = t.site_id
  WHERE t.status = 'active'
  GROUP BY t.site_id
),
defects AS (
  SELECT
    site_id,
    COUNT(*) FILTER WHERE (
      SELECT COUNT(*) FROM tyre_activity
      WHERE tyre_id = t.id AND defect_found = true
    ) > 0 AS defect_tyres
  FROM tyres t
  WHERE t.status = 'active'
  GROUP BY t.site_id
)
SELECT
  pc.site_id,
  ROUND(
    GREATEST(0, pc.compliance_pct * 30) +
    GREATEST(0, (1 - lr.avg_life_pct / NULLIF(GREATEST(lr.avg_life_pct, 1), 0)) * 25) +
    GREATEST(0, (1 - ir.recency_pct) * 20) +
    GREATEST(0, 15 - lk.leaking_count::float * 0.3) +
    GREATEST(0, (1 - d.defect_tyres::float / NULLIF(GREATEST(
      (SELECT COUNT(*) FROM tyres WHERE site_id = pc.site_id AND status = 'active'), 1), 0)) * 10),
    0
  ) AS health_score,
  ROUND(pc.compliance_pct * 100, 1) AS pressure_compliance_pct,
  ROUND(lr.avg_life_pct, 1) AS avg_life_remaining_pct,
  ROUND((1 - ir.recency_pct) * 100, 1) AS inspection_recency_pct,
  lk.leaking_count AS leakage_severity,
  ROUND(d.defect_tyres::float / NULLIF(GREATEST(
    (SELECT COUNT(*) FROM tyres WHERE site_id = pc.site_id AND status = 'active'), 1), 0), 3) AS defect_rate
FROM pressure_compliance pc
LEFT JOIN life_remaining lr ON lr.site_id = pc.site_id
LEFT JOIN inspection_recency ir ON ir.site_id = pc.site_id
LEFT JOIN leakage lk ON lk.site_id = pc.site_id
LEFT JOIN defects d ON d.site_id = pc.site_id;

-- 2. Tyre Age Distribution
CREATE OR REPLACE VIEW v_tyre_age_distribution AS
SELECT
  site_id,
  brand,
  size,
  COUNT(*) AS total_tyres,
  ROUND(AVG(EXTRACT(DAY FROM now() - fitment_date)), 0) AS avg_age_days,
  CASE
    WHEN AVG(EXTRACT(DAY FROM now() - fitment_date)) <= 90 THEN '0-90 days'
    WHEN AVG(EXTRACT(DAY FROM now() - fitment_date)) <= 180 THEN '91-180 days'
    WHEN AVG(EXTRACT(DAY FROM now() - fitment_date)) <= 365 THEN '181-365 days'
    ELSE '365+ days'
  END AS age_group
FROM v_manager_tyre_records
WHERE status = 'active'
GROUP BY site_id, brand, size;

-- 3. Defect Trend by Position (Top 5 per brand)
CREATE OR REPLACE VIEW v_defect_trend_by_position AS
WITH defect_counts AS (
  SELECT
    t.site_id,
    t.brand,
    ta.position,
    COUNT(*) AS defect_count,
    ROW_NUMBER() OVER (PARTITION BY t.site_id, t.brand ORDER BY COUNT(*) DESC) AS rn
  FROM tyre_activity ta
  JOIN tyres t ON t.id = ta.tyre_id
  WHERE ta.defect_found = true
    AND ta.created_at >= now() - interval '90 days'
  GROUP BY t.site_id, t.brand, ta.position
)
SELECT site_id, brand, position, defect_count, rn AS rank
FROM defect_counts
WHERE rn <= 5
ORDER BY site_id, brand, rn;

-- 4. Removal Reasons (Pie chart data)
CREATE OR REPLACE VIEW v_removal_reasons_pie AS
WITH removal_data AS (
  SELECT
    t.site_id,
    COALESCE(NULLIF(ta.notes, ''), thr.removal_reason, 'Unknown') AS reason,
    COUNT(*) AS removal_count
  FROM tyre_history thr
  JOIN tyres t ON t.id = thr.tyre_id
  LEFT JOIN LATERAL (
    SELECT notes FROM tyre_activity
    WHERE tyre_id = t.id AND action_type = 'removal'
    ORDER BY created_at DESC LIMIT 1
  ) ta ON true
  WHERE thr.action = 'removed'
    AND thr.created_at >= now() - interval '90 days'
  GROUP BY t.site_id, COALESCE(NULLIF(ta.notes, ''), thr.removal_reason, 'Unknown')
)
SELECT
  site_id,
  reason,
  removal_count,
  ROUND(removal_count::float / SUM(removal_count) OVER (PARTITION BY site_id) * 100, 1) AS percentage
FROM removal_data
ORDER BY site_id, removal_count DESC;
