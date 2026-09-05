# Migration Rollback Guide — DynaHaul X

Run these commands in order to undo a migration.

---

## Migration 012: `alert_config`

```sql
begin;
drop table if exists public.alert_logs cascade;
drop table if exists public.subscriber_contacts cascade;
drop table if exists public.alert_rules cascade;
commit;
```

---

## Migration 013: `scheduled_reports`

```sql
begin;
drop table if exists public.report_deliveries cascade;
drop table if exists public.scheduled_reports cascade;
commit;
```

---

## Migration 014: `fleet_health_and_analytics_views`

```sql
begin;
drop view if exists public.v_removal_reasons_pie;
drop view if exists public.v_defect_trend_by_position;
drop view if exists public.v_tyre_age_distribution;
drop view if exists public.v_fleet_health_score;
commit;
```

---

## Existing Migrations (001-011)

These have been applied in production. Rollback only if absolutely necessary.

| # | Rollback Command | Risk |
|---|---|---|
| 001 | `drop schema if exists ops cascade;` | Loses ALL offline submissions, domain journal |
| 002 | `-- Indexes: drop individually or leave (harmless)` | None |
| 003 | `-- RLS: revoke policies (complex, skip unless needed)` | High |
| 004 | `-- Public schema: drops tables/triggers` | Very High |
| 005 | `drop table if exists public.fuel_trip_entries;` | Medium |
| 006 | `-- Form updates: column drops` | Medium |
| 007 | `alter table public.sites drop column pressure_model_enabled, drop column pressure_base_psi, ...` | Low |
| 008 | `-- Formula alignment: no structural change` | None |
| 009 | `drop trigger trg_refresh_tyre_state_from_activity; drop view v_tyre_lifecycle_summary; ...` | **High** — canonical data model |
| 010 | `drop index idx_tyre_activity_source_unique;` | Medium |
| 011 | `drop view v_manager_tyre_records; drop view v_manager_inspection_records; drop view v_manager_pressure_events;` | Medium |

---

## Rollback Order (New Migrations)

```
014 → 013 → 012
```

Each migration is independent of the others in this project. Roll back in reverse order of application.
