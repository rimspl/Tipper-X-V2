const DAY_MS = 24 * 60 * 60 * 1000;
const INSPECTION_DUE_DAYS = 30;

let els = null;
let scrapChart = null;
let refreshBusy = false;

export function initHomepageOverview({ onRefresh } = {}) {
  const root = document.getElementById('fleetOverview');
  if (!root) return false;

  els = {
    root,
    insight: document.getElementById('foInsight'),
    insightSeverity: document.getElementById('foInsightSeverity'),
    insightHeadline: document.getElementById('foInsightHeadline'),
    insightCopy: document.getElementById('foInsightCopy'),
    insightAction: document.getElementById('foInsightAction'),
    snapshotMeta: document.getElementById('foSnapshotMeta'),
    refreshBtn: document.getElementById('foRefreshBtn'),

    healthCard: document.getElementById('foHealthCard'),
    healthChip: document.getElementById('foHealthChip'),
    healthGauge: document.getElementById('foHealthGauge'),
    healthValue: document.getElementById('foHealthValue'),
    healthSupport: document.getElementById('foHealthSupport'),

    activeCard: document.getElementById('foActiveCard'),
    activeChip: document.getElementById('foActiveChip'),
    activeValue: document.getElementById('foActiveValue'),
    activeTotal: document.getElementById('foActiveTotal'),
    activeSupport: document.getElementById('foActiveSupport'),

    lifeCard: document.getElementById('foLifeCard'),
    lifeChip: document.getElementById('foLifeChip'),
    lifeValue: document.getElementById('foLifeValue'),
    lifeSupport: document.getElementById('foLifeSupport'),

    savingsCard: document.getElementById('foSavingsCard'),
    savingsChip: document.getElementById('foSavingsChip'),
    savingsValue: document.getElementById('foSavingsValue'),
    savingsSupport: document.getElementById('foSavingsSupport'),

    scrapView: document.getElementById('foScrapView'),
    scrapChart: document.getElementById('foScrapChart'),
    scrapEmpty: document.getElementById('foScrapEmpty'),
    scrapSupport: document.getElementById('foScrapSupport'),

    attentionCard: document.getElementById('foAttentionCard'),
    attentionChip: document.getElementById('foAttentionChip'),
    attentionList: document.getElementById('foAttentionList'),
    attentionEmpty: document.getElementById('foAttentionEmpty'),

    brandView: document.getElementById('foBrandView'),
    brandList: document.getElementById('foBrandList'),
    brandEmpty: document.getElementById('foBrandEmpty'),
    brandSupport: document.getElementById('foBrandSupport'),

    pressureChip: document.getElementById('foPressureChip'),
    pressureValue: document.getElementById('foPressureValue'),
    pressureBar: document.getElementById('foPressureBar'),
    pressureSupport: document.getElementById('foPressureSupport'),
    pressureView: document.getElementById('foPressureView'),
    pressureSettings: document.getElementById('foPressureSettings'),

    aiAccuracy: document.getElementById('foAiAccuracy'),
    dataPeriod: document.getElementById('foDataPeriod'),
    lastRefreshed: document.getElementById('foLastRefreshed')
  };

  els.refreshBtn?.addEventListener('click', async () => {
    if (refreshBusy || typeof onRefresh !== 'function') return;
    refreshBusy = true;
    els.refreshBtn.classList.add('is-busy');
    els.refreshBtn.disabled = true;
    if (els.snapshotMeta) els.snapshotMeta.textContent = 'Refreshing live records…';
    try {
      await onRefresh();
    } catch (error) {
      if (els.snapshotMeta) els.snapshotMeta.textContent = 'Refresh failed. Try again.';
    } finally {
      refreshBusy = false;
      els.refreshBtn.classList.remove('is-busy');
      els.refreshBtn.disabled = false;
    }
  });

  initSidebar();
  return true;
}

