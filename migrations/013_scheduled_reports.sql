-- ═══════════════════════════════════════════════════════════
-- Migration 013: Scheduled Reports
-- Tables: scheduled_reports, report_deliveries
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS scheduled_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES fleet_sites(id) ON DELETE CASCADE,
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
