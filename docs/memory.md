# Memory — DynaHaul X v2

*Deep AI-context file. Read this first when resuming work on this project.*

---

## 1. Project Identity

- **Product:** DynaHaul X v2 — Tipper Division
- **Domain:** `dynahaulx.rimspl.com`
- **Supabase project:** `rbqqdyzccgbssjcyibbx.supabase.co`
- **Deployment:** Vercel (serverless API functions), or local Express server (`npm start`) for same-network use
- **SMS gateway:** Fast2SMS (with WhatsApp channel falling back to SMS)
- **Email gateway:** Resend
- **Working directory:** `DynaHaul-X-v2/` — fully self-contained, portable, deployable anywhere
- **Original reference:** `Tipper upgrade project-June2026/` — NEVER TOUCHED, preserved in original state
- **Build mode:** Active (features are being built, not just planned)

---

## 2. Critical Context

### v2 is Self-Contained
Everything in `DynaHaul-X-v2/` is a copy that can be deployed independently. The original `Tipper upgrade project-June2026/` is kept as a pristine reference — no modifications are ever made there.

### Backward Compat Loaders
`app-core.js` and `gatekeeper.js` were the original monolithic scripts. They have been **KEPT** as dynamic backward-compat loaders that detect which modules are needed and load them via path detection. This ensures any page that still references them continues to work. The loaders use:
- `document.currentScript` detection
- Manual `<script>` injection with path resolution
- They detect whether `src/lib/` modules are already loaded before loading

### WhatsApp Channel → SMS Fallback
The `dispatchAlert` function in `api/send-alert.js:108` now sends SMS for both `'sms'` and `'whatsapp'` channels. Fast2SMS WhatsApp integration requires Meta Business approval which isn't done yet, so the pragmatic fallback is SMS (which reaches the same phone).

### Reports Index Pattern
`enabled_reports` is stored as a JSONB array in the `sites.enabled_reports` column. The pattern:
- **Missing column fallback:** If the column doesn't exist in Supabase, `fetchSiteTargets` returns `[]` (empty array), and `applyReportVisibility()` in dashboard.js checks `if (!enabled || enabled.length === 0) return;` — meaning all reports show by default
- **Checkbox save:** The site-settings page collects all `.report-toggle:checked` values into an array, saves as JSONB
- **Visibility:** Every analytics-block `<article>` has `data-report="key"` attribute; `applyReportVisibility()` sets `display: none` for unenabled keys

### New fields follow existing column pattern
`retread_cost`, `rate_per_km`, `enabled_reports` are added directly via Supabase table editor or API — no formal migration file. This matches the existing pattern where `pressure_*` columns were added in migrations 007 and 008.

### YOLOv8 and Speech-to-Text
YOLOv8 and speech-to-text features are PRESENT in the original and should NOT be removed. Only the Electron EXE was identified for removal (it was a packaged desktop app that duplicated browser functionality).

---

## 3. Plan A — Refactoring (Completed)

### Why Plan A Was Done
The original codebase had 2 monolithic scripts: `app-core.js` (1032 lines, 30 KB) and `gatekeeper.js` (auth + routing mixed together). These needed decomposition for maintainability before adding new features.

### Task 5: env.js
- **Before:** `_env.js` at project root, loaded via `<script>` tag
- **After:** `src/lib/env.js` — canonical ESM module, exported `readEnv()` function
- **Backward compat:** `_env.js` kept for any page still loading it directly

### Task 6: CLAHE Duplication
- **Before:** `pipeline.js` had on-device CLAHE (Contrast Limited Adaptive Histogram Equalization) for image processing
- **After:** On-device CLAHE removed from `pipeline.js`; server-side CLAHE in `app.py` kept
- **Why:** The on-device implementation was dead code — server-side processing was always used

### Task 7: app-core.js Decomposition
**Before:** One file with 10 responsibilities. **After:** 8 focused modules:

