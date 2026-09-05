# DynaHaul X v2 — User Manual

*For site managers, fleet supervisors, and ground staff.*

---

## Part 1: Installation

### Option 0: Install the App Icon on Your Phone (Recommended)

Before accessing the app, install it on your phone so it opens like a native app with an icon on the home screen.

**Method 1: Add to Home Screen (Browser built-in) — Recommended for Local WiFi**

*Takes 10 seconds per phone. No APK, no installation files. Works on any phone (Android + iPhone).*

1. Open the app URL in Chrome on your phone
2. Tap the menu (⋮) → **Add to Home Screen**
3. Name it "DynaHaul" → tap **Add**
4. An icon appears on your home screen — tapping it opens the fitter app in full-screen mode

**Method 2: Install via APK (Android — for Vercel remote deployment)**

*Generates a standalone Android APK. Best for fleet-wide deployment when the app is deployed on Vercel (internet-accessible). For local WiFi, use Method 1 instead.*

**Prerequisite:** Your app must be deployed to a **public URL** (Vercel). ZIP-uploaded APKs cannot call API endpoints. See Option B below for Vercel setup.

**Step 1: Deploy to Vercel**
1. Open a terminal in the project folder
2. Run: `vercel --prod`
3. Vercel gives you a URL like `https://dynahaul-x-v2.vercel.app`

**Step 2: Open PWABuilder**
- On your laptop, open `https://pwabuilder.com`

**Step 3: Enter Your Vercel URL**
- In the text box, type: `https://dynahaul-x-v2.vercel.app/fitter/`
- Click **Start**

**Step 4: PWABuilder Crawls Your App**
It will fetch your manifest, service worker, and icons. The page shows a scorecard:
- Manifest ✅ (name, icons, colors all present)
- Service Worker ✅ (offline cache configured)
- Icons ✅ (192, 512, maskable)
- Our app passes all checks automatically.

**Step 5: Package for Android**
- Click the **Package for Stores** tab
- Find the **Android** card → click **Package for Android**
- Choose **Signed** → click **Download**
- PWABuilder generates an `.apk` file (~2-5 MB)

**Step 6: Install on a Phone**

*Option A — Direct file transfer:*
- Send the `.apk` file to the phone (email, WhatsApp, USB cable, or Google Drive)
- Open the file on the phone → Android prompts "Install unknown app"
- Tap **Install** → the "DynaHaul" icon appears on the home screen

*Option B — QR code (best for many phones):*
- On the PWABuilder results page, look for the QR code
- Scan it from each phone → APK downloads directly
- Open the downloaded file → tap **Install**

**Step 7: Verify**
- Tap the "DynaHaul" icon on the phone home screen
- It opens the fitter app in standalone mode — full screen, no address bar, no browser tabs
- Enter email + password → OTP → logged in

> **Important:** APKs built from a ZIP upload (without a server URL) **will NOT work** because the API calls (`/api/send-otp`, `/api/verify-otp`, etc.) need a running server. Always use the **URL method** with PWABuilder for a functional APK.

> **Which to choose:** Use **Method 1** (Add to Home Screen) for local WiFi deployment. Use **Method 2** (APK via Vercel URL) for remote teams who need to access the app from anywhere.

### Option A: Local WiFi (Same Network)

*Use when everyone is on the same office WiFi — laptop + mobile phones. All API functions run locally — login, alerts, everything works without Vercel.*

**Step 1: Prerequisites**
- A laptop/desktop with Node.js 18+ installed
- All user phones connected to the same WiFi network
- A Supabase project (free tier works) — get URL + Anon Key from `Settings > API`

