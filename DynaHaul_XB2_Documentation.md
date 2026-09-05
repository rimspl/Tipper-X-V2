# DynaHaul XB2 - Project Documentation

**Version:** 2.0  
**Date:** August 2026  
**Product:** DynaHaul X v2 - Tipper Division  
**Domain:** dynahaulx.rimspl.com  

---

## Table of Contents

1. Executive Summary
2. Architecture and Tech Stack
3. Fitter App Features
4. Manager Dashboard
5. Authentication Flow
6. Database Schema
7. API Reference
8. Offline Architecture
9. Deployment Guide
10. APK Build Guide
11. Voice Pipeline
12. Known Issues and Pending
13. Presentation Demo Script

---

## 1. Executive Summary

### What is DynaHaul XB2?

DynaHaul XB2 is an offline-capable tyre fleet management system designed for Indian mining, construction, and logistics operators. It tracks tyres from fitment to removal across multiple sites, including pressure checks, inspections, RTD measurements, retreading, and scrap disposition.

### Target Users

| Role | Device | Primary Use |
|------|--------|-------------|
| Fitter | Android phone/tablet | Voice-first data capture at mine site |
| Manager | Desktop/laptop | Fleet analytics, reporting, cost tracking |
| Admin | Desktop | User management, site configuration |

### Business Value

- 17 toggleable analytics reports for data-driven decisions
- Voice-first capture - fitters speak values, no typing required
- Offline-first - works in remote mines without network
- PWA and APK - installable on Android devices
- Bilingual SMS alerts - English and Hindi

### Key Metrics

| Metric | Target |
|--------|--------|
| Sync success rate | >= 95% |
| Voice extraction accuracy | >= 85% |
| Manager correction rate | < 10% |
| Offline data retention | Full shift |

---

## 2. Architecture and Tech Stack

### System Topology