function initSidebar() {
  const sidebar = document.getElementById('foSidebar');
  const backdrop = document.getElementById('foSidebarBackdrop');
  const menuBtn = document.getElementById('foMenuBtn');
  if (!sidebar || !backdrop || !menuBtn) return;

  const closeSidebar = () => {
    document.body.classList.remove('fo-sidebar-open');
    backdrop.hidden = true;
    menuBtn.setAttribute('aria-expanded', 'false');
  };

  const openSidebar = () => {
    document.body.classList.add('fo-sidebar-open');
    backdrop.hidden = false;
    menuBtn.setAttribute('aria-expanded', 'true');
  };

  menuBtn.addEventListener('click', () => {
    if (document.body.classList.contains('fo-sidebar-open')) closeSidebar();
    else openSidebar();
  });

  backdrop.addEventListener('click', closeSidebar);

  const navLinks = Array.from(sidebar.querySelectorAll('[data-fo-nav], [data-fo-report]'));
  const setActive = (target) => {
    navLinks.forEach((link) => {
      const active = link === target;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  };
  const syncActiveFromLocation = (initial = false) => {
    if (new URLSearchParams(window.location.search).get('view') === 'dashboard') {
      const dashboardLink = navLinks.find((link) => link.dataset.foNav === 'dashboard');
      if (dashboardLink) {
        setActive(dashboardLink);
        return;
      }
    }
    if (initial) {
      const report = new URLSearchParams(window.location.search).get('report');
      if (report) {
        const reportLink = navLinks.find((link) => link.dataset.foReport === report);
        if (reportLink) {
          setActive(reportLink);
          return;
        }
      }
    }
    const hash = window.location.hash.replace('#', '').toLowerCase();
    const tabMap = {
      tyres: 'tyres',
      inspection: 'inspection',
      analytics: 'reports',
      savings: 'savings'
    };
    const target = navLinks.find((link) => link.dataset.foNav === (tabMap[hash] || 'dashboard'));
    if (target) setActive(target);
  };

  navLinks.forEach((link) => {
    link.addEventListener('click', () => {
      setActive(link);
      closeSidebar();
    });
  });
  sidebar.querySelectorAll('a:not([data-fo-nav]):not([data-fo-report])').forEach((link) => {
    link.addEventListener('click', closeSidebar);
  });
  syncActiveFromLocation(true);
  window.addEventListener('hashchange', () => syncActiveFromLocation(false));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.body.classList.contains('fo-sidebar-open')) {
      closeSidebar();
    }
  });

  let session = {};
  try {
    session = JSON.parse(sessionStorage.getItem('rims_session') || '{}');
  } catch (_) {}

  const user = document.getElementById('foSideUser');
  const site = document.getElementById('foSideSite');
  const avatar = document.getElementById('foSideAvatar');
  if (user) user.textContent = session.username || 'Manager';
  if (site) site.textContent = session.siteName || 'Site not linked';
  if (avatar) {
    const label = String(session.username || session.siteName || 'M').trim();
    avatar.textContent = label.slice(0, 1).toUpperCase() || 'M';
  }
}

export function renderHomepageOverview(state) {
  if (!els || !state) return;

  const model = buildModel(state);
  renderSnapshotMeta(model);
  renderInsight(model);
  renderHealth(model);
  renderActive(model);
  renderLife(model);
  renderSavings(model);
  renderScrap(model);
  renderAttention(model);
  renderBrands(model);
  renderPressure(model);
  renderFooter(model);
}

function buildModel(state) {
  const records = Array.isArray(state.tyreRecords) ? state.tyreRecords : [];
  const running = records.filter((record) => classifyRecord(record) === 'running');
  const scrapped = records.filter((record) => classifyRecord(record) === 'scrapped');
  const trucks = new Set(
    running.map((record) => clean(record.vehicle_no || record.truck)).filter((value) => value && value !== '-')
  );

  const targets = state.targets || {};
  const targetLife = numberOrNull(targets.targetTyreLife) || 0;
  const unit = String(targets.lifeUnit || 'KM').toUpperCase();

  const runs = Array.isArray(state.analytics?.sectionA) ? state.analytics.sectionA : [];
  const completed = runs.filter((run) => {
    const removal = run?.removal_date;
    return removal && removal !== '-' && Number(run.actual_life) > 0;
  });
  const onTarget = targetLife > 0
    ? completed.filter((run) => Number(run.actual_life) >= targetLife)
    : [];
  const below = targetLife > 0
    ? completed.filter((run) => Number(run.actual_life) < targetLife)
    : [];

  const lifePct = completed.length >= 3 && targetLife > 0
    ? Math.round((onTarget.length / completed.length) * 100)
    : null;
  const avgLife = completed.length
    ? average(completed.map((run) => Number(run.actual_life) || 0))
    : null;

  const health = state.fleetHealth || {};
  const healthScore = finiteNumber(health.health_score);
  const pressureScore = finiteNumber(health.pressure_compliance_score);
  const monitoredTyres = Number(health.total_tyres_with_pressure || 0);

  const overdue = buildOverdue(running, state.inspectionRecords);
  const savingsRow = Array.isArray(state.analytics?.savings)
    ? state.analytics.savings.find((row) => /tyre life/i.test(String(row?.parameter || '')))
    : null;
  const savingsValue = Math.max(0, Number(savingsRow?.impact || 0));

  return {
    state,
    records,
    running,
    scrapped,
    trucks,
    targetLife,
    unit,
    completed,
    onTarget,
    below,
    lifePct,
    avgLife,
    healthScore,
    pressureScore,
    monitoredTyres,
    overdue,
    savingsValue,
    recentDefects: Number(health.recent_defect_count || 0),
    inspectedLast7d: Number(health.tyres_inspected_last_7d || 0),
    avgPressureDrop: finiteNumber(health.avg_pressure_drop_psi),
    errors: state.dataErrors || {}
  };
}