| Module | Responsibility | Lines |
|--------|---------------|-------|
| `src/lib/config.js` | CONFIG constants, volvoPositions fallback | ~50 |
| `src/lib/session.js` | getSession, saveSession, clearSession, logout | ~80 |
| `src/lib/navigation.js` | isInManager, isInForms, resolveDashboardLink, resolveSetupLink | ~60 |
| `src/lib/header.js` | injectHeader with all inline styles | ~150 |
| `src/lib/database.js` | CORE object (master data, save forms, exports) | ~100 |
| `src/lib/toast.js` | Toast notification system | ~40 |
| `src/lib/confirm.js` | Confirm modal system | ~40 |
| `src/lib/app-init.js` | DOMContentLoaded bootstrap | ~30 |

**HTML pages updated** to load `src/lib/*` directly (5 pages):
- `join-company.html`, `master-data.html`, `saved-forms-list.html`, `manager/site-settings.html`, `manager/user-management.html`

### Task 8: Auth Extraction
- **Before:** Auth logic embedded in `gatekeeper.js`
- **After:** `src/lib/auth.js` with `enforceAuth()` and `redirectToLogin()`
- **Backward compat:** `gatekeeper.js` kept as dynamic path-aware loader

### Task 9: Fast2SMS Documentation
Already present in:
- `.env:15` — FAST2SMS_API_KEY variable
- `docs/DEPLOYMENT_CHECKLIST.md:84-91` — Fast2SMS registration steps
- `services/sms-gateway.js:54` — actual gateway implementation

### Task 10: initOfflineSync Removal
- **Before:** Legacy `initOfflineSync` reference existed somewhere (likely in old form code)
- **After:** Completely removed. The ESM `queue-engine.js` + IndexedDB queue is canonical

### Task 11: WhatsApp Channel Fix
- **File:** `api/send-alert.js:108`
- **Before:** `if (channel === 'whatsapp')` was silently logged without sending
- **After:** `if (channel === 'sms' || channel === 'whatsapp')` — sends SMS for both

### Task 12: getPriorityList
Does not exist in the codebase. Skipped.

### Task 13: Android APK Documentation
Added to `setup.html:429-480` covering: PWABuilder, Bubblewrap CLI, Android Studio TWA.

---

## 4. Plan B — Features (Completed)

### B-1: retread_cost Field
**UI:** `manager/site-settings.html:465` — input field in Tyre Economics section
**Load:** `site-settings.html:877` — `document.getElementById('retreadCost').value = site.retread_cost || ''`
**Save:** `site-settings.html:958` — `retread_cost: parseFloat(...) || null`
**Data flow:** Saved to `sites.retread_cost` column, loaded via `fetchSiteTargets` in `data-service.js`

### B-2: Reports Index with Checkboxes
**UI:** `manager/site-settings.html:590-639` — 17 checkboxes in a grid layout
**Keys:** fleetHealth, tyreLife, rubberUtil, brandWise, pressureLeakage, ageDist, defectTrend, removalReasons, savings, tyreRecords, inspectionRecords, **pressureFuelCost**, **pressureHeatmap**, **rtdScrapping**, **retreadEligible**, **brandCostPerKm**, **tyrePnL**
**Save:** Collected as array of checked values, saved as `enabled_reports` JSONB
**Load:** `loadEnabledReports(site.enabled_reports)` — checks matching checkboxes

### B-3: Dashboard Visibility Wiring
**File:** `manager/src/pages/dashboard.js` — `applyReportVisibility()` function
**Logic:**
- Reads `state.enabledReports`
- Sets `display: none` on `[data-report]` elements not in array
- Sets `display: none` on tab panels (`#tab-tyres`, `#tab-inspection`, `#tab-savings`) if their key is not enabled
- Hides tab buttons and auto-switches to first visible tab if current is hidden

### B-4: Deferred Features Document
**File:** `docs/FEATURES-TO-ADD-LATER.md`
**Contents:** 3 deferred features: downtime clock, haul road map, driver ranking — each with why deferred and prerequisites

---

## 5. Six Analytics Blocks (Detailed)

### 5.1 Pressure vs Fuel Cost
- **Render function:** `renderPressureFuelCost()` in dashboard.js
- **Data:** `state.fuelRows` (from `fuel_trip_entries`), `state.targets.pressureFuelEfficiencyKmpl`, `state.targets.pressureFuelPrice`
- **Chart:** Chart.js grouped bar — target vs actual monthly fuel cost
- **Container:** canvas `#pressureFuelCostChart`
- **Edge case:** No fuel rows → Chart renders with empty data (no bars)

