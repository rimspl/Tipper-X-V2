# DynaHaul X — Manager Dashboard Onboarding Design Spec

**Date:** 2026-07-28
**Author:** Abhishek + Opencode
**Status:** Approved
**Target:** Tipper fleet companies (Indian mining operations)

---

## 1. Overview

### 1.1 Problem
When a new customer opens the DynaHaul X Manager Dashboard for the first time, they see an empty dashboard with blank tables and zero charts. This creates a confusing, incomplete first impression — the opposite of what we need for sales demos and customer onboarding.

### 1.2 Solution
A cinematic 2-page onboarding experience that:
- Explains what historical data the system needs (with "Historical data of the company" framing)
- Provides drag-and-drop Excel upload with column auto-mapping
- Shows a live "X of 17 reports ready" progress ring
- Celebrates the 9 core reports already available
- Positions 8 additional reports as "Power-Ups" for when customers add fuel/financial data
- Includes a persistent search filter for finding any report by name

### 1.3 Success Criteria
- Customer sees value within 30 seconds of first login
- Customer uploads historical data within 5 minutes
- No empty-state confusion — dashboard always shows meaningful content
- Sales demo includes the onboarding "wow moment" (progress ring filling, reports unlocking)

---

## 2. Onboarding Flow Architecture

### 2.1 Entry Condition
```
Login → dashboard loads → check tyre_activity_log count for site_id
  If count > 0: Skip onboarding → show full dashboard
  If count = 0: Show onboarding (hard gate)
```

### 2.2 Flow Diagram
```
Login
  │
  ├─ Has activity data? → YES → Full Dashboard (all 17 reports)
  │
  └─ No activity data → Onboarding Page 1
                            │
                            ▼
                        Onboarding Page 2
                       (Upload + Unlock)
                            │
                     ┌──────┴──────┐
                     ▼             ▼
              Upload Complete   Skip Disabled
                     │          (hard gate)
                     ▼
              Dashboard (partial or full)
```

### 2.3 States After Onboarding
| State | Condition | Dashboard Behavior |
|-------|-----------|-------------------|
| Full data | All 5 data types uploaded | All 17 reports visible |
| Partial data | Vehicle + Tyre + Activity uploaded | 9 core reports + Power-Up CTAs |
| Fuel only | Fuel data uploaded | 12 reports, 5 locked |
| Minimal | Only Vehicle uploaded | Base reports only |

### 2.4 Persistence
- Store `onboarding_completed: true` in `localStorage` after first successful upload
- Also store in `sites.onboarding_completed` column (Supabase) for cross-device sync
- On subsequent logins: check `localStorage` first, skip onboarding if completed

---

## 3. Page 1 — "Welcome to DynaHaul X"

### 3.1 Layout
Full-screen, dark industrial theme. No header/sidebar — pure onboarding screen.

### 3.2 Hero Section
- **Headline:** "Your Fleet. Your Data. Your Savings."
- **Font:** Rajdhani 700, 48px, #daa520 (gold)
- **Subheadline:** "DynaHaul X turns your historical fleet data into actionable intelligence. Here's what we need to get started."
- **Font:** Work Sans 400, 18px, #9ca3af (grey-400)
- **Animation:** Fade in + upward slide, 0.6s ease-out. Headline first, subheadline 0.3s delay.

### 3.3 Data Requirements Grid
5 cards in 2 rows (3 + 2 centered). Each card:
- **Container:** 280px width, 200px height, #20262d background, #333a44 border, 12px border-radius
- **Icon:** Gold SVG, 48px, centered top
- **Title:** Rajdhani 600, 20px, white
- **Description:** Work Sans 400, 14px, #9ca3af
- **Unlocks badge:** Small pill (grey background, 10px font): "Unlocks X reports"
- **Status indicator:** 8px circle — grey (not uploaded) / gold checkmark (uploaded)

**The 5 Cards:**

| # | Title | Description | Unlocks |
|---|-------|-------------|---------|
| 1 | Vehicle Fleet | "Historical data of your company's trucks and tippers" | All reports (base) |
| 2 | Tyre Inventory | "Historical data of your company's tyre records — serials, brands, sizes" | 6 tyre reports |
| 3 | Activity History | "Historical data of your company's fitment, inspection, pressure, and removal records" | 8 activity reports |
| 4 | Fuel & Trip Data | "Historical data of your company's fuel consumption and trip logs" | 3 fuel reports |
| 5 | Financial Parameters | "Historical data of your company's tyre costs and rate per KM" | 5 financial reports |