function renderSnapshotMeta(model) {
  if (!els.snapshotMeta) return;
  if (model.errors.dataset) {
    els.snapshotMeta.textContent = 'Live data unavailable · showing empty states';
  } else if (model.records.length > 0) {
    els.snapshotMeta.textContent = `Live records · ${model.records.length} tyres`;
  } else {
    els.snapshotMeta.textContent = 'No tyre records captured yet';
  }
}

function renderInsight(model) {
  let severity = 'stable';
  let chipLabel = 'Stable';
  let title = 'Fleet is performing within expected range';
  let detail = 'No open tyre, inspection or defect exceptions in the current data.';
  let actionLabel = 'View analytics';
  let actionHref = tabHref('analytics');

  if (model.errors.dataset) {
    severity = 'watch';
    chipLabel = 'Unavailable';
    title = 'Live data is temporarily unavailable';
    detail = 'Refresh the page or check the site connection. Empty states are shown below.';
    actionLabel = 'Reload page';
    actionHref = window.location.href;
  } else if (model.records.length === 0) {
    severity = 'preview';
    chipLabel = 'No data';
    title = 'No tyre records captured yet';
    detail = 'Add vehicles and fitments to begin tracking fleet health.';
    actionLabel = 'Open tyre records';
    actionHref = reportLink(model, 'tyreRecords', tabHref('analytics'));
  } else if (model.healthScore !== null && model.healthScore < 50) {
    severity = 'action';
    chipLabel = 'Action';
    title = 'Fleet health needs attention';
    detail = `${model.below.length} completed runs are below target life and ${model.overdue.length} inspections are overdue.`;
    actionLabel = 'Review tyre health';
    actionHref = reportLink(model, 'fleetHealth', tabHref('analytics'));
  } else if (model.below.length > 0) {
    severity = 'watch';
    chipLabel = 'Watch';
    const first = model.below[0];
    title = `${model.below.length} completed tyre runs fell short of target life`;
    detail = `Start with ${displayTyre(first)}${first?.truck ? ` on ${first.truck}` : ''}.`;
    actionLabel = 'Review tyres';
    actionHref = reportLink(model, 'tyreRecords', tabHref('analytics'));
  } else if (model.overdue.length > 0) {
    severity = 'watch';
    chipLabel = 'Watch';
    const oldest = model.overdue[0];
    title = `${model.overdue.length} inspections are overdue`;
    detail = oldest.days === null
      ? `${displayTyre(oldest.record)} has no inspection logged yet.`
      : `Oldest open inspection: ${oldest.days} days.`;
    actionLabel = 'Open inspections';
    actionHref = reportLink(model, 'inspectionRecords', tabHref('analytics'));
  } else if (model.recentDefects > 0) {
    severity = 'watch';
    chipLabel = 'Watch';
    title = `${model.recentDefects} new defects were logged recently`;
    detail = 'Check the defect trend before the next fitment cycle.';
    actionLabel = 'View defect trend';
    actionHref = reportLink(model, 'defectTrend', tabHref('analytics'));
  }

  if (els.insight) els.insight.className = `fo-insight severity-${severity}`;
  setText(els.insightHeadline, title);
  setText(els.insightCopy, detail);
  setChip(els.insightSeverity, chipLabel, chipTone(severity));
  setLink(els.insightAction, actionHref, true);
  if (els.insightAction) {
    els.insightAction.innerHTML = `${escapeHtml(actionLabel)}<svg class="fo-icon"><use href="#fo-i-arrow"/></svg>`;
  }
}

