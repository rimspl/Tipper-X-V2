# Six Analytics Blocks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 6 new analytics blocks to the manager dashboard Analytics tab

**Architecture:** Each block is an independent `<article class="analytics-block" data-report="...">` element in `index.html`, driven by a dedicated render function in `dashboard.js`. Data comes from already-loaded `state` objects plus one new `fetchRetreadCounts` API call. Visibility is gated by `state.enabledReports` via the existing `applyReportVisibility()` function.

**Tech Stack:** Chart.js (already loaded), vanilla JS, Supabase REST API

---

## File Map

| File | Change |
|------|--------|
| `manager/index.html` | Add 6 `<article class="analytics-block">` elements |
| `manager/site-settings.html` | Add `rate_per_km` field; add 6 new checkbox keys |
| `manager/src/services/data-service.js` | Add `rate_per_km` to return; add `fetchRetreadCounts` function |
| `manager/src/pages/dashboard.js` | Add 6 render functions; wire into renderAllHeavyModules + applyReportVisibility |

### Task 1: Add `rate_per_km` to site-settings

**Files:**
- Modify: `manager/site-settings.html`

**Details:**
The `rate_per_km` field goes alongside `retread_cost` in the Tyre Economics section. It stores the revenue rate (₹ per km) used by Feature 6 (P&L per Tyre).

- [ ] **Step 1: Add HTML input field**

After the `retread_cost` input in the site-settings form:

```html
<div class="form-group">
  <label for="ratePerKm">Rate per KM (₹)</label>
  <input type="number" id="ratePerKm" name="ratePerKm" min="0" step="0.01" class="form-control" placeholder="e.g., 0.75">
  <small class="form-text text-muted">Revenue rate per kilometer for P&L calculations.</small>
</div>
```

- [ ] **Step 2: Add load handler**

Where `retread_cost` is read from `site` object in the load handler, add:

```js
document.getElementById('ratePerKm').value = site.rate_per_km || '';
```

- [ ] **Step 3: Add save payload**

Where `retread_cost` is included in the `siteUpdate` payload, add:

```js
rate_per_km: parseFloat(document.getElementById('ratePerKm').value) || null
```

- [ ] **Step 4: Verify UX**

Open site-settings, confirm `rate_per_km` field appears, can be set, and survives page reload (check Supabase table).

### Task 2: Add `rate_per_km` to fetchSiteTargets

**Files:**
- Modify: `manager/src/services/data-service.js`

- [ ] **Step 1: Add fallback field**

In the fallback/default return object (around line 45), add:

```js
ratePerKm: 0
```

- [ ] **Step 2: Add real field**

In the main return object (around line 84), add:

```js
ratePerKm: Number(data?.rate_per_km) || 0
```

### Task 3: Add `fetchRetreadCounts` service

**Files:**
- Modify: `manager/src/services/data-service.js`

This function queries `tyre_activity_log` for removal records per tyre and counts them to derive retread_count.

- [ ] **Step 1: Add the function**

```js
export async function fetchRetreadCounts(siteId) {
  const { data, error } = await supabase
    .from('tyre_activity_log')
    .select('tyre_id, removal_reason, activity_type, disposition')
    .eq('activity_type', 'REMOVAL')
    .in('removal_reason', ['Retread', 'Retreading', 'retread', 'RETREAD'])
    .or('disposition.eq.RETREAD,removal_reason.ilike.%retread%');

  if (error) {
    console.warn('Could not fetch retread counts:', error.message);
    return {};
  }

  const counts = {};
  for (const row of data || []) {
    counts[row.tyre_id] = (counts[row.tyre_id] || 0) + 1;
  }
  return counts;
}
```

Note: `.in()` on `removal_reason` is an optimistic filter. The `.or()` catches any ILIKE matches. Supabase JS SDK supports chaining or() with ilike.

- [ ] **Step 2: Export it**

