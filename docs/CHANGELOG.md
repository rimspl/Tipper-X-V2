# Changelog — DynaHaul X Upgrade

*All notable changes to the upgrade project. Dates in DD-Mon-YYYY format.*

---

## v2.0.1 — 05-Jun-2026

Local Express server wrapper + startup script + full deployment documentation.

### Added
- `package.json` — project deps (express, dotenv, @supabase/supabase-js, @grpc/grpc-js, @grpc/proto-loader) with npm scripts: `start`, `local`, `deploy`
- `server.js` — Express server that auto-discovers and mounts all `api/**/*.js` handlers (19 endpoints), serves static files, SPA fallback
- `local.js` — auto-kill startup script: finds PID on port 3000, kills it, spawns server (Windows + Unix)
- `npm run local` — single command: kill stale process → start fresh server → all 19 APIs ready

### Updated
- `docs/USER_MANUAL.md` — Part 3 (Reports Reference) completely rewritten: all 17 reports documented with location, format, data source, empty state, colour coding
- `docs/USER_MANUAL.md` — Option A rewritten for Express server; Option 0 (APK) clarified with ZIP upload limitation + dual approach (Add to Home Screen for local, PWABuilder URL for remote)
- `docs/memory.md` — Full session summary, section 9 (file structure) updated, footer bumped to v2.0.1
- `docs/README_FIRST.md` — Added package.json/server.js to file tree and Quick Navigation
- `docs/DEPLOYMENT_CHECKLIST.md` — Step 10 rewritten for `npm install && npm start`
- `docs/UPGRADE_INDEX.md` — Added package.json + server.js to root-level folders; both deploy options updated

### Fixed
- 4 API files initially skipped (voice-pipeline sync endpoints) due to missing `@grpc/grpc-js` and `@grpc/proto-loader` — now all 19 mount successfully
- No more `npx serve` or Python HTTP server needed for local deployment — Express handles both static files and API routing

---

## v2.0.0 — 05-Jun-2026

Plan A (refactoring) + Plan B (new features). Analytics rebuild, 6 new blocks, Reports Index.

### Plan A — Analytics Code Refactoring

**Why:** The original `dashboard.js` had grown to 850+ lines with 11 render functions, inline state management, and no separation of concerns. Making changes was risky and slow.

**What changed:**
- Decomposed the monolithic render pipeline into 8 standalone modules under `src/lib/analytics/`
- Created `dashboard-renderer.js` as the single orchestrator — owns shared state, sort/export, and composite renders
- Each chart type got its own module: pressure scatter, removal bar, savings, fleet stats, removal pie, retread, brand ranking, summary cards
- All modules are pure-function based — receive data, return DOM, zero global side effects
- `manager/index.html` updated — 6 new analytics block containers, Reports Index page, removed 3 old stubs

### Plan B — New Features

**Reports Index Page**
- `manager/reports/index.html` — standalone page with 8 filter/action cards
- `reports.js` — report generation, print handler, page navigation
- `reports.css` — responsive card layout

**3 New Database Fields**
- `retread_cost` (DECIMAL) on `fleet_sites` — per-tyre retreading cost for savings calculations
- `rate_per_km` (DECIMAL) on `fleet_sites` — per-km operational rate
- `enabled_reports` (TEXT[]) on `sites` — which report types are active for a site

**Migration 015** — `migrations/015_plan_b_fields.sql`

---

## v1.0.0 — 05-Jun-2026

Initial upgrade release. Merged with original project (3,958 files total). 18 new/modified deployable files across 5 categories.

### Phase C — Reporting & Analytics (v1.0.0-c)

*Executed first — most impactful for Segment 1 users.*

**Added:**
- Fleet health score view `v_fleet_health_score` with 5-component weighted calculation (SQL)
- Tyre age distribution view `v_tyre_age_distribution` (0–90, 91–180, 181–365, 365+ days)
- Defect trend by position view `v_defect_trend_by_position` with top-5 ranking per brand
- Removal reasons view `v_removal_reasons_pie` with count and percentage
- `data-queries.js` — standalone cached fetch module for analytics views (replaces dependency on 56 KB `data-service.js`)
- Fleet health gauge on dashboard (conic gradient CSS, 0–100 scale)
- Date-range filter bar affecting all analytics widgets
- Age distribution table with brand/size grouping
- Defect trend by brand table (top 5)
- Removal reason breakdown table
- `dashboard-mobile.css` — responsive breakpoints at 768px and 480px
- Print-optimized weekly fleet report generator (`generate-report.js`)
- Scheduled report delivery endpoint (`deliver-report.js`) via Resend
- Digest config UI (`digest-config.html`) for report schedule management

**Modified:**
- `manager/index.html` — added fleet health gauge element, date filter bar, 3 analytics table containers
- `manager/src/pages/dashboard.js` — full copy + 5 new render functions, import `data-queries.js`, state additions, date filter event handlers

### Phase B — Alert & Notification Engine (v1.0.0-b)

*Executed second — primary deliverable for Segment 2 buyers.*

**Added:**
- `alert_rules` table — defines WHEN to fire (event type + threshold + site)
- `subscriber_contacts` table — WHO receives alerts (validated Indian mobile numbers)
- `alert_logs` table — audit trail of every dispatch attempt
- `scheduled_reports` table — configurable report schedule per site
- `report_deliveries` table — delivery tracking
- `sms-gateway.js` — Fast2SMS wrapper with 10/min/site rate limiting and exponential backoff retry
- `alert-templates.js` — bilingual (English + Hindi) templates for all 5 alert types + daily digest
- `send-alert.js` — POST endpoint for real-time alert dispatch
- `generate-digest.js` — POST endpoint for daily fleet health SMS summary
- `alert-settings.html` — tabbed manager UI (Rules / Subscribers / History)
- `alert-settings.js` — CRUD logic with paginated history view

### Phase D — Cleanup Documentation (v1.0.0-d)

*Executed third — supporting documentation.*

**Added:**
- `dead-code-inventory.md` — 4 candidates: fitter-camera/, mockups/, root scripts, legacy vehicle_no_norm fallbacks
- `migration-rollback-guide.md` — rollback SQL for 012–014 + existing 001–011 with risk ratings

### Phase A — Security & Configuration (v1.0.0-a)

*Executed fourth — hardening.*

**Added:**
- `_env.js` — centralized env-var loader (single import point, replaces duplicate `readEnv()` calls)
- `.env.example` — documented template with all 8 variables, placeholders, and source instructions
- `security-audit-report.md` — 5 findings: hardcoded Resend key (HIGH), anon key exposure (LOW), service role key (MEDIUM), license verification gap (MEDIUM), OTP URL default (LOW)
- `fix-hardcoded-secrets.md` — 6-step checklist with grep commands and verification steps

### Phase E — Testing & Quality (v1.0.0-e)

*Executed fifth — verification.*

**Added:**
- `pipeline.test.js` — fitter pipeline E2E (enqueue, sync, stale-recovery, retry logic)
- `analytics.test.js` — CPK, variance, achievement %, rubber utilization, fleet health score calculations
- `alerts.test.js` — bilingual template generation, SMS validation, rate limiting, trigger logic
- `qa-checklist.md` — 30+ manual verification items across all categories

---

*DynaHaul X Tipper Division — June 2026*