### 3.4 Bottom CTA
- **Primary button:** "Begin Data Import →" (gold, 48px height, 240px width, rounded 8px)
- **Secondary text:** "You can upload Excel files or connect your existing systems"
- **Font:** Work Sans 400, 12px, #6b7280

### 3.5 Animations
| Element | Animation | Duration | Easing |
|---------|-----------|----------|--------|
| Hero text | Fade in + slide up | 0.6s | ease-out |
| Cards | Stagger appear (left→right, top→bottom) | 0.15s delay each | ease-out |
| Card border | Gold glow pulse | 1.2s loop | ease-in-out |
| CTA button | Subtle breathing glow | 2s loop | ease-in-out |

---

## 4. Page 2 — "Import Your Historical Data"

### 4.1 Layout
Full-screen, split into two panels: left (60%) = upload zone, right (40%) = unlock preview.

### 4.2 Header Bar
- **Back button:** Gold arrow + "← Back to overview" (Work Sans 500, 14px)
- **Title:** "Import Your Historical Data" (Rajdhani 600, 28px, white)
- **Subtitle:** "Upload Excel files from your existing systems. We'll map the columns automatically." (Work Sans 400, 14px, grey-400)

### 4.3 Left Panel — Upload Zone

**5 Upload Cards (stacked vertically):**

