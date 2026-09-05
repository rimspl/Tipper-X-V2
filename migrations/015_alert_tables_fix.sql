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