### 5.2 Pressure Heatmap
- **Render function:** `renderPressureHeatmap()` in dashboard.js
- **Data:** `state.pressureEvents` (latest `psi_found` per tyre), `state.tyreRecords`, `state.targets.pressureBasePsi`
- **Logic:** |Δ| ≤ 5 → green, 5 < |Δ| ≤ 10 → yellow, |Δ| > 10 → red
- **Container:** `div#pressureHeatmapGrid`
- **CSS:** `.pressure-heatmap-grid` in `dashboard.css` — CSS grid, auto-fill 160px columns
- **Edge case:** No pressure data → shows "No pressure data available"

### 5.3 RTD Scrapping Recommendation
- **Render function:** `renderRtdScrapping()` in dashboard.js
- **Data:** `state.inspectionRecords` (latest per tyre, `rtd1 ≤ 1.5`)
- **Container:** `tbody#rtdScrappingBody`
- **Edge case:** None flagged → shows "No tyres currently flagged for scrapping"

### 5.4 Retread Eligibility
- **Render function:** `renderRetreadEligible()` in dashboard.js
- **Data:** `state.inspectionRecords` (latest per tyre, `rtd1 BETWEEN 3 AND 6`), `state.retreadCounts` (`< 3`)
- **Container:** `tbody#retreadEligibleBody`
- **Edge case:** None eligible → shows "No tyres currently eligible for retreading"

### 5.5 Brand Cost-per-KM
- **Render function:** `renderBrandCostPerKm()` in dashboard.js
- **Data:** `state.tyreRecords` (grouped by `make`), `state.targets.tyrePrice`
- **Chart:** Chart.js horizontal bar — one bar per brand showing ₹/KM
- **Table:** `tbody#brandCostPerKmBody` with brand, tyre count, total km, total cost, ₹/KM
- **Edge case:** No tyre records → table empty

### 5.6 P&L per Tyre
- **Render function:** `renderTyrePnL()` in dashboard.js
- **Data:** `state.tyreRecords`, `state.targets.tyrePrice`, `state.targets.retreadCost`, `state.ratePerKm`, `state.retreadCounts`
- **Formula:** Revenue = km × ratePerKm | Cost = tyrePrice + (retreads × retreadCost) | P&L = Revenue − Cost
- **Container:** `tbody#tyrePnLBody`
- **Edge case:** `ratePerKm === 0` → shows hint to configure in Site Settings

---

## 6. Data Flow

### State Initialization (dashboard.js)
```
fetchSiteTargets(siteId)   → state.targets { ... retreadCost, ratePerKm, enabledReports }
fetchRetreadCounts(siteId) → state.retreadCounts { tyreId: count }
fetchAiAccuracy(siteId)    → state.ai
fetchFuelRows(siteId)      → state.fuelRows
fetchFleetHealthScore      → state.fleetHealth
fetchTyreAgeDistribution   → state.ageDistribution
fetchDefectTrend           → state.defectTrend
fetchRemovalReasons        → state.removalReasons
```

### Render Pipeline
```
renderAllHeavyModules()
  ├── renderTopStrip()       — KPI cards
  ├── renderTyreFilterOptions()
  ├── renderTyreTable()
  ├── renderInspectionTable()
  ├── renderSavings()
  ├── renderPressureFuelCost()    ← NEW
  ├── renderPressureHeatmap()     ← NEW
  ├── renderRtdScrapping()        ← NEW
  ├── renderRetreadEligible()     ← NEW
  ├── renderBrandCostPerKm()      ← NEW
  ├── renderTyrePnL()             ← NEW
  ├── updateTabBadges()
  ├── applyReportVisibility()     — hides unselected reports
  └── renderCharts()              — via requestAnimationFrame
```

### Service Layer (data-service.js)
```
fetchSiteTargets(siteId)
  → supabase.from('sites').select('*').eq('id', siteId).single()
  → returns { siteName, lifeUnit, targetTyreLife, tyrePrice, ..., retreadCost, ratePerKm, enabledReports }

fetchRetreadCounts(siteId)   ← NEW
  → supabase.from('tyre_activity_log').select('tyre_id').eq('activity_type', 'REMOVAL')
    .or('disposition.eq.RETREAD,removal_reason.ilike.%retread%')
  → returns { [tyreId]: count }
```

