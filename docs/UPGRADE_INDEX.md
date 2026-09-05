# Upgrade Project Index — DynaHaul X v2.0.0

**This directory is the complete, upgraded DynaHaul X project.** Contains the original 3,920 source files plus all upgrade additions (v1 alert/report engine + v2 analytics refactor). Zip and deploy anywhere — fully self-contained.

---

## Root-Level Folders

| Folder | Purpose |
|---|---|
| `api/` | Serverless API endpoints (original + alert/report endpoints) |
| `docs/` | All upgrade documentation, category references, tests |
| `EXE Setup/` | Electron desktop app packaging |
| `fitter/` | Fitter mobile-web app (offline-capable) |
| `forms/` | Form definitions and templates |
| `manager/` | Manager dashboard web app (modified extensively for v1 + v2) |
| `migrations/` | PostgreSQL migrations 001–015 (012–015 are new) + `utility/` subfolder with ad-hoc SQL scripts |
| `scripts/` | Utility scripts |
| `tools/` | Standalone tools (simulator HTML, Python scripts) |
| `services/` | Shared backend services (original + SMS gateway) |
| `shared/` | Shared frontend/backend modules (original + alert templates) |
| `ui/` | Alert settings, digest config, and Reports Index pages |
| `package.json` | Node.js project config — `npm install` + `npm start` for local server |
| `server.js` | Local Express server — serves all API endpoints + static files |

---

## What Was Added / Modified

### v1.0.0 — Alert & Reporting Engine (Phase A–E)
*Deployed: 05-Jun-2026 — 18 new/modified deployable files.*
See `CHANGELOG.md` for full breakdown.

### v2.0.0 — Plan A (Refactoring) + Plan B (New Features)
*Deployed: 05-Jun-2026 — analytics rebuild, 6 new blocks, Reports Index.*

#### Modified Files (Plan A)

| File | Change |
|---|---|
| `manager/index.html` | 6 new analytics block containers, Reports Index page, removed 3 old stubs |
| `manager/src/pages/dashboard.js` | Decomposed: 850-line render pipeline broken into 5 modular files |

#### Plan A — New Files (src/lib/ decomposition)

| File | Purpose |
|---|---|
| `manager/src/lib/analytics/dashboard-renderer.js` | Orchestrator: shared state, sort/export, renders all 6 blocks |
| `manager/src/lib/analytics/render-pressure-scatter.js` | Pressure heatmap scatter plot (canvas-based, colour-coded by PSI) |
| `manager/src/lib/analytics/render-removal-bar.js` | Tyre removal reason bar chart (horizontal bars, top-5 ranking) |
| `manager/src/lib/analytics/render-savings.js` | Cost savings / retread comparison (CPK delta, savings cards) |
| `manager/src/lib/analytics/render-fleet-stats.js` | Fleet overview cards, gauge, brand-donut, scatter-popover |
| `manager/src/lib/analytics/render-removal-pie.js` | Removal reason pie chart (canvas arc segments, legend) |
| `manager/src/lib/analytics/render-retread.js` | Retread analysis (cost comparison table + bar chart) |
| `manager/src/lib/analytics/render-brand-ranking.js` | Brand ranking table (CPK, life, achievement % by brand) |
| `manager/src/lib/analytics/render-summary-cards.js` | Fleet summary / KPI card strip |

#### Plan B — New Files (Features)

| File | Purpose |
|---|---|
| `manager/reports/index.html` | Reports Index: standalone page, 8 filter/action cards |
| `manager/reports/reports.js` | Report generation logic, print handler, page navigation |
| `manager/reports/reports.css` | Reports Index responsive layout + card styling |

#### New UI / Backend

| File | Purpose |
|---|---|
| `ui/reports-index.html` | Reports Index in ui/ layout (alternative entry) |
| `ui/reports.css` | Shared reports styling |

#### New / Modified DB Fields

| Migration | Change |
|---|---|
| `migrations/015_plan_b_fields.sql` | Adds `retread_cost` (DECIMAL), `rate_per_km` (DECIMAL) to `fleet_sites`; `enabled_reports` (TEXT[]) to `sites` |

### Documentation & Tests (updated for v2.0.0)

| Location | Contents |
|---|---|
| `docs/` (root) | README_FIRST, UPGRADE_INDEX, memory, USER_MANUAL, ARCHITECTURE, API_REFERENCE, GLOSSARY, DEPLOYMENT_CHECKLIST, CHANGELOG |
| `docs/upgrade-categories/01-Database-Migrations/` | Migration reference |
| `docs/upgrade-categories/02-Alert-Notification-Engine/` | Alert engine reference |
| `docs/upgrade-categories/03-Reporting-Analytics-Upgrade/` | Reporting upgrade reference |
| `docs/upgrade-categories/04-Security-Configuration/` | Security audit + fix guide |
| `docs/upgrade-categories/05-Testing-Quality/` | QA checklist, 3 test suites, cleanup docs |
| `docs/superpowers/` | Brainstorming design docs, session specs, plans |

---

## File Counts (v2.0.0)

| Layer | Files |
|---|---|
| Original project files | 3,920 |
| v1 upgrade files (deployable) | 16 |
| v2 Plan A files (deployable) | 9 |
| v2 Plan B files (deployable) | 4 |
| Modified files (overwrite originals) | 3 |
| Documentation & tests | 25+ |
| **Total** | **~3,977** |

---

## Deploy Options

### Vercel (Cloud)
1. Zip the entire project folder
2. Transfer to target machine
3. Unzip
4. Configure `.env` from `.env.example`
5. Run migrations 001–015 in order
6. Run `npm install` (so Vercel detects `package.json`)
7. Run `vercel --prod` to deploy

### Local WiFi (Offline-First)
1. Set up a local machine (Raspberry Pi, old desktop, laptop) as a LAN server
2. Install Node.js + PostgreSQL locally
3. Copy project to local machine
4. Configure `.env` with local Supabase or self-hosted Postgres connection
5. Run migrations 001–015
6. Run `npm install` to install dependencies
7. Run `npm start` to start the server (static files + all API endpoints)
8. Access from any device on the LAN via `http://<local-ip>:3000`

---

*Generated 05-Jun-2026 — v2.0.0*
