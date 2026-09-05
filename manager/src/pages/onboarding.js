/**
 * onboarding.js
 * DynaHaul X Manager Dashboard — Onboarding Page Controller
 * Two-page cinematic onboarding for first-time users
 */

import {
  parseExcelFile,
  autoMapColumns,
  transformRows,
  uploadVehicleData,
  uploadTyreData,
  uploadActivityData,
  uploadFuelData,
  saveFinancialParameters,
  countUnlockedReports,
  getUnlockedReportIds,
  downloadTemplate,
  COLUMN_MAPPINGS
} from '../services/upload-service.js';

const TOTAL_REPORTS = 17;

const CORE_REPORTS = [
  { id: 'fleetHealth', name: 'Fleet Health Score', benefit: 'Know your fleet\'s vital signs in one number' },
  { id: 'tyreLife', name: 'Tyre Life Analysis', benefit: 'See which tyres last — and which don\'t' },
  { id: 'rubberUtil', name: 'Rubber Utilisation', benefit: 'Stop wasting rubber, stop wasting money' },
  { id: 'brandWise', name: 'Brand Comparison', benefit: 'Know which brand performs best for YOUR fleet' },
  { id: 'pressureLeakage', name: 'Pressure Leakage', benefit: 'Find hidden fuel waste from under-inflation' },
  { id: 'ageDist', name: 'Age Distribution', benefit: 'Know when your fleet needs replacements' },
  { id: 'defectTrend', name: 'Defect Trends', benefit: 'Catch problems before they become breakdowns' },
  { id: 'removalReasons', name: 'Removal Reasons', benefit: 'Understand why tyres leave your fleet' },
  { id: 'tyreLifeCharts', name: 'Tyre Forecast', benefit: 'Plan next month\'s tyre purchases today' }
];

const POWERUP_CARDS = [
  {
    id: 'fuel',
    title: 'Fuel Intelligence',
    icon: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#daa520" stroke-width="2"><path d="M3 22V5a2 2 0 012-2h8a2 2 0 012 2v17"/><path d="M15 10h2a2 2 0 012 2v4a2 2 0 002 2v0a2 2 0 002-2V9l-3-3"/><path d="M3 22h12"/><rect x="6" y="7" width="6" height="4" rx="1"/></svg>`,
    reports: 'Pressure vs Fuel Cost, Pressure Heatmap, Fuel Efficiency',
    uploadType: 'fuel'
  },
  {
    id: 'financial',
    title: 'Financial Mastery',
    icon: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#daa520" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>`,
    reports: 'Brand Cost/KM, P&L per Tyre, Savings, RTD Scrapping, Retread',
    uploadType: 'financial'
  }
];

function resolveSession() {
  try {
    const raw = sessionStorage.getItem('rims_session');
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session?.uid) return null;
    const explicit = String(session.userType || '').trim().toLowerCase();
    const isManager = explicit === 'manager' || String(session.role || '').trim().toLowerCase() === 'manager';
    if (!isManager) return null;
    return { siteId: session.siteId, userId: session.uid, username: session.username || session.email };
  } catch { return null; }
}

function getSupabase() {
  return window.supabaseClient || null;
}

class OnboardingController {
  constructor() {
    this.session = resolveSession();
    this.currentPage = 1;
    this.uploadStatus = {
      vehicles: false,
      tyres: false,
      activity: false,
      fuel: false,
      financial: false
    };
    this.uploadedCounts = {
      vehicles: 0,
      tyres: 0,
      activity: 0,
      fuel: 0
    };
    this.unlockedReports = new Set();
    this.financialParams = {};
    this.container = null;
  }

