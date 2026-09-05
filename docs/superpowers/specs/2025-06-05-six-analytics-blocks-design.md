# Six Analytics Blocks for DynaHaul X v2 Dashboard

## Overview
Add 6 new analytics blocks to the existing Analytics tab on the manager dashboard. Each block follows the existing `<article class="analytics-block">` pattern with a `data-report` attribute so the Reports Index checkboxes (Plan B-2) control visibility.

## Data Model

### Existing fields used
| Field | Source | Used By |
|-------|--------|---------|
| `tyres.make` | `tyres` table | Feature 5 |
| `tyres.total_life_run` | `tyres` table | Features 5, 6 |
| `tyres.id` (as tyre_id) | `tyres` table | Features 2, 3, 4, 6 |
| `tyres.tyre_no` | `tyres` table | Features 2, 3, 4, 6 |
| `tyres.status` | `tyres` table | Features 3, 4 |
| `tyre_activity_log.rtd1` | `v_manager_inspection_records` | Features 3, 4 |
| `tyre_activity_log.position` | `v_manager_inspection_records` | Features 3, 4 |
| `tyre_activity_log.activity_date` | `v_manager_inspection_records` | Features 3, 4 |
| `tyre_activity_log.psi_found` | `v_manager_pressure_events` | Feature 2 |
| `tyre_activity_log.tyre_id` | `tyre_activity_log` | Features 2, 3, 4, 6 |
| `fuel_trip_entries.total_fuel_consumed` | `fuel_trip_entries` | Feature 1 |
| `fuel_trip_entries.total_kms` | `fuel_trip_entries` | Feature 1 |
| `sites.tyre_price` | `sites` table | Features 5, 6 |
| `sites.retread_cost` | `sites` table | Feature 6 |
| `sites.pressure_fuel_price` | `sites` table | Feature 1 |
| `sites.pressure_fuel_efficiency_kmpl` | `sites` table | Feature 1 |
| `sites.pressure_base_psi` | `sites` table | Feature 2 |
| `analytics.pressure.summary.cumulative_loss` | computed in JS | Feature 1 |

### New field needed
| Field | Table | Used By | Migration |
|-------|-------|---------|-----------|
| `sites.rate_per_km` | `sites` (numeric) | Feature 6 | Added via site-settings HTML field + API payload — no formal migration, same pattern as `retread_cost` and `enabled_reports` |

### Derived fields (computed in JS)
| Field | Derivation | Used By |
|-------|-----------|---------|
| `retread_count` | Count of `tyre_activity_log` rows per `tyre_id` where `activity_type = 'REMOVAL'` and removal reason / disposition indicates retread | Features 4, 6 |

### Reports Index keys
- `pressureFuelCost` — Feature 1
- `pressureHeatmap` — Feature 2
- `rtdScrapping` — Feature 3
- `retreadEligible` — Feature 4
- `brandCostPerKm` — Feature 5
- `tyrePnL` — Feature 6

## Feature Details

### Feature 1: Pressure vs Fuel Cost (bar chart)

**Purpose:** Show cost of under-inflation (extra fuel burn) vs savings from proper inflation side by side.

**Data sources:**
- Pressure leakage cost: `state.analytics.pressure.summary.cumulative_loss` (already computed)
- Fuel efficiency: For each month, compute target fuel cost vs actual fuel cost from `fuel_trip_entries`
  - Target fuel consumed = `total_kms / target_kmpl` where target_kmpl = `sites.pressure_fuel_efficiency_kmpl`
  - Actual fuel consumed = `total_fuel_consumed`
  - Target fuel cost = target_fuel_consumed × `sites.pressure_fuel_price`
  - Actual fuel cost = total_fuel_consumed × `sites.pressure_fuel_price`
  - Fuel waste = Actual - Target

**Visual:** Grouped bar chart (Chart.js) — two bars per month: "Target Fuel Cost (₹)" in green, "Actual Fuel Cost (₹)" in red. Displayed as monthly breakdown for last 12 months.

### Feature 2: Pressure Heatmap Grid

**Purpose:** At-a-glance view of all tyres' current pressure status.

**Data sources:**
- Latest `psi_found` per tyre from `state.pressureEvents`
- Target PSI from `sites.pressure_base_psi`