function renderHealth(model) {
  setLink(els.healthCard, reportLink(model, 'fleetHealth', tabHref('analytics')), true);

  if (model.errors.health) {
    setGauge(els.healthGauge, null);
    setText(els.healthValue, '—');
    setChip(els.healthChip, 'Unavailable', 'muted');
    setText(els.healthSupport, 'Health score could not be loaded. Refresh to retry.');
    return;
  }

  if (model.healthScore === null) {
    setGauge(els.healthGauge, null);
    setText(els.healthValue, '—');
    setChip(els.healthChip, 'No data', 'muted');
    setText(els.healthSupport, 'Health score appears once pressure and inspection records exist.');
    return;
  }

  const score = Math.round(model.healthScore);
  setGauge(els.healthGauge, score);
  setText(els.healthValue, String(score));
  setChip(
    els.healthChip,
    score >= 75 ? 'Healthy' : score >= 50 ? 'Watch' : 'Action',
    score >= 75 ? 'stable' : score >= 50 ? 'watch' : 'action'
  );
  setText(
    els.healthSupport,
    model.inspectedLast7d > 0
      ? `${model.inspectedLast7d} tyres inspected in the last 7 days.`
      : 'No inspections recorded in the last 7 days.'
  );
}

function renderActive(model) {
  setLink(els.activeCard, reportLink(model, 'tyreRecords', tabHref('analytics')), true);

  if (model.errors.dataset) {
    setText(els.activeValue, '—');
    setText(els.activeTotal, '');
    setChip(els.activeChip, 'Unavailable', 'muted');
    setText(els.activeSupport, 'Tyre records could not be loaded. Refresh to retry.');
    return;
  }

  if (model.records.length === 0) {
    setText(els.activeValue, '—');
    setText(els.activeTotal, '');
    setChip(els.activeChip, 'No data', 'muted');
    setText(els.activeSupport, 'No tyre records captured for this site yet.');
    return;
  }

  setText(els.activeValue, String(model.running.length));
  setText(els.activeTotal, ` / ${model.records.length}`);
  setChip(els.activeChip, model.running.length > 0 ? 'Fleet covered' : 'No active', model.running.length > 0 ? 'stable' : 'muted');
  setText(
    els.activeSupport,
    `Across ${model.trucks.size} trucks · ${model.scrapped.length} retired.`
  );
}

function renderLife(model) {
  setLink(els.lifeCard, reportLink(model, 'tyreLife', tabHref('analytics')), true);

  if (model.errors.dataset) {
    setText(els.lifeValue, '—');
    setChip(els.lifeChip, 'Unavailable', 'muted');
    setText(els.lifeSupport, 'Life performance could not be loaded. Refresh to retry.');
    return;
  }

  if (model.lifePct === null) {
    setText(els.lifeValue, '—');
    setChip(els.lifeChip, 'Awaiting data', 'muted');
    setText(
      els.lifeSupport,
      model.targetLife > 0
        ? 'Appears after three completed runs against a site target.'
        : 'Set a target tyre life in Site Settings to compare completed runs.'
    );
    return;
  }

  setText(els.lifeValue, `${model.lifePct}%`);
  setChip(
    els.lifeChip,
    model.lifePct >= 80 ? 'On track' : model.lifePct >= 60 ? 'Watch' : 'Needs attention',
    model.lifePct >= 80 ? 'stable' : model.lifePct >= 60 ? 'watch' : 'action'
  );
  setText(
    els.lifeSupport,
    `Avg ${formatInt(model.avgLife)} ${model.unit} · target ${formatInt(model.targetLife)} ${model.unit} · ${model.completed.length} completed runs.`
  );
}

function renderSavings(model) {
  setLink(
    els.savingsCard,
    model.savingsValue > 0
      ? reportLink(model, 'savings', reportLink(model, 'tyrePnL', tabHref('analytics')))
      : reportLink(model, 'tyrePnL', tabHref('analytics')),
    true
  );

  if (model.errors.dataset) {
    setText(els.savingsValue, '—');
    setChip(els.savingsChip, 'Unavailable', 'muted');
    setText(els.savingsSupport, 'Savings could not be loaded. Refresh to retry.');
    return;
  }

  if (model.savingsValue > 0) {
    setText(els.savingsValue, formatInrCompact(model.savingsValue));
    if (els.savingsValue) els.savingsValue.title = `₹${formatInt(model.savingsValue)}`;
    setChip(els.savingsChip, 'Verified', 'stable');
    setText(els.savingsSupport, 'Verified value from completed runs that beat target life.');
    return;
  }

  setText(els.savingsValue, '—');
  setChip(els.savingsChip, 'Awaiting data', 'muted');
  setText(els.savingsSupport, 'Value is recorded once completed runs beat their target life.');
}