Ensure it's exported alongside `fetchSiteTargets`, `fetchAiAccuracy`, etc. in the module exports.

### Task 4: Add rate_per_km and retreadCounts to dashboard state

**Files:**
- Modify: `manager/src/pages/dashboard.js`

- [ ] **Step 1: Add state fields**

In the `state` object initialization (around line 27), add:

```js
ratePerKm: 0,
retreadCounts: {}
```

- [ ] **Step 2: Load retread counts**

In the main fetch function, add `fetchRetreadCounts` to the Promise.all and store the result:

```js
import { fetchRetreadCounts } from '../services/data-service.js';

// In the main fetch Promise.all:
const [targets, ai, fuelRows, retreadCounts] = await Promise.all([
  fetchSiteTargets(state.session.siteId).catch(...),
  fetchAiAccuracy(state.session.siteId).catch(...),
  fetchFuelRows(state.session.siteId).catch(() => []),
  fetchRetreadCounts(state.session.siteId).catch(() => ({}))
]);

// After setting state.targets:
state.retreadCounts = retreadCounts || {};
state.ratePerKm = targets.ratePerKm || 0;
```

### Task 5: Add 6 analytics-block articles to index.html

**Files:**
- Modify: `manager/index.html`

Insert 6 new `<article class="analytics-block">` elements in the Analytics tab section, after the existing Removal Reasons block and before the closing `</section>` of the analytics tab.

- [ ] **Step 1: Add Feature 1 block (Pressure vs Fuel Cost)**

```html
<article class="analytics-block accent-danger" data-report="pressureFuelCost" id="blockPressureFuelCost">
  <div class="analytics-head">
    <div>
      <h3>Pressure vs Fuel Cost</h3>
      <p class="analytics-note">Monthly comparison of target fuel cost vs actual fuel cost.</p>
    </div>
  </div>
  <div class="chart-container" style="position:relative;height:300px;width:100%">
    <canvas id="pressureFuelCostChart"></canvas>
  </div>
</article>
```

- [ ] **Step 2: Add Feature 2 block (Pressure Heatmap)**

```html
<article class="analytics-block accent-info" data-report="pressureHeatmap" id="blockPressureHeatmap">
  <div class="analytics-head">
    <div>
      <h3>Pressure Heatmap</h3>
      <p class="analytics-note">Current tyre pressure status — green (ok), yellow (warning), red (critical).</p>
    </div>
  </div>
  <div id="pressureHeatmapGrid" class="pressure-heatmap-grid"></div>
</article>
```

- [ ] **Step 3: Add Feature 3 block (RTD Scrapping)**

```html
<article class="analytics-block accent-danger" data-report="rtdScrapping" id="blockRtdScrapping">
  <div class="analytics-head">
    <div>
      <h3>RTD Scrapping Recommendation</h3>
      <p class="analytics-note">Tyres with tread depth ≤ 1.5mm flagged for scrapping.</p>
    </div>
  </div>
  <div class="table-responsive">
    <table class="data-table" id="rtdScrappingTable">
      <thead>
        <tr>
          <th>Tyre No</th>
          <th>Position</th>
          <th>Tread Depth (mm)</th>
          <th>Inspection Date</th>
        </tr>
      </thead>
      <tbody id="rtdScrappingBody"></tbody>
    </table>
  </div>
</article>
```

- [ ] **Step 4: Add Feature 4 block (Retread Eligibility)**

```html
<article class="analytics-block accent-ok" data-report="retreadEligible" id="blockRetreadEligible">
  <div class="analytics-head">
    <div>
      <h3>Retread Eligibility</h3>
      <p class="analytics-note">Tyres eligible for retreading (tread 3-6mm, retreads &lt; 3).</p>
    </div>
  </div>
  <div class="table-responsive">
    <table class="data-table" id="retreadEligibleTable">
      <thead>
        <tr>
          <th>Tyre No</th>
          <th>Position</th>
          <th>Tread Depth (mm)</th>
          <th>Retread Count</th>
          <th>Inspection Date</th>
        </tr>
      </thead>
      <tbody id="retreadEligibleBody"></tbody>
    </table>
  </div>
</article>
```