**Step 2: Configure Environment**
1. Open the `DynaHaul-X-v2` folder
2. Copy `.env.example` to `.env` (if `.env` doesn't exist already)
3. Fill in these values in `.env`:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key-here
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   RESEND_API_KEY=re_xxx          (optional, for email)
   FAST2SMS_API_KEY=xxx           (optional, for SMS alerts)
   ```

**Step 3: Install Dependencies**
1. Open a terminal in the `DynaHaul-X-v2` folder
2. Run:
   ```
   npm install
   ```

**Step 4: Start the Server**
1. In the same terminal, run:
   ```
   npm run local
   ```
2. This script **auto-kills any old process** on port 3000, then starts fresh. The terminal will show:
   ```
   DynaHaul X v2 — Server running
     Local:    http://127.0.0.1:3000
     Network:  http://192.168.1.100:3000   (use this for phones)
   ```
3. The server serves **both** static files and all 19 API endpoints — login, alerts, everything works.

> **Tip:** If the server was already running, `npm run local` kills the old instance and replaces it with a new one. No need to manually find and kill processes.

**Step 5: Access on Mobile**
1. On the laptop, note the IP address shown in the terminal
2. On each mobile phone, open Chrome and type: `http://192.168.1.100:3000`
3. The Fitter App loads — ground staff can start entering data
4. **Optional:** Tap Chrome menu → **Add to Home Screen** for an icon on the phone's home screen

> **Tip:** Phones access the **same URL** as the laptop. The app auto-detects mobile vs desktop and shows the right interface. The service worker caches files for offline use — even without internet, the fitter app works.

### Option B: Vercel (Internet Access)

*Use when users need to access the app from anywhere (different locations, 4G mobile networks).*

**Step 1: Create a Vercel Account**
1. Go to `https://vercel.com` and sign up (GitHub account works)
2. Install Vercel CLI: `npm install -g vercel`

**Step 2: Deploy**
1. Open a terminal in the `DynaHaul-X-v2` folder
2. Run: `vercel`
3. Follow the prompts (login, link project, deploy)
4. Vercel gives you a URL like `https://dynahaul-x-v2.vercel.app`

**Step 3: Set Environment Variables**
1. In Vercel dashboard, go to your project > Settings > Environment Variables
2. Add the same variables from Step 2 (Option A, Step 2)
3. Redeploy or Vercel automatically applies them

**Step 4: Access**
- Everyone opens the Vercel URL in their browser
- Laptops get the Manager Dashboard, phones get the Fitter App
- Works on any internet connection — WiFi, 4G, anything
- **For mobile users:** After loading once, tap Chrome menu → **Add to Home Screen** for quick access without typing the URL

---

## Part 2: First-Run Setup

### 2.1 Create Your Account
1. Open the app in your browser
2. Click **Join Company** or **Create Account**
3. Enter your company/email details
4. You'll receive an OTP on your email or phone
5. Enter the OTP to log in

### 2.2 Create a Site
1. From the Manager Dashboard, go to **Site Settings**
2. Enter your **Site Name** (e.g., "Bharat West Mine")
3. Enter your **Fleet Size** (number of vehicles)
4. Enter **Annual Demand** (tyres per year)
5. Click **Save**

### 2.3 Configure Tyre Economics
1. Still in Site Settings, find the **Tyre Economics** section
2. Set the fields:

| Field | What It Is | Example |
|-------|------------|---------|
| **Tyre Purchase Price (₹)** | Cost of one new tyre | `45000` |
| **Retread Cost (₹)** | Cost per retreading cycle | `12000` |
| **Rate per KM (₹)** | Revenue earned per km the tyre runs | `0.75` |
| **Target Tyre Life** | Expected life of a tyre | `120000` |
| **Life Unit** | KM or Hours (HMR) | `KM` |

3. Click **Save Changes**

### 2.4 Configure Reports Index
1. In Site Settings, scroll to **Reports Index**
2. You'll see 17 checkboxes — one for every report section on the dashboard
3. **Uncheck** any report you don't want to see — that section hides from the dashboard
4. All are checked by default (everything visible)
5. Click **Save Changes**

### 2.5 Set Pressure Model Targets
1. In Site Settings, scroll to **Pressure Model** section
2. Set your targets:

| Field | Example |
|-------|---------|
| **Base PSI** | `120` |
| **Temperature Zone (°C)** | `45` |
| **Fuel Price (₹/L)** | `90` |
| **Daily KM** | `250` |
| **Tires per Truck** | `6` |
| **Fuel Efficiency (km/L)** | `2.8` |
| **Calibration Interval (days)** | `30` |

3. Click **Save Changes**

---

## Part 3: Reports Reference — Complete Guide

The dashboard has **4 tabs** containing **17 reports total**. Every report can be toggled on/off from **Site Settings** → **Reports Index** (see Part 2.4).

### 3.1 How Visibility Works

1. Go to **Site Settings** → scroll to **Reports Index**
2. **17 checkboxes** — one per report — all checked by default
3. Uncheck any report → that section hides from the dashboard
4. Unchecking Savings, Tyre Records, or Inspection Records hides the **entire tab**
5. Click **Save Changes** → refresh the dashboard → only checked reports appear

### 3.2 Tab: Tyre Records (1 report)

| Report Key | `tyreRecords` |
|------------|--------------|
| **Location** | Tyre Records tab (tab-level) |
| **What it shows** | Full list of every tyre in your fleet |
| **Format** | HTML table with columns: Tyre No, Brand, Size, Status (Running/Spare/Scrap/Retread), Truck (vehicle), Position, Latest Inspection Date, Tread Depth (mm), Life Achieved (KM) |
| **Filters** | Brand dropdown, Tyre Number search, Truck filter, Status filter, Date range |
| **Sort** | Click any column header |
| **Export** | Excel (.xlsx) button |
| **Per-tyre history** | Click a tyre row → opens history section below showing all inspection + pressure events for that tyre |
| **When empty** | Table shows "No tyres found for this site" |
| **Data source** | `v_manager_tyre_records` view (from `tyres` + `tyre_activity_log` tables) |

### 3.3 Tab: Inspection Records (1 report)

| Report Key | `inspectionRecords` |
|------------|-------------------|
| **Location** | Inspection Records tab (tab-level) |
| **What it shows** | Every inspection event recorded in the system |
| **Format** | HTML table with columns: Date, Tyre No, Truck, Position, Tread Depth (RTD1, RTD2 mm), PSI (Found/Corrected), Odometer (KM) |
| **Pagination** | 50 rows per page, click page numbers |
| **Per-tyre history** | Click a tyre row → shows all inspections for that tyre |
| **Export** | Excel (.xlsx) button |
| **When empty** | Table shows "No inspection records found" |
| **Data source** | `v_manager_inspection_records` view |

### 3.4 Tab: Savings (1 report)

| Report Key | `savings` |
|------------|----------|
| **Location** | Savings tab (tab-level) |
| **What it shows** | Operational cost impact — how much money the fleet saved (or lost) |
| **Format** | Hero card (total savings ₹) + grid of impact tiles + breakdown table |
| **Tiles** | Fuel Efficiency (target vs actual km/L), Tyre Life Impact, Pressure Leakage Cost, Retread Savings |
| **Fuel calculation** | Compares current km/L vs target km/L × diesel rate ₹95/L. If no fuel uploads, value is "(modeled)" |
| **Download** | Full savings Excel export |
| **When empty** | Tiles show "No data" with info message |
| **Data source** | `state.analytics` (computed from `fuel_trip_entries` + `tyre_activity_log` + targets) |

### 3.5 Tab: Analytics (14 reports)

The Analytics tab contains 14 individual report blocks. They are grouped into **Analytics Blocks 1–8** (rendered via `renderCharts`) and **Analytics Blocks 9–14** (rendered directly). All blocks have a `data-report` attribute and are controlled by the visibility system.

#### Block 1: Fleet Health Score

| Report Key | `fleetHealth` |
|------------|--------------|
| **Location** | Top of Analytics tab |
| **Format** | Circular gauge (CSS conic gradient) + score card |
| **Score ranges** | 80-100 (green, healthy), 60-79 (yellow, attention needed), <60 (red, critical) |
| **Components** | Pressure compliance, life remaining, inspection recency, leakage severity, defect rate |
| **When empty** | Gauge shows 0 with "No data" |

#### Block 2: Target vs Actual Tyre Life

| Report Key | `tyreLife` |
|------------|-----------|
| **Location** | Analytics tab |
| **Format** | HTML table: Tyre No, Target Life (config), Actual Life (KM), Variance (KM), % Achieved |
| **Pagination** | 50 rows per page |
| **Color** | Green rows (≥100% achieved), Red rows (<100% achieved) |
| **When empty** | "No tyre records found" |
| **Data source** | `state.tyreRecords` + `state.targets` |

#### Block 3: Rubber Utilisation Analysis

| Report Key | `rubberUtil` |
|------------|-------------|
| **Location** | Analytics tab |
| **Format** | HTML table: Tyre No, Brand, Size, Life Achieved (KM), RTD1, Rubber consumed (mm per KM) |
| **Pagination** | 50 rows per page |
| **When empty** | "No records" |
| **Data source** | `state.tyreRecords` |

#### Block 4: Brand-wise Performance Summary

| Report Key | `brandWise` |
|------------|------------|
| **Location** | Analytics tab |
| **Format** | HTML table: Brand, Tyre Count, Avg Life (KM), Avg RTD, CPK (Cost per KM), Ranking |
| **When empty** | "No brand data available" |
| **Data source** | `state.tyreRecords` grouped by `make` |

#### Block 5: Pressure Leakage Impact

| Report Key | `pressureLeakage` |
|------------|-------------------|
| **Location** | Analytics tab |
| **Format** | KPI cards + table: Tyre No, PSI Found, PSI Corrected, Leakage (Δ), Cost Impact (₹) |
| **View toggle** | Summary view vs detail view |
| **Pagination** | 50 rows per page |
| **When empty** | "No pressure data available" |
| **Data source** | `state.pressureEvents` |

#### Block 6: Tyre Age Distribution

| Report Key | `ageDist` |
|------------|----------|
| **Location** | Analytics tab |
| **Format** | Bar chart (Chart.js horizontal bars) + summary cards |
| **Buckets** | 0-6 months, 6-12 months, 12-18 months, 18-24 months, 24+ months |
| **When empty** | "No tyre age data" |
| **Data source** | `state.ageDistribution` |

#### Block 7: Defect Trend by Position

| Report Key | `defectTrend` |
|------------|--------------|
| **Location** | Analytics tab |
| **Format** | Grouped bar chart (Chart.js): defect counts per brand, grouped by vehicle position |
| **Colours** | One colour per position (FL, FR, RL, RR, etc.) |
| **When empty** | "No defect data" |
| **Data source** | `state.defectTrend` |

#### Block 8: Removal Reasons

| Report Key | `removalReasons` |
|------------|-----------------|
| **Location** | Analytics tab |
| **Format** | Pie chart (canvas arc segments) + legend + count table |
| **Segments** | Each removal reason (cut, puncture, worn-out, sidewall damage, etc.) with % breakdown |
| **When empty** | "No removal data" |
| **Data source** | `state.removalReasons` |

#### Block 9: Pressure vs Fuel Cost

| Report Key | `pressureFuelCost` |
|------------|-------------------|
| **Location** | Analytics tab |
| **Format** | Grouped bar chart (Chart.js) — green bars (target cost) vs red bars (actual cost), month by month |
| **Data source** | `state.fuelRows` (from `fuel_trip_entries`) + `state.targets.pressureFuelEfficiencyKmpl` + `state.targets.pressureFuelPrice` |
| **When empty** | No bars rendered — empty canvas |
| **Prerequisite** | Fuel upload data must exist (see Part 4) |

#### Block 10: Pressure Heatmap

| Report Key | `pressureHeatmap` |
|------------|------------------|
| **Location** | Analytics tab |
| **Format** | CSS grid of coloured cards — one per tyre |
| **Colour legend** | 🟢 Green: |Δ| ≤ 5 PSI (OK) / 🟡 Yellow: 5 < |Δ| ≤ 10 PSI (Warning) / 🔴 Red: |Δ| > 10 PSI (Critical) |
| **Data source** | `state.pressureEvents` (latest `psi_found` per tyre) vs `state.targets.pressureBasePsi` |
| **When empty** | "No pressure data available" |
| **CSS class** | `.pressure-heatmap-grid` — auto-fill 160px columns |

#### Block 11: RTD Scrapping Recommendation

| Report Key | `rtdScrapping` |
|------------|---------------|
| **Location** | Analytics tab |
| **Format** | HTML table: Tyre No, Position, Tread Depth (mm), Inspection Date |
| **Threshold** | RTD1 ≤ 1.5 mm (scrapping threshold) |
| **When empty** | "No tyres currently flagged for scrapping" (good — fleet is healthy) |
| **Data source** | `state.inspectionRecords` (latest per tyre) |

#### Block 12: Retread Eligibility

| Report Key | `retreadEligible` |
|------------|------------------|
| **Location** | Analytics tab |
| **Format** | HTML table: Tyre No, Position, Tread Depth (mm), Retread Count, Inspection Date |
| **Threshold** | RTD1 between 3-6 mm AND retread count < 3 |
| **When empty** | "No tyres currently eligible for retreading" |
| **Data source** | `state.inspectionRecords` (latest per tyre) + `state.retreadCounts` |

#### Block 13: Brand-wise Cost per KM

| Report Key | `brandCostPerKm` |
|------------|-----------------|
| **Location** | Analytics tab |
| **Format** | Horizontal bar chart (Chart.js) + summary HTML table |
| **Table columns** | Brand, Tyre Count, Total KM, Total Cost (₹), ₹/KM |
| **Formula** | `₹/KM = Total Cost / Total KM` — aggregated per brand |
| **Data source** | `state.tyreRecords` grouped by `make` + `state.targets.tyrePrice` |
| **When empty** | Table is empty |

#### Block 14: P&L per Tyre

| Report Key | `tyrePnL` |
|------------|----------|
| **Location** | Analytics tab |
| **Format** | HTML table: Tyre No, KM Run, Rate per KM, Revenue (₹), Tyre Price (₹), Retread Cost (₹), Total Cost (₹), P&L (₹) |
| **Colour** | Green row = profitable, Red row = loss-making |
| **Footer** | Fleet-wide total row at bottom |
| **Formula** | Revenue = KM Run × Rate per KM / Cost = Tyre Price + (Retreads × Retread Cost) / P&L = Revenue − Cost |
| **Prerequisite** | Rate per KM must be set in Site Settings (otherwise shows hint) |
| **Data source** | `state.tyreRecords` + `state.targets` + `state.retreadCounts` + `state.ratePerKm` |
| **When empty** | Table empty with "Configure Rate per KM in Site Settings" hint |

---

## Part 4: Fitter App

### 4.1 Logging In
1. Open the app URL on a mobile phone
2. Enter email + password → OTP sent to your email → enter OTP
3. The fitter dashboard loads

### 4.2 Entering a Tyre Card
1. Tap **Tyre Card**
2. Enter: Tyre No, Make, Size, OTD (Original Tread Depth)
3. Tap **Save** — stored offline and synced when internet is available

### 4.3 Pressure Check
1. Tap **Pressure Check**
2. Select the tyre or enter Tyre No
3. Enter: PSI Found, PSI Corrected (if adjusted)
4. Tap **Save**

### 4.4 Inspection
1. Tap **Inspection**
2. Select the tyre
3. Enter: RTD1, RTD2, Odometer Reading, Remarks
4. Tap **Save**

### 4.5 Offline Mode
- The fitter app works **without internet**
- Data is stored in IndexedDB (local database in the browser)
- When internet is restored, data syncs automatically to Supabase
- A queue icon shows pending items to sync

---

## Part 5: Site Settings Reference

### Tyre Economics Fields

| Field | Effect |
|-------|--------|
| **Tyre Price** | Used in Brand Cost-per-KM and P&L per Tyre calculations |
| **Retread Cost** | Added to tyre cost per retread cycle in P&L calculation |
| **Rate per KM** | Revenue rate — used in P&L per Tyre. If 0, the P&L block shows a hint to configure it |
| **Target Tyre Life** | Used in tyre life comparison block |
| **Life Unit** | KM or Hours (HMR) — affects all distance-based calculations |

### Reports Index

| Report Key | Checkbox Label | Tab | Format |
|------------|---------------|-----|--------|
| `tyreRecords` | Tyre Records | Tyres | HTML table + Excel export |
| `inspectionRecords` | Inspection Records | Inspection | HTML table + Excel export |
| `savings` | Savings Achieved | Savings | Hero card + impact tiles + breakdown |
| `fleetHealth` | Fleet Health Score | Analytics | Conic gradient gauge |
| `tyreLife` | Target vs Actual Tyre Life | Analytics | HTML table + pagination |
| `rubberUtil` | Rubber Utilisation Analysis | Analytics | HTML table + pagination |
| `brandWise` | Brand-wise Performance Summary | Analytics | HTML table |
| `pressureLeakage` | Pressure Leakage Impact | Analytics | KPI cards + table + pagination |
| `ageDist` | Tyre Age Distribution | Analytics | Chart.js bar chart |
| `defectTrend` | Defect Trend by Position | Analytics | Chart.js grouped bar |
| `removalReasons` | Removal Reasons | Analytics | Canvas pie chart |
| `pressureFuelCost` | Pressure vs Fuel Cost | Analytics | Chart.js grouped bar |
| `pressureHeatmap` | Pressure Heatmap | Analytics | CSS grid of coloured cards |
| `rtdScrapping` | RTD Scrapping Recommendation | Analytics | HTML table |
| `retreadEligible` | Retread Eligibility | Analytics | HTML table |
| `brandCostPerKm` | Brand-wise Cost per KM | Analytics | Chart.js bar + HTML table |
| `tyrePnL` | P&L per Tyre | Analytics | HTML table with colour-coded rows |

### Fuel Upload
The **Fuel Upload** button at the top of the dashboard opens a modal where you can:
- **Enter a single fuel record** manually (Truck No, Date, Trips, KMs, Fuel Consumed, Production)
- **Upload a file** (.xlsx, .xls, .csv) with multiple fuel records
- See uploaded fuel data in a table below the form

Fuel data feeds into:
- **Pressure vs Fuel Cost chart** (Block 9)
- **Savings** tab → Fuel Efficiency tile
- **Fuel analytics Excel export**

---

## Part 6: Troubleshooting

### Dashboard shows "Set Rate per KM in Site Settings"
- Go to Site Settings, find Rate per KM, set a value, save, refresh the dashboard

### A new analytics block is missing
- Check the Reports Index in Site Settings — that block may be unchecked
- Check the browser console (F12 > Console) for JavaScript errors

### Pressure Heatmap shows "No pressure data available"
- Pressure check data needs to exist in the system first
- Enter pressure readings via the Fitter App

### P&L shows unexpected values
- Verify Retread Cost and Rate per KM in Site Settings
- Verify tyres have total_life_run data (from inspections/tracking)

### "No tyres currently flagged for scrapping"
- That means no tyre has tread depth ≤ 1.5mm — good news

### "No tyres currently eligible for retreading"
- That means no tyre has tread depth between 3-6mm with <3 retreads

### App won't load
- Check that the server is running (terminal window is open). Run `npm run local` to start
- If port 3000 is still in use, `npm run local` auto-kills the old process and restarts
- Check that `.env` file has correct Supabase URL and Anon Key
- Check browser console for errors (F12)

### Sync isn't working (offline data)
- Open the fitter app while connected to internet
- The queue processes automatically
- Check IndexedDB: DevTools > Application > IndexedDB > DynaHaulCacheDB

### Changes not reflecting after Site Settings update
- Refresh the dashboard page (F5 or Ctrl+R)
- Some settings affect new data only

---

*DynaHaul X v2 — June 2026*