function renderScrap(model) {
  setLink(els.scrapView, reportHref('removalReasons'), isReportEnabled(model.state, 'removalReasons'));

  const monthly = new Map();
  let totalLife = 0;
  for (const run of model.completed) {
    const date = parseDate(run.removal_date);
    if (!date) continue;
    const key = monthKey(date);
    const bucket = monthly.get(key) || { key, date, count: 0, life: 0 };
    bucket.count += 1;
    bucket.life += Number(run.actual_life) || 0;
    totalLife += Number(run.actual_life) || 0;
    monthly.set(key, bucket);
  }

  if (monthly.size === 0) {
    destroyScrapChart();
    if (els.scrapChart) els.scrapChart.hidden = true;
    showEmpty(
      els.scrapEmpty,
      model.errors.dataset ? 'Data unavailable' : 'No removals recorded yet',
      model.errors.dataset
        ? 'Removal history could not be loaded. Refresh to retry.'
        : 'Tyre removals will appear here after the first completed run.'
    );
    setText(els.scrapSupport, model.errors.dataset ? 'Live removal history unavailable.' : 'No removals recorded yet.');
    return;
  }

  const buckets = Array.from(monthly.values()).sort((a, b) => a.key.localeCompare(b.key)).slice(-12);
  const labels = buckets.map((bucket) => bucket.date.toLocaleString('en-IN', { month: 'short', year: '2-digit' }));
  const counts = buckets.map((bucket) => bucket.count);
  const avgRemovalLife = totalLife / model.completed.length;

  if (els.scrapChart) els.scrapChart.hidden = false;
  hideEmpty(els.scrapEmpty);
  setText(
    els.scrapSupport,
    `${model.completed.length} tyres retired · avg ${formatInt(avgRemovalLife)} ${model.unit} at removal.`
  );

  if (!window.Chart || !els.scrapChart) {
    if (els.scrapChart) els.scrapChart.hidden = true;
    showEmpty(els.scrapEmpty, 'Chart library unavailable', 'The removal summary is still shown below.');
    return;
  }

  destroyScrapChart();
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const ctx = els.scrapChart.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 240);
  gradient.addColorStop(0, 'rgba(62, 201, 165, 0.3)');
  gradient.addColorStop(1, 'rgba(62, 201, 165, 0)');

  scrapChart = new window.Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: counts,
        borderColor: '#3ec9a5',
        backgroundColor: gradient,
        fill: true,
        tension: 0.35,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 4,
        pointBackgroundColor: '#0f1419',
        pointBorderColor: '#3ec9a5',
        pointBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: reduceMotion ? 0 : 450 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e2530',
          borderColor: 'rgba(62, 201, 165, 0.3)',
          borderWidth: 1,
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
          padding: 10,
          displayColors: false,
          callbacks: {
            label: (context) => `${context.parsed.y} tyre${context.parsed.y === 1 ? '' : 's'} retired`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: '#64748b',
            autoSkip: true,
            maxTicksLimit: 6,
            maxRotation: 0,
            minRotation: 0,
            font: { family: 'Work Sans', size: 10 }
          }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(148, 163, 184, 0.1)' },
          border: { display: false },
          ticks: { color: '#64748b', precision: 0, font: { family: 'Work Sans', size: 10 } }
        }
      }
    }
  });
}

