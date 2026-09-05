# 01 — Database Migrations

**Purpose:** New Supabase SQL migrations for the upgrade. Copied here so all schema changes live in one place. Apply on top of existing 001–011 migrations.

**Files:**
- `012_alert_config.sql` — Tables: `alert_rules`, `subscriber_contacts`, `alert_logs` (from Phase B)
- `013_scheduled_reports.sql` — Tables: `scheduled_reports`, `report_deliveries` (from Phase B)
- `014_fleet_health_and_analytics_views.sql` — 4 views: fleet health, tyre age distribution, defect trend by brand, removal reasons (from Phase C)

**Dependencies:**
- Migration 011 (`v_manager_tyre_records`) must be applied before 014
- All migrations are idempotent (`CREATE IF NOT EXISTS`)