```
Fitter PWA (Mobile)         Manager Dashboard (Desktop)
        |                            |
        v                            v
  IndexedDB Queue             Supabase PostgreSQL
        |                            |
        v                            v
  Sync API (Vercel)     <-->    Supabase Views
        |                            |
        v                            v
  External Services: Fast2SMS, Resend, NVIDIA ASR
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ (Vercel serverless) |
| Server | Express 4.x (auto-discovers 19 API handlers) |
| Database | PostgreSQL via Supabase |
| Auth | Supabase email OTP + password-based sign-in |
| Client | Vanilla JS (ESM modules) + HTML - no framework |
| Offline | IndexedDB queue + service worker (fitter app) |
| SMS | Fast2SMS REST API (WhatsApp fallback to SMS) |
| Email | Resend REST API |
| Charts | Chart.js v4 |
| Voice | Web Speech API (on-device) + NVIDIA Riva ASR (server) |
| Deploy | Vercel (cloud) or local WiFi (LAN server) |
| Package | ~30KB JS bundle |

### Module Architecture (8 ESM Modules)

| Module | Purpose |
|--------|---------|
| app-core.js | Application initialization and coordination |
| form-storage-supabase-direct.js | Form data persistence |
| gatekeeper.js | Access control and routing |
| supabase-init.js | Supabase client initialization |
| email-otp-service.js | OTP email flow |
| local.js | Local development server |
| server.js | Express server with API auto-discovery |
| _env.js | Environment variable loader |

---

## 3. Fitter App Features

### Overview

The fitter app is an offline-capable PWA designed for ground staff at mine sites. It uses a voice-first approach where fitters speak data values rather than typing.

### 4 Capture Modules

#### 3.1 Tyre Fitment

- Capture new tyre installation details
- Voice input for: tyre serial, make, size, position, odometer
- Auto-populates tyre card from voice extraction
- Validates tyre serial against existing records

#### 3.2 Pressure Check

- Per-position pressure reading for all tyres on a truck
- Voice input for: found PSI, corrected PSI
- Auto-calculates variance from target pressure
- Flags pressure anomalies for manager review

#### 3.3 Tyre Inspection

- Periodic tyre condition assessment
- Voice input for: RTD1, RTD2, damage class, severity
- Photo capture for evidence
- Auto-calculates rubber utilization

#### 3.4 Tyre Removal

- Record tyre removal and disposition
- Voice input for: removal reason, disposal method
- Calculates life achieved in this run
- Updates tyre status (scrap, retread, reassign)

### Voice Capture System

| Component | Description |
|-----------|-------------|
| Web Speech API | On-device speech recognition (offline capable) |
| NVIDIA Riva ASR | Server-side ASR for higher accuracy |
| Voice Processing | Normalization, field extraction, confidence scoring |
| Microphone Permission | PWA banner prompts for mic access |

### Offline Queue Engine

- IndexedDB stores submissions locally
- Auto-sync when network available
- Manual "Sync Now" button
- Per-item status tracking: Draft > Ready > Uploading > Synced > Processing > Completed
- 3 retries with exponential backoff
- Idempotent sync protocol (no duplicate submissions)

### PWA Features

- Add to Home Screen on Android
- Offline caching via service worker (sw.js v35)
- Portrait orientation lock
- Custom app icons (192px, 512px, maskable)

---

## 4. Manager Dashboard

### Overview

The manager dashboard is a comprehensive web interface for fleet oversight, analytics, and cost tracking.

### 4 Main Tabs

#### 4.1 Tyre Records

- Full table: Tyre Number, Brand, Size, Truck Number, Position, Status
- Last Inspection, RTD1, RTD2, Odometer, Tyre Life
- First Fitment date, Actions
- Filters: tyre number, brand, truck, status, date range
- Export to Excel

#### 4.2 Inspection Records

- Columns: Date, Activity, Truck, Tyre Number, Brand, Position
- Odometer, RTD1, RTD2, PSI Found, PSI Corrected, Remarks
- Paginated (25/50/100 per page)
- Filters: date range, truck, tyre, brand, activity type
- Export to CSV

#### 4.3 Analytics (17+ Reports)

| Report | Description |
|--------|-------------|
| Fleet Health Score | Composite 0-100 gauge |
| Target vs Actual Tyre Life | Comparison table |
| Rubber Utilization | Charts and analysis table |
| Brand-wise Performance | Summary and charts |
| Pressure Leakage Impact | Tyre summary and daily readings |
| Tyre Age Distribution | Age breakdown chart |
| Defect Trend by Position | 90-day trend |
| Removal Reasons | Breakdown pie chart |
| Pressure vs Fuel Cost | Correlation chart |
| Pressure Heatmap | Visual pressure map |
| RTD Scrapping Recommendation | Tread depth <= 1.5mm |
| Retread Eligibility | Assessment |
| Brand-wise Cost per KM | Chart and table |
| P&L per Tyre | Financial breakdown |

#### 4.4 Savings Achieved

- Hero impact card with total operational cost impact
- Impact tiles grid
- Detailed breakdown table
- Export to Excel

### KPI Header Cards

- Target Tyre Life
- Target Fuel Efficiency
- Target Annual Savings
- Pressure Leakage Loss (clickable modal)

### Modals

- Pressure Loss modal
- Fuel Upload modal (CSV/Excel drag-and-drop)
- Voice Evidence modal

---

## 5. Authentication Flow

### Login Process

```
Step 1: Email + Password
    |
    v
POST /api/send-otp (action: auth_login)
    |
    v
Supabase auth/v1/token?grant_type=password
    |
    v
Validate user_profiles + sites + customers
    |
    v
Return session payload
    |
Step 2: Email OTP
    |
    v
window.EmailOTP.sendOTP(email)
    |
    v
POST /api/verify-otp -> External PHP provider
    |
    v
User enters 6-digit OTP
    |
    v
Store session in sessionStorage
    |
Step 3: Role-based Redirect
    |
    +--> userType === 'manager' -> ../manager/index.html
    |
    +--> userType === 'fitter'  -> ./index.html