- [ ] **Step 5: Add Feature 5 block (Brand Cost-per-KM)**

```html
<article class="analytics-block accent-warn" data-report="brandCostPerKm" id="blockBrandCostPerKm">
  <div class="analytics-head">
    <div>
      <h3>Brand-wise Cost per KM</h3>
      <p class="analytics-note">Cost efficiency comparison across tyre brands.</p>
    </div>
  </div>
  <div class="chart-container" style="position:relative;height:300px;width:100%">
    <canvas id="brandCostPerKmChart"></canvas>
  </div>
  <div class="table-responsive" style="margin-top:16px">
    <table class="data-table" id="brandCostPerKmTable">
      <thead>
        <tr>
          <th>Brand</th>
          <th>Tyres</th>
          <th>Total KM</th>
          <th>Total Cost (₹)</th>
          <th>₹/KM</th>
        </tr>
      </thead>
      <tbody id="brandCostPerKmBody"></tbody>
    </table>
  </div>
</article>
```

- [ ] **Step 6: Add Feature 6 block (P&L per Tyre)**

```html
<article class="analytics-block accent-ok" data-report="tyrePnL" id="blockTyrePnL">
  <div class="analytics-head">
    <div>
      <h3>P&amp;L per Tyre</h3>
      <p class="analytics-note">Profit &amp; loss per tyre based on rate/km × km run minus costs.</p>
    </div>
  </div>
  <div class="table-responsive">
    <table class="data-table" id="tyrePnLTable">
      <thead>
        <tr>
          <th>Tyre No</th>
          <th>Make</th>
          <th>Total KM</th>
          <th>Revenue (₹)</th>
          <th>Cost (₹)</th>
          <th>P&amp;L (₹)</th>
        </tr>
      </thead>
      <tbody id="tyrePnLBody"></tbody>
    </table>
  </div>
</article>
```

- [ ] **Step 7: Add heatmap grid CSS**

In the dashboard's CSS section (or inline in index.html `<style>`), add:

```css
.pressure-heatmap-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 8px;
  padding: 8px 0;
}
.pressure-heatmap-card {
  border-radius: 8px;
  padding: 12px;
  text-align: center;
  font-size: 13px;
  border: 1px solid rgba(255,255,255,0.08);
}
.pressure-heatmap-card .tyre-no {
  font-weight: 600;
  font-size: 14px;
}
.pressure-heatmap-card .psi-value {
  font-size: 20px;
  font-weight: 700;
  margin: 4px 0;
}
.pressure-heatmap-card .position-label {
  opacity: 0.7;
  font-size: 11px;
}
.pressure-heatmap-card.status-ok    { background: rgba(34,197,94,0.15); border-color: rgba(34,197,94,0.3); }
.pressure-heatmap-card.status-ok .psi-value    { color: #22c55e; }
.pressure-heatmap-card.status-warn  { background: rgba(234,179,8,0.15); border-color: rgba(234,179,8,0.3); }
.pressure-heatmap-card.status-warn .psi-value  { color: #eab308; }
.pressure-heatmap-card.status-critical { background: rgba(239,68,68,0.15); border-color: rgba(239,68,68,0.3); }
.pressure-heatmap-card.status-critical .psi-value { color: #ef4444; }
.pressure-heatmap-card.status-unknown {
  background: rgba(148,163,184,0.1);
  border-color: rgba(148,163,184,0.2);
  opacity: 0.6;
}
```

### Task 6: Add 6 new checkbox keys to Reports Index in site-settings

**Files:**
- Modify: `manager/site-settings.html`

- [ ] **Step 1: Add 6 checkbox entries to the Reports Index section**

In the Reports Index checkboxes grid, add these entries alongside the existing 11:

