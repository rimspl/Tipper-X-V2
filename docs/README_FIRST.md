# DynaHaul X v2 — Read This First

*32,000-ft bird's-eye view of this version.*

---

## What Is DynaHaul X

A tyre fleet management system for Indian mining, construction, and logistics operators. Tracks tyres from fitment to removal: pressure checks, inspections, RTD (tread depth), retreading, and scrapping.

Two user-facing halves:
- **Fitter App** — offline-capable mobile form entry for ground staff
- **Manager Dashboard** — web dashboard with fleet overview, analytics, per-tyre history, cost tracking

## v2 vs Original

This is `DynaHaul-X-v2/` — a **self-contained, portable copy** of the original project with all refactoring and new features applied.

| Aspect | Original (`Tipper upgrade project-June2026/`) | v2 (`DynaHaul-X-v2/`) |
|--------|------|-----|
| Status | Never modified, preserved as reference | Active development target |
| Architecture | Monolithic app-core.js (1032 lines) | 8 focused ESM modules in `src/lib/` |
| Auth | Embedded in gatekeeper.js | Extracted to `src/lib/auth.js` |
| Reports | Fixed, always visible | Toggle via Reports Index in Site Settings |
| Tyre Economics | tyre_price only | + retread_cost, rate_per_km |
| WhatsApp | Silent ignored | Falls back to SMS delivery |
| Local server | npx serve / python http.server | Express + package.json — full API support |

## What Was Refactored (Plan A)

| Change | Why |
|--------|-----|
| `_env.js` → `src/lib/env.js` | Canonical env loader location, importable as ESM |
| CLAHE duplication removed from pipeline.js | On-device CLAHE was dead code; server CLAHE kept |
| `app-core.js` decomposed into 8 modules | config, session, navigation, header, database, toast, confirm, app-init — each under 150 lines |
| Auth extracted to `src/lib/auth.js` | enforceAuth, redirectToLogin in focused module |
| WhatsApp channel → SMS fallback | WhatsApp not configured; SMS reaches same phone |
| `initOfflineSync` legacy reference removed | ESM queue-engine.js + IndexedDB queue is canonical |
| Android APK builder docs added to setup.html | PWABuilder, Bubblewrap CLI, Android Studio TWA |

**Backward compatibility:** `app-core.js` and `gatekeeper.js` are kept as dynamic loaders that detect which modules are needed and load them via path detection. Any page that hasn't been updated still works.

## What Was Added (Plan B)

| Feature | Files |
|---------|-------|
| `retread_cost` field | site-settings.html input/load/save |
| `rate_per_km` field | site-settings.html input/load/save + data-service.js |
| Reports Index (17 checkboxes) | site-settings.html — toggle visibility of any report |
| Report visibility wiring | dashboard.js applyReportVisibility() + data-report attributes |
| Pressure vs Fuel Cost chart | dashboard.js renderPressureFuelCost + index.html block |
| Pressure Heatmap grid | dashboard.js renderPressureHeatmap + CSS grid |
| RTD Scrapping Recommendation | dashboard.js renderRtdScrapping + table |
| Retread Eligibility | dashboard.js renderRetreadEligible + table |
| Brand Cost-per-KM | dashboard.js renderBrandCostPerKm + chart + table |
| P&L per Tyre | dashboard.js renderTyrePnL + table |
| `fetchRetreadCounts` | data-service.js — counts retreads per tyre from activity log |
| Deferred features doc | FEATURES-TO-ADD-LATER.md |

## Mobile App (Android APK)

The fitter app is PWA-enabled (manifest + service worker + offline cache). Install it on phones with a home-screen icon — no Play Store needed.

**Quick start:**
1. Deploy the app (Vercel or Local WiFi — see `USER_MANUAL.md`)
2. Visit `https://pwabuilder.com`, enter your app URL (e.g. `https://dynahaulx.rimspl.com/fitter/`)
3. Click **Package for Android** → download the signed APK
4. Install on any Android phone — icon appears on home screen, opens fitter login in full-screen mode

Full walkthrough with screenshots → **`docs/USER_MANUAL.md`** (Part 1, Option 0 — Install the App Icon)

## Project Structure (v2)

```
DynaHaul-X-v2/
├── api/              Serverless API endpoints
├── docs/             All documentation + specs + plans
├── EXE Setup/        Electron desktop packaging
├── fitter/           Fitter mobile-web app (PWA-enabled)
│   ├── manifest.webmanifest  NEW — PWA manifest for APK builder
│   └── icons/                NEW — Home screen icons (192, 512, maskable)
├── manager/          Manager dashboard
│   ├── index.html    ← NEW blocks for 6 analytics
│   ├── site-settings.html  ← retread_cost, rate_per_km, 17 checkboxes
│   └── src/
│       ├── pages/dashboard.js  ← 6 new render functions
│       ├── services/data-service.js  ← fetchRetreadCounts, ratePerKm
│       └── styles/dashboard.css  ← heatmap grid styles
├── migrations/       PostgreSQL migrations 001–015 + utility/ subfolder
├── tools/            Standalone tools (simulator HTML, Python scripts)
├── src/lib/          ← 18 files (10 core ESM + 8 analytics render modules)
├── app-core.js       Backward-compat dynamic loader (kept)
├── gatekeeper.js     Backward-compat dynamic loader (kept)
├── _env.js           Backward-compat env loader (kept)
├── index.html        Root landing page (entry point)
├── login.html        Login page (entry point)
├── join-company.html Company onboarding page
├── master-data.html  Master data management page
├── saved-forms-list.html  Saved forms list
├── setup.html        Setup and configuration page
├── saved-forms-list.js    Saved forms logic
├── form-storage-supabase-direct.js  Direct Supabase storage
├── email-otp-service.js    Email OTP service
├── styles.css         Root-level shared stylesheet
├── supabase-init.js   Supabase client init
├── package.json      Node.js project config — npm start
├── server.js         Local Express server — APIs + static files
├── .env              Your environment variables
└── README.md         You are here
```

## Quick Navigation

| File | What It Is |
|------|------------|
| `README.md` | Project card |
| `package.json` | Node.js project config — install deps, start server |
| `server.js` | Local Express server wrapper for all API handlers |
| `docs/memory.md` | Deep AI context for continuing development |
| `docs/USER_MANUAL.md` | How-to for installation + usage |
| `docs/ARCHITECTURE.md` | Data flow and system topology |
| `docs/DEPLOYMENT_CHECKLIST.md` | Production deployment steps |
| `docs/FEATURES-TO-ADD-LATER.md` | Deferred feature queue |
| `src/lib/` | All ESM modules (config, auth, session, header, database, toast, confirm, navigation, app-init, env) |
| `fitter/manifest.webmanifest` | PWA manifest — enables APK generation via PWABuilder |
| `fitter/icons/` | Home screen icons (192x192, 512x512, 512-maskable) |

---

*DynaHaul X v2 — June 2026*