**Logic:**
- For each unique tyre in `state.tyreRecords`, find the most recent `psi_found`
- Δ = `psi_found - pressure_base_psi`
- 🟢 Green: `|Δ| ≤ 5` (within range)
- 🟡 Yellow: `5 < |Δ| ≤ 10` (warning)
- 🔴 Red: `|Δ| > 10` (critical)

**Visual:** CSS grid of cards — each card shows tyre_no, position, current PSI, status color. Max 4 columns, responsive.

### Feature 3: RTD Scrapping Recommendation (table)

**Purpose:** List tyres that should be scrapped based on tread depth.

**Criteria:** Latest inspection `rtd1 ≤ 1.5mm` (regardless of retread count).

**Data sources:**
- `state.inspectionRecords` — group by tyre_no, take latest by date
- Filter where `rtd1 ≤ 1.5`

**Visual:** Table with columns: Tyre No, Position, Tread Depth (mm), Latest Inspection Date. Highlighted rows with red text. If no tyres match, show "No tyres currently flagged for scrapping."

### Feature 4: Retread Eligibility (table)

**Purpose:** List tyres eligible for retreading.

**Criteria:** Latest inspection `rtd1 BETWEEN 3 AND 6` AND `retread_count < 3`.

**Data sources:**
- `state.inspectionRecords` — latest per tyre
- Derived `retread_count` per tyre from removal events

**Visual:** Table columns: Tyre No, Position, Tread Depth (mm), Retread Count, Last Inspection Date. Green-highlighted rows. If no tyres match, show "No tyres currently eligible for retreading."

### Feature 5: Per-Brand Cost-per-KM (chart + summary)

**Purpose:** Compare tyre brands by cost efficiency.

**Data sources:**
- `state.tyreRecords` — group by `make`
- `sites.tyre_price` — per-tyre cost (same across site)
- `tyres.total_life_run` — km achieved per tyre

**Logic:**
- Per brand: sum all `total_life_run` for tyres of that brand
- Per brand: count of tyres × `tyre_price` = total cost
- Cost/km = total_cost / total_km

**Visual:** Horizontal bar chart (Chart.js) — one bar per brand showing ₹/km. Small summary table below showing brand, tyre count, total km, total cost, cost/km.

### Feature 6: P&L per Tyre (table)

**Purpose:** Profit & loss per tyre.

**Data sources:**
- `state.tyreRecords` — each tyre's `total_life_run`
- `sites.tyre_price` — purchase cost
- `sites.retread_cost` — cost per retread
- `sites.rate_per_km` — revenue rate per km
- Derived `retread_count` per tyre

**Logic:**
- Revenue = `total_life_run × rate_per_km`
- Cost = `tyre_price + (retread_count × retread_cost)`
- P&L = Revenue - Cost

**Visual:** Table columns: Tyre No, Make, Total KM, Revenue (₹), Cost (₹), Profit/Loss (₹). Profit rows green, loss rows red. Total row at bottom.

## Implementation Plan

### Phase 1: Data Prep
1. Add `rate_per_km` field to `site-settings.html` (alongside `retread_cost`)
2. Add `rate_per_km` to `siteUpdate` payload in site-settings save handler
3. Add `rate_per_km` to `fetchSiteTargets` return in `data-service.js`
4. Add `computeRetreadCounts()` helper that derives retread_count from tyre data (counts removal events per tyre)
5. Add `fetchRetreadCounts()` API call (or derive from existing loaded data)

### Phase 2: HTML Blocks
6. Add 6 new `<article class="analytics-block">` blocks to `manager/index.html` in the Analytics tab section
7. Each block gets proper `data-report` attribute and unique ID

### Phase 3: Render Functions
8. Implement `renderPressureFuelCost()` — grouped bar chart
9. Implement `renderPressureHeatmap()` — grid of tyres with color status
10. Implement `renderRtdScrapping()` — table of flagged tyres
11. Implement `renderRetreadEligible()` — table of eligible tyres
12. Implement `renderBrandCostPerKm()` — horizontal bar chart + summary
13. Implement `renderTyrePnL()` — table with profit/loss

### Phase 4: Wiring
14. Add all 6 render calls to `renderAllHeavyModules()`
15. Add all 6 keys to `applyReportVisibility()`

## Key Constraints
- All blocks follow existing pattern: `display: none` when not in enabled_reports
- All data is from already-loaded state where possible; new API calls only when needed
- Each block renders its own content independently
- No new database migrations (all fields either exist or are added via supabase JS column addition, same pattern as `retread_cost` and `enabled_reports`)