Each card:
- **Drag-and-drop zone:** Dashed gold border, 120px height, "Drop Excel here" text
- **Icon + Label:** Gold icon (24px) + data type name (Rajdhani 600, 16px)
- **File input:** "Choose File" button (gold outline) + "Or drag Excel here" text
- **Template link:** "Download template" (gold outline, small) — downloads pre-formatted .xlsx
- **Status pill:**
  - "Not uploaded" (grey #6b7280)
  - "Uploading..." (amber #f59e0b, pulse animation)
  - "Uploaded ✓" (green #10b981)
  - "Error ✗" (red #ef4444)
- **Preview row:** After upload, shows first 3 rows in mini-table (12px font, grey background)
- **Column mapping:** "12 columns detected → 8 matched automatically, 4 need mapping" with "Map Columns" button

**Upload Order & Dependencies:**
```
1. Vehicle Fleet (REQUIRED — blocks all others)
   └─ Uploads: vehicle_no, model, status
   └─ Maps to: vehicles table

2. Tyre Inventory (requires #1)
   └─ Uploads: tyre_no, make, size, otd
   └─ Maps to: tyres table

3. Activity History (requires #1)
   └─ Uploads: date, tyre_no, vehicle_no, type, position, odometer, rtd1, rtd2, psi
   └─ Maps to: tyre_activity_log table

4. Fuel & Trip Data (optional, requires #1)
   └─ Uploads: truck_no, date, trips, kms, fuel, production
   └─ Maps to: fuel_trip_entries table

5. Financial Parameters (optional, manual input)
   └─ Inputs: tyre_price, retread_cost, rate_per_km
   └─ Maps to: sites table columns
```

### 4.4 Right Panel — Unlock Preview

**Progress Ring (centered, 120px diameter):**
- Circular SVG: gold fill = unlocked, #252b33 fill = locked
- Center: large number (Rajdhani 700, 36px, white) + "of 17" (Work Sans 400, 14px, grey-400)
- Animation: Fill incrementally on upload complete (0.8s ease-out)

**"You're Already Equipped" Section:**
- **Title:** "Your Fleet. Your Insights. Already Powerful." (Rajdhani 700, 20px, white)
- **Subtitle:** "With just your vehicle and tyre data, DynaHaul X gives you 9 analytics that most fleet managers only dream of." (Work Sans 400, 14px, grey-400)

**9 Core Reports (3x3 mini-grid):**

| Report | Benefit |
|--------|---------|
| Fleet Health Score | "Know your fleet's vital signs in one number" |
| Tyre Life Analysis | "See which tyres last — and which don't" |
| Rubber Utilisation | "Stop wasting rubber, stop wasting money" |
| Brand Comparison | "Know which brand performs best for YOUR fleet" |
| Pressure Leakage | "Find hidden fuel waste from under-inflation" |
| Age Distribution | "Know when your fleet needs replacements" |
| Defect Trends | "Catch problems before they become breakdowns" |
| Removal Reasons | "Understand why tyres leave your fleet" |
| Tyre Forecast | "Plan next month's tyre purchases today" |

Each report card: Gold dot + name (Work Sans 500, 12px) + benefit (Work Sans 400, 11px, grey-500)

**"Power-Up" Section:**
- **Title:** "Ready for More Power?" (Rajdhani 600, 16px, gold #daa520)
- **Subtitle:** "Add fuel data and financial parameters to unlock 8 more reports — like a turbo boost for your analytics."

**Power-Up Card 1: "Fuel Intelligence"**
- Icon: Fuel pump (gold)
- "Unlock 3 reports: Pressure vs Fuel Cost, Pressure Heatmap, Fuel Efficiency Trends"
- CTA: "Upload Fuel Data →" (gold outline button)
- Click scrolls to fuel upload card on left panel

**Power-Up Card 2: "Financial Mastery"**
- Icon: Indian Rupee symbol (gold)
- "Unlock 5 reports: Brand Cost/KM, P&L per Tyre, Savings Achieved, RTD Scrapping, Retread Eligibility"
- CTA: "Set Financial Parameters →" (gold outline button)
- Click scrolls to financial upload card on left panel

**Animation:** Shimmer effect (gold gradient sweep left→right, 3s loop)

### 4.5 Bottom Bar
- **Left:** "X of 17 reports will be available after import"
- **Center:** "Estimated time: 5 minutes"
- **Right:**
  - "Import All & Launch Dashboard" (gold, primary) — enabled when Vehicle Fleet uploaded
  - "Skip for Now" (grey outline, secondary) — DISABLED (hard gate)

---

## 5. Graph Search Filter

### 5.1 Search Bar
- **Position:** Fixed at top of Analytics tab, below tab navigation. Sticky on scroll.
- **Container:** 400px width, 44px height, 8px border-radius
- **Background:** #20262d
- **Border:** 1px solid #333a44
- **Focus:** 1px solid #daa520 + gold glow (box-shadow: 0 0 12px rgba(218,165,32,0.15))
- **Placeholder:** "Search reports... (e.g., pressure, brand, savings)"
- **Icon:** Magnifying glass (gold, 16px, left-aligned)
- **Clear button:** X icon, appears on text input, gold on hover

### 5.2 Search Results Dropdown
- **Background:** #1a1e24
- **Border:** 1px solid #333a44
- **Max height:** 320px, scrollable
- **Row height:** 44px, hover background #252b33

**Each result row:**
- Report name (Work Sans 500, 14px, white) — bold match highlight
- Category pill (10px): "Fleet" / "Pressure" / "Financial" / "Brand" — color-coded
- Status dot: Gold (unlocked) / Grey (locked)
- Quick action: "View" button (gold outline) on hover

### 5.3 Search Behavior
- **Debounce:** 200ms
- **Fuzzy matching:** Typo tolerance (e.g., "pessure" → "Pressure")
- **Category shortcuts:** "all" → all 17, "unlocked" → available, "locked" → locked
- **Keyboard:** Arrow keys navigate, Enter selects, Escape closes
- **Empty state:** "No reports match '{query}'" with suggestions

### 5.4 Dashboard Integration
- On "View" click: smooth scroll to report block + gold highlight flash (0.5s)
- On locked report: Shows "Unlock this report" CTA instead of "View"
- Search only works on Analytics tab (not Tyres/Inspections)

---

## 6. "Why 9 of 17" — Positive Framing

### 6.1 The Copy

**Instead of:** "8 reports are locked because you haven't uploaded fuel data."

**Say:** "You're already seeing what matters most. 9 core reports give you complete fleet visibility — from health scores to tyre forecasts. When you're ready, add fuel and financial data to unlock 8 more power-ups that reveal hidden savings."

### 6.2 Framing Principles
- "Already powerful" → not "incomplete"
- "Power-Ups" → not "missing data"
- "When you're ready" → not "you must"
- "Turbo boost" → not "additional requirement"
- "Reveal hidden savings" → not "you're losing money"

### 6.3 Dependency Explanation
Inline on Page 2 (right panel), below the Power-Up cards:

| Report | What's Needed | How to Unlock |
|--------|---------------|---------------|
| Pressure vs Fuel Cost | Fuel trip entries | Upload fuel data |
| Pressure Heatmap | Recent pressure readings | Collect via Fitter App |
| RTD Scrapping | RTD ≤ 1.5mm readings | Collect via Fitter App |
| Retread Eligibility | RTD 3-6mm + retread config | Set retread cost in Site Settings |
| Brand Cost per KM | Rate per KM parameter | Set in Site Settings |
| P&L per Tyre | Rate per KM parameter | Set in Site Settings |

---

## 7. Design Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | #161a1f | Page background |
| `--bg-card` | #20262d | Card backgrounds |
| `--bg-card-hover` | #252b33 | Card hover state |
| `--bg-dropdown` | #1a1e24 | Search dropdown |
| `--border` | #333a44 | Card borders |
| `--accent` | #daa520 | Gold accent |
| `--text-primary` | #ffffff | Headlines |
| `--text-secondary` | #9ca3af | Descriptions |
| `--text-muted` | #6b7280 | Hints |
| `--success` | #10b981 | Uploaded/unlocked |
| `--warning` | #f59e0b | Power-ups, pending |
| `--danger` | #ef4444 | Errors |
| `--font-heading` | Rajdhani 600/700 | All headings |
| `--font-body` | Work Sans 400/500 | Body text |

---

## 8. File Changes

| File | Type | Description |
|------|------|-------------|
| `manager/index.html` | Modify | Add onboarding container, search bar, progress ring |
| `manager/src/pages/dashboard.js` | Modify | Add onboarding check, search handler, upload handler |
| `manager/src/styles/dashboard.css` | Modify | Add onboarding styles, search bar, progress ring |
| `manager/src/lib/data-service.js` | Modify | Add upload endpoints, column mapping |
| `manager/src/lib/export.js` | Modify | Add template download function |
| `manager/src/pages/onboarding.js` | **New** | Onboarding page controller |
| `manager/src/services/upload-service.js` | **New** | Excel upload, parsing, column mapping |
| `manager/src/assets/templates/*.xlsx` | **New** | 5 downloadable templates |
| `manager/src/assets/icons/power-up/*.svg` | **New** | Power-up card icons |
| `shared/field-masters.js` | Modify | Add column mapping definitions |

---

## 9. Animation Specs

| Element | Animation | Duration | Easing |
|---------|-----------|----------|--------|
| Hero text | Fade in + slide up | 0.6s | ease-out |
| Data cards | Stagger appear | 0.15s delay | ease-out |
| Card border glow | Gold pulse | 1.2s loop | ease-in-out |
| Upload status pill | Color transition | 0.3s | ease |
| Progress ring | Fill incrementally | 0.8s | ease-out |
| Report unlock | Flash + text color | 0.5s | ease |
| Power-up shimmer | Gold gradient sweep | 3s loop | linear |
| Search focus | Border + glow | 0.2s | ease |
| Search results | Dropdown slide | 0.15s | ease-out |

---

## 10. Hard Gate Logic

```
On page load:
  1. Check sessionStorage for 'rims_session'
  2. If no session → redirect to login
  3. Get site_id from session
  4. Check localStorage for 'onboarding_completed'
  5. If completed → show dashboard
  6. If not completed → query: SELECT COUNT(*) FROM tyre_activity_log WHERE site_id = ?
  7. If count > 0 → show dashboard, set localStorage
  8. If count = 0 → show onboarding Page 1
  9. After upload completes → set localStorage + sites.onboarding_completed
```

---

## 11. Open Questions

1. Should the onboarding be skippable after a timer (e.g., 30 seconds) for power users?
2. Should we support CSV upload in addition to Excel?
3. Should the column mapping UI be a modal or inline on the upload card?
4. Should we show a "What's next?" step after upload (e.g., "Install the Fitter App on your team's phones")?

---

**End of Spec.**