  async init() {
    if (!this.session) {
      window.location.replace('../fitter/login.html');
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const previewMode = urlParams.get('preview') === 'onboarding';

    if (previewMode) {
      try {
        const hasData = await this.checkExistingData();
        if (hasData) {
          localStorage.setItem('onboarding_completed', 'true');
          window.location.href = './index.html';
          return;
        }
      } catch (err) {
        console.warn('Onboarding data check failed:', err);
      }
    } else {
      const alreadyCompleted = localStorage.getItem('onboarding_completed');
      if (alreadyCompleted) {
        return;
      }

      try {
        const hasData = await this.checkExistingData();
        if (hasData) {
          localStorage.setItem('onboarding_completed', 'true');
          return;
        }
      } catch (err) {
        console.warn('Onboarding data check failed, defaulting to dashboard:', err);
        return;
      }
    }

    this.render();
  }

  async checkExistingData() {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase not initialized');

    const { count, error } = await supabase
      .from('vehicles')
      .select('*', { count: 'exact', head: true })
      .eq('site_id', this.session.siteId);

    if (error) throw error;
    return (count || 0) > 0;
  }

  showDashboard() {
    const onboarding = document.getElementById('onboardingContainer');
    if (onboarding) onboarding.style.display = 'none';
  }

  render() {
    this.container = document.getElementById('onboardingContainer');
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'onboardingContainer';
      document.body.appendChild(this.container);
    }

    this.container.style.display = '';
    this.renderPage1();
  }

  renderPage1() {
    this.currentPage = 1;
    this.container.innerHTML = `
      <div class="ob-page ob-page-1">
        <div class="ob-hero">
          <h1 class="ob-headline">Your Fleet. Your Data. Your Savings.</h1>
          <p class="ob-subheadline">DynaHaul X turns your historical fleet data into actionable intelligence. Here's what we need to get started.</p>
        </div>

        <div class="ob-cards-grid">
          ${this.renderDataCards()}
        </div>

        <div class="ob-cta-area">
          <button class="ob-cta-btn" id="obBeginImport">Begin Data Import →</button>
          <p class="ob-cta-hint">You can upload Excel files or connect your existing systems</p>
        </div>
      </div>
    `;

    this.animatePage1();
    document.getElementById('obBeginImport')?.addEventListener('click', () => this.renderPage2());
  }

  renderDataCards() {
    const cards = [
      { key: 'vehicles', icon: '🚛', title: 'Vehicle Fleet', desc: 'Historical data of your company\'s trucks and tippers', unlocks: 'All reports (base requirement)' },
      { key: 'tyres', icon: '🔵', title: 'Tyre Inventory', desc: 'Historical data of your company\'s tyre records — serials, brands, sizes', unlocks: '6 tyre reports' },
      { key: 'activity', icon: '📋', title: 'Activity History', desc: 'Historical data of your company\'s fitment, inspection, pressure, and removal records', unlocks: '8 activity reports' },
      { key: 'fuel', icon: '⛽', title: 'Fuel & Trip Data', desc: 'Historical data of your company\'s fuel consumption and trip logs', unlocks: '3 fuel reports' },
      { key: 'financial', icon: '💰', title: 'Financial Parameters', desc: 'Historical data of your company\'s tyre costs and rate per KM', unlocks: '5 financial reports' }
    ];

    return cards.map((card, i) => `
      <div class="ob-card" style="animation-delay: ${i * 0.15}s" data-type="${card.key}">
        <div class="ob-card-icon">${card.icon}</div>
        <h3 class="ob-card-title">${card.title}</h3>
        <p class="ob-card-desc">${card.desc}</p>
        <span class="ob-card-unlocks">Unlocks: ${card.unlocks}</span>
        <div class="ob-card-status" id="status-${card.key}">
          <span class="ob-status-dot"></span>
          <span class="ob-status-text">Not uploaded</span>
        </div>
      </div>
    `).join('');
  }

  animatePage1() {
    const headline = this.container.querySelector('.ob-headline');
    const sub = this.container.querySelector('.ob-subheadline');
    const cards = this.container.querySelectorAll('.ob-card');
    const cta = this.container.querySelector('.ob-cta-area');

    if (headline) headline.style.animation = 'obFadeSlideUp 0.6s ease-out forwards';
    if (sub) sub.style.animation = 'obFadeSlideUp 0.6s ease-out 0.3s forwards';
    cards.forEach((card, i) => {
      card.style.animation = `obFadeSlideUp 0.5s ease-out ${0.5 + i * 0.15}s forwards`;
    });
    if (cta) cta.style.animation = 'obFadeSlideUp 0.5s ease-out 1.2s forwards';
  }