function renderAttention(model) {
  if (!els.attentionList || !els.attentionEmpty) return;
  const items = [];

  for (const run of model.below.slice(0, 3)) {
    items.push({
      tyre: displayTyre(run),
      truck: run?.truck || 'Truck not linked',
      reason: 'Below target',
      tone: 'watch',
      note: `${formatInt(run.actual_life)} / ${formatInt(model.targetLife)} ${model.unit}`,
      href: tyreHistoryHref(run?.tyre_no, 'tyres')
    });
  }

  for (const entry of model.overdue.slice(0, 2)) {
    const record = entry.record;
    items.push({
      tyre: displayTyre(record),
      truck: record?.vehicle_no || record?.truck || 'Truck not linked',
      reason: 'Inspection due',
      tone: 'watch',
      note: entry.days === null ? 'No inspection logged' : `${entry.days} days since last check`,
      href: tyreHistoryHref(record?.tyre_no, 'inspection')
    });
  }

  if (model.recentDefects > 0 && items.length < 5) {
    items.push({
      tyre: `${model.recentDefects} new defect${model.recentDefects === 1 ? '' : 's'}`,
      truck: 'Defect trend',
      reason: 'Watch',
      tone: 'action',
      note: 'Review the pattern before the next fitment',
      href: reportLink(model, 'defectTrend', tabHref('analytics'))
    });
  }

  if (model.errors.dataset) items.length = 0;
  els.attentionList.replaceChildren();

  if (items.length === 0) {
    els.attentionList.hidden = true;
    els.attentionEmpty.hidden = false;
    if (model.errors.dataset) {
      setChip(els.attentionChip, 'Unavailable', 'muted');
      showEmpty(els.attentionEmpty, 'Data unavailable', 'Tyre and inspection exceptions could not be loaded. Refresh to retry.');
    } else if (model.records.length === 0) {
      setChip(els.attentionChip, 'No data', 'muted');
      showEmpty(els.attentionEmpty, 'Nothing to review yet', 'Attention items appear after the first fitment and inspection.');
    } else {
      setChip(els.attentionChip, 'All clear', 'stable');
      showEmpty(els.attentionEmpty, 'All clear', 'No tyre, inspection or defect exceptions in the current data.');
    }
    return;
  }

  setChip(els.attentionChip, `${items.length} open`, 'watch');
  els.attentionEmpty.hidden = true;
  els.attentionList.hidden = false;

  for (const item of items) {
    const row = document.createElement(item.href ? 'a' : 'div');
    row.className = 'fo-attention-item';
    if (item.href) {
      row.href = item.href;
      row.setAttribute('aria-label', `Open history for ${item.tyre} (${item.reason})`);
    }

    const main = document.createElement('div');
    main.className = 'fo-attention-main';
    const tyre = document.createElement('div');
    tyre.className = 'fo-attention-tyre';
    tyre.textContent = item.tyre;
    const sub = document.createElement('div');
    sub.className = 'fo-attention-sub';
    sub.textContent = `${item.truck} · ${item.note}`;
    main.append(tyre, sub);

    const statusChip = document.createElement('span');
    statusChip.className = `fo-chip ${item.tone === 'action' ? 'fo-chip-action' : 'fo-chip-watch'}`;
    statusChip.textContent = item.reason;

    row.append(main, statusChip);

    if (item.href) {
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('class', 'fo-icon fo-attention-open');
      icon.setAttribute('aria-hidden', 'true');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', '#fo-i-arrow');
      icon.appendChild(use);
      row.appendChild(icon);
    }

    els.attentionList.appendChild(row);
  }
}

function renderBrands(model) {
  setLink(els.brandView, reportHref('brandWise'), isReportEnabled(model.state, 'brandWise'));

  const grouped = new Map();
  for (const run of model.completed) {
    const brand = clean(run?.brand);
    if (!brand || brand === '-' || brand.toLowerCase() === 'unknown') continue;
    const bucket = grouped.get(brand) || { brand, count: 0, life: 0 };
    bucket.count += 1;
    bucket.life += Number(run.actual_life) || 0;
    grouped.set(brand, bucket);
  }

  const brands = Array.from(grouped.values())
    .sort((a, b) => b.count - a.count || (b.life / b.count) - (a.life / a.count))
    .slice(0, 5);

  if (els.brandList) els.brandList.replaceChildren();

  if (brands.length === 0 || model.targetLife <= 0) {
    if (els.brandList) els.brandList.hidden = true;
    els.brandEmpty.hidden = false;
    if (model.errors.dataset) {
      showEmpty(els.brandEmpty, 'Data unavailable', 'Brand history could not be loaded. Refresh to retry.');
    } else if (brands.length > 0 && model.targetLife <= 0) {
      showEmpty(els.brandEmpty, 'Set a target tyre life', 'Brand benchmarks appear once the site has a target to compare against.');
    } else {
      showEmpty(els.brandEmpty, 'No brand benchmarks yet', 'Brand benchmarks appear after completed tyre runs.');
    }
    setText(els.brandSupport, '');
    return;
  }

  els.brandEmpty.hidden = true;
  if (els.brandList) els.brandList.hidden = false;

  for (const brand of brands) {
    const avgLife = brand.life / brand.count;
    const achievement = (avgLife / model.targetLife) * 100;
    const tone = achievement >= 100 ? '' : achievement >= 85 ? 'is-watch' : 'is-action';

    const row = document.createElement('div');
    row.className = 'fo-brand-row';

    const name = document.createElement('div');
    name.className = 'fo-brand-name';
    name.textContent = brand.brand;
    name.title = brand.brand;

    const bar = document.createElement('div');
    bar.className = 'fo-brand-bar';
    const fill = document.createElement('span');
    fill.className = tone;
    fill.style.width = `${Math.max(2, Math.min(100, achievement))}%`;
    bar.appendChild(fill);

    const life = document.createElement('div');
    life.className = 'fo-brand-life';
    life.textContent = `${formatInt(avgLife)} ${model.unit}`;
    life.title = `${Math.round(achievement)}% of target`;

    row.append(name, bar, life);
    els.brandList.appendChild(row);
  }

  setText(
    els.brandSupport,
    `${model.completed.length} completed runs · top ${brands.length} brands compared with the site target.`
  );
}