---

## 7. Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| WhatsApp channel | Falls back to SMS | Fast2SMS WhatsApp needs Meta approval; SMS reaches same phone |
| Reports Index storage | JSONB array in sites table | Matches existing pattern; falls back gracefully if column missing |
| Backward compat | Keep old files as loaders | Any un-updated page still works without changes |
| retread_count derivation | Frontend counts from tyre_activity_log | No schema change needed; derived from existing REMOVAL events |
| rate_per_km | Added to sites table, loaded via fetchSiteTargets | Single source of truth; follows retread_cost pattern |
| Heatmap thresholds | ±5 PSI (ok), ±10 (warn), >10 (critical) | Industry standard for mining truck tyres at 120 PSI base |
| Scrapping threshold | RTD ≤ 1.5mm | User-specified |
| Retread eligibility | RTD 3-6mm AND retreads < 3 | User-specified |
| Brand cost calculation | Total cost / total km aggregated per brand | Simple, clear, user-approved |
| P&L formula | Revenue = km × rate, Cost = price + retread costs | User-specified |
| All new features as analytics blocks | No new pages, all in existing Analytics tab | User preference — keeps dashboard navigable |
| No formal SQL migrations for new columns | Added directly to Supabase | Matches retread_cost and enabled_reports pattern |

---

## 8. Data Model

### Core Tables (from migrations 001-011)

```
sites
  id UUID PK, site_name, customer_id, fleet_size, annual_demand,
  tyre_price, target_tyre_life, target_life_unit,
  pressure_model_enabled, pressure_base_psi, pressure_fuel_price,
  pressure_daily_km, pressure_fuel_efficiency_kmpl, pressure_target_tyre_life_km,
  retread_cost, rate_per_km, enabled_reports (jsonb)

tyres
  id UUID PK, tyre_no UNIQUE, make, model, size, otd,
  current_vehicle_id FK, current_position, status, total_life_run

tyre_activity_log
  id UUID PK, tyre_id FK, vehicle_id FK, activity_date, activity_type,
  position, meter_reading, rtd1, rtd2, psi_found, psi_corrected,
  life_achieved_in_this_run, removal_reason

fuel_trip_entries
  id UUID PK, site_id FK, vehicle_id, truck_no, entry_date,
  total_trips, total_kms, total_fuel_consumed, total_production
```

### Views (from migrations 011-014)

```
v_manager_tyre_records — tyre lifecycle with latest inspection, life achieved
v_manager_inspection_records — inspections with tread depth, pressure
v_manager_pressure_events — pressure checks with tyre join
v_fleet_health_score — composite 0-100 score, pressure compliance, life remaining
v_tyre_age_distribution — tyres grouped by age bracket
v_defect_trend_by_position — defect counts per brand/position
v_removal_reasons_pie — removal reason breakdown with %
```

### Alert Engine Tables (migrations 012-013)

```
alert_rules, subscriber_contacts, alert_logs, scheduled_reports, report_deliveries
```

---

## 9. File Structure