```html
<div class="report-checkbox">
  <input type="checkbox" id="chkPressureFuelCost" value="pressureFuelCost" checked>
  <label for="chkPressureFuelCost">Pressure vs Fuel Cost</label>
</div>
<div class="report-checkbox">
  <input type="checkbox" id="chkPressureHeatmap" value="pressureHeatmap" checked>
  <label for="chkPressureHeatmap">Pressure Heatmap</label>
</div>
<div class="report-checkbox">
  <input type="checkbox" id="chkRtdScrapping" value="rtdScrapping" checked>
  <label for="chkRtdScrapping">RTD Scrapping Recommendation</label>
</div>
<div class="report-checkbox">
  <input type="checkbox" id="chkRetreadEligible" value="retreadEligible" checked>
  <label for="chkRetreadEligible">Retread Eligibility</label>
</div>
<div class="report-checkbox">
  <input type="checkbox" id="chkBrandCostPerKm" value="brandCostPerKm" checked>
  <label for="chkBrandCostPerKm">Brand-wise Cost per KM</label>
</div>
<div class="report-checkbox">
  <input type="checkbox" id="chkTyrePnL" value="tyrePnL" checked>
  <label for="chkTyrePnL">P&L per Tyre</label>
</div>
```

### Task 7: Implement renderPressureFuelCost

**Files:**
- Modify: `manager/src/pages/dashboard.js`

- [ ] **Step 1: Add the render function**

```js
function renderPressureFuelCost() {
  const canvas = document.getElementById('pressureFuelCostChart');
  if (!canvas) return;

  const fuelRows = state.fuelRows || [];
  const targetKmpl = state.targets.pressureFuelEfficiencyKmpl || 2.8;
  const fuelPrice = state.targets.pressureFuelPrice || 90;

  const monthly = {};
  for (const row of fuelRows) {
    const month = (row.entry_date || '').slice(0, 7);
    if (!month) continue;
    if (!monthly[month]) monthly[month] = { targetCost: 0, actualCost: 0 };
    const km = Number(row.total_kms) || 0;
    const liters = Number(row.total_fuel_consumed) || 0;
    monthly[month].actualCost += liters * fuelPrice;
    monthly[month].targetCost += (km / targetKmpl) * fuelPrice;
  }

  const labels = Object.keys(monthly).sort().slice(-12);
  const targetData = labels.map(m => Math.round(monthly[m].targetCost));
  const actualData = labels.map(m => Math.round(monthly[m].actualCost));

  const ctx = canvas.getContext('2d');
  if (window._pressureFuelCostChart) window._pressureFuelCostChart.destroy();
  window._pressureFuelCostChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Target Fuel Cost (₹)', data: targetData, backgroundColor: 'rgba(34,197,94,0.7)', borderRadius: 4 },
        { label: 'Actual Fuel Cost (₹)', data: actualData, backgroundColor: 'rgba(239,68,68,0.7)', borderRadius: 4 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: { stacked: false }, y: { beginAtZero: true, ticks: { callback: v => '₹' + v.toLocaleString() } } },
      plugins: { legend: { position: 'top' } }
    }
  });
}
```

### Task 8: Implement renderPressureHeatmap

**Files:**
- Modify: `manager/src/pages/dashboard.js`

- [ ] **Step 1: Add the render function**