function renderPressure(model) {
  const score = model.pressureScore;
  const monitored = model.monitoredTyres;
  setLink(els.pressureView, reportHref('pressureLeakage'), isReportEnabled(model.state, 'pressureLeakage'));
  setLink(els.pressureSettings, 'site-settings.html#pressure-settings', true);

  if (model.errors.health) {
    setText(els.pressureValue, '—');
    setChip(els.pressureChip, 'Unavailable', 'muted');
    setBar(els.pressureBar, 0, '');
    setText(els.pressureSupport, 'Pressure health could not be loaded. Refresh to retry.');
    return;
  }

  if (score === null || monitored === 0) {
    setText(els.pressureValue, '—');
    setChip(els.pressureChip, 'Not configured', 'muted');
    setBar(els.pressureBar, 0, '');
    setText(els.pressureSupport, 'Pressure monitoring is not configured for this site.');
    return;
  }

  const rounded = Math.round(score);
  setText(els.pressureValue, `${rounded}%`);
  setChip(els.pressureChip, 'Monitored', 'stable');
  setBar(els.pressureBar, rounded, rounded >= 75 ? '' : rounded >= 50 ? 'is-watch' : 'is-action');

  const dropText = model.avgPressureDrop === null
    ? ''
    : ` · avg drop ${formatDecimal(model.avgPressureDrop)} psi`;
  setText(els.pressureSupport, `${monitored} tyres monitored${dropText}.`);
}

function renderFooter(model) {
  const ai = model.state.ai || {};
  const total = Number(ai.total || 0);
  const auto = Number(ai.auto || 0);
  const percent = Number.isFinite(Number(ai.autoPercent))
    ? Math.round(Number(ai.autoPercent))
    : (total > 0 ? Math.round((auto / total) * 100) : 0);

  setText(
    els.aiAccuracy,
    model.errors.ai
      ? 'Unavailable'
      : total > 0
        ? `${auto} of ${total} auto-filled (${percent}%)`
        : 'Not enough submissions'
  );

  const dates = [];
  for (const record of model.records) {
    const start = parseDate(record.first_fitment_date);
    const end = parseDate(record.removal_date) || parseDate(record.last_inspection_date);
    if (start) dates.push(start);
    if (end) dates.push(end);
  }

  if (dates.length === 0) {
    setText(els.dataPeriod, 'No records yet');
  } else {
    dates.sort((a, b) => a.getTime() - b.getTime());
    const first = dates[0].toLocaleString('en-IN', { month: 'short', year: 'numeric' });
    const last = dates[dates.length - 1].toLocaleString('en-IN', { month: 'short', year: 'numeric' });
    setText(els.dataPeriod, first === last ? first : `${first} → ${last}`);
  }

  if (model.state.lastUpdated) {
    setText(
      els.lastRefreshed,
      model.state.lastUpdated.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      })
    );
  } else {
    setText(els.lastRefreshed, 'Not refreshed');
  }
}