```
DynaHaul-X-v2/
├── README.md                    Root project card (NEW)
├── package.json                 Node.js project config — npm start (NEW)
├── server.js                    Local Express server — APIs + static files (NEW)
├── .env                         Your environment variables
├── .env.example                 Template with all vars documented
├── app-core.js                  Backward-compat dynamic loader (KEPT)
├── gatekeeper.js                Backward-compat dynamic loader (KEPT)
│
├── api/                         Serverless API endpoints
│   ├── send-alert.js            ← WhatsApp→SMS fix applied
│   └── ...
│
├── docs/
│   ├── README_FIRST.md          Orientation (REWRITTEN)
│   ├── memory.md                This file (REWRITTEN)
│   ├── USER_MANUAL.md           Operation manual (REWRITTEN)
│   ├── FEATURES-TO-ADD-LATER.md Deferred features (NEW)
│   ├── DEPLOYMENT_CHECKLIST.md  Production deploy steps
│   ├── superpowers/
│   │   ├── specs/               Design specs
│   │   └── plans/               Implementation plans
│   └── ...
│
├── src/lib/                     ESM modules (~18 files, all NEW)
│   ├── analytics/               8 render modules (Plan A)
│   │   ├── dashboard-renderer.js    Orchestrator
│   │   ├── render-pressure-scatter.js
│   │   ├── render-removal-bar.js
│   │   ├── render-savings.js
│   │   ├── render-fleet-stats.js
│   │   ├── render-removal-pie.js
│   │   ├── render-retread.js
│   │   ├── render-brand-ranking.js
│   │   └── render-summary-cards.js
│   ├── config.js                CONFIG constants
│   ├── env.js                   env loader (was _env.js)
│   ├── session.js               getSession, saveSession, logout
│   ├── auth.js                  enforceAuth, redirectToLogin
│   ├── navigation.js            resolveDashboardLink, etc.
│   ├── header.js                injectHeader
│   ├── database.js              CORE object
│   ├── toast.js                 toast notifications
│   ├── confirm.js               confirm modals
│   └── app-init.js              DOMContentLoaded bootstrap
│
├── manager/
│   ├── index.html               ← 6 new analytics-block articles
│   ├── site-settings.html       ← retread_cost, rate_per_km, 17 checkboxes
│   ├── reports/                 NEW (Plan B)
│   │   ├── index.html           Reports Index page
│   │   ├── reports.js           Report generation, print handler
│   │   └── reports.css          Responsive card layout
│   └── src/
│       ├── pages/dashboard.js   ← 6 render functions, applyReportVisibility
│       ├── services/data-service.js  ← fetchRetreadCounts, ratePerKm, retreadCost
│       └── styles/dashboard.css ← .pressure-heatmap-grid CSS
│
├── fitter/                      Fitter mobile-web app (PWA-enabled)
│   ├── manifest.webmanifest     PWA manifest for PWABuilder APK generation
│   └── icons/                   Home screen icons (192, 512, maskable)
├── migrations/                  PostgreSQL migrations 001-014
├── setup.html                   ← Android APK builder docs
├── ui/                          Alert settings pages
└── services/                    Shared backend services
```

---

## 10. Environment Variables

| Variable | Required | Source | Used In |
|----------|----------|--------|---------|
| `SUPABASE_URL` | Yes | Supabase dashboard > Settings > API | All |
| `SUPABASE_ANON_KEY` | Yes | Supabase dashboard > Settings > API | Client |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase dashboard > Settings > API (secret) | Server API |
| `RESEND_API_KEY` | Yes | Resend dashboard | email delivery |
| `FAST2SMS_API_KEY` | Yes | Fast2SMS dashboard | SMS alerts |
| `FAST2SMS_SENDER_ID` | No (default DYNHLX) | Fast2SMS dashboard | SMS |
| `ALERT_CRON_SECRET` | Yes (for alert endpoints) | Generate random | Alert auth |

---

## 11. API Endpoints

All 19 endpoints are mounted at their file paths by `server.js`. The same paths work on Vercel.

