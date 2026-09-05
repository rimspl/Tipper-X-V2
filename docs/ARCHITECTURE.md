# DynaHaul X — Architecture

---

## 1. System Topology

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Vercel (Serverless)                             │
│                                                                         │
│  ┌─────────────────┐   ┌─────────────────┐   ┌──────────────────────┐  │
│  │ Manager UI       │   │ Alert UI        │   │ Reports Index        │  │
│  │ (dashboard.js +  │   │ (settings)      │   │ (reports/index.html) │  │
│  │  src/lib/analyt- │   └────────┬────────┘   └──────────┬───────────┘  │
│  │  ics/ 8 modules) │            │                       │              │
│  └────────┬─────────┘            │                       │              │
│           │                      │                       │              │
│  ┌────────┴─────────┐   ┌───────┴───────┐   ┌───────────┴───────────┐  │
│  │ src/lib/analytics│   │ send-alert.js │   │ deliver-report.js     │  │
│  │  /dashboard-     │   │ generate-     │   │                       │  │
│  │  renderer.js     │   │ digest.js     │   │                       │  │
│  │  (orchestrator)  │   └───────────────┘   └───────────────────────┘  │
│  └────────┬─────────┘                                                 │
│           │                                                           │
│  ┌────────┴──────────────────────────────────────────────────────┐    │
│  │  src/lib/analytics/ modules (pure-function renderers)         │    │
│  │                                                               │    │
│  │  render-pressure-scatter.js   render-removal-bar.js           │    │
│  │  render-savings.js            render-fleet-stats.js           │    │
│  │  render-removal-pie.js        render-retread.js               │    │
│  │  render-brand-ranking.js      render-summary-cards.js         │    │
│  └──────────────────────────────────────────────────────────────┘    │
│           │                                                           │
└───────────┼───────────────────────────────────────────────────────────┘
            │
            ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          Supabase (PostgreSQL)                            │
│                                                                          │
│  Existing Tables:            Upgrade Tables:                             │
│  ┌────────────────────┐    ┌────────────────────────────┐                │
│  │ fleet_sites (+)    │    │ alert_rules                │                │
│  │ tyres              │    │ subscriber_contacts        │                │
│  │ tyre_activity      │    │ alert_logs                 │                │
│  │ tyre_history       │    │ scheduled_reports          │                │
│  │ pressure_readings  │    │ report_deliveries          │                │
│  │ inspections        │    └────────────────────────────┘                │
│  │ fitment_log        │                                                  │
│  │ licenses           │    Upgrade Views:                                │
│  │ sites (+)          │    ┌────────────────────────────┐                │
│  │ ... (10+ tables)   │    │ v_fleet_health_score       │                │
│  └────────────────────┘    │ v_tyre_age_distribution    │                │
│                            │ v_defect_trend_by_position │                │
│   (+) = Plan B fields      │ v_removal_reasons_pie      │                │
│   retread_cost,            └────────────────────────────┘                │
│   rate_per_km,                                                           │
│   enabled_reports                                                        │
└──────────────────────────────────────────────────────────────────────────┘
            │
            │
┌───────────┴──────────────────────┐
│       External Services          │
│                                  │
│  ┌────────────┐                  │
│  │ Fast2SMS   │◄── SMS API      │
│  │ (SMS gw)   │                  │
│  └────────────┘                  │
│                                  │
│  ┌────────────┐                  │
│  │ Resend     │◄── Email API    │
│  │ (Email gw) │                  │
│  └────────────┘                  │
│                                  │
│  ┌─────────────────┐             │
│  │ Local WiFi       │             │
│  │ (LAN Server)     │             │
│  └─────────────────┘             │
└──────────────────────────────────┘
```

---

## 2. Analytics Render Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│  manager/src/pages/dashboard.js (entry point)                       │
│                                                                     │
│  1. Query DOM for block containers (6 sections)                     │
│  2. Fetch data via data-queries.js (cached fetch)                   │
│  3. Delegate to dashboard-renderer.js                               │
│  4. dashboard-renderer.js coordinates sub-renderers                 │
│  5. Each sub-renderer returns DOM fragment                          │
│  6. dashboard-renderer.js mounts fragments into containers          │
│  7. Attaches sort/export event handlers                             │
│  8. Appends date-filter change listener                             │
└─────────────────────────────────────────────────────────────────────┘

  Sub-renderers (pure functions, receive data → return DOM):

  render-fleet-stats.js        → Fleet overview cards + health gauge
  render-summary-cards.js      → KPI summary strip (CPK, avg life, etc.)
  render-pressure-scatter.js   → Pressure heatmap scatter (canvas)
  render-removal-bar.js        → Removal reason bar chart (canvas)
  render-removal-pie.js        → Removal reason pie chart (canvas)
  render-savings.js            → Cost savings cards + CPK delta
  render-brand-ranking.js      → Brand ranking table
  render-retread.js            → Retread analysis (cost comparison)
```

---

## 3. Alert Engine Data Flow

```
┌──────────┐     ┌─────────────────────┐     ┌─────────────────┐
│ Upstream │────>│ POST /api/send-alert │────>│ Validate Payload│
│ System   │     │ .js                 │     │ (site_id,       │
│ (cron /  │     └──────────┬──────────┘     │  event_type,    │
│  pipeline│                │                 │  payload)       │
│  hook)   │                ▼                 └────────┬────────┘
└──────────┘     ┌──────────────────┐                  │
                 │ Match Against    │◄──── query ───────┘
                 │ alert_rules      │
                 │ (by site + type) │
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │ Fetch Active     │
                 │ Subscribers      │
                 │ (by site)        │
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │ Generate Message │◄──── alert-templates.js
                 │ (EN + HI)        │      (pure functions)
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │ Dispatch SMS     │◄──── sms-gateway.js
                 │ (Fast2SMS)       │      (rate limited)
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │ Write alert_logs │────> Return { success,
                 │ (status, time)   │       dispatched, failed }
                 └──────────────────┘
```