```js
function renderPressureHeatmap() {
  const grid = document.getElementById('pressureHeatmapGrid');
  if (!grid) return;

  const basePsi = state.targets.pressureBasePsi || 120;
  const tyreRecords = state.tyreRecords || [];
  const pressureEvents = state.pressureEvents || [];

  const latestPsi = {};
  for (const ev of pressureEvents) {
    const tyreId = ev.tyre_id || ev.tyreId;
    if (tyreId && ev.psi_found != null) {
      if (!latestPsi[tyreId] || ev.date > latestPsi[tyreId].date) {
        latestPsi[tyreId] = { psi: Number(ev.psi_found), date: ev.date, position: ev.position || '' };
      }
    }
  }

  const tyreMap = {};
  for (const t of tyreRecords) {
    const tyreId = t.id || t.tyreId;
    if (tyreId && t.tyre_no) tyreMap[tyreId] = t;
  }

  let html = '';
  for (const [tyreId, info] of Object.entries(latestPsi)) {
    const tyre = tyreMap[tyreId];
    const tyreNo = tyre ? tyre.tyre_no : tyreId.slice(0, 8);
    const dev = info.psi - basePsi;
    const absDev = Math.abs(dev);
    let status, statusLabel;
    if (absDev <= 5) { status = 'ok'; statusLabel = 'OK'; }
    else if (absDev <= 10) { status = 'warn'; statusLabel = 'WARN'; }
    else { status = 'critical'; statusLabel = 'CRIT'; }

    html += `<div class="pressure-heatmap-card status-${status}">
      <div class="tyre-no">${tyreNo}</div>
      <div class="psi-value">${info.psi}</div>
      <div style="font-size:11px;opacity:0.7">${dev > 0 ? '+' : ''}${dev.toFixed(1)} PSI</div>
      <div class="position-label">${info.position} · ${statusLabel}</div>
    </div>`;
  }

  if (!html) {
    html = '<p style="color:#94a3b8;text-align:center;padding:20px">No pressure data available.</p>';
  }

  grid.innerHTML = html;
}
```

### Task 9: Implement renderRtdScrapping

**Files:**
- Modify: `manager/src/pages/dashboard.js`

- [ ] **Step 1: Add the render function**

```js
function renderRtdScrapping() {
  const tbody = document.getElementById('rtdScrappingBody');
  if (!tbody) return;

  const inspections = state.inspectionRecords || [];
  const tyreRecords = state.tyreRecords || [];

  const latestInsp = {};
  for (const row of inspections) {
    const key = row.tyre_no || row.tyreNo;
    if (!key || row.rtd1 == null) continue;
    if (!latestInsp[key] || row.date > latestInsp[key].date) {
      latestInsp[key] = { rtd1: Number(row.rtd1), position: row.position || '', date: row.date };
    }
  }

  const flagged = Object.entries(latestInsp)
    .filter(([, v]) => v.rtd1 <= 1.5)
    .sort((a, b) => a[1].rtd1 - b[1].rtd1);

  if (flagged.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:20px">No tyres currently flagged for scrapping.</td></tr>';
    return;
  }

  tbody.innerHTML = flagged.map(([tyreNo, v]) =>
    `<tr style="color:#ef4444">
      <td><strong>${tyreNo}</strong></td>
      <td>${v.position}</td>
      <td><strong>${v.rtd1.toFixed(1)}</strong></td>
      <td>${v.date || '-'}</td>
    </tr>`
  ).join('');
}
```

### Task 10: Implement renderRetreadEligible

**Files:**
- Modify: `manager/src/pages/dashboard.js`

- [ ] **Step 1: Add the render function**

```js
function renderRetreadEligible() {
  const tbody = document.getElementById('retreadEligibleBody');
  if (!tbody) return;

  const inspections = state.inspectionRecords || [];
  const retreadCounts = state.retreadCounts || {};

  const latestInsp = {};
  for (const row of inspections) {
    const key = row.tyre_no || row.tyreNo;
    if (!key || row.rtd1 == null) continue;
    if (!latestInsp[key] || row.date > latestInsp[key].date) {
      latestInsp[key] = { rtd1: Number(row.rtd1), position: row.position || '', date: row.date, tyreId: row.tyre_id || row.tyreId };
    }
  }

  const eligible = Object.entries(latestInsp)
    .filter(([, v]) => v.rtd1 >= 3 && v.rtd1 <= 6 && (retreadCounts[v.tyreId] || 0) < 3)
    .sort((a, b) => b[1].rtd1 - a[1].rtd1);

  if (eligible.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:20px">No tyres currently eligible for retreading.</td></tr>';
    return;
  }

  tbody.innerHTML = eligible.map(([tyreNo, v]) =>
    `<tr style="color:#22c55e">
      <td><strong>${tyreNo}</strong></td>
      <td>${v.position}</td>
      <td><strong>${v.rtd1.toFixed(1)}</strong></td>
      <td>${retreadCounts[v.tyreId] || 0}</td>
      <td>${v.date || '-'}</td>
    </tr>`
  ).join('');
}
```

