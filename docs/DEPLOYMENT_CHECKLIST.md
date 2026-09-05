# Deployment Checklist — DynaHaul X v2.0.0

*Follow this order to deploy to production. Check off each item as completed.*

---

## Step 1: Choose Deployment Mode

| Mode | When To Use | Instructions ↓ |
|---|---|---|
| **Vercel (Cloud)** | Remote fleet managers, multi-site, always-on internet | Follow Steps 2–9 |
| **Local WiFi (LAN)** | Single-site, offline-first, low-bandwidth, no cloud cost | Skip to Step 10 |

---

## Step 2: Supabase — Run Migrations

Apply new SQL migrations on top of existing 001–011.

- [ ] Run `migrations/012_alert_config.sql` — creates alert_rules, subscriber_contacts, alert_logs
- [ ] Run `migrations/013_scheduled_reports.sql` — creates scheduled_reports, report_deliveries
- [ ] Run `migrations/014_fleet_health_and_analytics_views.sql` — creates 4 analytics views
- [ ] Run `migrations/015_plan_b_fields.sql` — adds retread_cost, rate_per_km, enabled_reports
- [ ] Verify: `SELECT * FROM alert_rules LIMIT 1;` — returns empty set (no error)
- [ ] Verify: `SELECT * FROM v_fleet_health_score LIMIT 1;` — returns columns (may be empty)
- [ ] Verify: `SELECT retread_cost, rate_per_km FROM fleet_sites LIMIT 1;` — new columns exist

> **Note:** Migration 014 depends on `v_manager_tyre_records` from migration 011. Ensure 011 was applied.

---

## Step 3: Vercel — Set Environment Variables

Set these in Vercel dashboard (Project > Settings > Environment Variables).

- [ ] `SUPABASE_URL` — `https://rbqqdyzccgbssjcyibbx.supabase.co`
- [ ] `SUPABASE_ANON_KEY` — from Supabase dashboard
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — from Supabase dashboard (keep secret!)
- [ ] `RESEND_API_KEY` — from Resend dashboard
- [ ] `FAST2SMS_API_KEY` — from Fast2SMS dashboard
- [ ] `FAST2SMS_SENDER_ID` — `DYNHLX` (or your approved sender ID)
- [ ] `ALERT_CRON_SECRET` — generate: `openssl rand -hex 32` or similar
- [ ] Redeploy Vercel project to pick up new env vars

**Set for all environments (Production, Preview, Development).**

---

## Step 4: Vercel — Deploy v1 Files (Alert Engine)

### New API Functions

| File | Vercel Path |
|---|---|
| `api/send-alert.js` | `/api/send-alert` |
| `api/generate-digest.js` | `/api/generate-digest` |
| `api/deliver-report.js` | `/api/deliver-report` |

### Modified Manager Files (v1)

| File | What Changed |
|---|---|
| `manager/index.html` | Fleet health gauge, date filter, 3 analytics tables |
| `manager/src/pages/dashboard.js` | 5 new render functions, fleet health score, date filter |

### New Manager Files (v1)

| File | Deploy To |
|---|---|
| `manager/src/lib/data-queries.js` | `/manager/src/lib/` |
| `manager/src/report/generate-report.js` | `/manager/src/report/` |
| `manager/src/styles/dashboard-mobile.css` | `/manager/src/styles/` |

### New UI Pages (v1)

| File | Purpose |
|---|---|
| `ui/alert-settings.html` | Tabbed alert rule/subscriber/history UI |
| `ui/alert-settings.js` | CRUD logic for alert settings |
| `ui/digest-config.html` | Report schedule and recipient config |

### New Root Files (v1)

| File | Purpose |
|---|---|
| `_env.js` | Centralised env-var loader |
| `.env.example` | Documented env template |

---

## Step 5: Vercel — Deploy v2 Files (Plan A + B)

### New Manager Analytics Modules (Plan A)