```

### Session Payload Structure

```json
{
  "uid": "user-uuid",
  "email": "user@company.com",
  "username": "Full Name",
  "userType": "fitter|manager",
  "role": "user|manager",
  "siteId": "site-uuid",
  "siteName": "Mine Site Name",
  "customerId": "customer-uuid",
  "customerName": "Company Name",
  "licenseId": "license-uuid",
  "isActive": true,
  "token": "supabase-jwt",
  "refreshToken": "supabase-refresh",
  "lifeUnit": "KM",
  "lastActivity": 1234567890
}
```

### Demo Mode

A "Demo Mode" button is available on the login page for presentation purposes. It bypasses authentication and injects a minimal session directly into sessionStorage.

---

## 6. Database Schema

### Core Tables

#### customers
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Auto-generated |
| name | TEXT NOT NULL | Company name |
| created_at | TIMESTAMPTZ | Default now() |

#### sites
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Auto-generated |
| customer_id | UUID FK -> customers | Parent company |
| site_name | TEXT | Mine site name |
| target_tyre_life | NUMERIC | Target in KM/HMR |
| target_life_unit | TEXT | Default 'HMR' |
| tyre_price | NUMERIC | Average tyre cost |
| annual_demand | NUMERIC | Annual tyre demand |
| fleet_size | NUMERIC | Number of vehicles |

#### tyres
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Auto-generated |
| tyre_no | TEXT UNIQUE NOT NULL | Serial number |
| make | TEXT | Brand name |
| model | TEXT | Model name |
| size | TEXT | Tyre size |
| otd | NUMERIC | Original tread depth |
| current_vehicle_id | UUID FK -> vehicles | Currently mounted on |
| current_position | TEXT | Position code (FL, FR, etc.) |
| status | TEXT | Default 'New' |
| total_life_run | NUMERIC | Default 0 |

#### vehicles
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Auto-generated |
| vehicle_no | TEXT UNIQUE NOT NULL | Truck number |
| site_id | UUID FK -> sites | Site assignment |
| tipper_model_id | UUID FK -> tipper_model_master | Vehicle model |
| current_odometer | NUMERIC | Default 0 |
| status | TEXT | Default 'Active' |

#### tyre_activity_log
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Auto-generated |
| tyre_id | UUID FK -> tyres | Which tyre |
| vehicle_id | UUID FK -> vehicles | Which vehicle |
| user_id | UUID FK -> auth.users | Who performed |
| activity_date | DATE | Default current_date |
| activity_type | TEXT | FITMENT, REMOVAL, INSPECTION, PRESSURE_CHECK, RECAPPING |
| position | TEXT | Tyre position |
| meter_reading | NUMERIC | Odometer at activity |
| rtd1, rtd2 | NUMERIC | Remaining tread depth |
| psi_found, psi_corrected | NUMERIC | Pressure readings |
| life_achieved_in_this_run | NUMERIC | Default 0 |
| remarks | TEXT | Notes |

#### user_profiles
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK FK -> auth.users | Links to Supabase auth |
| username | TEXT | Display name |
| role | TEXT | 'manager' or 'user' |
| site_id | UUID FK -> sites | Site assignment |
| customer_id | UUID FK -> customers | Company assignment |

#### observation_entries
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Auto-generated |
| customer_id, site_id | UUID | Location context |
| vehicle_id, tyre_id | UUID FK | Related entities |
| category | TEXT | Observation type |
| observation | TEXT | Description |
| severity | TEXT | Default 'Medium' |

### Database Views

| View | Purpose |
|------|---------|
| v_fleet_health_score | Composite health metric per vehicle |
| v_tyre_age_distribution | Age breakdown for analytics |
| v_defect_trend_by_position | 90-day defect trends |
| v_removal_reasons_pie | Removal reason breakdown |

---

## 7. API Reference

### Authentication Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | /api/send-otp | Password-based sign-in + profile bundle |
| POST | /api/verify-otp | OTP verification (proxy to external provider) |

### User Management

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | /api/create-user | Create new user in Supabase |
| POST | /api/update-user-email | Update user email |
| POST | /api/send-email | Transactional email (dual-purpose) |

### Alert Engine

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | /api/send-alert | 5 event types: pressure-drop, fitment-overdue, inspection-due, rtd-threshold, daily-digest |
| POST | /api/generate-digest | Daily 8 AM SMS digest |
| POST | /api/deliver-report | Weekly Monday 8 AM report via email |

### Admin

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | /api/admin/import-fitter-csv | Bulk import fitter data from CSV |

### Review Pipeline

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | /api/v1/review/queue | Get items pending review |
| POST | /api/v1/review/action | Approve, correct, or reject |
| GET | /api/v1/review/evidence | Fetch photo/audio evidence |

### Sync Pipeline

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | /api/v1/sync/submissions-register | Register submission, get signed upload URLs |
| POST | /api/v1/sync/submissions-finalize | Verify hashes, enqueue processing |
| GET | /api/v1/sync/submissions-status | Check submission status |
| POST | /api/v1/sync/status-batch | Batch status polling |
| POST | /api/v1/sync/extract-preview | Voice/image extraction preview |
| POST | /api/v1/sync/photo-pipeline-preview | Photo processing preview |
| POST | /api/v1/sync/voice-pipeline-preview | Voice extraction preview |

**Total: 19 API endpoints**

---

## 8. Offline Architecture

### IndexedDB Stores

| Store | Purpose |
|-------|---------|
| submissions | Captured form data |
| media | Photo/audio blobs |
| sync_queue | Pending sync items |
| settings | Device and user preferences |

### Service Worker Strategy

- **Network-first** for: .js, .css, .html, .webmanifest (always try network, fall back to cache)
- **Cache-first** for: fonts, images, SVGs (serve from cache, update in background)
- On navigation failure: fall back to ./index.html (offline shell)
- Cache name: dynahaul-fitter-v35
- ~50 assets precached on install

### Sync Protocol

```
1. Submission saved to IndexedDB (status: draft)
   |