### Task 11: Implement renderBrandCostPerKm

**Files:**
- Modify: `manager/src/pages/dashboard.js`

- [ ] **Step 1: Add the render function**

```js
function renderBrandCostPerKm() {
  const canvas = document.getElementById('brandCostPerKmChart');
  const tbody = document.getElementById('brandCostPerKmBody');
  if (!canvas || !tbody) return;

  const tyreRecords = state.tyreRecords || [];
  const tyrePrice = state.targets.tyrePrice || 0;

  const brands = {};
  for (const t of tyreRecords) {
    const brand = (t.make || t.brand || 'Unknown').trim();
    if (!brands[brand]) brands[brand] = { count: 0, totalKm: 0 };
    brands[brand].count += 1;
    brands[brand].totalKm += Number(t.total_life_run || t.life_achieved || t.totalLifeRun || 0);
  }

  const entries = Object.entries(brands)
    .map(([brand, v]) => ({
      brand,
      count: v.count,
      totalKm: v.totalKm,
      totalCost: v.count * tyrePrice,
      costPerKm: v.totalKm > 0 ? (v.count * tyrePrice) / v.totalKm : 0
    }))
    .sort((a, b) => b.costPerKm - a.costPerKm);

  const labels = entries.map(e => e.brand);
  const data = entries.map(e => e.costPerKm);

  const ctx = canvas.getContext('2d');
  if (window._brandCostPerKmChart) window._brandCostPerKmChart.destroy();
  window._brandCostPerKmChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: '₹/KM', data, backgroundColor: 'rgba(59,130,246,0.7)', borderRadius: 4 }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      scales: { x: { beginAtZero: true, ticks: { callback: v => '₹' + v.toFixed(2) } } },
      plugins: { legend: { display: false } }
    }
  });

  tbody.innerHTML = entries.map(e =>
    `<tr>
      <td><strong>${e.brand}</strong></td>
      <td>${e.count}</td>
      <td>${e.totalKm.toLocaleString()}</td>
      <td>₹${e.totalCost.toLocaleString()}</td>
      <td><strong>₹${e.costPerKm.toFixed(2)}</strong></td>
    </tr>`
  ).join('');
}
```

### Task 12: Implement renderTyrePnL

**Files:**
- Modify: `manager/src/pages/dashboard.js`

- [ ] **Step 1: Add the render function**

