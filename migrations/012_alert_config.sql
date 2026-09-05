-- ═══════════════════════════════════════════════════════════
-- Migration 012: Alert Configuration
-- Tables: alert_rules, subscriber_contacts, alert_logs
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES fleet_sites(id) ON DELETE CASCADE,
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
  site_id UUID NOT NULL REFERENCES fleet_sites(id) ON DELETE CASCADE,
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
  site_id UUID REFERENCES fleet_sites(id) ON DELETE CASCADE,
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