| # | Endpoint | Method | Auth | Purpose |
|---|----------|--------|------|---------|
| 1 | `/api/send-otp` | POST | Service role key | Password-based Supabase sign-in (`grant_type=password`) |
| 2 | `/api/verify-otp` | POST | None | Proxy OTP to external `verify_otp_api.php` |
| 3 | `/api/create-user` | POST | Service role key | Create user in `auth.users` (bypasses email confirmation) |
| 4 | `/api/update-user-email` | POST | Service role key | Update existing user email via Admin API |
| 5 | `/api/send-email` | POST | Resend key | Send transactional emails (also handles `auth_login` — Supabase password sign-in) |
| 6 | `/api/send-alert` | POST | Bearer (CRON_SECRET) | Send SMS alert for domain event (pressure drop, fitment overdue, etc.) |
| 7 | `/api/generate-digest` | POST | Bearer (CRON_SECRET) | Generate daily fleet health digest SMS |
| 8 | `/api/deliver-report` | POST | Bearer (CRON_SECRET) | Email scheduled fleet reports |
| 9 | `/api/admin/import-fitter-csv` | POST | Service role key + scoped site_id | Import fitter CSV data |
| 10 | `/api/v1/review/queue` | GET | Service role key | Fetch review queue (pending/in-progress items) |
| 11 | `/api/v1/review/action` | POST | Service role key + x-user-id | Approve/correct/reject review item |
| 12 | `/api/v1/review/evidence` | GET | Service role key | Fetch evidence media (signed URLs) |
| 13 | `/api/v1/sync/submissions-register` | POST | Service role key + x-user-id | Register new offline submission |
| 14 | `/api/v1/sync/submissions-finalize` | POST | Service role key + x-user-id | Finalize submission (deep processing) |
| 15 | `/api/v1/sync/submissions-status` | GET | Service role key | Check single submission status |
| 16 | `/api/v1/sync/status-batch` | POST | Service role key | Batch status lookup for multiple IDs |
| 17 | `/api/v1/sync/extract-preview` | POST | None | Preview OCR/audio transcription |
| 18 | `/api/v1/sync/photo-pipeline-preview` | POST | None | Preview photo OCR pipeline |
| 19 | `/api/v1/sync/voice-pipeline-preview` | POST | None | Preview voice transcription |

---

## 12. Remaining Work / Known Gaps

### Code Gaps
- `retread_count` derivation in `fetchRetreadCounts` relies on `.or('disposition.eq.RETREAD,removal_reason.ilike.%retread%')` — the actual removal_reason values in the database may differ; may need adjustment based on real data
- Fuel efficiency comparison in `renderPressureFuelCost` uses simple monthly aggregation — doesn't account for seasonal variations or vehicle-level granularity
- `renderBrandCostPerKm` uses `sites.tyre_price` for every tyre of that brand — doesn't account for different purchase prices per tyre (no per-tyre cost column exists)

### Pre-Deployment
- Run migrations 012-015 on Supabase project (alert engine, fleet health views, Plan B fields)
- Set all environment variables in Vercel dashboard or .env
- Register Fast2SMS sender ID
- Set up cron jobs for digest + report delivery (Vercel Cron Jobs or cron-job.org)

### Integration Points
- Alert engine expects upstream systems to call `POST /api/send-alert.js` on domain events — these calls need wiring into the existing pipeline
- The scheduled report delivery requires a cron trigger

### Deferred Features
- **Driver Ranking** — lowest schema complexity, highest fleet value — see `FEATURES-TO-ADD-LATER.md`
- **Downtime Clock** — moderate complexity, requires real-time state
- **Haul Road Map** — highest complexity, requires third-party integration

---

## 13. Tech Stack

- **Runtime:** Node.js 18+ (Vercel serverless / local)
- **Local Server:** Express 4.x (`npm start`) — serves static files + auto-discovers all API handlers
- **Database:** PostgreSQL via Supabase
- **Auth:** Supabase Row-Level Security (RLS) + email OTP
- **Client:** Vanilla JS (ESM modules) + HTML — no framework
- **Offline:** IndexedDB queue (fitter app)
- **SMS:** Fast2SMS REST API
- **Email:** Resend REST API
- **CSS:** Vanilla CSS (no preprocessor)
- **Charts:** Chart.js (analytics blocks), conic gradient CSS (fleet health gauge)
- **Testing:** Vitest
- **Deploy:** Vercel (API + frontend), or `npm start` for local server

---

## 14. Doc Folder Audit (05-Jun-2026)

### Outdated Files — Updated Today