```js
function renderTyrePnL() {
  const tbody = document.getElementById('tyrePnLBody');
  if (!tbody) return;

  const tyreRecords = state.tyreRecords || [];
  const tyrePrice = state.targets.tyrePrice || 0;
  const retreadCost = state.targets.retreadCost || 0;
  const ratePerKm = state.ratePerKm || 0;
  const retreadCounts = state.retreadCounts || {};

  if (ratePerKm === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:20px">Set Rate per KM in Site Settings to enable P&amp;L calculations.</td></tr>';
    return;
  }

  let totalRevenue = 0, totalCost = 0, totalPnL = 0;

  const rows = tyreRecords
    .filter(t => t.tyre_no)
    .map(t => {
      const tyreId = t.id || t.tyreId;
      const km = Number(t.total_life_run || t.life_achieved || t.totalLifeRun || 0);
      const retreads = retreadCounts[tyreId] || 0;
      const revenue = km * ratePerKm;
      const cost = tyrePrice + (retreads * retreadCost);
      const pnl = revenue - cost;
      totalRevenue += revenue; totalCost += cost; totalPnL += pnl;
      return { tyreNo: t.tyre_no, make: t.make || t.brand || '-', km, revenue, cost, pnl };
    })
    .sort((a, b) => b.pnl - a.pnl);

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:20px">No tyre data available.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(r =>
    `<tr style="color:${r.pnl >= 0 ? '#22c55e' : '#ef4444'}">
      <td><strong>${r.tyreNo}</strong></td>
      <td>${r.make}</td>
      <td>${r.km.toLocaleString()}</td>
      <td>₹${Math.round(r.revenue).toLocaleString()}</td>
      <td>₹${Math.round(r.cost).toLocaleString()}</td>
      <td><strong>${r.pnl >= 0 ? '+' : ''}₹${Math.round(r.pnl).toLocaleString()}</strong></td>
    </tr>`
  ).join('') +
  `<tr style="font-weight:700;border-top:2px solid rgba(255,255,255,0.15)">
    <td>TOTAL</td><td></td>
    <td></td>
    <td>₹${Math.round(totalRevenue).toLocaleString()}</td>
    <td>₹${Math.round(totalCost).toLocaleString()}</td>
    <td style="color:${totalPnL >= 0 ? '#22c55e' : '#ef4444'}">${totalPnL >= 0 ? '+' : ''}₹${Math.round(totalPnL).toLocaleString()}</td>
  </tr>`;
}
```

### Task 13: Wire all 6 render functions

**Files:**
- Modify: `manager/src/pages/dashboard.js`

- [ ] **Step 1: Add calls to renderAllHeavyModules**

Update `renderAllHeavyModules()`:

```js
function renderAllHeavyModules() {
  renderTopStrip(); 
  renderTyreFilterOptions();
  renderTyreTable();
  renderInspectionTable();
  renderSavings();
  renderPressureFuelCost();
  renderPressureHeatmap();
  renderRtdScrapping();
  renderRetreadEligible();
  renderBrandCostPerKm();
  renderTyrePnL();
  updateTabBadges();
  applyReportVisibility();
  requestAnimationFrame(() => renderCharts());
}
```

- [ ] **Step 2: Add keys to applyReportVisibility**

The `applyReportVisibility()` function already handles `[data-report]` elements generically, so the 6 new blocks are automatically included. No changes needed to the function itself — the `data-report` attributes on the `<article>` elements handle visibility.

- [ ] **Step 3: Verify the function ordering**

Ensure all render functions are called AFTER their data dependencies are loaded (they are — all data is set before `renderAllHeavyModules` is called).

### Task 14: Self-review and verification

- [ ] **Step 1: Check for undefined references**

Verify all element IDs in dashboard.js match IDs in index.html:
- `pressureFuelCostChart` ✅
- `pressureHeatmapGrid` ✅
- `rtdScrappingBody` ✅
- `retreadEligibleBody` ✅
- `brandCostPerKmChart`, `brandCostPerKmBody` ✅
- `tyrePnLBody` ✅

- [ ] **Step 2: Verify data flow**

- fetchRetreadCounts → state.retreadCounts: used in renderRetreadEligible and renderTyrePnL ✅
- state.targets.ratePerKm → state.ratePerKm: used in renderTyrePnL ✅
- state.pressureEvents: used in renderPressureHeatmap ✅
- state.fuelRows: used in renderPressureFuelCost ✅

- [ ] **Step 3: Verify Reports Index**

All 6 new data-report keys (pressureFuelCost, pressureHeatmap, rtdScrapping, retreadEligible, brandCostPerKm, tyrePnL) are registered in:
- `index.html`: `data-report` attributes on each article ✅
- `site-settings.html`: checkbox values ✅
- `dashboard.js`: handled automatically by `applyReportVisibility()` ✅