2. Marked ready for sync (status: ready)
   |
3. POST /api/v1/sync/submissions-register
   -> Returns signed upload URLs
   |
4. Upload media to Supabase Storage via signed URLs
   |
5. POST /api/v1/sync/submissions-finalize
   -> Verifies hashes, enqueues processing
   |
6. Poll status via /api/v1/sync/status-batch
   |
7. Status: completed | needs_review | failed_retryable
```

### Retry Logic

- 3 automatic retries with exponential backoff
- 1 minute, 5 minutes, 15 minutes between retries
- After 3 failures: manual retry via Queue page
- Idempotent: same idempotency_key prevents duplicates

---

## 9. Deployment Guide

### Option A: Vercel (Cloud)

1. Connect Git repo to Vercel
2. Set environment variables (see .env.example)
3. Run database migrations from migrations/ directory
4. Deploy: vercel --prod
5. Configure Fast2SMS registration for sender ID
6. Set up Resend domain verification
7. Create cron jobs for daily digest and weekly report

### Option B: Local WiFi (LAN)

1. Install Node.js 18+
2. Clone repository
3. Run: npm install
4. Copy .env.example to .env and fill values
5. Run: npm start
6. Server runs on http://0.0.0.0:3000
7. Access from any device on the same network

### Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| SUPABASE_URL | Supabase project URL | Yes |
| SUPABASE_ANON_KEY | Supabase public key | Yes |
| SUPABASE_SERVICE_ROLE_KEY | Supabase admin key | Yes (for user creation) |
| RESEND_API_KEY | Resend email API | Yes |
| FAST2SMS_API_KEY | SMS gateway API | Yes (for alerts) |
| FAST2SMS_SENDER_ID | DLT sender ID | Yes |
| OTP_PROVIDER_BASE_URL | External OTP endpoint | Yes |
| ALERT_CRON_SECRET | Cron auth secret | Yes (for scheduled tasks) |
| NVIDIA_ASR_API_KEY | Voice recognition API | Optional |

---

## 10. APK Build Guide

### Prerequisites

- Local server running on port 3000
- ngrok installed (free account)
- PWABuilder.com access

### Step-by-Step

1. **Start the server:**
   ```
   cd "Tipper demo"
   npm start
   ```

2. **Start ngrok tunnel:**
   ```
   ngrok http 3000
   ```
   Copy the https://xxxx.ngrok-free.app URL

3. **Open PWABuilder.com:**
   - Paste: https://xxxx.ngrok-free.app/fitter/
   - Click "Package for stores"
   - Select "Android"
   - Download the .apk file

4. **Install on Android:**
   - Transfer APK to device
   - Enable "Install from unknown sources"
   - Install and launch

### PWA Requirements (Already Met)

- manifest.webmanifest with display: standalone
- Service worker (sw.js) with offline caching
- Icons: 192px, 512px, maskable
- PWA meta tags in HTML

---

## 11. Voice Pipeline

### Architecture

```
Fitter speaks into microphone
        |
        v
