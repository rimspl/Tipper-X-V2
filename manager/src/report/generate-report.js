/* ═══════════════════════════════════════════════════════════
   DynaHaul X — One-Page Fleet Report Generator
   Produces an HTML string optimized for A4 print output.
   Called by api/deliver-report.js (scheduled) or export button.
   ═══════════════════════════════════════════════════════════ */

export async function generateWeeklyFleetReport(siteId, supabaseClient) {
  const supabase = supabaseClient;
  const siteInfo = await fetchSiteInfo(supabase, siteId);
  const healthScore = await fetchHealthScore(supabase, siteId);
  const pressureSummary = await fetchPressureSummary(supabase, siteId);
  const recentAlerts = await fetchRecentAlerts(supabase, siteId);
  const fleetOverview = await fetchFleetOverview(supabase, siteId);
  const topDefects = await fetchTopDefects(supabase, siteId);

  return buildReportHtml({
    siteInfo,
    healthScore,
    pressureSummary,
    recentAlerts,
    fleetOverview,
    topDefects
  });
}

async function fetchSiteInfo(supabase, siteId) {
  const { data } = await supabase
    .from('sites')
    .select('site_name, target_life_unit, customers(name), pressure_base_psi')
    .eq('id', siteId)
    .single();
  return data || { site_name: 'Site', target_life_unit: 'KM' };
}

async function fetchHealthScore(supabase, siteId) {
  const { data } = await supabase
    .from('v_fleet_health_score')
    .select('*')
    .eq('site_id', siteId)
    .limit(1)
    .maybeSingle();
  return data;
}

async function fetchPressureSummary(supabase, siteId) {
  const { data } = await supabase
    .from('v_manager_pressure_events')
    .select('tyre_no, truck, position, psi_found, date')
    .eq('site_id', siteId)
    .order('date', { ascending: false })
    .limit(20);
  return data || [];
}

async function fetchRecentAlerts(supabase, siteId) {
  const { data } = await supabase
    .from('alert_logs')
    .select('event_type, message, created_at')
    .eq('site_id', siteId)
    .eq('status', 'sent')
    .order('created_at', { ascending: false })
    .limit(10);
  return data || [];
}

async function fetchFleetOverview(supabase, siteId) {
  const { data: tyreRecords } = await supabase
    .from('v_manager_tyre_records')
    .select('id, status')
    .eq('site_id', siteId);

  const total = (tyreRecords || []).length;
  const running = (tyreRecords || []).filter(t => t.status === 'Running').length;
  const spare = (tyreRecords || []).filter(t => t.status === 'Spare').length;
  const scrap = (tyreRecords || []).filter(t => t.status === 'Scrap' || t.status === 'Retread').length;

  return { total, running, spare, scrap };
}

async function fetchTopDefects(supabase, siteId) {
  const { data } = await supabase
    .from('v_defect_trend_by_position')
    .select('vehicle_no, position_code, defect_count_90d')
    .eq('site_id', siteId)
    .order('defect_count_90d', { ascending: false })
    .limit(5);
  return data || [];
}

