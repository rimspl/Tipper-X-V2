# DynaHaul X v2 — Tyre Fleet Management

Offline-capable tyre tracking and analytics for Indian mining, construction, and logistics operators. Tracks tyres from fitment to removal across multiple sites: pressure checks, inspections, RTD measurements, retreading, and scrap disposition.

## Quick Start

| Step | What |
|------|------|
| **1** | Read `docs/README_FIRST.md` |
| **2** | Set `.env` with Supabase + Fast2SMS + Resend keys |
| **3** | Deploy to Vercel or serve locally |
| **4** | Open the Fitter App on mobile, Manager Dashboard on desktop |
| **5** | Configure Site Settings for retread costs, rate/km, report visibility |

## Tech Stack

- **Runtime:** Node.js 18+ (Vercel serverless)
- **Database:** PostgreSQL via Supabase
- **Auth:** Supabase Row-Level Security (RLS) + email OTP
- **Client:** Vanilla JS (ESM modules) + HTML — no framework
- **Offline:** IndexedDB queue (fitter app)
- **SMS:** Fast2SMS REST API
- **Email:** Resend REST API
- **Charts:** Chart.js (dashboard analytics)
- **Deploy:** Vercel (API + frontend), also runs locally via any static server

## Key Features

- **Fitter App** — offline form entry for pressure, inspections, tyre cards
- **Manager Dashboard** — fleet overview, per-tyre history, cost tracking
- **6 Analytics Blocks** — Pressure vs Fuel Cost, Pressure Heatmap, RTD Scrapping, Retread Eligibility, Brand Cost-per-KM, P&L per Tyre
- **Reports Index** — toggle visibility of any report section from Site Settings
- **Retread Cost & Rate per KM** — site-level tyre economics fields
- **SMS Alerts** — push alerts for pressure drops, fitment overdue, inspections due, tyre removal, RTD threshold
- **Fleet Health Score** — composite 0-100 health gauge
- **WhatsApp→SMS Fallback** — WhatsApp channel redirects to SMS delivery
- **Modular Architecture** — app-core.js decomposed into 8 focused ESM modules
- **Backward Compat Loaders** — legacy gatekeeper.js and app-core.js kept as dynamic path-aware loaders

## Documentation

| File | Purpose |
|------|---------|
| `docs/README_FIRST.md` | Orientation — read before anything |
| `docs/memory.md` | Full AI context (for AI coding agents) |
| `docs/USER_MANUAL.md` | Step-by-step installation + usage |
| `docs/DEPLOYMENT_CHECKLIST.md` | Production deploy steps |
| `docs/ARCHITECTURE.md` | Data flow and system topology |
| `docs/API_REFERENCE.md` | All API endpoints |
| `docs/CHANGELOG.md` | Version history |
| `docs/FEATURES-TO-ADD-LATER.md` | Deferred feature queue |

## Related

- Original project: `Tipper upgrade project-June2026/` — never modified
- v2 is fully self-contained in `DynaHaul-X-v2/` — portable, deployable anywhere