  renderPage2() {
    this.currentPage = 2;
    this.container.innerHTML = `
      <div class="ob-page ob-page-2">
        <div class="ob-page2-header">
          <button class="ob-back-btn" id="obBackBtn">← Back to overview</button>
          <h2 class="ob-page2-title">Import Your Historical Data</h2>
          <p class="ob-page2-subtitle">Upload Excel files from your existing systems. We'll map the columns automatically.</p>
        </div>

        <div class="ob-page2-body">
          <div class="ob-upload-panel" id="obUploadPanel">
            ${this.renderUploadCards()}
          </div>

          <div class="ob-preview-panel" id="obPreviewPanel">
            ${this.renderProgressRing()}
            ${this.renderAlreadyEquipped()}
            ${this.renderPowerUps()}
          </div>
        </div>

        <div class="ob-page2-footer">
          <span class="ob-footer-left" id="obReportCount">0 of ${TOTAL_REPORTS} reports will be available after import</span>
          <span class="ob-footer-center">Estimated time: 5 minutes</span>
          <div class="ob-footer-right">
            <button class="ob-cta-btn ob-cta-primary" id="obLaunchDash" disabled>Import All & Launch Dashboard</button>
          </div>
        </div>
      </div>
    `;

    this.bindUploadEvents();
    document.getElementById('obBackBtn')?.addEventListener('click', () => this.renderPage1());
    document.getElementById('obLaunchDash')?.addEventListener('click', () => this.completeOnboarding());
  }

  renderUploadCards() {
    const types = [
      { key: 'vehicles', icon: '🚛', label: 'Vehicle Fleet', required: true },
      { key: 'tyres', icon: '🔵', label: 'Tyre Inventory', required: false },
      { key: 'activity', icon: '📋', label: 'Activity History', required: false },
      { key: 'fuel', icon: '⛽', label: 'Fuel & Trip Data', required: false },
      { key: 'financial', icon: '💰', label: 'Financial Parameters', required: false }
    ];

    return types.map(t => `
      <div class="ob-upload-card" id="upload-card-${t.key}" data-type="${t.key}">
        <div class="ob-upload-header">
          <span class="ob-upload-icon">${t.icon}</span>
          <span class="ob-upload-label">${t.label}</span>
          ${t.required ? '<span class="ob-required-badge">Required</span>' : ''}
        </div>

        ${t.key === 'financial' ? this.renderFinancialInputs() : `
          <div class="ob-dropzone" id="dropzone-${t.key}">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#daa520" stroke-width="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="17,8 12,3 7,8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <p class="ob-dropzone-text">Drop Excel here or</p>
            <label class="ob-dropzone-btn">
              Choose File
              <input type="file" accept=".xlsx,.xls,.csv" class="ob-file-input" data-type="${t.key}" hidden>
            </label>
            <p class="ob-dropzone-hint">Supports .xlsx, .xls, .csv</p>
          </div>
          <div class="ob-template-row">
            <button class="ob-template-btn" data-template="${t.key}">Download template</button>
          </div>
        `}

        <div class="ob-upload-status" id="upload-status-${t.key}">
          <span class="ob-status-pill ob-status-idle">Not uploaded</span>
        </div>

        <div class="ob-upload-preview" id="upload-preview-${t.key}" style="display:none">
          <table class="ob-preview-table"></table>
          <p class="ob-mapping-info" id="mapping-info-${t.key}"></p>
        </div>
      </div>
    `).join('');
  }

  renderFinancialInputs() {
    return `
      <div class="ob-financial-inputs">
        <div class="ob-input-group">
          <label>Tyre Price (₹)</label>
          <input type="number" id="fin-tyre-price" placeholder="e.g., 45000" min="0">
        </div>
        <div class="ob-input-group">
          <label>Retread Cost (₹)</label>
          <input type="number" id="fin-retread-cost" placeholder="e.g., 8000" min="0">
        </div>
        <div class="ob-input-group">
          <label>Rate per KM (₹)</label>
          <input type="number" id="fin-rate-per-km" placeholder="e.g., 12.50" min="0" step="0.01">
        </div>
      </div>
    `;
  }