---

## 4. Daily Digest Flow

```
┌─────────────────────────────────────────────────────┐
│                 Cron (Daily 8 AM)                    │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│          POST /api/generate-digest.js                │
│                                                      │
│  1. Verify Authorization: Bearer <CRON_SECRET>       │
│  2. Query v_fleet_health_score for site              │
│  3. Count alert_logs from last 24h                   │
│  4. Compose SMS via dailyDigest template             │
│  5. Broadcast to all active subscribers              │
│  6. Return { success, broadcast: N }                │
└─────────────────────────────────────────────────────┘
```

---

## 5. Scheduled Report Flow

```
┌─────────────────────────────────────────────────────┐
│          Cron (Every Monday 8 AM)                    │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│          POST /api/deliver-report.js                 │
│                                                      │
│  1. Query scheduled_reports where schedule matches   │
│  2. For each due report:                             │
│     a. Call generate-report.js for the site          │
│     b. Generate fleet health HTML                    │
│     c. Send via Resend to all recipients             │
│     d. Write report_deliveries row                   │
│  3. Return { reports_generated, emails_sent }       │
└─────────────────────────────────────────────────────┘
```

---

## 6. Fitter Pipeline (For Context)

```
┌──────────────┐      ┌──────────────┐      ┌───────────────┐
│ Ground Staff  │─────>│ IndexedDB    │─────>│ Supabase      │
│ (Offline)     │      │ Queue Engine │      │ PostgreSQL    │
│               │      │              │      │               │
│ Fill form     │      │ Store locally│      │ Apply RLS,    │
│ → submit      │      │ → retry 3x   │      │ fire triggers │
│               │      │ → expire 45s │      │ → update views│
└──────────────┘      └──────────────┘      └───────┬───────┘
                                                     │
                                                     ▼
                                            ┌─────────────────┐
                                            │ v_manager_tyre_  │
                                            │ records (+ more) │
                                            └────────┬────────┘
                                                     │
                        ┌────────────────────────────┤
                        │                            │
                        ▼                            ▼
                ┌──────────────┐           ┌──────────────────┐
                │ Alert Engine │           │ Manager Dashboard│
                │ (triggers)   │           │ (queries views)  │
                └──────────────┘           └──────────────────┘
```

---

## 7. Data Model: Entity Relationships

```
site (fleet_sites)
│   + retread_cost (Plan B)
│   + rate_per_km (Plan B)
│
├── sites (sites table)
│   + enabled_reports (Plan B)
│
├── tyres (tyre lifecycle: fitment → inspection → pressure → removal → scrap)
│
├── alert_rules ── has many ──> alert_logs
│
├── subscriber_contacts (receives SMS)
│
├── scheduled_reports ── has many ──> report_deliveries
│
├── v_fleet_health_score (view, aggregated from tyres + activity)
│
├── v_tyre_age_distribution (view, aggregated from tyres)
│
├── v_defect_trend_by_position (view, aggregated from inspections)
│
└── v_removal_reasons_pie (view, aggregated from tyre_history)
```

---

## 8. Auth Boundaries

```
┌─────────────────────────────────────────────────────────────────────┐
│ Auth Layer                                                           │
│                                                                      │
│  Public (anon key)                │  Service Role (server-side)     │
│  ───────────────────────          │  ────────────────────────        │
│  Manager UI pages                 │  send-otp.js                    │
│  (dashboard + Reports Index)      │  send-email.js                  │
│  Fitter forms                     │  send-alert.js                  │
│  Login page                       │  generate-digest.js             │
│  Dashboard (read views)           │  deliver-report.js              │
│  Alert Settings UI (read)         │                                  │
│                                   │                                  │
│  Bearer Secret (cron→api)         │  Row-Level Security             │
│  ──────────────────────────       │  ────────────────────           │
│  send-alert.js                    │  All tables: RLS enabled        │
│  generate-digest.js               │  Policies check site_id + role  │
│  deliver-report.js                │                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 9. Deployment Options

| Option | When To Use | How To Start | Trade-offs |
|---|---|---|---|
| **Vercel (Cloud)** | Remote fleet managers, multi-site, always-on | `vercel --prod` | Dependent on internet, monthly cost |
| **Local WiFi (LAN)** | Single-site, offline-first, low-bandwidth | `npm run local` | Free, self-contained, requires local maintenance |

### Local Express Server

The `package.json` + `server.js` pair provides a local fallback with full API support:

- **`npm run local`** — auto-kills any stale process on port 3000, then starts Express
- **`npm start`** — bare start (no auto-kill, for production use)
- **Auto-discovery** — `server.js` recursively finds all `api/**/*.js` files and mounts their exported handlers at their file paths (e.g. `api/create-user.js` → `POST /api/create-user`)
- **19 API endpoints** mounted, matching the Vercel serverless deployment exactly
- **Static file serving** — Express serves `manager/`, `fitter/`, `ui/` as static dirs
- **Cross-platform** — `local.js` handles `taskkill` (Windows) and `SIGKILL` (Unix) PID cleanup

```js
// server.js:164 — Express mounts API handlers at their file paths
mountApiRoutes(app, baseDir, apiDir);
// → GET  /api/v1/review/evidence     → api/v1/review/evidence.js
// → POST /api/v1/sync/submissions-register → api/v1/sync/submissions-register.js
```

---

*DynaHaul X — June 2026 (v2.0.1)*