| File | Deploy To |
|---|---|
| `manager/src/lib/analytics/dashboard-renderer.js` | `/manager/src/lib/analytics/` |
| `manager/src/lib/analytics/render-pressure-scatter.js` | `/manager/src/lib/analytics/` |
| `manager/src/lib/analytics/render-removal-bar.js` | `/manager/src/lib/analytics/` |
| `manager/src/lib/analytics/render-savings.js` | `/manager/src/lib/analytics/` |
| `manager/src/lib/analytics/render-fleet-stats.js` | `/manager/src/lib/analytics/` |
| `manager/src/lib/analytics/render-removal-pie.js` | `/manager/src/lib/analytics/` |
| `manager/src/lib/analytics/render-retread.js` | `/manager/src/lib/analytics/` |
| `manager/src/lib/analytics/render-brand-ranking.js` | `/manager/src/lib/analytics/` |
| `manager/src/lib/analytics/render-summary-cards.js` | `/manager/src/lib/analytics/` |

### New Reports Index (Plan B)

| File | Deploy To |
|---|---|
| `manager/reports/index.html` | `/manager/reports/` |
| `manager/reports/reports.js` | `/manager/reports/` |
| `manager/reports/reports.css` | `/manager/reports/` |
| `ui/reports-index.html` | `/ui/` |
| `ui/reports.css` | `/ui/` |

### Modified Manager Files (v2)

| File | What Changed |
|---|---|
| `manager/index.html` | 6 new analytics block containers, Reports Index link, removed 3 stubs |

---

## Step 6: Fast2SMS — Registration

- [ ] Register/Login at `https://www.fast2sms.com/`
- [ ] Verify your business (KYC documents if required)
- [ ] Add DLT (Distributed Ledger Technology) registration for your SMS template headers
- [ ] Create sender ID `DYNHLX` (or use your approved ID)
- [ ] Purchase SMS credits (minimum pack)
- [ ] Generate API key from Fast2SMS dashboard
- [ ] Test: `curl -X POST "https://www.fast2sms.com/dev/bulkV2" -H "authorization: <KEY>" -H "Content-Type: application/json" -d '{"sender_id":"DYNHLX","message":"Test","numbers":"9876543210"}'`
- [ ] Set `FAST2SMS_API_KEY` in Vercel env vars
- [ ] **DLT Headers:** Register these message templates with your SMS provider:
  - `PRESSURE_ALERT`
  - `FITMENT_OVERDUE`
  - `INSPECTION_DUE`
  - `TYRE_REMOVED`
  - `RTD_THRESHOLD`
  - `DAILY_DIGEST`

---

## Step 7: Resend — Verify Configuration

- [ ] Login to Resend dashboard
- [ ] Verify domain `rimspl.com` (or your sending domain) is authenticated
- [ ] Generate or verify existing API key
- [ ] Set `RESEND_API_KEY` in Vercel env vars
- [ ] Test: Send a test email via the delivery endpoint

---

## Step 8: Cron Jobs — Set Up Schedulers

Set up Vercel Cron Jobs or use an external service like cron-job.org.

### Daily Digest (every morning)

```
URL:   https://dynahaulx.rimspl.com/api/generate-digest
Method: POST
Headers: Authorization: Bearer <ALERT_CRON_SECRET>
Body:   { "site_id": "<each-site-uuid>" }
Schedule: 0 8 * * *   (daily at 8 AM)
```

> **Run this once per site.** Alternatively, modify `generate-digest.js` to iterate all sites.

### Weekly Report Delivery (Monday morning)

```
URL:   https://dynahaulx.rimspl.com/api/deliver-report
Method: POST
Headers: Authorization: Bearer <ALERT_CRON_SECRET>
Body:   { }
Schedule: 0 8 * * 1   (every Monday at 8 AM)
```

> Empty body = process all due reports.

---

## Step 9: Verification — End-to-End Tests

### Alert Engine

- [ ] `POST /api/send-alert` with valid `pressure_drop` payload → 200 + SMS received
- [ ] `POST /api/send-alert` with missing fields → 400
- [ ] `POST /api/send-alert` without auth header → 403
- [ ] `POST /api/generate-digest` with valid site_id → 200 + SMS received
- [ ] Alert Settings UI loads in browser
- [ ] Create rule via UI → persists in alert_rules table
- [ ] Create subscriber via UI → persists in subscriber_contacts table
- [ ] History tab shows test alert logs

### v1 Reporting & Analytics

- [ ] Dashboard loads with fleet health gauge
- [ ] Date range filter changes analytics data
- [ ] Age distribution table populates
- [ ] Defect trend by brand table shows top 5
- [ ] Removal reasons table shows percentages
- [ ] Mobile view (768px width) renders without horizontal scroll
- [ ] Generate Fleet Report → opens printable HTML
- [ ] Scheduled report sends email
- [ ] Digest Config UI saves and loads settings