  renderProgressRing() {
    const unlocked = countUnlockedReports(this.uploadStatus);
    const pct = (unlocked / TOTAL_REPORTS) * 100;
    const circumference = 2 * Math.PI * 52;
    const dashoffset = circumference - (pct / 100) * circumference;

    return `
      <div class="ob-progress-section">
        <div class="ob-progress-ring-wrap">
          <svg class="ob-progress-ring" width="120" height="120" viewBox="0 0 120 120">
            <circle class="ob-ring-bg" cx="60" cy="60" r="52" fill="none" stroke="#252b33" stroke-width="8"/>
            <circle class="ob-ring-fill" cx="60" cy="60" r="52" fill="none" stroke="#daa520"
              stroke-width="8" stroke-linecap="round"
              stroke-dasharray="${circumference}"
              stroke-dashoffset="${dashoffset}"
              transform="rotate(-90 60 60)"
              style="transition: stroke-dashoffset 0.8s ease-out"/>
          </svg>
          <div class="ob-ring-center">
            <span class="ob-ring-number" id="obRingNumber">${unlocked}</span>
            <span class="ob-ring-of">of ${TOTAL_REPORTS}</span>
          </div>
        </div>
      </div>
    `;
  }

  renderAlreadyEquipped() {
    return `
      <div class="ob-equipped-section">
        <h3 class="ob-equipped-title">Your Fleet. Your Insights. Already Powerful.</h3>
        <p class="ob-equipped-subtitle">With just your vehicle and tyre data, DynaHaul X gives you 9 analytics that most fleet managers only dream of.</p>
        <div class="ob-reports-grid">
          ${CORE_REPORTS.map(r => `
            <div class="ob-report-card" data-report="${r.id}">
              <span class="ob-report-dot"></span>
              <div>
                <span class="ob-report-name">${r.name}</span>
                <span class="ob-report-benefit">${r.benefit}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  renderPowerUps() {
    return `
      <div class="ob-powerup-section">
        <h3 class="ob-powerup-title">Ready for More Power?</h3>
        <p class="ob-powerup-subtitle">Add fuel data and financial parameters to unlock 8 more reports — like a turbo boost for your analytics.</p>
        <div class="ob-powerup-cards">
          ${POWERUP_CARDS.map(p => `
            <div class="ob-powerup-card" data-upload="${p.uploadType}">
              <div class="ob-powerup-icon">${p.icon}</div>
              <h4 class="ob-powerup-name">${p.title}</h4>
              <p class="ob-powerup-reports">Unlock: ${p.reports}</p>
              <button class="ob-powerup-btn" data-scroll-to="${p.uploadType}">Upload ${p.id === 'fuel' ? 'Fuel Data' : 'Financial Parameters'} →</button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  bindUploadEvents() {
    this.container.querySelectorAll('.ob-file-input').forEach(input => {
      input.addEventListener('change', (e) => this.handleFileUpload(e.target.dataset.type, e.target.files[0]));
    });

    this.container.querySelectorAll('.ob-dropzone').forEach(zone => {
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('ob-dragover'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('ob-dragover'));
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('ob-dragover');
        const file = e.dataTransfer.files[0];
        if (file) this.handleFileUpload(zone.dataset.type, file);
      });
    });

    this.container.querySelectorAll('.ob-template-btn').forEach(btn => {
      btn.addEventListener('click', () => downloadTemplate(btn.dataset.template));
    });

    this.container.querySelectorAll('.ob-powerup-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.scrollTo;
        const card = document.getElementById(`upload-card-${target}`);
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });

    const finInputs = ['fin-tyre-price', 'fin-retread-cost', 'fin-rate-per-km'];
    finInputs.forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => this.handleFinancialInput());
    });
  }

  async handleFileUpload(type, file) {
    if (!file) return;

    const statusEl = document.getElementById(`upload-status-${type}`);
    const previewEl = document.getElementById(`upload-preview-${type}`);
    const mappingInfo = document.getElementById(`mapping-info-${type}`);

    if (statusEl) statusEl.innerHTML = '<span class="ob-status-pill ob-status-uploading">Uploading...</span>';

    try {
      const parsed = await parseExcelFile(file);
      const { mapped, unmapped, missing } = autoMapColumns(parsed.headers, type);

      const transformed = transformRows(parsed.rows, mapped, type);

      const previewRows = transformed.slice(0, 3);
      if (previewEl && previewRows.length > 0) {
        const headers = Object.keys(previewRows[0]);
        previewEl.style.display = 'block';
        previewEl.querySelector('.ob-preview-table').innerHTML = `
          <thead><tr>${headers.slice(0, 6).map(h => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${previewRows.slice(0, 3).map(row => `
            <tr>${headers.slice(0, 6).map(h => `<td>${row[h] || ''}</td>`).join('')}</tr>
          `).join('')}</tbody>
        `;
      }

      if (mappingInfo) {
        const mappedCount = Object.keys(mapped).length;
        mappingInfo.textContent = `${parsed.headers.length} columns detected → ${mappedCount} matched automatically${unmapped.length > 0 ? `, ${unmapped.length} need mapping` : ''}`;
      }

      let result;
      switch (type) {
        case 'vehicles': result = await uploadVehicleData(transformed, this.session.siteId); break;
        case 'tyres': result = await uploadTyreData(transformed, this.session.siteId); break;
        case 'activity': result = await uploadActivityData(transformed, this.session.siteId); break;
        case 'fuel': result = await uploadFuelData(transformed, this.session.siteId); break;
        default: throw new Error('Unknown upload type');
      }

      this.uploadStatus[type] = true;
      this.uploadedCounts[type] = result.count;
      this.updateStatusUI(type, 'success', result.count);
      this.recalculateUnlocks();
      this.updateProgressRing();
      this.checkLaunchReady();

    } catch (err) {
      console.error(`Upload ${type} failed:`, err);
      if (statusEl) statusEl.innerHTML = `<span class="ob-status-pill ob-status-error">Error: ${err.message}</span>`;
    }
  }

  async handleFinancialInput() {
    const tyrePrice = document.getElementById('fin-tyre-price')?.value;
    const retreadCost = document.getElementById('fin-retread-cost')?.value;
    const ratePerKm = document.getElementById('fin-rate-per-km')?.value;

    this.financialParams = {};
    if (tyrePrice) this.financialParams.tyre_price = Number(tyrePrice);
    if (retreadCost) this.financialParams.retread_cost = Number(retreadCost);
    if (ratePerKm) this.financialParams.rate_per_km = Number(ratePerKm);

    if (Object.keys(this.financialParams).length > 0) {
      try {
        await saveFinancialParameters(this.financialParams, this.session.siteId);
        this.uploadStatus.financial = true;
        this.updateStatusUI('financial', 'success', 1);
        this.recalculateUnlocks();
        this.updateProgressRing();
        this.checkLaunchReady();
      } catch (err) {
        console.error('Financial params save failed:', err);
      }
    }
  }

  updateStatusUI(type, status, count) {
    const statusEl = document.getElementById(`upload-status-${type}`);
    if (!statusEl) return;

    if (status === 'success') {
      statusEl.innerHTML = `<span class="ob-status-pill ob-status-success">Uploaded ✓ — ${count} rows</span>`;
    } else if (status === 'error') {
      statusEl.innerHTML = '<span class="ob-status-pill ob-status-error">Error ✗</span>';
    }
  }

  recalculateUnlocks() {
    this.unlockedReports = getUnlockedReportIds(this.uploadStatus);
  }

  updateProgressRing() {
    const unlocked = countUnlockedReports(this.uploadStatus);
    const pct = (unlocked / TOTAL_REPORTS) * 100;
    const circumference = 2 * Math.PI * 52;
    const dashoffset = circumference - (pct / 100) * circumference;

    const ring = this.container.querySelector('.ob-ring-fill');
    if (ring) ring.setAttribute('stroke-dashoffset', dashoffset);

    const num = this.container.querySelector('.ob-ring-number');
    if (num) num.textContent = unlocked;

    const countEl = document.getElementById('obReportCount');
    if (countEl) countEl.textContent = `${unlocked} of ${TOTAL_REPORTS} reports will be available after import`;
  }

  checkLaunchReady() {
    const btn = document.getElementById('obLaunchDash');
    if (btn) btn.disabled = !this.uploadStatus.vehicles;
  }

  async completeOnboarding() {
    try {
      const supabase = getSupabase();
      if (supabase && this.session.siteId) {
        await supabase.from('sites').update({ onboarding_completed: true }).eq('id', this.session.siteId);
      }
    } catch (err) {
      console.warn('Could not persist onboarding state to server:', err);
    }

    localStorage.setItem('onboarding_completed', 'true');
    const url = new URL(window.location);
    url.searchParams.delete('preview');
    window.location.href = url.toString();
  }
}

const controller = new OnboardingController();
controller.init();