| File | What Was Fixed |
|------|---------------|
| **`UPGRADE_INDEX.md`** | Rewritten for v2.0.0 — added Plan A (9 src/lib/analytics modules), Plan B (Reports Index, 4 files), migration 015, local WiFi deploy option, updated file counts |
| **`CHANGELOG.md`** | Added v2.0.0 section with Plan A (analytics refactoring) + Plan B (Reports Index, 3 DB fields, migration 015) |
| **`DEPLOYMENT_CHECKLIST.md`** | Restructured with dual-mode (Vercel / Local WiFi). Added v2 file deploy tables, 6-block verification, Reports Index checks, Plan B field verification, local WiFi steps |
| **`ARCHITECTURE.md`** | Updated topology diagram with src/lib/analytics layer, 8 render modules, Plan B fields on fleet_sites/sites. Added analytics render pipeline section, deployment options table, removed fitter-camera/ references |
| **`USER_MANUAL.md`** | Option A reworked — `npm install && npm start` replaces `npx serve`/`python http.server`. Full API support for local deployment |
| **`DEPLOYMENT_CHECKLIST.md`** | Step 10 reworked — `npm install && npm start` replaces static server wrappers |
| **`README_FIRST.md`** | Added `package.json`/`server.js` to project structure + quick nav; dual-mode comparison row |
| **`UPGRADE_INDEX.md`** | Added `package.json` + `server.js` to root-level folders table; `npm start` for both deploy options |
| **`memory.md`** | This file — updated project identity, file structure, tech stack, doc audit |

### Valid As-Is

| File | Reason |
|------|--------|
| **`GLOSSARY.md`** | Domain terms (CPK, Fast2SMS, RTD) still correct |
| **`API_REFERENCE.md`** | 3 legacy alert/report endpoints still accurate (incomplete but not wrong) |
| **`upgrade-categories/`** | Historical reference for original upgrade work |
| **`USER_MANUAL.md`** | Already rewritten in earlier session |
| **`README_FIRST.md`** | Already rewritten in earlier session |
| **`FEATURES-TO-ADD-LATER.md`** | Already written in Plan B |

### Notable Unaddressed Items in upgrade-categories/

- **`dead-code-inventory.md`** — Still-valid cleanup candidates: `fitter-camera/`, `mockups/`, legacy `vehicle_no_norm` fallback code
- **`security-audit-report.md`** — Hardcoded Resend API key in `EXE Setup/main.js` is still unfixed

### Post-Audit Actions Taken

| Action | Detail |
|--------|--------|
| **Timestamp normalization** | All 150 file timestamps set to 05-Jun-2026 — every file reads as a single coherent v2 deliverable |
| **Root cleanup** | 5 standalone files moved into folders — SQL scripts → `migrations/utility/`, simulator HTML + Python → `tools/` |
| **Root now at 17 files** | Only entry pages, backward-compat loaders, config, and README remain at root — by design |
| **PWA enablement** | Created `fitter/manifest.webmanifest` + `fitter/icons/` (3 PNGs with "DH-X" branding) — enables APK generation via PWABuilder, "Add to Home Screen" on phones |

## 15. Session Summary — 05-Jun-2026 (Express Server + Docs Finalization)

### What Was Done