### v2 — 6 New Analytics Blocks

- [ ] **Fleet Stats** — overview cards, gauge, brand donut, scatter popover all render
- [ ] **Summary Cards** — KPI card strip loads with correct data
- [ ] **Pressure Heatmap** — scatter plot with coloured PSI zones renders on canvas
- [ ] **Removal Bar Chart** — horizontal bars for top-5 removal reasons
- [ ] **Removal Pie Chart** — arc segments with legend for removal breakdown
- [ ] **Savings** — cost savings cards with CPK delta comparison
- [ ] **Brand Ranking** — table with CPK, avg life, achievement % per brand
- [ ] **Retread Analysis** — cost comparison table + bar chart

### v2 — Reports Index

- [ ] `/manager/reports/index.html` loads with 8 filter/action cards
- [ ] Each card navigates or triggers its action
- [ ] Print handler works
- [ ] Responsive layout at 768px and 480px

### v2 — PWA / Mobile App Install

- [ ] Verify `fitter/manifest.webmanifest` loads without 404: open `https://your-app-url/fitter/manifest.webmanifest`
- [ ] Verify `fitter/icons/icon-192.png`, `icon-512.png`, `icon-512-maskable.png` are accessible
- [ ] Test "Add to Home Screen" on an Android phone — opens fitter login in standalone mode
- [ ] (Optional) Generate APK via `https://pwabuilder.com` — enter app URL, download, install on test phone

### v2 — Plan B Database Fields

- [ ] Verify `retread_cost` column exists in `fleet_sites`
- [ ] Verify `rate_per_km` column exists in `fleet_sites`
- [ ] Verify `enabled_reports` column exists in `sites`
- [ ] Set sample values → savings/retread analytics blocks reflect them

---

## Step 10: Security — Post-Deployment Checks

- [ ] Run `grep -rn "['\"]re_" EXE\ Setup/` — confirm no hardcoded Resend keys
- [ ] Run `grep -rn "service_role" manager/` — confirm no service role key in client code
- [ ] Verify `.env` is NOT in the deployed bundle
- [ ] Verify `ALERT_CRON_SECRET` is required for alert/digest endpoints
- [ ] Run `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';` — verify RLS enabled on all tables

---

## Step 11: Production Go-Live

- [ ] Notify Segment 1 users: dashboard has new features
- [ ] Configure first alert rules and subscribers per site
- [ ] Configure first scheduled reports per site
- [ ] Set `retread_cost` and `rate_per_km` for each site
- [ ] Enable relevant report types via `enabled_reports`
- [ ] Monitor alert_logs for first 48 hours for delivery failures
- [ ] Monitor Fast2SMS balance
- [ ] Confirm cron jobs are firing on schedule

---

## Step 10 (alternate): Local WiFi Deployment

*Skip to here if deploying locally instead of Vercel. The built-in `server.js` runs all API functions locally — no Vercel needed.*

### Prerequisites

- [ ] Machine with Node.js 18+ installed
- [ ] PostgreSQL 14+ running (local or networked)
- [ ] Project copied to local machine

### Steps

- [ ] Run migrations 001–015 against local PostgreSQL
- [ ] Configure `.env` with local DB connection + external API keys (Fast2SMS, Resend)
- [ ] Install dependencies: `npm install`
- [ ] Start server: `npm start`
- [ ] Verify the terminal shows `DynaHaul X v2 — Server running`
- [ ] Verify access from another device on LAN: `http://<server-ip>:3000/manager/`
- [ ] Confirm login works (OTP sent and verified)
- [ ] Set up cron jobs on the local machine (cron / Task Scheduler) for digest + reports
- [ ] Test alert engine with a sample POST to `/api/send-alert` via localhost

### LAN Access

```
Manager Dashboard:  http://<server-ip>:3000/manager/
Reports Index:      http://<server-ip>:3000/manager/reports/
Alert Settings:     http://<server-ip>:3000/ui/alert-settings.html
Digest Config:      http://<server-ip>:3000/ui/digest-config.html
```

---

*DynaHaul X — June 2026 (v2.0.0)*