Web Speech API (on-device, offline)
        |
        v
Voice Processing Service
  - normalizeFieldValue()
  - enrichPreferredForForm()
  - buildVoiceStepId()
        |
        v
Extracted fields with confidence scores
        |
        v
POST /api/v1/sync/voice-pipeline-preview
        |
        v
NVIDIA Riva ASR (server-side, higher accuracy)
        |
        v
Final extracted values -> Auto-fill form fields
```

### Voice Processing Features

- India English support
- Spoken number parsing (e.g., "one fifty two" -> 152)
- Hindi/Hinglish phrase support
- Alphanumeric normalization (e.g., "K zero one" -> K-01)
- Brand name matching from field masters
- Position code recognition (e.g., "front left" -> FL)

### Field Extraction

| Field | Voice Input Example | Extracted Value |
|-------|-------------------|-----------------|
| Tyre Serial | "M H one two three four five six" | MH123456 |
| Brand | "Apollo" | Apollo |
| Size | "ten zero zero twenty" | 10.00-20 |
| Position | "front left" | FL |
| PSI | "one fifty two" | 152 |
| RTD | "eight point five" | 8.5 |
| Odometer | "forty five thousand two hundred" | 45200 |

---

## 12. Known Issues and Pending

### Critical

| Issue | Status | Impact |
|-------|--------|--------|
| NVIDIA ASR API PermissionDenied | Blocked | Voice extraction fallback to Web Speech API only |
| SUPABASE_SERVICE_ROLE_KEY missing | Pending | User creation and admin writes fail |
| FAST2SMS_API_KEY missing | Pending | SMS alerts silently no-op |
| Migration 015 not applied | Pending | Missing retread_cost, rate_per_km, enabled_reports columns |

### Deferred Features

| Feature | Priority | Complexity |
|---------|----------|------------|
| Driver Ranking | High | Low |
| Downtime Clock | Medium | Medium |
| Haul Road Map | Low | High |

### Security Notes

- .env files contain real API keys (should not be committed to public repos)
- Manager dashboard trusts client-side sessionStorage (no server-side token verification on page load)
- Service role key should never be exposed to browser code

---

## 13. Presentation Demo Script

### For Client Presentation (Manager Flow)

1. Open the deployed URL in browser/projector
2. Show login page - explain the two-step auth (email+password then OTP)
3. Enter test manager credentials
4. Show OTP screen - explain security
5. Dashboard loads - walk through KPI header cards
6. Tab 1: Tyre Records - show filtering, export
7. Tab 2: Inspection Records - show pagination
8. Tab 3: Analytics - highlight key charts
9. Tab 4: Savings - show financial impact

### For Fitter Demo (Mine Workers)

1. Open the URL on mobile device
2. Show login page - explain "Demo Mode" button for quick access
3. Click "Demo Mode" - instant access to fitter dashboard
4. Show module grid: Tyre Fitment, Pressure Check, Inspection, Removal
5. Enter a module - show voice capture button
6. Speak a value - show real-time transcription
7. Show field auto-fill from voice
8. Save submission - show offline queue
9. Show sync status

### For APK Demo

1. Show app icon on Android home screen
2. Open app - goes to fitter login
3. Use Demo Mode or real login
4. Navigate through modules
5. Show offline capability (airplane mode test)
6. Show service worker caching

### Key Talking Points

- "Works offline in remote mines without network"
- "Fitters speak values - no typing required"
- "17 analytics reports for data-driven decisions"
- "Real-time sync when network available"
- "Bilingual SMS alerts in English and Hindi"
- "PWA installable - no app store needed"
- "APK available for direct installation"

---

*Document generated: August 2026*  
*DynaHaul X v2 - Tipper Division*  
*RIMSPL*