function buildOverdue(running, inspectionRecords) {
  const latestByTyre = new Map();
  for (const record of inspectionRecords || []) {
    const tyre = normalize(record.tyre_no);
    if (!tyre || tyre === '-') continue;
    const date = parseDate(record.activity_date);
    if (!date) continue;
    const current = latestByTyre.get(tyre);
    if (!current || date > current) latestByTyre.set(tyre, date);
  }

  const now = Date.now();
  return running
    .map((record) => {
      const tyre = normalize(record.tyre_no);
      const lastCheck = parseDate(record.last_inspection_date)
        || latestByTyre.get(tyre)
        || null;
      if (!lastCheck) return { record, days: null };
      const days = Math.floor((now - lastCheck.getTime()) / DAY_MS);
      return days > INSPECTION_DUE_DAYS ? { record, days } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (b.days ?? 999) - (a.days ?? 999));
}

function isReportEnabled(state, key) {
  const enabled = state?.targets?.enabledReports;
  if (!Array.isArray(enabled) || enabled.length === 0) return true;
  return enabled.includes(key);
}

function reportLink(model, key, fallback) {
  if (!isReportEnabled(model.state, key)) return fallback;
  if (key === 'tyreRecords') return tabHref('tyres');
  if (key === 'inspectionRecords') return tabHref('inspection');
  if (key === 'savings') return tabHref('savings');
  return reportHref(key);
}

function reportHref(key) {
  return homeHref(`report=${encodeURIComponent(key)}`, 'analytics');
}

function tabHref(tab) {
  return homeHref('', tab);
}

function homeHref(search, hash) {
  const file = (window.location.pathname.split('/').pop() || 'index.html');
  const query = search ? `?${search}` : '';
  return `${file}${query}${hash ? `#${hash}` : ''}`;
}

function tyreHistoryHref(tyreNo, from) {
  const tyre = clean(tyreNo);
  if (!tyre || tyre === '-') return '';
  return `tyre-history.html?tyre=${encodeURIComponent(tyre)}&from=${from}`;
}

function classifyRecord(record) {
  const status = clean(record?.status || record?.tyre_status).toLowerCase();
  if (status.includes('run') || status.includes('active') || status.includes('fitted')) return 'running';
  if (status.includes('scrap') || status.includes('retir') || status.includes('remov')) return 'scrapped';
  const removal = record?.removal_date;
  if (removal && removal !== '-') return 'scrapped';
  const fitment = record?.first_fitment_date;
  if (fitment && fitment !== '-') return 'running';
  return 'unknown';
}

function displayTyre(row) {
  const tyre = clean(row?.tyre_no);
  return tyre && tyre !== '-' ? tyre : 'Unnamed tyre';
}

function setText(element, value) {
  if (element) element.textContent = value;
}

function setChip(element, label, tone) {
  if (!element) return;
  const toneClass = tone ? ` fo-chip-${tone}` : '';
  element.className = `fo-chip${toneClass}`;
  element.textContent = label;
}

function chipTone(severity) {
  if (severity === 'stable') return 'stable';
  if (severity === 'watch') return 'watch';
  if (severity === 'action') return 'action';
  return 'muted';
}

function setLink(element, href, visible = true) {
  if (!element) return;
  if (href) element.href = href;
  element.hidden = !visible;
}

function setGauge(element, score) {
  if (!element) return;
  if (score === null) {
    element.className = 'fo-gauge';
    element.style.setProperty('--fo-pct', '0%');
    element.setAttribute('aria-label', 'Tyre health score unavailable');
    return;
  }
  const value = Math.max(0, Math.min(100, score));
  element.className = `fo-gauge${value >= 75 ? '' : value >= 50 ? ' is-watch' : ' is-action'}`;
  element.style.setProperty('--fo-pct', `${value}%`);
  element.setAttribute('aria-label', `Tyre health score ${value} out of 100`);
}

function setBar(element, value, tone) {
  if (!element) return;
  element.style.width = `${Math.max(0, Math.min(100, value))}%`;
  element.className = tone || '';
}

function showEmpty(element, title, detail) {
  if (!element) return;
  element.hidden = false;
  const strong = element.querySelector('strong');
  const span = element.querySelector('span');
  if (strong) strong.textContent = title;
  if (span) span.textContent = detail;
}

function hideEmpty(element) {
  if (element) element.hidden = true;
}

function destroyScrapChart() {
  if (scrapChart) {
    scrapChart.destroy();
    scrapChart = null;
  }
}

function parseDate(value) {
  if (!value || value === '-') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const raw = String(value).trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    const year = Number(dmy[3]) < 100 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    const date = new Date(year, Number(dmy[2]) - 1, Number(dmy[1]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clean(value) {
  return String(value ?? '').trim();
}

function normalize(value) {
  return clean(value).toUpperCase();
}

function formatInt(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return Math.round(number).toLocaleString('en-IN');
}

function formatDecimal(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return number.toLocaleString('en-IN', { maximumFractionDigits: 1 });
}

function formatInrCompact(value) {
  const number = Math.max(0, Number(value) || 0);
  if (number >= 10000000) return `₹${formatDecimal(number / 10000000)}Cr`;
  if (number >= 100000) return `₹${formatDecimal(number / 100000)}L`;
  if (number >= 1000) return `₹${formatDecimal(number / 1000)}K`;
  return `₹${formatInt(number)}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