function buildReportHtml({ siteInfo, healthScore, pressureSummary, recentAlerts, fleetOverview, topDefects }) {
  const siteName = siteInfo.site_name || 'Site';
  const reportDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const healthBlock = healthScore && healthScore.health_score !== null
    ? `<div class="rs-health">
        <strong>Fleet Health Score: ${Math.round(healthScore.health_score)}/100</strong>
        <span class="rs-health-bar"><span style="width:${Math.min(healthScore.health_score, 100)}%"></span></span>
       </div>`
    : '';

  const pressureRows = pressureSummary.slice(0, 10).map(p =>
    `<tr><td>${p.tyre_no || '—'}</td><td>${p.truck || '—'}</td><td>${p.position || '—'}</td><td>${p.psi_found || '—'}</td></tr>`
  ).join('');

  const alertList = recentAlerts.slice(0, 5).map(a =>
    `<li>${a.message || a.event_type} <span class="rs-meta">${new Date(a.created_at).toLocaleDateString('en-IN')}</span></li>`
  ).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Weekly Fleet Report — ${siteName}</title>
<style>${getReportStyles()}</style></head><body>
<div class="rs-page">
  <div class="rs-header">
    <h1>DynaHaul X — Fleet Report</h1>
    <p class="rs-site">${siteName} &middot; ${reportDate}</p>
  </div>

  ${healthBlock}

  <div class="rs-grid">
    <div class="rs-card"><span class="rs-card-label">Total Tyres</span><strong>${fleetOverview.total}</strong></div>
    <div class="rs-card"><span class="rs-card-label">Running</span><strong>${fleetOverview.running}</strong></div>
    <div class="rs-card"><span class="rs-card-label">Spare</span><strong>${fleetOverview.spare}</strong></div>
    <div class="rs-card"><span class="rs-card-label">Scrap/Retread</span><strong>${fleetOverview.scrap}</strong></div>
  </div>

  <h2>Pressure Readings (Last 10)</h2>
  <table class="rs-table"><thead><tr><th>Tyre</th><th>Truck</th><th>Position</th><th>PSI</th></tr></thead>
  <tbody>${pressureRows || '<tr><td colspan="4" class="rs-empty">No pressure data.</td></tr>'}</tbody></table>

  <h2>Recent Alerts (Top 5)</h2>
  <ul class="rs-alerts">${alertList || '<li class="rs-empty">No alerts.</li>'}</ul>

  ${topDefects.length > 0 ? `
  <h2>Top Defect Positions (90-Day)</h2>
  <table class="rs-table"><thead><tr><th>Truck</th><th>Position</th><th>Defects</th></tr></thead>
  <tbody>${topDefects.map(d => `<tr><td>${d.vehicle_no}</td><td>${d.position_code || '—'}</td><td>${d.defect_count_90d}</td></tr>`).join('')}</tbody></table>
  ` : ''}

  <div class="rs-footer">
    <p>Generated by DynaHaul X Tipper Division &middot; ${reportDate}</p>
  </div>
</div>
</body></html>`;
}

function getReportStyles() {
  return `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #222; background: #fff; }
.rs-page { max-width: 210mm; margin: 0 auto; padding: 15mm 12mm; }
.rs-header { border-bottom: 3px solid #1e6f5c; padding-bottom: 8px; margin-bottom: 16px; }
.rs-header h1 { font-size: 18pt; color: #1e6f5c; }
.rs-site { font-size: 10pt; color: #555; }
.rs-health { margin: 12px 0; padding: 10px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; }
.rs-health strong { font-size: 13pt; }
.rs-health-bar { display: block; height: 10px; background: #e5e7eb; border-radius: 5px; margin-top: 6px; overflow: hidden; }
.rs-health-bar span { display: block; height: 100%; background: #10b981; border-radius: 5px; }
.rs-grid { display: flex; gap: 10px; margin: 12px 0; }
.rs-card { flex: 1; padding: 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; text-align: center; }
.rs-card-label { display: block; font-size: 8pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
.rs-card strong { font-size: 16pt; color: #1e293b; }
h2 { font-size: 12pt; color: #1e6f5c; margin: 16px 0 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
.rs-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
.rs-table th { background: #f1f5f9; text-align: left; padding: 6px 8px; border: 1px solid #e2e8f0; color: #475569; }
.rs-table td { padding: 5px 8px; border: 1px solid #e2e8f0; }
.rs-table tr:nth-child(even) td { background: #fafafa; }
.rs-alerts { list-style: none; font-size: 9pt; }
.rs-alerts li { padding: 4px 0; border-bottom: 1px solid #f0f0f0; }
.rs-meta { color: #94a3b8; font-size: 8pt; }
.rs-empty { color: #94a3b8; text-align: center; padding: 12px; }
.rs-footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 8pt; color: #94a3b8; }
@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .rs-page { padding: 0; } }
`;
}