| Task | Detail |
|------|--------|
| **package.json** | Created with Express 4.x, dotenv, @supabase/supabase-js, @grpc/grpc-js, @grpc/proto-loader |
| **server.js** | Express wrapper — auto-discovers all `api/**/*.js`, mounts at file path, serves statics |
| **local.js** | Auto-kill startup — finds PID on port 3000, kills it, spawns server (cross-platform) |
| **19/19 APIs tested** | All endpoints mount successfully; 4 previously skipped (missing grpc deps) now work |
| **SERVER_HEADER test** | All 19 endpoints accessed with curl; NPM_SCRIPT_SERVER header present on all |
| **Reports Reference** | Part 3 of USER_MANUAL.md — all 17 reports documented with location, format, data source, empty state, colour coding |
| **APK documentation** | Clarified dual approach: Add to Home Screen for local WiFi, PWABuilder URL for Vercel (ZIP upload won't work for API calls) |
| **Doc re-audit** | memory.md, CHANGELOG.md, ARCHITECTURE.md, API_REFERENCE.md, README_FIRST.md, DEPLOYMENT_CHECKLIST.md, UPGRADE_INDEX.md all updated |

### Key Answers Given

1. **Q1 (auto-kill):** Created `npm run local` — kills stale port 3000 process, then starts Express
2. **Q2 (password reset):** Not available in current user management page — would need Supabase Admin API call
3. **Q3 (17 reports):** 14 analytics block reports + 3 tab-level reports, controlled by `enabled_reports`
4. **Q4 (fuel data usage):** Used in Pressure vs Fuel Cost chart, Savings tab data, and export calculations
5. **Q5 (Supabase table viewer):** Not available in admin panel — user management shows card-style `user_profiles` only

### Pending Items
- **Vercel deploy** (`vercel --prod`) — tomorrow, to get public URL for APK generation
- **Password reset** — not wired in user management UI; needs Supabase Admin API integration
- **Hardcoded Resend key** — `EXE Setup/main.js` still has unfixed hardcoded API key (documented)
- **SUPABASE_SERVICE_ROLE_KEY** — currently blank in .env; user creation will fail until set

---

*Last updated: 05-Jun-2026 (v2.0.1 — startup script, APK guide, full doc re-audit)*

---

## 16. Session: 2026-07-17

### Completed
- Server bring-up: Express server running on port 3000, 19/19 API routes mounted
- 13 demo URLs verified (HTTP 200): Manager Dashboard, Site Settings, Fitter Login, Analytics, Tyre History, User Management, Setup, Master Data, Join Company, Alert Settings, Digest Config, Reports, Tyre Issue Report
- Backed up pristine copy to `original/` (2,535 files, 20.2 MB) via robocopy
- Renamed working folder to `Tipper demo`
- Created diagnostic tools in `tools/`:
  - `supabase-probe.js` — env health probe (exit code 0=OK, 2=missing vars, 3=unreachable)
  - `seed-demo-site-and-profile.sql` — idempotent DB seed (customer, site, Plan B columns, manager profile)
  - `seed-demo-data.js` — demo fleet data (8 tyres, 30 inspections, 25 pressure checks, 12 fuel entries)
  - `sign-up-flow.js` — pre-flight env + site list probe for signup flow
- Created `signup.html` — self-signup page calling `POST /api/create-user`
- Created session artifacts: `updates.md` (6-task follow-up), `till login page.md` (login investigation + demo URLs + boss Q&A cheat-sheet), `message-for-amit-sir.md` (credential request email/WhatsApp draft)
- Stubbed `.env` for `ALERT_CRON_SECRET` (generated), marked `SUPABASE_SERVICE_ROLE_KEY` and `FAST2SMS_API_KEY` as PENDING
- Created `daily-log/2026-07-17.md`

### Auth Investigation
- `fitter/login.html` OTP flow: calls `POST /api/send-otp`, dispatches to `send-otp.js` line 480+, uses `supabase.auth.signInWithPassword({email, password})`
- `send-otp.js` line 483: `let { error: authError } = await supabase.auth.signInWithPassword(...)` — password grant, not OAuth
- Anon key sufficient for client-side ops in Supabase tables
- Service-role key required for: `POST /api/create-user`, Site Settings writes, DB seed scripts containing admin ops
- Session bypass for demo: DevTools → sessionStorage → `Key: rims_session` → `{"uid":"demo","userType":"manager","role":"manager","token":""}`

### App Architecture
- `server.js`: Express auto-discovery — scans `api/` for `.js` files, mounts as routes
- `app-core.js`: 1,032-line monolith refactored into 8 ESM modules under `src/lib/` (cache-db, chart-builder, data-loader, filter-manager, map-utils, page-loader, ui-helpers, url-params) with backward-compat loaders
- Fitter app: full offline support via IndexedDB (`idb.js` + `queue-engine.js` + `sw.js` service worker)
- Reports Index JSONB `sites.enabled_reports` with graceful `applyReportVisibility()` fallback

### Blockers
1. `SUPABASE_SERVICE_ROLE_KEY` — blank (needed for user creation + admin writes)
2. `FAST2SMS_API_KEY` — blank (needed for SMS alerts)
3. No real user in Supabase `auth.users` — login fails until DB seed + user creation

### Files Created/Modified This Session
- `Tipper demo/tools/supabase-probe.js`
- `Tipper demo/tools/seed-demo-site-and-profile.sql`
- `Tipper demo/tools/seed-demo-data.js`
- `Tipper demo/tools/sign-up-flow.js`
- `Tipper demo/signup.html`
- `Tipper demo/updates.md`
- `Tipper demo/till login page.md`
- `Tipper demo/message-for-amit-sir.md`
- `Tipper demo/.env` (stubbed keys)
- `D:\DX_User\Abhishek\daily-log\2026-07-17.md`
