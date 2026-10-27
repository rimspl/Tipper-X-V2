import { exportRowsAsCsv, exportRowsAsExcel } from '../lib/export.js';
import { requireManagerSession } from '../lib/session.js';
import {
  appendFuelRow,
  appendFuelRows,
  buildAnalyticsSnapshot,
  fetchFuelRows,
  fetchAiAccuracy,
  fetchManagerDataset,
  invalidateManagerDataset,
  fetchSiteTargets,
  fetchRetreadCounts,
} from '../services/data-service.js';
import { fetchEvidenceUrls, fetchReviewQueue, resolveReviewItem } from '../services/review-service.js';
import {
  fetchFleetHealthScore,
  fetchTyreAgeDistribution,
  fetchDefectTrend,
  fetchRemovalReasons,
  invalidateCache as invalidateDataCache
} from '../lib/data-queries.js';
import { TYRE_CARDS } from '../data/tyre-cards.js';
import { initHomepageOverview, renderHomepageOverview } from './homepage-overview.js';

const __urlParams = new URLSearchParams(window.location.search);
const __isOnboardingPreview = __urlParams.get('preview') === 'onboarding';

if (!__isOnboardingPreview) {

const session = requireManagerSession();
if (!session) {
  throw new Error('No manager session available');
}

// Onboarding check — hide dashboard if no data and onboarding not completed
(function checkOnboarding() {
  const alreadyCompleted = localStorage.getItem('onboarding_completed');
  if (alreadyCompleted) return;

  const supabase = window.supabaseClient;
  if (!supabase || !session.siteId) return;

  supabase
    .from('vehicles')
    .select('*', { count: 'exact', head: true })
    .eq('site_id', session.siteId)
    .then(({ count, error }) => {
      if (!error && (count || 0) === 0) {
        const header = document.querySelector('.manager-header');
        const shell = document.querySelector('.manager-shell');
        const overlay = document.getElementById('loadingOverlay');
        if (header) header.style.display = 'none';
        if (shell) shell.style.display = 'none';
        if (overlay) overlay.classList.add('fade-out');
        const container = document.getElementById('onboardingContainer');
        if (container) container.style.display = '';
      }
    })
    .catch(() => {});
})();

const state = {
  session,
  activeTab: 'tyres',
  targets: null,
  ai: null,
  tyreRecords: [],
  inspectionRecords: [],
  pressureEvents: [],
  fuelRows: [],
  analytics: null,
  tyrePage: 1,
  tyrePageSize: 50,
  inspectionPage: 1,
  inspectionPageSize: 50,
  analyticsPageSizes: {
    life: 50,
    rubber: 50,
    pressure: 50
  },
  analyticsPages: {
    life: 1,
    rubber: 1,
    brand: 1,
    pressure: 1
  },
  pressureViewMode: 'summary',
  activeTyreHistorySerial: null,
  activeTyreHistoryRows: [],
  reviewItems: [],
  selectedReviewIndex: -1,

  fleetHealth: null,
  ageDistribution: [],
  defectTrend: [],
  removalReasons: [],
  enabledReports: [],
  reportsVisibilityApplied: false,
  reportDeepLink: '',
  reportDeepLinkApplied: false,
  retreadCounts: {},
  ratePerKm: 0,
  dateRangePreset: 'all',
  dateFrom: null,
  dateTo: null,
  analyticsGraphWindowMonths: 12,
  lastUpdated: null,
  dataErrors: {
    targets: false,
    dataset: false,
    fuel: false,
    ai: false,
    health: false
  }
};

const elements = {
  loadingOverlay: document.getElementById('loadingOverlay'),
  userLabel: document.getElementById('userLabel'),
  fuelUploadTopBtn: document.getElementById('fuelUploadTopBtn'),
  pressureLeakageCard: document.getElementById('pressureLeakageCard'),
  targetTyreLife: document.getElementById('targetTyreLife'),
  targetFuel: document.getElementById('targetFuel'),
  targetSavings: document.getElementById('targetSavings'),
  pressureLeakage: document.getElementById('pressureLeakage'),
  tabNav: document.getElementById('tabNav'),
  logoutBtn: document.getElementById('logoutBtn'),

  tabBadgeTyres: document.getElementById('tabBadgeTyres'),
  tabBadgeInspection: document.getElementById('tabBadgeInspection'),
  tabBadgeAnalytics: document.getElementById('tabBadgeAnalytics'),
  tabBadgeSavings: document.getElementById('tabBadgeSavings'),

  tyreBrandFilter: document.getElementById('tyreBrandFilter'),
  tyreNumberFilter: document.getElementById('tyreNumberFilter'),
  tyreTruckFilter: document.getElementById('tyreTruckFilter'),
  tyreStatusFilter: document.getElementById('tyreStatusFilter'),
  tyreDateFrom: document.getElementById('tyreDateFrom'),
  tyreDateTo: document.getElementById('tyreDateTo'),
  tyreApplyFilter: document.getElementById('tyreApplyFilter'),
  tyreClearFilter: document.getElementById('tyreClearFilter'),
  exportTyreXls: document.getElementById('exportTyreXls'),
  tyreRecordCount: document.getElementById('tyreRecordCount'),
  tyreTableBody: document.getElementById('tyreTableBody'),
  tyrePageMeta: document.getElementById('tyrePageMeta'),
  tyrePageSize: document.getElementById('tyrePageSize'),
  tyrePrevPage: document.getElementById('tyrePrevPage'),
  tyreNextPage: document.getElementById('tyreNextPage'),
  tyrePageInfo: document.getElementById('tyrePageInfo'),
  tyreCardModal: document.getElementById('tyreCardModal'),
  tyreCardTitle: document.getElementById('tyreCardTitle'),
  tyreCardSub: document.getElementById('tyreCardSub'),
  tyreCardBody: document.getElementById('tyreCardBody'),
  tyreCardClose: document.getElementById('tyreCardClose'),
  tyreCardTotal: document.getElementById('tyreCardTotal'),
  tyreCardStatus: document.getElementById('tyreCardStatus'),
  exportTyreCardXls: document.getElementById('exportTyreCardXls'),
  tyreHistorySection: document.getElementById('tyreHistorySection'),
  tyreHistoryTitle: document.getElementById('tyreHistoryTitle'),
  tyreHistoryCount: document.getElementById('tyreHistoryCount'),
  tyreHistoryBody: document.getElementById('tyreHistoryBody'),
  exportTyreHistoryBtn: document.getElementById('exportTyreHistoryBtn'),
  closeTyreHistoryBtn: document.getElementById('closeTyreHistoryBtn'),

  inspectionFrom: document.getElementById('inspectionFrom'),
  inspectionTo: document.getElementById('inspectionTo'),
  inspectionTruck: document.getElementById('inspectionTruck'),
  inspectionTyre: document.getElementById('inspectionTyre'),
  inspectionBrand: document.getElementById('inspectionBrand'),
  inspectionType: document.getElementById('inspectionType'),
  inspectionApplyFilter: document.getElementById('inspectionApplyFilter'),
  exportInspectionBtn: document.getElementById('exportInspectionBtn'),
  inspectionResultMeta: document.getElementById('inspectionResultMeta'),
  inspectionPageMeta: document.getElementById('inspectionPageMeta'),
  inspectionPageSize: document.getElementById('inspectionPageSize'),
  inspectionPrevPage: document.getElementById('inspectionPrevPage'),
  inspectionNextPage: document.getElementById('inspectionNextPage'),
  inspectionPageInfo: document.getElementById('inspectionPageInfo'),
  inspectionTableBody: document.getElementById('inspectionTableBody'),

  fuelForm: document.getElementById('fuelForm'),
  fuelTruck: document.getElementById('fuelTruck'),
  fuelDate: document.getElementById('fuelDate'),
  fuelTrips: document.getElementById('fuelTrips'),
  fuelKms: document.getElementById('fuelKms'),
  fuelConsumed: document.getElementById('fuelConsumed'),
  fuelProduction: document.getElementById('fuelProduction'),
  fuelFileUpload: document.getElementById('fuelFileUpload'),
  fuelTableBody: document.getElementById('fuelTableBody'),

  fuelUploadModal: document.getElementById('fuelUploadModal'),
  fuelUploadClose: document.getElementById('fuelUploadClose'),

  pressureLossModal: document.getElementById('pressureLossModal'),
  pressureLossClose: document.getElementById('pressureLossClose'),
  pressureLossBody: document.getElementById('pressureLossBody'),

  analyticsLifeMeta: document.getElementById('analyticsLifeMeta'),
  analyticsRubberMeta: document.getElementById('analyticsRubberMeta'),
  analyticsLifePrev: document.getElementById('analyticsLifePrev'),
  analyticsLifeNext: document.getElementById('analyticsLifeNext'),
  analyticsRubberPrev: document.getElementById('analyticsRubberPrev'),
  analyticsRubberNext: document.getElementById('analyticsRubberNext'),
  analyticsLifePageInfo: document.getElementById('analyticsLifePageInfo'),
  analyticsRubberPageInfo: document.getElementById('analyticsRubberPageInfo'),
  analyticsLifePageSize: document.getElementById('analyticsLifePageSize'),
  analyticsRubberPageSize: document.getElementById('analyticsRubberPageSize'),
  // Table bodies for analytics sections
  analyticsLifeTableBody: document.getElementById('analyticsLifeTableBody'),
  analyticsRubberTableBody: document.getElementById('analyticsRubberTableBody'),
  analyticsBrandTableBody: document.getElementById('analyticsBrandTableBody'),
  analyticsPressurePageSize: document.getElementById('analyticsPressurePageSize'),
  analyticsPressureMeta: document.getElementById('analyticsPressureMeta'),
  analyticsPressurePrev: document.getElementById('analyticsPressurePrev'),
  analyticsPressureNext: document.getElementById('analyticsPressureNext'),
  analyticsPressurePageInfo: document.getElementById('analyticsPressurePageInfo'),
  analyticsPressureModeSummary: document.getElementById('analyticsPressureModeSummary'),
  analyticsPressureModeDaily: document.getElementById('analyticsPressureModeDaily'),
  analyticsPressureTableHead: document.getElementById('analyticsPressureTableHead'),
  analyticsPressureTableBody: document.getElementById('analyticsPressureTableBody'),
  exportAnalyticsLifeXls: document.getElementById('exportAnalyticsLifeXls'),
  exportAnalyticsRubberXls: document.getElementById('exportAnalyticsRubberXls'),
  exportAnalyticsBrandXls: document.getElementById('exportAnalyticsBrandXls'),
  exportAnalyticsPressureDailyXls: document.getElementById('exportAnalyticsPressureDailyXls'),
  exportSavingsXls: document.getElementById('exportSavingsXls'),
  savingsBody: document.getElementById('savingsBody'),
  savingsHero: document.getElementById('savingsHero'),
  savingsHeroValue: document.getElementById('savingsHeroValue'),
  savingsHeroSub: document.getElementById('savingsHeroSub'),
  savingsGrid: document.getElementById('savingsGrid'),

  fleetHealthScore: document.getElementById('fleetHealthScore'),
  fleetHealthBreakdown: document.getElementById('fleetHealthBreakdown'),
  fleetHealthGauge: document.getElementById('fleetHealthGauge'),

  analyticsDateRangePreset: document.getElementById('analyticsDateRangePreset'),
  analyticsDateFrom: document.getElementById('analyticsDateFrom'),
  analyticsDateTo: document.getElementById('analyticsDateTo'),
  analyticsApplyRange: document.getElementById('analyticsApplyRange'),

  ageDistBody: document.getElementById('ageDistBody'),
  defectTrendBody: document.getElementById('defectTrendBody'),
  removalReasonsBody: document.getElementById('removalReasonsBody'),

  evidenceModal: document.getElementById('evidenceModal'),
  evidenceModalClose: document.getElementById('evidenceModalClose'),
  evidenceModalSub: document.getElementById('evidenceModalSub'),
  evidenceTableBody: document.getElementById('evidenceTableBody'),

  toastHost: document.getElementById('toastHost')
};

const chartInstances = {};

let currentFetchToken = 0;

init().catch((error) => {
  console.error(error);
  toast(error.message || 'Failed to load manager dashboard', 'error');
});

async function init() {
  elements.userLabel.textContent = `${state.session.username} • ${state.session.siteName}`;
  bindEvents();
  initHomepageOverview({ onRefresh: refreshDashboardData });
  try {
    await loadCoreData();
  } catch (error) {
    console.error('Core data load failed:', error);
    toast(error.message || 'Failed to load manager dashboard', 'error');
  } finally {
    // Dismiss loading overlay
    if (elements.loadingOverlay) {
      elements.loadingOverlay.classList.add('fade-out');
      elements.loadingOverlay.addEventListener('transitionend', () => {
        elements.loadingOverlay.remove();
      }, { once: true });
    }
  }

  const hashTab = String(window.location.hash.replace('#', '') || '').trim().toLowerCase();
  const initialTab = ['tyres', 'inspection', 'analytics', 'savings'].includes(hashTab)
    ? hashTab.toLowerCase()
    : 'tyres';
  switchTab(initialTab);
  applyReportDeepLink();
}

function bindEvents() {
  window.addEventListener('hashchange', () => {
    const hashTab = String(window.location.hash.replace('#', '') || '').trim().toLowerCase();
    if (['tyres', 'inspection', 'analytics', 'savings'].includes(hashTab) && hashTab !== state.activeTab) {
      switchTab(hashTab);
    }
  });

  elements.tabNav.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-tab]');
    if (!button) return;
    switchTab(button.dataset.tab);
  });

  // Filter toggle buttons
  document.querySelectorAll('.filter-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const panel = document.getElementById(targetId);
      if (panel) {
        panel.classList.toggle('open');
      }
    });
  });

  elements.tyreApplyFilter.addEventListener('click', () => { state.tyrePage = 1; renderTyreTable(); });
  elements.tyreClearFilter?.addEventListener('click', () => { if (elements.tyreNumberFilter) elements.tyreNumberFilter.value = ''; state.tyrePage = 1; renderTyreTable(); elements.tyreNumberFilter?.focus(); });
  elements.tyreNumberFilter?.addEventListener('input', () => { state.tyrePage = 1; renderTyreTable(); });
  elements.tyreNumberFilter?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); state.tyrePage = 1; renderTyreTable(); }});
  elements.tyrePageSize?.addEventListener('change', () => { state.tyrePageSize = Math.max(1, Number(elements.tyrePageSize.value || 50)); state.tyrePage = 1; renderTyreTable(); });
  elements.tyrePrevPage?.addEventListener('click', () => { state.tyrePage = Math.max(1, state.tyrePage - 1); renderTyreTable(); });
  elements.tyreNextPage?.addEventListener('click', () => { state.tyrePage += 1; renderTyreTable(); });
  elements.exportTyreXls?.addEventListener('click', exportTyreRows);
  elements.exportTyreHistoryBtn?.addEventListener('click', exportTyreHistoryRows);
  elements.closeTyreHistoryBtn?.addEventListener('click', closeTyreHistoryView);
  elements.tyreCardClose?.addEventListener('click', closeTyreCardModal);
  elements.tyreCardModal?.addEventListener('click', (event) => { if (event.target === elements.tyreCardModal) closeTyreCardModal(); });
  elements.exportTyreCardXls?.addEventListener('click', exportTyreCardExcel);

  elements.inspectionApplyFilter.addEventListener('click', () => {
    state.inspectionPage = 1;
    renderInspectionTable();
  });
  elements.exportInspectionBtn.addEventListener('click', exportInspectionRows);
  elements.inspectionPageSize?.addEventListener('change', () => {
    state.inspectionPageSize = Math.max(1, Number(elements.inspectionPageSize.value || 50));
    state.inspectionPage = 1;
    renderInspectionTable();
  });
  elements.inspectionPrevPage?.addEventListener('click', () => {
    state.inspectionPage = Math.max(1, state.inspectionPage - 1);
    renderInspectionTable();
  });
  elements.inspectionNextPage?.addEventListener('click', () => {
    state.inspectionPage += 1;
    renderInspectionTable();
  });

  elements.fuelForm.addEventListener('submit', handleFuelSubmit);
  elements.fuelUploadTopBtn?.addEventListener('click', openFuelUploadModal);
  elements.pressureLeakageCard?.addEventListener('click', openPressureLossModal);
  elements.pressureLeakageCard?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPressureLossModal();
    }
  });
  elements.fuelUploadClose?.addEventListener('click', closeFuelUploadModal);
  elements.fuelUploadModal?.addEventListener('click', (event) => {
    if (event.target === elements.fuelUploadModal) {
      closeFuelUploadModal();
    }
  });
  elements.pressureLossClose?.addEventListener('click', closePressureLossModal);
  elements.pressureLossModal?.addEventListener('click', (event) => {
    if (event.target === elements.pressureLossModal) {
      closePressureLossModal();
    }
  });
  elements.fuelFileUpload?.addEventListener('change', handleFuelFileSelection);

  elements.exportAnalyticsLifeXls?.addEventListener('click', exportAnalyticsLifeExcel);
  elements.exportAnalyticsRubberXls?.addEventListener('click', exportAnalyticsRubberExcel);
  elements.exportAnalyticsBrandXls?.addEventListener('click', exportAnalyticsBrandExcel);
  elements.exportAnalyticsPressureDailyXls?.addEventListener('click', exportAnalyticsPressureDailyExcel);
  elements.analyticsLifePrev?.addEventListener('click', () => {
    state.analyticsPages.life = Math.max(1, state.analyticsPages.life - 1);
    renderAnalytics();
  });
  elements.analyticsLifeNext?.addEventListener('click', () => {
    state.analyticsPages.life += 1;
    renderAnalytics();
  });
  elements.analyticsRubberPrev?.addEventListener('click', () => {
    state.analyticsPages.rubber = Math.max(1, state.analyticsPages.rubber - 1);
    renderAnalytics();
  });
  elements.analyticsRubberNext?.addEventListener('click', () => {
    state.analyticsPages.rubber += 1;
    renderAnalytics();
  });
  elements.analyticsLifePageSize?.addEventListener('change', () => {
    state.analyticsPageSizes.life = Math.max(1, Number(elements.analyticsLifePageSize.value || 50));
    state.analyticsPages.life = 1;
    renderAnalytics();
  });
  elements.analyticsRubberPageSize?.addEventListener('change', () => {
    state.analyticsPageSizes.rubber = Math.max(1, Number(elements.analyticsRubberPageSize.value || 50));
    state.analyticsPages.rubber = 1;
    renderAnalytics();
  });
  elements.analyticsPressurePageSize?.addEventListener('change', () => {
    state.analyticsPageSizes.pressure = Math.max(1, Number(elements.analyticsPressurePageSize.value || 50));
    state.analyticsPages.pressure = 1;
    renderAnalytics();
  });
  elements.analyticsPressurePrev?.addEventListener('click', () => {
    state.analyticsPages.pressure = Math.max(1, state.analyticsPages.pressure - 1);
    renderAnalytics();
  });
  elements.analyticsPressureNext?.addEventListener('click', () => {
    state.analyticsPages.pressure += 1;
    renderAnalytics();
  });
  elements.analyticsPressureModeSummary?.addEventListener('click', () => {
    state.pressureViewMode = 'summary';
    state.analyticsPages.pressure = 1;
    renderAnalytics();
  });
  elements.analyticsPressureModeDaily?.addEventListener('click', () => {
    state.pressureViewMode = 'daily';
    state.analyticsPages.pressure = 1;
    renderAnalytics();
  });
  elements.exportSavingsXls?.addEventListener('click', exportSavingsExcel);

  elements.evidenceModalClose?.addEventListener('click', closeEvidenceModal);
  elements.evidenceModal?.addEventListener('click', (event) => {
    if (event.target === elements.evidenceModal) {
      closeEvidenceModal();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;

    if (elements.tyreCardModal && !elements.tyreCardModal.classList.contains('hidden')) {
      closeTyreCardModal();
      return;
    }

    if (elements.pressureLossModal && !elements.pressureLossModal.classList.contains('hidden')) {
      closePressureLossModal();
      return;
    }

    if (elements.evidenceModal && !elements.evidenceModal.classList.contains('hidden')) {
      closeEvidenceModal();
      return;
    }

    if (elements.fuelUploadModal && !elements.fuelUploadModal.classList.contains('hidden')) {
      closeFuelUploadModal();
    }
  });

  elements.logoutBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    sessionStorage.removeItem('rims_session');
    window.location.replace('../fitter/login.html');
  });

  elements.analyticsDateRangePreset?.addEventListener('change', () => {
    renderDateRangeFilter();
    applyDateRange();
  });
  elements.analyticsApplyRange?.addEventListener('click', applyDateRange);
  elements.analyticsDateFrom?.addEventListener('change', () => { state.dateFrom = elements.analyticsDateFrom?.value || null; });
  elements.analyticsDateTo?.addEventListener('change', () => { state.dateTo = elements.analyticsDateTo?.value || null; });

  // Analytics search filter
  initAnalyticsSearch();
}

async function refreshDashboardData() {
  if (!state.session.siteId) {
    throw new Error('Manager account is not linked to a site');
  }

  invalidateManagerDataset(state.session.siteId);
  invalidateDataCache();
  await loadCoreData();
  state.lastUpdated = new Date();
  renderHomepageOverview(state);
  toast('Dashboard refreshed.', 'success');
}

async function loadCoreData() {
  if (!state.session.siteId) {
    throw new Error('Manager account is not linked to a site');
  }

  state.dataErrors = {
    targets: false,
    dataset: false,
    fuel: false,
    ai: false,
    health: false
  };

  // One-time cache bust: discard stale IndexedDB + memory cache after DB fixes
  try {
    const cacheBustKey = 'cache_bust_v2_applied';
    if (!sessionStorage.getItem(cacheBustKey)) {
      invalidateManagerDataset(state.session.siteId);
      invalidateDataCache();
      sessionStorage.setItem(cacheBustKey, '1');
    }
  } catch (_) {}

  const token = ++currentFetchToken;

  elements.tyreTableBody.innerHTML = '<tr><td colspan="13" style="text-align: center; padding: 20px; color: #94a3b8;">Processing data...</td></tr>';
  elements.inspectionTableBody.innerHTML = '<tr><td colspan="14" style="text-align: center; padding: 20px; color: #94a3b8;">Processing data...</td></tr>';

  const [targets, ai, fuelRows, retreadCounts] = await Promise.all([
    fetchSiteTargets(state.session.siteId).catch((error) => {
      console.warn('Using default targets:', error);
      state.dataErrors.targets = true;
      return {
        siteName: state.session.siteName || 'Site',
        lifeUnit: 'KM',
        targetTyreLife: 0,
        pressureTargetTyreLifeKm: 0,
        tyrePrice: 0,
        fleetSize: 0,
        annualDemand: 0,
        targetFuelEfficiency: 0,
        pressureFuelEfficiencyKmpl: 0,
        pressureBasePsi: 120,
        pressureTempZone: 45,
        pressureFuelPrice: 90,
        pressureDailyKm: 250,
        pressureTiresPerTruck: 6,
        pressureCalibrationDays: 30,
        pressureMaxInterpolationDays: 7,
        pressureModelEnabled: true,
        targetAnnualSavings: 0,
        enabledReports: [],
        retreadCost: 0,
        ratePerKm: 0
      };
    }),
    fetchAiAccuracy(state.session.siteId).catch((error) => {
      console.warn('Using default AI accuracy:', error);
      state.dataErrors.ai = true;
      return { total: 0, auto: 0, autoPercent: 0 };
    }),
    fetchFuelRows(state.session.siteId).catch((error) => {
      console.warn('Using empty fuel rows:', error);
      state.dataErrors.fuel = true;
      return [];
    }),
    fetchRetreadCounts(state.session.siteId).catch((error) => {
      console.warn('Using empty retread counts:', error);
      return {};
    })
  ]);

  Promise.all([
    fetchFleetHealthScore(state.session.siteId).catch((error) => {
      console.warn('Fleet health fetch failed:', error);
      state.dataErrors.health = true;
      return null;
    }),
    fetchTyreAgeDistribution(state.session.siteId).catch((error) => {
      console.warn('Age distribution fetch failed:', error);
      return [];
    }),
    fetchDefectTrend(state.session.siteId).catch((error) => {
      console.warn('Defect trend fetch failed:', error);
      return [];
    }),
    fetchRemovalReasons(state.session.siteId).catch((error) => {
      console.warn('Removal reasons fetch failed:', error);
      return [];
    })
  ]).then(([hs, age, defect, removal]) => {
    state.fleetHealth = hs;
    state.ageDistribution = age;
    state.defectTrend = defect;
    state.removalReasons = removal;
    if (hs) state.dataErrors.health = false;
    renderHomepageOverview(state);
  });

  if (token !== currentFetchToken) return;

  state.targets = targets;
  state.enabledReports = targets.enabledReports || [];
  state.retreadCounts = retreadCounts || {};
  state.ratePerKm = targets.ratePerKm || 0;
  state.ai = ai;
  state.fuelRows = fuelRows || [];

  if (!state.analytics) {
    state.analytics = { pressure: { summary: { cumulative_loss: 0 } } };
  }

  state.lastUpdated = new Date();
  renderTopStrip();
  renderHomepageOverview(state);
  renderFuelRows();

  if (elements.loadingOverlay) {
    elements.loadingOverlay.classList.add('fade-out');
    elements.loadingOverlay.addEventListener('transitionend', () => {
      elements.loadingOverlay.remove();
    }, { once: true });
  }

  loadManagerAnalyticsAsync(state.session.siteId, token);
}

async function loadManagerAnalyticsAsync(siteId, token) {
  try {
    const freshDataHandler = (freshData) => {
      if (token !== currentFetchToken) return;
      applyManagerDataset(freshData);
      renderAllHeavyModules();
      toast('Live stats updated seamlessly.', 'success');
    };

    const dataset = await fetchManagerDataset(siteId, freshDataHandler);
    if (token !== currentFetchToken) return;

    state.dataErrors.dataset = false;
    applyManagerDataset(dataset);
    renderAllHeavyModules();

  } catch (error) {
    console.warn('Using empty manager dataset:', error);
    if (token !== currentFetchToken) return;
    state.dataErrors.dataset = true;
    applyManagerDataset({ tyreRecords: [], inspectionRecords: [], pressureEvents: [] });
    renderAllHeavyModules();
  }
}

function applyManagerDataset(dataset) {
  const excelTyreRecords = Object.keys(TYRE_CARDS).sort().map((tn) => {
    const rows = TYRE_CARDS[tn] || [];
    const first = rows[0];
    const last = rows[rows.length - 1];
    const totalLife = rows.reduce((s, r) => {
      const v = Number(String(r.life).replace(/,/g, ''));
      return Number.isFinite(v) ? s + v : s;
    }, 0);
    return {
      tyre_no: tn,
      make: first?.brand || 'MRF',
      size: '-',
      status: last?.removalDate === '-' ? 'Running' : 'Scrapped',
      total_life_run: totalLife,
      current_rtd1: last?.rtd1Rem !== '-' ? last.rtd1Rem : last?.rtd1Fit,
      current_rtd2: last?.rtd2Rem !== '-' ? last.rtd2Rem : last?.rtd2Fit
    };
  });
  const excelMap = new Map(excelTyreRecords.map((r) => [normalize(r.tyre_no), r]));
  const merged = [...excelTyreRecords];
  for (const r of dataset.tyreRecords || []) {
    const norm = normalize(r.tyre_no);
    if (!norm || norm === '-' || excelMap.has(norm)) continue;
    merged.push(r);
  }
  merged.sort((a, b) => String(a.tyre_no || '').localeCompare(String(b.tyre_no || '')));
  state.tyreRecords = merged.length > 0 ? merged : excelTyreRecords;
  state.inspectionRecords = dataset.inspectionRecords || [];
  state.pressureEvents = dataset.pressureEvents || [];
  state.analytics = buildAnalyticsSnapshot({
    tyreRecords: state.tyreRecords,
    fuelRows: state.fuelRows,
    targets: state.targets,
    pressureEvents: state.pressureEvents
  });
}

function renderAllHeavyModules() {
  state.lastUpdated = new Date();
  renderTopStrip();
  renderHomepageOverview(state);
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
  requestAnimationFrame(() => {
    renderCharts();
    requestAnimationFrame(() => applyReportDeepLink());
  });
}

function applyReportVisibility() {
  state.reportsVisibilityApplied = true;
  const enabled = state.enabledReports;
  if (!enabled || enabled.length === 0) return;

  document.querySelectorAll('[data-report]').forEach(el => {
    el.style.display = enabled.includes(el.dataset.report) ? '' : 'none';
  });

  document.getElementById('tab-tyres').style.display = enabled.includes('tyreRecords') ? '' : 'none';
  document.getElementById('tab-inspection').style.display = enabled.includes('inspectionRecords') ? '' : 'none';
  document.getElementById('tab-savings').style.display = enabled.includes('savings') ? '' : 'none';

  document.querySelectorAll('.tab-btn').forEach(btn => {
    const tab = btn.dataset.tab;
    const map = { tyres: 'tyreRecords', inspection: 'inspectionRecords', savings: 'savings', analytics: 'analytics' };
    const key = map[tab];
    if (key && !enabled.includes(key)) {
      btn.style.display = 'none';
      if (btn.classList.contains('active')) {
        const firstVisible = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.style.display !== 'none');
        if (firstVisible) firstVisible.click();
      }
    } else {
      btn.style.display = '';
    }
  });
}

function renderPressureFuelCost() {
  const canvas = document.getElementById('pressureFuelCostChart');
  if (!canvas) return;
  const fuelRows = state.fuelRows || [];
  const rawKmpl = Number(state.targets.pressureFuelEfficiencyKmpl || 0);
  const targetKmpl = rawKmpl > 0 ? rawKmpl : 2.8;
  const fuelPrice = Number(state.targets.pressureFuelPrice || 90) || 90;
  const monthly = {};
  for (const row of fuelRows) {
    const month = (row.date || row.entry_date || '').slice(0, 7);
    if (!month) continue;
    if (!monthly[month]) monthly[month] = { targetCost: 0, actualCost: 0 };
    const km = Number(row.total_kms) || 0;
    const liters = Number(row.total_fuel_consumed) || 0;
    monthly[month].actualCost += liters * fuelPrice;
    monthly[month].targetCost += targetKmpl > 0 ? (km / targetKmpl) * fuelPrice : 0;
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

function renderPressureHeatmap() {
  const grid = document.getElementById('pressureHeatmapGrid');
  if (!grid) return;
  const basePsi = Number(state.targets.pressureBasePsi || 120) || 120;
  const tyreRecords = state.tyreRecords || [];
  const pressureEvents = state.pressureEvents || [];
  const serialToTyre = {};
  for (const t of tyreRecords) {
    if (t.tyre_no) serialToTyre[String(t.tyre_no).trim().toUpperCase()] = t;
  }
  const latestBySerial = {};
  for (const ev of pressureEvents) {
    const serial = String(ev.tyre_serial || ev.tyre_no || ev.tyre_id || ev.tyreId || '').trim().toUpperCase();
    const psi = ev.found_psi ?? ev.psi_found ?? ev.corrected_psi ?? ev.psi_corrected;
    if (!serial || psi == null || psi === '' || psi === '-') continue;
    const ms = Number(ev.checked_at_ms || 0) || Date.parse(ev.checked_date || ev.date || '') || 0;
    const existing = latestBySerial[serial];
    if (!existing || ms > existing.ms) {
      latestBySerial[serial] = { psi: Number(psi), ms, date: ev.checked_date || ev.date || '', position: ev.position_code || ev.position || '' };
    }
  }
  let html = '';
  for (const [serial, info] of Object.entries(latestBySerial)) {
    const tyre = serialToTyre[serial];
    const tyreNo = tyre ? tyre.tyre_no : serial.slice(0, 12);
    const position = info.position || tyre?.position || '-';
    const dev = info.psi - basePsi;
    const absDev = Math.abs(dev);
    let status, statusLabel;
    if (absDev <= 5) { status = 'ok'; statusLabel = 'OK'; }
    else if (absDev <= 10) { status = 'warn'; statusLabel = 'WARN'; }
    else { status = 'critical'; statusLabel = 'CRIT'; }
    html += `<div class="pressure-heatmap-card status-${status}" title="${tyreNo} • ${position} • ${info.date}">
      <div class="tyre-no">${tyreNo}</div>
      <div class="psi-value">${info.psi}</div>
      <div style="font-size:11px;opacity:0.7">${dev > 0 ? '+' : ''}${dev.toFixed(1)} PSI</div>
      <div class="position-label">${position} · ${statusLabel}</div>
    </div>`;
  }
  if (!html) html = '<p style="color:#94a3b8;text-align:center;padding:20px">No pressure data available. Add PRESSURE_CHECK entries.</p>';
  grid.innerHTML = html;
}

function renderRtdScrapping() {
  const tbody = document.getElementById('rtdScrappingBody');
  if (!tbody) return;
  const inspections = state.inspectionRecords || [];
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
      brand, count: v.count, totalKm: v.totalKm,
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
  const rows = tyreRecords.filter(t => t.tyre_no).map(t => {
    const tyreId = t.id || t.tyreId;
    const km = Number(t.total_life_run || t.life_achieved || t.totalLifeRun || 0);
    const retreads = retreadCounts[tyreId] || 0;
    const revenue = km * ratePerKm;
    const cost = tyrePrice + (retreads * retreadCost);
    const pnl = revenue - cost;
    totalRevenue += revenue; totalCost += cost; totalPnL += pnl;
    return { tyreNo: t.tyre_no, make: t.make || t.brand || '-', km, revenue, cost, pnl };
  }).sort((a, b) => b.pnl - a.pnl);
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
    <td>TOTAL</td><td></td><td></td>
    <td>₹${Math.round(totalRevenue).toLocaleString()}</td>
    <td>₹${Math.round(totalCost).toLocaleString()}</td>
    <td style="color:${totalPnL >= 0 ? '#22c55e' : '#ef4444'}">${totalPnL >= 0 ? '+' : ''}₹${Math.round(totalPnL).toLocaleString()}</td>
  </tr>`;
}

function renderTopStrip() {
  if (elements.targetTyreLife) {
    elements.targetTyreLife.textContent = `${formatNumber(state.targets.targetTyreLife)} ${state.targets.lifeUnit}`;
  }
  if (elements.targetFuel) {
    elements.targetFuel.textContent = `${formatNumber(state.targets.targetFuelEfficiency)} Km/L`;
  }
  if (elements.targetSavings) {
    elements.targetSavings.textContent = currency(state.targets.targetAnnualSavings);
  }
  if (elements.pressureLeakage) {
    const pressureCumulativeLoss = state.analytics?.pressure?.summary?.cumulative_loss;
    elements.pressureLeakage.textContent = Number.isFinite(Number(pressureCumulativeLoss))
      ? currency(pressureCumulativeLoss)
      : '0';
  }
}

function renderTyreFilterOptions() {
  const brands = Array.from(new Set(state.tyreRecords.map((row) => row.make).filter(Boolean))).sort();
  const current = elements.tyreBrandFilter.value;

  elements.tyreBrandFilter.innerHTML = '<option value="">All Brands</option>';
  for (const brand of brands) {
    const option = document.createElement('option');
    option.value = brand;
    option.textContent = brand;
    elements.tyreBrandFilter.appendChild(option);
  }

  elements.tyreBrandFilter.value = brands.includes(current) ? current : '';
}

function renderTyreTable() {
  const allRows = getFilteredTyreRows();
  const paged = paginateRows(allRows, state.tyrePage, state.tyrePageSize);
  state.tyrePage = paged.page;

  if (elements.tyreRecordCount) {
    elements.tyreRecordCount.textContent = `Total Tyres: ${state.tyreRecords.length} | Filtered: ${allRows.length}`;
  }
  renderPagerState({ metaEl: elements.tyrePageMeta, pageEl: elements.tyrePageInfo, prevEl: elements.tyrePrevPage, nextEl: elements.tyreNextPage }, paged, 'tyres');
  if (elements.tyrePageSize) elements.tyrePageSize.value = String(state.tyrePageSize);

  elements.tyreTableBody.innerHTML = '';
  if (paged.rows.length === 0) {
    elements.tyreTableBody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:#94a3b8">No tyres found. Try different search.</td></tr>';
    return;
  }

  let sl = paged.start;
  for (const row of paged.rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${sl++}</td>
      <td><strong>${escapeHtml(row.tyre_no)}</strong></td>
      <td><button class="btn btn-row-view" type="button" data-action="tyre-view-card">View</button></td>
    `;
    tr.querySelector('button[data-action="tyre-view-card"]')?.addEventListener('click', () => {
      openTyreCardModal(row.tyre_no);
    });
    elements.tyreTableBody.appendChild(tr);
  }
}

function getFilteredTyreRows() {
  const tyreNo = normalize(elements.tyreNumberFilter?.value);
  let rows = state.tyreRecords;
  if (tyreNo) {
    rows = rows.filter((record) => normalize(record.tyre_no).includes(tyreNo));
  }
  return [...rows].sort((a, b) => String(a.tyre_no || '').localeCompare(String(b.tyre_no || '')));
}

let _activeTyreCardNo = null;
let _activeTyreCardRows = [];

function buildTyreCardRows(tyreNo) {
  const norm = normalize(tyreNo);
  const excelRows = TYRE_CARDS[norm] || TYRE_CARDS[String(tyreNo || '').trim().toUpperCase()] || null;
  if (excelRows && Array.isArray(excelRows) && excelRows.length > 0) {
    return excelRows.map((r) => ({
      sl: r.sl,
      tyreNo: r.tyreNo,
      brand: r.brand,
      newOld: r.newOld,
      dNo: r.dNo,
      position: r.position,
      fittedDate: r.fittedDate,
      fitKmr: formatNumber(r.fitKmr),
      rtd1Fit: valueOrDash(r.rtd1Fit),
      rtd2Fit: valueOrDash(r.rtd2Fit),
      avgFit: r.avgFit,
      removalDate: r.removalDate,
      rtd1Rem: valueOrDash(r.rtd1Rem),
      rtd2Rem: valueOrDash(r.rtd2Rem),
      avgRem: r.avgRem,
      wear: r.wear,
      reason: r.reason,
      removedKmr: formatNumber(r.removedKmr),
      life: formatNumber(r.life)
    }));
  }
  const logs = state.inspectionRecords.filter((r) => normalize(r.tyre_no) === norm);
  if (logs.length === 0) return [];
  const sorted = [...logs].sort((a, b) => {
    const da = Date.parse(a.activity_date || a.date || '') || 0;
    const db = Date.parse(b.activity_date || b.date || '') || 0;
    if (da !== db) return da - db;
    return Number(a._activity_at_ms || 0) - Number(b._activity_at_ms || 0);
  });
  return sorted.map((r, i) => ({
    sl: i + 1,
    tyreNo: r.tyre_no,
    brand: r.brand || '-',
    newOld: i === 0 ? 'New' : 'Old',
    dNo: r.truck || '-',
    position: r.position || '-',
    fittedDate: formatDateOnly(r.activity_date || r.date),
    fitKmr: formatNumber(r.odometer),
    rtd1Fit: valueOrDash(r.rtd1),
    rtd2Fit: valueOrDash(r.rtd2),
    avgFit: (Number(r.rtd1) && Number(r.rtd2)) ? ((Number(r.rtd1) + Number(r.rtd2)) / 2).toFixed(1) : '-',
    removalDate: '-',
    rtd1Rem: '-',
    rtd2Rem: '-',
    avgRem: '-',
    wear: '-',
    reason: r.remarks || r.activity_type || '-',
    removedKmr: '-',
    life: '-'
  }));
}

function openTyreCardModal(tyreNo) {
  const norm = normalize(tyreNo);
  if (!norm) { toast('Tyre number missing', 'error'); return; }
  _activeTyreCardNo = norm;
  _activeTyreCardRows = buildTyreCardRows(norm);
  if (elements.tyreCardTitle) elements.tyreCardTitle.textContent = `Tyre Card — ${norm}`;
  if (elements.tyreCardSub) {
    const rec = state.tyreRecords.find((r) => normalize(r.tyre_no) === norm);
    const brand = rec?.make || _activeTyreCardRows[0]?.brand || '-';
    const status = rec?.status || '-';
    elements.tyreCardSub.textContent = `${brand} • ${status} • ${_activeTyreCardRows.length} lifecycle row(s) — matches Excel sheet "${norm}"`;
  }
  renderTyreCard();
  elements.tyreCardModal?.classList.remove('hidden');
}

function closeTyreCardModal() {
  elements.tyreCardModal?.classList.add('hidden');
  _activeTyreCardNo = null;
}

function renderTyreCard() {
  if (!elements.tyreCardBody) return;
  elements.tyreCardBody.innerHTML = '';
  if (_activeTyreCardRows.length === 0) {
    elements.tyreCardBody.innerHTML = '<tr><td colspan="19" style="text-align:center;padding:20px;color:#94a3b8">No lifecycle rows for this tyre. Check inspectionRecords.</td></tr>';
    if (elements.tyreCardTotal) elements.tyreCardTotal.textContent = '';
    if (elements.tyreCardStatus) elements.tyreCardStatus.textContent = '';
    return;
  }
  for (const r of _activeTyreCardRows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.sl}</td><td><strong>${escapeHtml(r.tyreNo)}</strong></td><td>${escapeHtml(r.brand)}</td><td>${r.newOld}</td><td>${escapeHtml(r.dNo)}</td><td>${escapeHtml(r.position)}</td><td>${r.fittedDate}</td><td>${r.fitKmr}</td><td>${r.rtd1Fit}</td><td>${r.rtd2Fit}</td><td>${r.avgFit}</td><td>${r.removalDate}</td><td>${r.rtd1Rem}</td><td>${r.rtd2Rem}</td><td>${r.avgRem}</td><td>${r.wear}</td><td>${escapeHtml(r.reason)}</td><td>${r.removedKmr}</td><td>${r.life}</td>`;
    elements.tyreCardBody.appendChild(tr);
  }
  const totalLife = _activeTyreCardRows.reduce((sum, r) => {
    const v = Number(String(r.life).replace(/,/g, ''));
    return Number.isFinite(v) ? sum + v : sum;
  }, 0);
  if (elements.tyreCardTotal) elements.tyreCardTotal.textContent = `TOTAL LIFE OF TYRE: ${totalLife.toLocaleString()} Kmr`;
  const rec = state.tyreRecords.find((r) => normalize(r.tyre_no) === _activeTyreCardNo);
  if (elements.tyreCardStatus) elements.tyreCardStatus.textContent = `Status: ${rec?.status || _activeTyreCardRows[_activeTyreCardRows.length - 1]?.reason || '-'}`;
}

function exportTyreCardExcel() {
  if (!_activeTyreCardRows || _activeTyreCardRows.length === 0) { toast('No tyre card to export', 'info'); return; }
  const header = ['Sl','Tyre No','Brand','New/Old','D No','Position','Fitted Date','Fit Kmr','RTD 1','RTD 2','Avg','Removal Date','RTD 1','RTD 2','Avg','Wear %','Reason','Removed Kmr','Life (Kmr)'];
  const rows = _activeTyreCardRows.map((r) => [r.sl,r.tyreNo,r.brand,r.newOld,r.dNo,r.position,r.fittedDate,r.fitKmr,r.rtd1Fit,r.rtd2Fit,r.avgFit,r.removalDate,r.rtd1Rem,r.rtd2Rem,r.avgRem,r.wear,r.reason,r.removedKmr,r.life]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, _activeTyreCardNo || 'TyreCard');
  XLSX.writeFile(wb, `TyreCard_${_activeTyreCardNo || 'export'}.xlsx`);
}

function showTyreRepositoryView() {
  elements.tyreBrandFilter.value = '';
  if (elements.tyreNumberFilter) {
    elements.tyreNumberFilter.value = '';
  }
  elements.tyreTruckFilter.value = '';
  elements.tyreStatusFilter.value = '';
  elements.tyreDateFrom.value = '';
  elements.tyreDateTo.value = '';
  renderTyreTable();
  toast('Showing full tyre repository view.', 'success');
}

function openTyreHistoryPage(tyreNo, fromTab = 'tyres') {
  const normalizedTyre = normalize(tyreNo);
  if (!normalizedTyre) {
    toast('Tyre number is missing for history view.', 'error');
    return;
  }

  const safeTab = fromTab === 'inspection' ? 'inspection' : 'tyres';
  const params = new URLSearchParams({
    tyre: normalizedTyre,
    from: safeTab
  });
  window.location.href = `./tyre-history.html?${params.toString()}`;
}

function openTyreHistoryView(tyreNo) {
  const normalizedTyre = normalize(tyreNo);
  if (!normalizedTyre) {
    toast('Tyre number is missing for history view.', 'error');
    return;
  }

  const rows = state.inspectionRecords
    .filter((record) => normalize(record.tyre_no) === normalizedTyre)
    .sort((a, b) => {
      const left = Date.parse(`${a.activity_date || ''}T00:00:00Z`);
      const right = Date.parse(`${b.activity_date || ''}T00:00:00Z`);
      if (Number.isFinite(left) && Number.isFinite(right) && left !== right) {
        return right - left;
      }
      return String(b.id || '').localeCompare(String(a.id || ''));
    });

  state.activeTyreHistorySerial = normalizedTyre;
  state.activeTyreHistoryRows = rows;
  renderTyreHistoryTable();

  elements.tyreHistorySection?.classList.remove('hidden');
  elements.exportTyreHistoryBtn?.classList.remove('hidden');
  elements.tyreHistorySection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeTyreHistoryView() {
  state.activeTyreHistorySerial = null;
  state.activeTyreHistoryRows = [];
  elements.tyreHistorySection?.classList.add('hidden');
}

function renderTyreHistoryTable() {
  if (!elements.tyreHistoryBody) {
    return;
  }

  const rows = Array.isArray(state.activeTyreHistoryRows) ? state.activeTyreHistoryRows : [];
  const serial = state.activeTyreHistorySerial || '-';

  if (elements.tyreHistoryTitle) {
    elements.tyreHistoryTitle.textContent = `Tyre History - ${serial}`;
  }
  if (elements.tyreHistoryCount) {
    elements.tyreHistoryCount.textContent = `${rows.length} record(s)`;
  }
  if (elements.exportTyreHistoryBtn) {
    elements.exportTyreHistoryBtn.disabled = rows.length === 0;
  }

  elements.tyreHistoryBody.innerHTML = '';
  if (rows.length === 0) {
    elements.tyreHistoryBody.innerHTML = '<tr><td colspan="11">No history records found for this tyre.</td></tr>';
    return;
  }

  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.activity_date}</td>
      <td>${row.activity_type}</td>
      <td>${row.truck}</td>
      <td>${row.brand}</td>
      <td>${row.position}</td>
      <td>${formatNumber(row.odometer)}</td>
      <td>${row.rtd1}</td>
      <td>${row.rtd2}</td>
      <td>${row.psi_found}</td>
      <td>${row.psi_corrected}</td>
      <td>${row.remarks}</td>
    `;
    elements.tyreHistoryBody.appendChild(tr);
  }
}

function getFilteredInspectionRows() {
  const filters = {
    from: elements.inspectionFrom.value,
    to: elements.inspectionTo.value,
    truck: normalize(elements.inspectionTruck.value),
    tyre: normalize(elements.inspectionTyre.value),
    brand: normalize(elements.inspectionBrand.value),
    activity: elements.inspectionType.value
  };

  return state.inspectionRecords.filter((record) => {
    if (filters.activity && record.activity_type !== filters.activity) return false;
    if (filters.from && record.activity_date < filters.from) return false;
    if (filters.to && record.activity_date > filters.to) return false;
    if (filters.truck && !normalize(record.truck).includes(filters.truck)) return false;
    if (filters.tyre && !normalize(record.tyre_no).includes(filters.tyre)) return false;
    if (filters.brand && !normalize(record.brand).includes(filters.brand)) return false;
    return true;
  });
}

function getLatestInspectionRows(rows) {
  const seen = new Set();
  const latest = [];

  for (const row of rows) {
    const key = normalize(row.tyre_no);
    if (!key || key === '-' || seen.has(key)) continue;
    seen.add(key);
    latest.push(row);
  }

  return latest;
}

function renderInspectionTable() {
  const filteredRows = getFilteredInspectionRows();
  const latestRows = getLatestInspectionRows(filteredRows);
  const paged = paginateRows(latestRows, state.inspectionPage, state.inspectionPageSize);
  state.inspectionPage = paged.page;

  if (elements.inspectionResultMeta) {
    elements.inspectionResultMeta.textContent = `Latest record per tyre | Matched tyres: ${latestRows.length}`;
  }

  if (elements.inspectionPageMeta) {
    elements.inspectionPageMeta.textContent = paged.total === 0
      ? 'Showing 0 of 0 tyres'
      : `Showing ${paged.start}-${paged.end} of ${paged.total} tyres`;
  }

  if (elements.inspectionPageInfo) {
    elements.inspectionPageInfo.textContent = `Page ${paged.page} / ${paged.totalPages}`;
  }

  if (elements.inspectionPageSize) {
    elements.inspectionPageSize.value = String(state.inspectionPageSize);
  }

  if (elements.inspectionPrevPage) {
    elements.inspectionPrevPage.disabled = paged.page <= 1;
  }

  if (elements.inspectionNextPage) {
    elements.inspectionNextPage.disabled = paged.page >= paged.totalPages;
  }

  elements.inspectionTableBody.innerHTML = '';
  if (paged.rows.length === 0) {
    elements.inspectionTableBody.innerHTML = '<tr><td colspan="13">No inspection records found for this filter.</td></tr>';
    return;
  }

  for (const row of paged.rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.activity_date}</td>
      <td>${row.activity_type}</td>
      <td>${row.truck}</td>
      <td>${row.tyre_no}</td>
      <td>${row.brand}</td>
      <td>${row.position}</td>
      <td>${formatNumber(row.odometer)}</td>
      <td>${row.rtd1}</td>
      <td>${row.rtd2}</td>
      <td>${row.psi_found}</td>
      <td>${row.psi_corrected}</td>
      <td>${row.remarks}</td>
      <td><button class="btn btn-row-view" type="button" data-action="inspection-view-tyre">View</button></td>
    `;

    const viewButton = tr.querySelector('button[data-action="inspection-view-tyre"]');
    viewButton?.addEventListener('click', () => {
      openTyreHistoryPage(row.tyre_no, 'inspection');
    });

    elements.inspectionTableBody.appendChild(tr);
  }
}

async function openEvidenceModal({ submissionId, title }) {
  if (!submissionId) {
    toast('Submission ID missing for evidence lookup.', 'info');
    return;
  }

  elements.evidenceModal.classList.remove('hidden');
  elements.evidenceModalSub.textContent = `Submission: ${submissionId}`;
  elements.evidenceTableBody.innerHTML = '<tr><td colspan="7">Fetching evidence from bucket...</td></tr>';

  try {
    const evidence = await fetchEvidenceUrls(submissionId);
    elements.evidenceModalSub.textContent = title
      ? `${title} | Submission: ${submissionId}`
      : `Submission: ${submissionId}`;

    if (!Array.isArray(evidence) || evidence.length === 0) {
      elements.evidenceTableBody.innerHTML = '<tr><td colspan="7">No evidence rows found for this submission.</td></tr>';
      return;
    }

    elements.evidenceTableBody.innerHTML = '';
    for (const item of evidence) {
      const tr = document.createElement('tr');

      const hasMediaUrl = Boolean(item.signed_url);
      let mediaCell = '-';
      if (hasMediaUrl && String(item.media_kind || '').toLowerCase() === 'audio') {
        mediaCell = `<audio controls preload="none" src="${item.signed_url}"></audio>`;
      } else if (hasMediaUrl) {
        mediaCell = `<a class="inline-link" href="${item.signed_url}" target="_blank" rel="noopener noreferrer">Open file</a>`;
      }

      tr.innerHTML = `
        <td>${item.field_label || prettifyStepId(item.step_id)}</td>
        <td>${item.step_id || '-'}</td>
        <td>${item.media_kind || '-'}</td>
        <td>${formatDateTime(item.captured_at)}</td>
        <td>${mediaCell}</td>
        <td>${formatTranscript(item.transcript)}</td>
        <td>${item.storage_path || '-'}</td>
      `;
      elements.evidenceTableBody.appendChild(tr);
    }
  } catch (error) {
    elements.evidenceTableBody.innerHTML = `<tr><td colspan="7">${error.message || 'Failed to fetch evidence.'}</td></tr>`;
    throw error;
  }
}

function closeEvidenceModal() {
  elements.evidenceModal.classList.add('hidden');
}

function openPressureLossModal() {
  if (!elements.pressureLossModal || !elements.pressureLossBody) {
    return;
  }

  const sourceRows = Array.isArray(state.analytics?.sectionPressureDaily)
    ? state.analytics.sectionPressureDaily
    : [];

  const cumulativeByTyre = new Map();
  for (const row of sourceRows) {
    const tyreNo = String(row.tyre_no || '').trim();
    if (!tyreNo) continue;
    cumulativeByTyre.set(tyreNo, Number(row.cumulative_loss_inr || 0));
  }

  const rows = Array.from(cumulativeByTyre.entries())
    .map(([tyre_no, cumulative_loss]) => ({ tyre_no, cumulative_loss }))
    .sort((a, b) => b.cumulative_loss - a.cumulative_loss);

  elements.pressureLossBody.innerHTML = '';
  if (rows.length === 0) {
    elements.pressureLossBody.innerHTML = '<tr><td colspan="2">No pressure leakage rows found.</td></tr>';
  } else {
    for (const row of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.tyre_no}</td>
        <td>${currency(row.cumulative_loss)}</td>
      `;
      elements.pressureLossBody.appendChild(tr);
    }
  }

  elements.pressureLossModal.classList.remove('hidden');
}

function closePressureLossModal() {
  elements.pressureLossModal?.classList.add('hidden');
}

function renderFuelRows() {
  elements.fuelTableBody.innerHTML = '';
  if (state.fuelRows.length === 0) {
    elements.fuelTableBody.innerHTML = '<tr><td colspan="8">No fuel rows added yet.</td></tr>';
    return;
  }

  for (const row of state.fuelRows) {
    const fuelPerTrip = row.total_trips > 0 ? row.total_fuel_consumed / row.total_trips : 0;
    const fuelPerKm = row.total_kms > 0 ? row.total_fuel_consumed / row.total_kms : 0;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.truck_no}</td>
      <td>${row.date}</td>
      <td>${formatNumber(row.total_trips)}</td>
      <td>${formatNumber(row.total_kms)}</td>
      <td>${formatNumber(row.total_fuel_consumed)}</td>
      <td>${formatNumber(row.total_production)}</td>
      <td>${formatNumber(fuelPerTrip)}</td>
      <td>${formatNumber(fuelPerKm)}</td>
    `;
    elements.fuelTableBody.appendChild(tr);
  }
}

function openFuelUploadModal() {
  if (elements.fuelDate && !elements.fuelDate.value) {
    elements.fuelDate.value = today();
  }
  elements.fuelUploadModal?.classList.remove('hidden');
}

function closeFuelUploadModal() {
  elements.fuelUploadModal?.classList.add('hidden');
}

const FUEL_UPLOAD_FIELD_ALIASES = {
  truck_no: ['truckno', 'trucknumber', 'truck', 'equipment', 'vehicleno', 'vehicle'],
  date: ['date', 'entrydate', 'entrydt', 'month'],
  total_trips: ['totaltrips', 'trips', 'tripcount', 'nooftrips'],
  total_kms: ['totalkms', 'totalkm', 'kms', 'km', 'runningkms', 'distance'],
  total_fuel_consumed: ['totalfuelconsumed', 'fuelconsumed', 'dieselconsumed', 'diesel', 'hsd', 'totalfuel'],
  total_production: ['totalproduction', 'production', 'volbcm', 'volume', 'vol']
};

async function handleFuelFileSelection(event) {
  const fileInput = event.target;
  const file = fileInput?.files?.[0];
  if (!file) {
    return;
  }

  try {
    const rawRows = await parseFuelUploadFile(file);
    validateFuelUploadHeaders(rawRows);

    const { rows: normalizedRows, skippedErrors } = normalizeFuelUploadRows(rawRows);
    if (normalizedRows.length === 0) {
      const firstReason = skippedErrors[0] || 'No valid data rows found.';
      throw new Error(`No rows imported. ${firstReason}`);
    }

    state.fuelRows = await appendFuelRows(state.session.siteId, normalizedRows, state.session.userId);
    state.analytics = buildAnalyticsSnapshot({
      tyreRecords: state.tyreRecords,
      fuelRows: state.fuelRows,
      targets: state.targets,
      pressureEvents: state.pressureEvents
    });

    renderTopStrip();
    renderFuelRows();
    renderAnalytics();
    renderSavings();

    const skipped = skippedErrors.length;
    toast(
      skipped > 0
        ? `Imported ${normalizedRows.length} rows. Skipped ${skipped} invalid rows.`
        : `Imported ${normalizedRows.length} fuel rows successfully.`,
      skipped > 0 ? 'info' : 'success'
    );

    if (skipped > 0) {
      console.warn('Fuel upload skipped rows:', skippedErrors.slice(0, 25));
    }
  } catch (error) {
    console.error('Fuel upload failed:', error);
    toast(error?.message || 'Fuel upload failed.', 'error');
  } finally {
    if (fileInput) {
      fileInput.value = '';
    }
  }
}

async function parseFuelUploadFile(file) {
  const extension = String(file?.name || '').split('.').pop()?.toLowerCase();
  if (!['csv', 'xlsx', 'xls'].includes(extension)) {
    throw new Error('Unsupported file type. Upload CSV or Excel (.xlsx/.xls).');
  }

  const XLSX = globalThis?.XLSX;
  if (!XLSX?.read || !XLSX?.utils?.sheet_to_json) {
    throw new Error('Spreadsheet parser not available. Refresh and try again.');
  }

  const fileBuffer = await file.arrayBuffer();
  let workbook;
  try {
    workbook = XLSX.read(fileBuffer, { type: 'array', cellDates: true });
  } catch {
    throw new Error('Could not read this file. Please use a valid CSV/Excel template.');
  }

  const sheetName = workbook?.SheetNames?.[0];
  if (!sheetName) {
    throw new Error('Uploaded file has no data sheet.');
  }

  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    defval: '',
    raw: true
  });

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('No data rows found in uploaded file.');
  }

  return rows;
}

function validateFuelUploadHeaders(rawRows) {
  const firstRow = rawRows[0] || {};
  const normalizedHeaders = new Set(
    Object.keys(firstRow)
      .map((header) => normalizeUploadHeader(header))
      .filter(Boolean)
  );

  const missingRequired = ['truck_no', 'date'].filter((field) => {
    const aliases = FUEL_UPLOAD_FIELD_ALIASES[field] || [];
    return !aliases.some((alias) => normalizedHeaders.has(alias));
  });

  if (missingRequired.length > 0) {
    throw new Error('Template mismatch. Required columns: Truck No, Date, Total Trips, Total KMs, Total Fuel Consumed, Total Production (optional).');
  }
}

function normalizeFuelUploadRows(rawRows) {
  const normalizedRows = [];
  const skippedErrors = [];

  rawRows.forEach((row, index) => {
    const rowNumber = index + 2;
    const mapped = mapFuelUploadRow(row, rowNumber);
    if (mapped.error) {
      skippedErrors.push(mapped.error);
      return;
    }
    normalizedRows.push(mapped.row);
  });

  return {
    rows: normalizedRows,
    skippedErrors
  };
}

function mapFuelUploadRow(rawRow, rowNumber) {
  const normalizedEntryMap = new Map(
    Object.entries(rawRow || {}).map(([key, value]) => [normalizeUploadHeader(key), value])
  );

  const take = (fieldKey) => {
    const aliases = FUEL_UPLOAD_FIELD_ALIASES[fieldKey] || [];
    for (const alias of aliases) {
      if (normalizedEntryMap.has(alias)) {
        return normalizedEntryMap.get(alias);
      }
    }
    return '';
  };

  const truckNo = String(take('truck_no') || '').trim().toUpperCase();
  const date = normalizeUploadDate(take('date'));

  if (!truckNo) {
    return { error: `Row ${rowNumber}: Truck No is missing.` };
  }

  if (!date) {
    return { error: `Row ${rowNumber}: Date is missing or invalid.` };
  }

  return {
    row: {
      truck_no: truckNo,
      date,
      total_trips: toUploadNumber(take('total_trips')),
      total_kms: toUploadNumber(take('total_kms')),
      total_fuel_consumed: toUploadNumber(take('total_fuel_consumed')),
      total_production: toUploadNumber(take('total_production'))
    }
  };
}

function normalizeUploadHeader(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function toUploadNumber(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const cleaned = String(value)
    .replace(/,/g, '')
    .replace(/%/g, '')
    .trim();

  if (!cleaned || cleaned === '-') {
    return 0;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeUploadDate(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toIsoDate(value);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const fromSerial = excelSerialToDate(value);
    if (fromSerial) {
      return fromSerial;
    }
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const yFirst = raw.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (yFirst) {
    const y = Number(yFirst[1]);
    const m = Number(yFirst[2]);
    const d = Number(yFirst[3]);
    if (isValidDateParts(y, m, d)) {
      return `${y}-${pad2(m)}-${pad2(d)}`;
    }
  }

  const dFirst = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (dFirst) {
    const d = Number(dFirst[1]);
    const m = Number(dFirst[2]);
    const y = Number(dFirst[3]);
    if (isValidDateParts(y, m, d)) {
      return `${y}-${pad2(m)}-${pad2(d)}`;
    }
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return toIsoDate(parsed);
  }

  return null;
}

function excelSerialToDate(serial) {
  const XLSX = globalThis?.XLSX;
  if (!XLSX?.SSF?.parse_date_code) {
    return null;
  }

  const parsed = XLSX.SSF.parse_date_code(serial);
  if (!parsed || !parsed.y || !parsed.m || !parsed.d) {
    return null;
  }

  if (!isValidDateParts(parsed.y, parsed.m, parsed.d)) {
    return null;
  }

  return `${parsed.y}-${pad2(parsed.m)}-${pad2(parsed.d)}`;
}

function isValidDateParts(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }

  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === (month - 1)
    && date.getUTCDate() === day;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function getAnalyticsLifeRows() {
  return (state.analytics?.sectionA || [])
    .filter((row) => Number(row.actual_life || 0) > 0)
    .sort((a, b) => Number(a.variance || 0) - Number(b.variance || 0));
}

function getAnalyticsRubberRows() {
  return [...(state.analytics?.sectionB || [])]
    .sort((a, b) => Number(b.rubber_wasted_pct || 0) - Number(a.rubber_wasted_pct || 0));
}

function getAnalyticsPressureRows(showDailyPressure) {
  const sourceRows = showDailyPressure
    ? (state.analytics?.sectionPressureDaily || [])
    : (state.analytics?.sectionPressureTyres || []);

  return [...sourceRows].sort((a, b) => {
    if (showDailyPressure) {
      const byDate = String(b.metric_date || '').localeCompare(String(a.metric_date || ''));
      if (byDate !== 0) return byDate;
      return Number(b.total_loss_inr || 0) - Number(a.total_loss_inr || 0);
    }

    const byMtd = Number(b.mtd_loss_inr || 0) - Number(a.mtd_loss_inr || 0);
    if (byMtd !== 0) return byMtd;
    return Number(b.total_loss_inr || 0) - Number(a.total_loss_inr || 0);
  });
}

/* ═══════════════════════════════════════════════════════════
   CHART INFRASTRUCTURE — Ported from V1
   ═══════════════════════════════════════════════════════════ */

function configureChartDefaults() {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.color = '#94a3b8';
  Chart.defaults.borderColor = '#2d3748';
  Chart.defaults.font.family = 'Work Sans, sans-serif';
}

function baseChartOptions({ stackedX = false, stackedY = false, yTitle = '', xTitle = '', yMax = null } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top' }
    },
    scales: {
      x: {
        stacked: stackedX,
        title: xTitle ? { display: true, text: xTitle } : undefined,
        grid: { color: 'rgba(45, 55, 72, 0.5)' }
      },
      y: {
        stacked: stackedY,
        beginAtZero: true,
        max: yMax,
        title: yTitle ? { display: true, text: yTitle } : undefined,
        grid: { color: 'rgba(45, 55, 72, 0.5)' }
      }
    }
  };
}

function createChart(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return;
  restoreChartCanvas(canvasId);
  destroyChart(canvasId);
  configureChartDefaults();
  chartInstances[canvasId] = new Chart(canvas, config);
}

function destroyChart(key) {
  if (chartInstances[key]) {
    chartInstances[key].destroy();
    delete chartInstances[key];
  }
}

function destroyAllCharts() {
  Object.keys(chartInstances).forEach((key) => destroyChart(key));
}

function showMissingChart(canvasId, message) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  destroyChart(canvasId);
  canvas.style.display = 'none';
  const card = canvas.parentElement;
  if (!card) return;
  let empty = card.querySelector(`[data-empty-for="${canvasId}"]`);
  if (!empty) {
    empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.dataset.emptyFor = canvasId;
    card.appendChild(empty);
  }
  empty.textContent = message;
  empty.style.display = '';
}

function restoreChartCanvas(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  canvas.style.display = '';
  const card = canvas.parentElement;
  const empty = card?.querySelector(`[data-empty-for="${canvasId}"]`);
  if (empty) empty.style.display = 'none';
}

/* ═══════════════════════════════════════════════════════════
   HELPER FUNCTIONS — Ported from V1
   ═══════════════════════════════════════════════════════════ */

function avg(values) {
  const list = (values || []).filter((value) => Number.isFinite(Number(value)));
  if (list.length === 0) return 0;
  return list.reduce((sum, value) => sum + Number(value), 0) / list.length;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatMonthLabel(monthKey) {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return monthKey || '-';
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function filterRowsByGraphWindow(rows, getDateValue) {
  const months = Number(state.analyticsGraphWindowMonths || 12) === 24 ? 24 : 12;
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  const startIso = toIsoDate(start);
  const endIso = toIsoDate(now);

  return (rows || []).filter((row) => {
    const date = formatDateOnly(getDateValue(row));
    if (!date || date === '-') return false;
    return date >= startIso && date <= endIso;
  });
}

function sortMonthBucketMap(map) {
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, value]) => value);
}

function createLabeledBuckets(labels, seed = { good: 0, fast: 0 }) {
  return labels.reduce((acc, label) => {
    acc[label] = { label, ...JSON.parse(JSON.stringify(seed)) };
    return acc;
  }, {});
}

function resolveLifeBracket(value) {
  if (value <= 25) return '0-25%';
  if (value <= 50) return '26-50%';
  if (value <= 75) return '51-75%';
  if (value <= 100) return '76-100%';
  return '>100%';
}

function resolveCurrentRtd(tyreRecord) {
  if (!tyreRecord) return null;
  const values = [Number(tyreRecord.current_rtd1), Number(tyreRecord.current_rtd2)].filter(Number.isFinite);
  if (values.length === 0) return null;
  return avg(values);
}

function resolveOriginalRtd(tyreRecord) {
  if (!tyreRecord) return null;
  const otd = Number(tyreRecord.otd);
  if (Number.isFinite(otd) && otd > 0) return otd;
  const initial = Number(tyreRecord.initial_rtd_derived);
  return Number.isFinite(initial) && initial > 0 ? initial : null;
}

/* ═══════════════════════════════════════════════════════════
   DATA AGGREGATION — Ported from V1
   ═══════════════════════════════════════════════════════════ */

function getTyreLifeDataRows() {
  return [...(state.analytics?.sectionA || [])]
    .filter((row) => Number(row.actual_life || 0) > 0)
    .sort((a, b) => Number(a.variance || 0) - Number(b.variance || 0));
}

function getRubberDataRows() {
  const lifeMap = new Map(getTyreLifeDataRows().map((row) => [normalize(row.tyre_no), row]));
  return [...(state.analytics?.sectionB || [])]
    .map((row) => ({
      ...row,
      removal_date: lifeMap.get(normalize(row.tyre_no))?.removal_date || '-'
    }))
    .sort((a, b) => Number(b.rubber_wasted_pct || 0) - Number(a.rubber_wasted_pct || 0));
}

function getRunningTyrePerformanceRows() {
  const runningTyres = new Map();
  (state.tyreRecords || []).forEach((row) => {
    const tyreNo = normalize(row.tyre_no);
    if (!tyreNo || normalize(row.status) !== 'RUNNING') return;
    if (!runningTyres.has(tyreNo)) {
      runningTyres.set(tyreNo, row);
    }
  });

  return Array.from(runningTyres.values())
    .map((tyreRecord) => {
      const currentRtd = resolveCurrentRtd(tyreRecord);
      const originalRtd = resolveOriginalRtd(tyreRecord);
      const actualLife = Number(tyreRecord.total_life_run || 0);
      const targetLife = Math.max(1, Number(state.targets.targetTyreLife || 0));
      const lifePct = (actualLife / targetLife) * 100;
      const rubberConsumed = Number.isFinite(originalRtd) && Number.isFinite(currentRtd)
        ? Math.max(0, originalRtd - currentRtd)
        : null;
      const wearPct = Number.isFinite(originalRtd) && originalRtd > 0 && Number.isFinite(currentRtd)
        ? clamp(((originalRtd - currentRtd) / originalRtd) * 100, 0, 100)
        : 0;
      const kmPerMm = Number.isFinite(rubberConsumed) && rubberConsumed > 0
        ? actualLife / rubberConsumed
        : 0;
      const predictedTotalLife = Number.isFinite(rubberConsumed) && rubberConsumed > 0 && Number.isFinite(originalRtd)
        ? (actualLife / rubberConsumed) * originalRtd
        : null;
      const expectedRemainingPct = Math.max(0, 1 - (lifePct / 100));
      const actualRemainingPct = Number.isFinite(originalRtd) && originalRtd > 0 && Number.isFinite(currentRtd)
        ? clamp(currentRtd / originalRtd, 0, 1)
        : 0;
      const goodWear = actualRemainingPct >= (expectedRemainingPct * 0.9);
      const hasWearSignal = Number.isFinite(originalRtd) && originalRtd > 0 && Number.isFinite(currentRtd);
      const isOnTrack = Number.isFinite(predictedTotalLife)
        ? predictedTotalLife >= targetLife
        : (hasWearSignal ? goodWear : false);

      return {
        tyreNo: tyreRecord.tyre_no,
        brand: tyreRecord.make || 'Unknown',
        actualLife,
        targetLife,
        lifePct,
        rubberConsumed,
        kmPerMm,
        predictedTotalLife,
        isOnTrack,
        goodWear,
        wearPct
      };
    })
    .filter((row) => Number.isFinite(row.actualLife) && row.actualLife > 0 && (Number.isFinite(row.predictedTotalLife) || Number.isFinite(row.rubberConsumed)));
}

function getTyreLifeScrapMonthlyRows() {
  const map = new Map();
  filterRowsByGraphWindow(
    getTyreLifeDataRows().filter((row) => row.removal_date && row.removal_date !== '-'),
    (row) => row.removal_date
  )
    .forEach((row) => {
      const date = formatDateOnly(row.removal_date);
      if (!date || date === '-') return;
      const monthKey = date.slice(0, 7);
      if (!map.has(monthKey)) {
        map.set(monthKey, { label: formatMonthLabel(monthKey), total: 0, aboveTarget: 0, belowTarget: 0 });
      }
      const bucket = map.get(monthKey);
      bucket.total += 1;
      if (Number(row.actual_life || 0) >= Number(row.target_life || 0)) {
        bucket.aboveTarget += 1;
      } else {
        bucket.belowTarget += 1;
      }
    });

  return sortMonthBucketMap(map);
}

function getRunningStatusBucketRows() {
  const buckets = createLabeledBuckets(['0-25%', '26-50%', '51-75%', '76-100%', '>100%']);

  getRunningTyrePerformanceRows().forEach((row) => {
    const bucket = resolveLifeBracket(row.lifePct);
    buckets[bucket].good += row.goodWear ? 1 : 0;
    buckets[bucket].fast += row.goodWear ? 0 : 1;
  });

  return Object.values(buckets);
}

function getTyreForecastRows() {
  const dailyKm = Math.max(1, Number(state.targets.pressureDailyKm || 250));
  const targetLife = Math.max(1, Number(state.targets.targetTyreLife || 0));
  const map = new Map();

  getRunningTyrePerformanceRows().forEach((row) => {
    const remainingLife = Math.max(0, targetLife - row.actualLife);
    const forecastDate = new Date();
    const maxForecastMonths = 12;
    const maxForecastDate = new Date();
    maxForecastDate.setMonth(maxForecastDate.getMonth() + maxForecastMonths);
    forecastDate.setDate(forecastDate.getDate() + Math.ceil(remainingLife / dailyKm));
    if (forecastDate > maxForecastDate) {
      forecastDate.setTime(maxForecastDate.getTime());
    }
    const monthKey = toIsoDate(forecastDate).slice(0, 7);
    if (!map.has(monthKey)) {
      map.set(monthKey, { label: formatMonthLabel(monthKey), count: 0 });
    }
    map.get(monthKey).count += 1;
  });

  return sortMonthBucketMap(map);
}

function getRubberMonthlyRows() {
  const map = new Map();
  filterRowsByGraphWindow(getRubberDataRows(), (row) => row.removal_date).forEach((row) => {
    const date = formatDateOnly(row.removal_date);
    if (!date || date === '-') return;
    const monthKey = date.slice(0, 7);
    if (!map.has(monthKey)) {
      map.set(monthKey, { label: formatMonthLabel(monthKey), usedTotal: 0, wastedTotal: 0, count: 0 });
    }
    const bucket = map.get(monthKey);
    bucket.usedTotal += Number(row.rubber_used_pct || 0);
    bucket.wastedTotal += Number(row.rubber_wasted_pct || 0);
    bucket.count += 1;
  });

  return sortMonthBucketMap(map).map((row) => ({
    label: row.label,
    used: row.count > 0 ? row.usedTotal / row.count : 0,
    wasted: row.count > 0 ? row.wastedTotal / row.count : 0
  }));
}

function getRubberPotentialDataset() {
  const points = getRunningTyrePerformanceRows()
    .filter((row) => Number.isFinite(row.rubberConsumed) && row.rubberConsumed > 0)
    .map((row) => ({
      tyre_no: row.tyreNo,
      brand: row.brand,
      x: row.actualLife,
      y: row.rubberConsumed,
      kmPerMm: row.kmPerMm
    }));

  if (points.length === 0) {
    return { points: [], thresholdLine: [] };
  }

  const sortedPerformance = points.map((row) => row.kmPerMm).filter(Number.isFinite).sort((a, b) => b - a);
  const topCount = Math.max(1, Math.ceil(sortedPerformance.length * 0.1));
  const thresholdKmPerMm = avg(sortedPerformance.slice(0, topCount));
  const maxX = Math.max(...points.map((row) => row.x), 1);
  const classifiedPoints = points.map((row) => {
    const thresholdY = thresholdKmPerMm > 0 ? row.x / thresholdKmPerMm : 0;
    return {
      ...row,
      thresholdY,
      deltaMm: row.y - thresholdY,
      health: row.y <= thresholdY ? 'at_or_better' : 'above_consumption'
    };
  });

  const thresholdLine = [
    { x: 0, y: 0 },
    { x: maxX, y: thresholdKmPerMm > 0 ? maxX / thresholdKmPerMm : 0 }
  ];

  return { points: classifiedPoints, thresholdLine, thresholdKmPerMm };
}

function getBrandScrapRows() {
  const groups = new Map();
  filterRowsByGraphWindow(
    getTyreLifeDataRows().filter((row) => row.removal_date && row.removal_date !== '-'),
    (row) => row.removal_date
  )
    .forEach((row) => {
      const brand = row.brand || 'Unknown';
      if (!groups.has(brand)) {
        groups.set(brand, { brand, count: 0, totalLife: 0 });
      }
      const bucket = groups.get(brand);
      bucket.count += 1;
      bucket.totalLife += Number(row.actual_life || 0);
    });

  return Array.from(groups.values())
    .map((row) => ({
      brand: row.brand,
      scrapCount: row.count,
      avgLife: row.count > 0 ? row.totalLife / row.count : 0,
      targetLife: Number(state.targets.targetTyreLife || 0)
    }))
    .sort((a, b) => a.brand.localeCompare(b.brand));
}

function getBrandRunningRows() {
  const groups = new Map();
  getRunningTyrePerformanceRows().forEach((row) => {
    const brand = row.brand || 'Unknown';
    if (!groups.has(brand)) {
      groups.set(brand, { brand, green: 0, red: 0 });
    }
    const bucket = groups.get(brand);
    if (row.isOnTrack) {
      bucket.green += 1;
    } else {
      bucket.red += 1;
    }
  });

  return Array.from(groups.values())
    .map((row) => {
      const total = row.green + row.red;
      return {
        brand: row.brand,
        totalTyres: total,
        greenCount: row.green,
        redCount: row.red,
        greenPct: total > 0 ? (row.green / total) * 100 : 0,
        redPct: total > 0 ? (row.red / total) * 100 : 0
      };
    })
    .sort((a, b) => a.brand.localeCompare(b.brand));
}

function getBrandScrapBarColors(brand, index) {
  const brandKey = normalize(brand);
  if (brandKey === 'MRF') {
    return {
      backgroundColor: 'rgba(16, 185, 129, 0.72)',
      borderColor: '#10b981'
    };
  }

  const palette = [
    { backgroundColor: 'rgba(59, 130, 246, 0.72)', borderColor: '#3b82f6' },
    { backgroundColor: 'rgba(249, 115, 22, 0.72)', borderColor: '#f97316' },
    { backgroundColor: 'rgba(168, 85, 247, 0.72)', borderColor: '#a855f7' },
    { backgroundColor: 'rgba(14, 165, 233, 0.72)', borderColor: '#0ea5e9' },
    { backgroundColor: 'rgba(236, 72, 153, 0.72)', borderColor: '#ec4899' },
    { backgroundColor: 'rgba(245, 158, 11, 0.72)', borderColor: '#f59e0b' },
    { backgroundColor: 'rgba(20, 184, 166, 0.72)', borderColor: '#14b8a6' }
  ];

  return palette[index % palette.length];
}

function getPressureIncidentRows() {
  const basePsi = Number(state.targets.pressureBasePsi || 120);
  const map = new Map();

  filterRowsByGraphWindow(
    state.pressureEvents || [],
    (row) => row.checked_date || row.metric_date || row.activity_date
  ).forEach((row) => {
    const date = formatDateOnly(row.checked_date || row.metric_date || row.activity_date);
    if (!date || date === '-') return;
    const foundPsi = Number(row.found_psi ?? row.psi_found ?? row.corrected_psi ?? row.psi_corrected);
    if (!Number.isFinite(foundPsi)) return;

    const tyreKey = normalize(row.tyre_serial || row.tyre_no || row.id);
    if (!tyreKey) return;

    const monthKey = date.slice(0, 7);
    if (!map.has(monthKey)) {
      map.set(monthKey, {
        label: formatMonthLabel(monthKey),
        inspectedTyres: new Set(),
        underInflatedTyres: new Set(),
        psiDropTotal: 0,
        psiDropCount: 0,
        loss: 0
      });
    }
    const bucket = map.get(monthKey);
    bucket.inspectedTyres.add(tyreKey);
    if (Number.isFinite(foundPsi) && foundPsi < basePsi) {
      bucket.underInflatedTyres.add(tyreKey);
    }
  });

  filterRowsByGraphWindow(
    state.analytics?.sectionPressureDaily || [],
    (row) => row.metric_date
  ).forEach((row) => {
    const date = formatDateOnly(row.metric_date);
    if (!date || date === '-') return;
    const monthKey = date.slice(0, 7);
    if (!map.has(monthKey)) {
      map.set(monthKey, {
        label: formatMonthLabel(monthKey),
        inspectedTyres: new Set(),
        underInflatedTyres: new Set(),
        psiDropTotal: 0,
        psiDropCount: 0,
        loss: 0
      });
    }
    const bucket = map.get(monthKey);
    bucket.psiDropTotal += Number(row.psi_drop_per_day || 0);
    bucket.psiDropCount += 1;
    bucket.loss += Number(row.total_loss_inr || 0);
  });

  return sortMonthBucketMap(map).map((row) => ({
    label: row.label,
    inspected: row.inspectedTyres.size,
    underInflated: row.underInflatedTyres.size,
    avgPsiDrop: row.psiDropCount > 0 ? row.psiDropTotal / row.psiDropCount : 0,
    loss: row.loss
  }));
}

function getPressureWearRows() {
  const buckets = createLabeledBuckets(['0-30%', '31-60%', '61-80%', '81-100%'], { avgPsiDrop: 0, count: 0 });
  const pressureMap = new Map((state.analytics?.sectionPressureTyres || []).map((row) => [normalize(row.tyre_no), row]));

  getRunningTyrePerformanceRows().forEach((row) => {
    const pressure = pressureMap.get(normalize(row.tyreNo));
    const wearPct = row.wearPct;
    const bucketKey = wearPct <= 30 ? '0-30%'
      : wearPct <= 60 ? '31-60%'
      : wearPct <= 80 ? '61-80%'
      : '81-100%';

    buckets[bucketKey].avgPsiDrop += Number(pressure?.estimated_daily_psi_drop || 0);
    buckets[bucketKey].count += 1;
  });

  return Object.values(buckets).map((row) => ({
    label: row.label,
    avgPsiDrop: row.count > 0 ? row.avgPsiDrop / row.count : 0
  }));
}

function getTyreLifeScrapOverviewStats() {
  const scrapped = filterRowsByGraphWindow(
    getTyreLifeDataRows().filter((row) => row.removal_date && row.removal_date !== '-'),
    (row) => row.removal_date
  );

  return {
    totalScrapped: scrapped.length,
    avgScrapLife: scrapped.length > 0
      ? avg(scrapped.map((row) => Number(row.actual_life || 0)))
      : 0
  };
}

/* ═══════════════════════════════════════════════════════════
   CHART RENDER FUNCTIONS — 9 Charts Ported from V1
   ═══════════════════════════════════════════════════════════ */

function renderTyreLifeScrapChart() {
  const rows = getTyreLifeScrapMonthlyRows();
  if (!rows.length) {
    showMissingChart('chartTyreLifeScrap', 'No scrap-life rows are available yet.');
    return;
  }

  createChart('chartTyreLifeScrap', {
    type: 'bar',
    data: {
      labels: rows.map((row) => row.label),
      datasets: [
        {
          label: 'Total Tyres Scrapped',
          data: rows.map((row) => row.total),
          backgroundColor: 'rgba(59, 130, 246, 0.24)',
          borderColor: '#3b82f6',
          borderWidth: 1,
          stack: 'total'
        },
        {
          label: 'Above Target',
          data: rows.map((row) => row.aboveTarget),
          backgroundColor: 'rgba(16, 185, 129, 0.75)',
          borderColor: '#10b981',
          borderWidth: 1,
          stack: 'status'
        },
        {
          label: 'Below Target',
          data: rows.map((row) => row.belowTarget),
          backgroundColor: 'rgba(239, 68, 68, 0.75)',
          borderColor: '#ef4444',
          borderWidth: 1,
          stack: 'status'
        }
      ]
    },
    options: baseChartOptions({
      stackedX: false,
      stackedY: true,
      yTitle: 'Number of Tyres Scrapped'
    })
  });
}

function renderRunningStatusChart() {
  const rows = getRunningStatusBucketRows();
  if (!rows.length) {
    showMissingChart('chartTyreLifeRunning', 'No running-tyre status rows are available yet.');
    return;
  }

  createChart('chartTyreLifeRunning', {
    type: 'bar',
    data: {
      labels: rows.map((row) => row.label),
      datasets: [
        {
          label: 'Good Wear Rate',
          data: rows.map((row) => row.good),
          backgroundColor: 'rgba(16, 185, 129, 0.75)',
          borderColor: '#10b981',
          borderWidth: 1,
          stack: 'health'
        },
        {
          label: 'Fast Wear Rate',
          data: rows.map((row) => row.fast),
          backgroundColor: 'rgba(239, 68, 68, 0.75)',
          borderColor: '#ef4444',
          borderWidth: 1,
          stack: 'health'
        }
      ]
    },
    options: baseChartOptions({
      stackedX: true,
      stackedY: true,
      yTitle: 'Number of Active Tyres'
    })
  });
}

function renderTyreForecastChart() {
  const rows = getTyreForecastRows();
  if (!rows.length) {
    showMissingChart('chartTyreLifeForecast', 'No running tyres are available for forecast projection.');
    return;
  }

  createChart('chartTyreLifeForecast', {
    type: 'bar',
    data: {
      labels: rows.map((row) => row.label),
      datasets: [
        {
          label: 'Projected Number of Tyres',
          data: rows.map((row) => row.count),
          backgroundColor: 'rgba(59, 130, 246, 0.68)',
          borderColor: '#3b82f6',
          borderWidth: 1
        }
      ]
    },
    options: baseChartOptions({
      yTitle: 'Projected Number of Tyres'
    })
  });
}

function renderRubberMonthlyChart() {
  const rows = getRubberMonthlyRows();
  if (!rows.length) {
    showMissingChart('chartRubberMonthly', 'No scrap rubber-utilization rows are available yet.');
    return;
  }

  createChart('chartRubberMonthly', {
    type: 'bar',
    data: {
      labels: rows.map((row) => row.label),
      datasets: [
        {
          label: 'Avg Rubber Used %',
          data: rows.map((row) => row.used),
          backgroundColor: 'rgba(16, 185, 129, 0.75)',
          borderColor: '#10b981',
          borderWidth: 1,
          stack: 'rubber'
        },
        {
          label: 'Avg Rubber Wasted %',
          data: rows.map((row) => row.wasted),
          backgroundColor: 'rgba(239, 68, 68, 0.75)',
          borderColor: '#ef4444',
          borderWidth: 1,
          stack: 'rubber'
        }
      ]
    },
    options: baseChartOptions({
      stackedX: true,
      stackedY: true,
      yMax: 100,
      yTitle: 'Average Percentage'
    })
  });
}

function renderRubberPotentialChart() {
  const result = getRubberPotentialDataset();
  if (!result.points.length) {
    showMissingChart('chartRubberPotential', 'No active tyres with usable RTD and life data are available.');
    return;
  }

  createChart('chartRubberPotential', {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'At/Better Than Threshold',
          data: result.points.filter((point) => point.health === 'at_or_better').map((point) => ({ x: point.x, y: point.y })),
          backgroundColor: 'rgba(16, 185, 129, 0.75)',
          borderColor: '#10b981',
          pointRadius: 5
        },
        {
          label: 'Above Threshold Consumption',
          data: result.points.filter((point) => point.health === 'above_consumption').map((point) => ({ x: point.x, y: point.y })),
          backgroundColor: 'rgba(239, 68, 68, 0.78)',
          borderColor: '#ef4444',
          pointRadius: 5
        },
        {
          label: 'Threshold Line',
          data: result.thresholdLine,
          type: 'line',
          borderColor: '#8b5cf6',
          borderDash: [6, 4],
          pointRadius: 0,
          tension: 0,
          fill: false
        }
      ]
    },
    options: {
      ...baseChartOptions({ yTitle: 'Rubber Consumed (mm)', xTitle: 'Distance Run (Actual Life in KM/HMR)' }),
      plugins: {
        legend: {
          position: 'top'
        },
        tooltip: {
          callbacks: {
            afterBody(context) {
              const point = result.points.find((entry) => entry.x === context[0]?.parsed?.x && entry.y === context[0]?.parsed?.y);
              if (!point) return '';
              const thresholdValue = Number.isFinite(point.thresholdY) ? formatNumber(point.thresholdY) : '-';
              const deltaValue = Number.isFinite(point.deltaMm) ? formatNumber(point.deltaMm) : '-';
              return [
                `Tyre: ${point.tyre_no}`,
                `Brand: ${point.brand}`,
                `Threshold Rubber @ same distance: ${thresholdValue} mm`,
                `Difference (Actual - Threshold): ${deltaValue} mm`,
                `Status: ${point.health === 'at_or_better' ? 'At/Better Than Threshold' : 'Above Threshold Consumption'}`
              ];
            }
          }
        }
      }
    }
  });
}

function renderBrandScrapChart() {
  const rows = getBrandScrapRows();
  if (!rows.length) {
    renderBrandScrapSummary([]);
    showMissingChart('chartBrandScrap', 'No scrapped-brand rows are available yet.');
    return;
  }

  renderBrandScrapSummary(rows);
  const brandColors = rows.map((row, index) => getBrandScrapBarColors(row.brand, index));

  createChart('chartBrandScrap', {
    type: 'bar',
    data: {
      labels: rows.map((row) => row.brand),
      datasets: [
        {
          label: 'Life Achieved',
          data: rows.map((row) => row.avgLife),
          backgroundColor: brandColors.map((row) => row.backgroundColor),
          borderColor: brandColors.map((row) => row.borderColor),
          borderWidth: 1
        },
        {
          label: 'Target Life',
          data: rows.map((row) => row.targetLife),
          type: 'line',
          borderColor: '#10b981',
          borderWidth: 2,
          pointRadius: 3,
          fill: false,
          tension: 0
        }
      ]
    },
    options: {
      ...baseChartOptions({ yTitle: 'Life Achieved (KM/HMR)' }),
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            filter(item) {
              return item.text === 'Target Life';
            }
          }
        },
        tooltip: {
          displayColors: false,
          padding: 12,
          titleFont: {
            size: 13,
            weight: '700'
          },
          bodyFont: {
            size: 12,
            weight: '600'
          },
          bodySpacing: 5,
          caretPadding: 8,
          callbacks: {
            title(context) {
              const row = rows[context[0]?.dataIndex ?? -1];
              if (!row) return context[0]?.label || 'Brand';
              return `${row.brand} | Scrap: ${formatWholeNumber(row.scrapCount)}`;
            },
            label(context) {
              if (context.datasetIndex !== 0) return null;
              const row = rows[context.dataIndex];
              if (!row) return null;
              const gap = row.avgLife - row.targetLife;
              const gapText = `${gap >= 0 ? '+' : ''}${formatWholeNumber(gap)}`;
              return [
                `Achieved: ${formatWholeNumber(row.avgLife)}`,
                `Target: ${formatWholeNumber(row.targetLife)}`,
                `Gap: ${gapText}`
              ];
            }
          }
        }
      }
    }
  });
}

function renderBrandRunningChart() {
  const rows = getBrandRunningRows();
  if (!rows.length) {
    showMissingChart('chartBrandRunning', 'No active brand-health rows are available yet.');
    return;
  }

  createChart('chartBrandRunning', {
    type: 'bar',
    data: {
      labels: rows.map((row) => row.brand),
      datasets: [
        {
          label: 'Projecting to Hit Target',
          data: rows.map((row) => row.greenPct),
          backgroundColor: 'rgba(16, 185, 129, 0.76)',
          borderColor: '#10b981',
          borderWidth: 1,
          stack: 'brandHealth'
        },
        {
          label: 'Projecting to Fail Early',
          data: rows.map((row) => row.redPct),
          backgroundColor: 'rgba(239, 68, 68, 0.78)',
          borderColor: '#ef4444',
          borderWidth: 1,
          stack: 'brandHealth'
        }
      ]
    },
    options: {
      ...baseChartOptions({ stackedX: true, stackedY: true, yMax: 100, yTitle: 'Percentage of Active Tyres' }),
      plugins: {
        legend: {
          position: 'top'
        },
        tooltip: {
          callbacks: {
            label(context) {
              return `${context.dataset.label}: ${formatWholeNumber(context.parsed.y)}%`;
            },
            afterBody(context) {
              const brand = context[0]?.label;
              const row = rows.find((entry) => entry.brand === brand);
              if (!row) return '';
              return [
                `Active tyres in brand: ${formatWholeNumber(row.totalTyres)}`,
                `Hit target: ${formatWholeNumber(row.greenCount)}`,
                `Fail early: ${formatWholeNumber(row.redCount)}`
              ];
            }
          }
        }
      }
    }
  });
}

function renderBrandScrapSummary(rows) {
  const container = document.getElementById('brandScrapSummary');
  if (!container) return;

  if (!rows.length) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="chart-summary-title">Scrap Count and Avg Life by Brand</div>
    <div class="chart-summary-table-wrap">
      <table class="chart-summary-table">
        <thead>
          <tr>
            <th>Brand</th>
            <th>Scrap Tyres</th>
            <th>Avg Life Achieved</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${escapeHtml(row.brand)}</td>
              <td>${escapeHtml(formatWholeNumber(row.scrapCount))}</td>
              <td>${escapeHtml(formatWholeNumber(row.avgLife))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderPressureIncidentChart() {
  const rows = getPressureIncidentRows();
  if (!rows.length) {
    showMissingChart('chartPressureIncident', 'No pressure incident rows are available yet.');
    return;
  }

  createChart('chartPressureIncident', {
    data: {
      labels: rows.map((row) => row.label),
      datasets: [
        {
          type: 'bar',
          label: 'Unique Tyres Inspected',
          data: rows.map((row) => row.inspected),
          backgroundColor: 'rgba(59, 130, 246, 0.26)',
          borderColor: '#3b82f6',
          borderWidth: 1,
          yAxisID: 'yCount'
        },
        {
          type: 'bar',
          label: 'Unique Under-inflated Tyres',
          data: rows.map((row) => row.underInflated),
          backgroundColor: 'rgba(239, 68, 68, 0.74)',
          borderColor: '#ef4444',
          borderWidth: 1,
          yAxisID: 'yCount'
        },
        {
          type: 'line',
          label: 'Average PSI Drop / Day',
          data: rows.map((row) => row.avgPsiDrop),
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139, 92, 246, 0.14)',
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: false,
          tension: 0.28,
          yAxisID: 'yPsi'
        },
        {
          type: 'line',
          label: 'Financial Loss (INR)',
          data: rows.map((row) => row.loss),
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.15)',
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: true,
          tension: 0.3,
          yAxisID: 'yLoss'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top' }
      },
      scales: {
        x: {
          grid: { color: 'rgba(45, 55, 72, 0.5)' }
        },
        yCount: {
          position: 'left',
          beginAtZero: true,
          title: { display: true, text: 'Count (Number of Tyres)' },
          grid: { color: 'rgba(45, 55, 72, 0.5)' }
        },
        yPsi: {
          position: 'right',
          beginAtZero: true,
          title: { display: true, text: 'Average PSI Drop / Day' },
          grid: { drawOnChartArea: false }
        },
        yLoss: {
          position: 'right',
          beginAtZero: true,
          title: { display: true, text: 'Financial Value (INR)' },
          grid: { drawOnChartArea: false },
          offset: true
        }
      }
    }
  });
}

function renderPressureWearChart() {
  const rows = getPressureWearRows();
  if (!rows.length) {
    showMissingChart('chartPressureWear', 'No wear-bracket pressure rows are available yet.');
    return;
  }

  createChart('chartPressureWear', {
    type: 'bar',
    data: {
      labels: rows.map((row) => row.label),
      datasets: [
        {
          label: 'Average PSI Drop / Day',
          data: rows.map((row) => row.avgPsiDrop),
          backgroundColor: 'rgba(59, 130, 246, 0.72)',
          borderColor: '#3b82f6',
          borderWidth: 1
        }
      ]
    },
    options: baseChartOptions({ yTitle: 'Average PSI Drop / Day' })
  });
}

/* ═══════════════════════════════════════════════════════════
   GRAPH WINDOW SELECTOR
   ═══════════════════════════════════════════════════════════ */

function bindGraphWindowSelector() {
  const selector = document.getElementById('analyticsWindowMonths');
  if (!selector) return;
  selector.addEventListener('change', () => {
    state.analyticsGraphWindowMonths = Number(selector.value) === 24 ? 24 : 12;
    renderAllCharts();
  });
}

function renderAllCharts() {
  destroyAllCharts();
  renderTyreLifeScrapChart();
  renderRunningStatusChart();
  renderTyreForecastChart();
  renderRubberMonthlyChart();
  renderRubberPotentialChart();
  renderBrandScrapChart();
  renderBrandRunningChart();
  renderPressureIncidentChart();
  renderPressureWearChart();
}

function renderAnalytics() {
  if (!state.analytics) {
    return;
  }

  // ── Section 0: Fleet Health Score ──
  renderFleetHealthScore();

  // ── Section A: Target vs Actual Tyre Life ──
  const lifeSorted = getAnalyticsLifeRows();
  const lifePaged = paginateRows(lifeSorted, state.analyticsPages.life, state.analyticsPageSizes.life);
  state.analyticsPages.life = lifePaged.page;
  renderTyreLifeTable(lifePaged.rows);
  renderPagerState({
    metaEl: elements.analyticsLifeMeta,
    pageEl: elements.analyticsLifePageInfo,
    prevEl: elements.analyticsLifePrev,
    nextEl: elements.analyticsLifeNext
  }, lifePaged, 'tyres');

  // ── Section B: Rubber Utilisation (Removed Tyres) ──
  const rubberSorted = getAnalyticsRubberRows();
  const rubberPaged = paginateRows(rubberSorted, state.analyticsPages.rubber, state.analyticsPageSizes.rubber);
  state.analyticsPages.rubber = rubberPaged.page;
  renderRubberTable(rubberPaged.rows);
  renderPagerState({
    metaEl: elements.analyticsRubberMeta,
    pageEl: elements.analyticsRubberPageInfo,
    prevEl: elements.analyticsRubberPrev,
    nextEl: elements.analyticsRubberNext
  }, rubberPaged, 'removed tyres');

  // ── Section C: Brand-wise Performance ──
  renderBrandPerformanceTable(state.analytics.sectionC || []);

  // ── Section D: Pressure Leakage (Table) ──
  const showDailyPressure = state.pressureViewMode === 'daily';
  const pressureSorted = getAnalyticsPressureRows(showDailyPressure);

  const pressurePaged = paginateRows(
    pressureSorted,
    state.analyticsPages.pressure,
    state.analyticsPageSizes.pressure
  );
  state.analyticsPages.pressure = pressurePaged.page;
  renderPressureTable(pressurePaged.rows, showDailyPressure);
  renderPagerState({
    metaEl: elements.analyticsPressureMeta,
    pageEl: elements.analyticsPressurePageInfo,
    prevEl: elements.analyticsPressurePrev,
    nextEl: elements.analyticsPressureNext
  }, pressurePaged, showDailyPressure ? 'daily pressure rows' : 'pressure summary rows');

  renderPressureKpis();
  elements.analyticsPressureModeSummary?.classList.toggle('active', !showDailyPressure);
  elements.analyticsPressureModeDaily?.classList.toggle('active', showDailyPressure);

  // ── Section E: Tyre Age Distribution ──
  renderTyreAgeDistribution();

  // ── Section F: Defect Trend by Position (90-day) ──
  renderDefectTrend();

  // ── Section G: Removal Reasons ──
  renderRemovalReasons();

  // ── Charts: Bind graph window selector and render all 9 charts ──
  bindGraphWindowSelector();
  renderAllCharts();
}

/* ═══════════════════════════════════════════════════════════
   NEW: Fleet Health Score (C5)
   ─ Composite 0-100 gauge with 5 sub-score breakdown
   ═══════════════════════════════════════════════════════════ */
function renderFleetHealthScore() {
  const container = elements.fleetHealthScore;
  if (!container) return;

  const hs = state.fleetHealth;
  if (!hs || hs.health_score === null) {
    container.innerHTML = '<div class="health-score-empty"><p class="hint">Fleet health data being computed. Check back after more inspection data is collected.</p></div>';
    return;
  }

  const score = Math.round(hs.health_score);
  const gaugeEl = elements.fleetHealthGauge;
  if (gaugeEl) {
    const color = score >= 70 ? 'var(--ok)' : score >= 40 ? 'var(--warn)' : 'var(--danger)';
    gaugeEl.style.setProperty('--health-pct', Math.min(score, 100) + '%');
    gaugeEl.style.setProperty('--health-color', color);
    gaugeEl.querySelector('.health-score-value').textContent = score;
    gaugeEl.querySelector('.health-score-label').textContent = score >= 70 ? 'Good' : score >= 40 ? 'Fair' : 'Critical';
  }

  const breakdownEl = elements.fleetHealthBreakdown;
  if (breakdownEl) {
    breakdownEl.innerHTML = `
      <div class="health-sub">
        <span class="health-sub-label">Pressure Compliance</span>
        <span class="health-sub-bar"><span style="width:${Math.min(hs.pressure_compliance_score / 30 * 100, 100)}%" class="bar-fill ok"></span></span>
        <span class="health-sub-value">${Math.round(hs.pressure_compliance_score)}/30</span>
      </div>
      <div class="health-sub">
        <span class="health-sub-label">Life Remaining</span>
        <span class="health-sub-bar"><span style="width:${Math.min(hs.life_remaining_score / 25 * 100, 100)}%" class="bar-fill info"></span></span>
        <span class="health-sub-value">${Math.round(hs.life_remaining_score)}/25</span>
      </div>
      <div class="health-sub">
        <span class="health-sub-label">Inspection Recency</span>
        <span class="health-sub-bar"><span style="width:${Math.min(hs.inspection_recency_score / 20 * 100, 100)}%" class="bar-fill ok"></span></span>
        <span class="health-sub-value">${Math.round(hs.inspection_recency_score)}/20</span>
      </div>
      <div class="health-sub">
        <span class="health-sub-label">Leakage Loss</span>
        <span class="health-sub-bar"><span style="width:${Math.min(hs.leakage_loss_score / 15 * 100, 100)}%" class="bar-fill warn"></span></span>
        <span class="health-sub-value">${Math.round(hs.leakage_loss_score)}/15</span>
      </div>
      <div class="health-sub">
        <span class="health-sub-label">Defect Rate</span>
        <span class="health-sub-bar"><span style="width:${Math.min(hs.defect_rate_score / 10 * 100, 100)}%" class="bar-fill info"></span></span>
        <span class="health-sub-value">${Math.round(hs.defect_rate_score)}/10</span>
      </div>
    `;
  }
}

/* ═══════════════════════════════════════════════════════════
   NEW: Date Range Filter (C9)
   ═══════════════════════════════════════════════════════════ */
function renderDateRangeFilter() {
  const presetEl = elements.analyticsDateRangePreset;
  const fromEl = elements.analyticsDateFrom;
  const toEl = elements.analyticsDateTo;
  if (!presetEl) return;

  const preset = state.dateRangePreset || 'all';
  presetEl.value = preset;

  if (preset === 'custom') {
    if (fromEl) fromEl.disabled = false;
    if (toEl) toEl.disabled = false;
  } else {
    if (fromEl) { fromEl.disabled = true; fromEl.value = ''; }
    if (toEl) { toEl.disabled = true; toEl.value = ''; }
    state.dateFrom = null;
    state.dateTo = null;
  }
}

function applyDateRange() {
  const presetEl = elements.analyticsDateRangePreset;
  if (!presetEl) return;

  state.dateRangePreset = presetEl.value;

  if (state.dateRangePreset === 'custom') {
    const fromEl = elements.analyticsDateFrom;
    const toEl = elements.analyticsDateTo;
    state.dateFrom = fromEl?.value || null;
    state.dateTo = toEl?.value || null;
  } else {
    state.dateFrom = null;
    state.dateTo = null;
  }

  invalidateDataCache();
  loadAll();
}

/* ═══════════════════════════════════════════════════════════
   NEW: Tyre Age Distribution (C6)
   ═══════════════════════════════════════════════════════════ */
function renderTyreAgeDistribution() {
  const tbody = elements.ageDistBody;
  if (!tbody) return;

  const rows = state.ageDistribution;
  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-cell">No fitment data available for age distribution.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.age_bucket}</td>
      <td>${r.tyre_count}</td>
      <td><span class="bar-inline"><span style="width:${Math.min(r.tyre_count / Math.max(...rows.map(x => x.tyre_count)) * 100, 100)}%" class="bar-fill info"></span></span></td>
    </tr>
  `).join('');
}

/* ═══════════════════════════════════════════════════════════
   NEW: Defect Trend by Position (C7)
   ═══════════════════════════════════════════════════════════ */
function renderDefectTrend() {
  const tbody = elements.defectTrendBody;
  if (!tbody) return;

  const rows = state.defectTrend;
  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">No defect data in the last 90 days.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const ratio = r.total_events_90d > 0 ? (r.defect_count_90d / r.total_events_90d * 100).toFixed(0) : 0;
    return `<tr>
      <td>${r.vehicle_no}</td>
      <td>${r.position_code || '—'}</td>
      <td>${r.defect_count_90d}</td>
      <td>${r.total_events_90d}</td>
      <td><span class="pct-badge ${ratio > 50 ? 'pct-high' : ratio > 20 ? 'pct-mid' : 'pct-low'}">${ratio}%</span></td>
    </tr>`;
  }).join('');
}

/* ═══════════════════════════════════════════════════════════
   NEW: Removal Reasons Pie (C8)
   ═══════════════════════════════════════════════════════════ */
function renderRemovalReasons() {
  const tbody = elements.removalReasonsBody;
  if (!tbody) return;

  const rows = state.removalReasons;
  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-cell">No removal data recorded.</td></tr>';
    return;
  }

  const maxCount = Math.max(...rows.map(r => r.count));
  tbody.innerHTML = rows.map(r => {
    const reason = r.reason || 'Not specified';
    const pct = r.pct || 0;
    return `<tr>
      <td>${reason}</td>
      <td>${r.count}</td>
      <td>
        <span class="bar-inline"><span style="width:${(r.count / maxCount) * 100}%" class="bar-fill danger"></span></span>
        <span class="pct-label">${pct}%</span>
      </td>
    </tr>`;
  }).join('');
}

// Analytics now renders table sections for all modules

function renderCharts() {
  if (typeof Chart !== 'undefined') {
    const chartDefaults = {
      color: '#94a3b8',
      borderColor: '#2d3748',
      font: { family: 'Work Sans, sans-serif' }
    };
    Chart.defaults.color = chartDefaults.color;
    Chart.defaults.borderColor = chartDefaults.borderColor;
    Chart.defaults.font.family = chartDefaults.font.family;
  }

  // Analytics now renders table views (no charts required)
  renderAnalytics();
}

/* ═══════════════════════════════════════════════════════════
   CHART 1: Target vs Actual Tyre Life
   ─ Horizontal reference line at 40,000 km
   ─ Bars color-coded: green = met/exceeded, red = below target
   ─ Scrollable container for large datasets
   ═══════════════════════════════════════════════════════════ */
function renderTyreLifeChart(pageRows) {
  // Original chart rendering retained but not called after modifications

  if (typeof Chart === 'undefined') return;
  const lifeCanvas = document.getElementById('tyreLifeChart');
  if (!lifeCanvas) return;
  if (chartInstances.tyreLife) chartInstances.tyreLife.destroy();
  if (!pageRows?.length) return;

  const TARGET_LIFE = 40000;

  // Dynamic width: ensure at least 40px per bar, minimum 100% container width
  const scrollWrap = lifeCanvas.closest('.chart-row-scrollable');
  if (scrollWrap) {
    const minWidth = Math.max(scrollWrap.parentElement.clientWidth, pageRows.length * 40);
    scrollWrap.style.width = minWidth + 'px';
  }

  chartInstances.tyreLife = new Chart(lifeCanvas, {
    type: 'bar',
    data: {
      labels: pageRows.map(r => r.tyre_no),
      datasets: [
        {
          label: 'Actual Life (km)',
          data: pageRows.map(r => Number(r.actual_life || 0)),
          backgroundColor: pageRows.map(r => {
            const v = Number(r.variance || 0);
            if (v >= 0) return 'rgba(16, 185, 129, 0.75)';
            if (v >= -5000) return 'rgba(245, 158, 11, 0.75)';
            return 'rgba(239, 68, 68, 0.75)';
          }),
          borderColor: pageRows.map(r => {
            const v = Number(r.variance || 0);
            if (v >= 0) return '#10b981';
            if (v >= -5000) return '#f59e0b';
            return '#ef4444';
          }),
          borderWidth: 2,
          borderRadius: 4,
          borderSkipped: false
        },
        {
          label: 'Remaining Expected (Running)',
          data: pageRows.map(r => {
            if (r.tyre_status === 'Running') {
              const actual = Number(r.actual_life || 0);
              return Math.max(0, TARGET_LIFE - actual);
            }
            return 0; // Not running or already exceeded target
          }),
          backgroundColor: 'rgba(148, 163, 184, 0.15)',
          borderColor: 'rgba(148, 163, 184, 0.4)',
          borderWidth: 1,
          borderDash: [5, 5],
          borderRadius: 4,
          borderSkipped: 'bottom'
        },
        {
          label: `Target (${TARGET_LIFE.toLocaleString()} km)`,
          data: pageRows.map(() => TARGET_LIFE),
          type: 'line',
          borderColor: '#3b82f6',
          borderWidth: 2,
          borderDash: [8, 4],
          pointRadius: 0,
          pointHoverRadius: 0,
          fill: false,
          tension: 0,
          order: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            usePointStyle: true,
            padding: 16,
            font: { size: 12, weight: '600' }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(30, 37, 48, 0.95)',
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
          borderColor: '#4a5568',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 14,
          callbacks: {
            title: function(context) {
              const idx = context[0].dataIndex;
              const row = pageRows[idx];
              return row ? `${row.tyre_no} — ${row.brand || ''}` : '';
            },
            afterBody: function(context) {
              const idx = context[0].dataIndex;
              const row = pageRows[idx];
              if (!row) return '';
              const v = Number(row.variance || 0);
              const actual = Number(row.actual_life || 0);
              const target = Number(row.target_life || 0);
              const status = row.tyre_status || 'Unknown';
              
              const lines = [
                `Truck: ${row.truck || '-'}`,
                `Variance: ${v >= 0 ? '+' : ''}${v.toLocaleString()} km`,
                `Performance: ${row.performance_status || '-'}`,
                `State: ${status}`,
                `CPK: ${formatNumber(row.cpk) || '-'}`
              ];
              
              if (status === 'Running' && target > 0) {
                 const pctUsed = Math.min(100, Math.round((actual / target) * 100));
                 const remainingKm = Math.max(0, target - actual);
                 lines.push(`\n--- Active Life ---`);
                 lines.push(`Life Used: ${pctUsed}%`);
                 lines.push(`Remaining Expected: ${remainingKm.toLocaleString()} km`);
              }
              
              return lines.join('\n');
            }
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          ticks: { maxRotation: 60, font: { size: 9 } },
          grid: { display: false }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          title: { display: true, text: 'Life (km)', font: { size: 11, weight: '600' } },
          grid: { color: 'rgba(148, 163, 184, 0.1)' }
        }
      }
    }
  });
}

/* ═══════════════════════════════════════════════════════════
   CHART 2: Rubber Utilisation Analysis
   ─ 100% stacked bar per tyre: Used (green) + Available/Wasted (red)
   ─ High waste (>20%) gets a danger red color
   ═══════════════════════════════════════════════════════════ */
function renderRubberChart(pageRows) {
  if (typeof Chart === 'undefined') return;
  const rubberCanvas = document.getElementById('rubberChart');
  if (!rubberCanvas) return;
  if (chartInstances.rubber) chartInstances.rubber.destroy();
  if (!pageRows?.length) return;

  const scrollWrap = rubberCanvas.closest('.chart-row-scrollable');
  if (scrollWrap) {
    const minWidth = Math.max(scrollWrap.parentElement.clientWidth, pageRows.length * 40);
    scrollWrap.style.width = minWidth + 'px';
  }

  chartInstances.rubber = new Chart(rubberCanvas, {
    type: 'bar',
    data: {
      labels: pageRows.map(r => r.tyre_no),
      datasets: [
        {
          label: 'Rubber Used %',
          data: pageRows.map(r => Number(r.rubber_used_pct || 0)),
          backgroundColor: 'rgba(16, 185, 129, 0.75)',
          borderColor: '#10b981',
          borderWidth: 1,
          borderRadius: { topLeft: 4, topRight: 4 },
          borderSkipped: 'bottom'
        },
        {
          label: 'Rubber Remaining at Removal %',
          data: pageRows.map(r => Number(r.rubber_wasted_pct || 0)),
          backgroundColor: pageRows.map(r => {
            const wasted = Number(r.rubber_wasted_pct || 0);
            if (wasted > 30) return 'rgba(239, 68, 68, 0.85)';
            if (wasted > 20) return 'rgba(245, 158, 11, 0.75)';
            return 'rgba(59, 130, 246, 0.5)';
          }),
          borderColor: pageRows.map(r => {
            const wasted = Number(r.rubber_wasted_pct || 0);
            if (wasted > 30) return '#ef4444';
            if (wasted > 20) return '#f59e0b';
            return '#3b82f6';
          }),
          borderWidth: 1,
          borderRadius: { topLeft: 4, topRight: 4 },
          borderSkipped: 'bottom'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: { usePointStyle: true, padding: 16, font: { size: 12, weight: '600' } }
        },
        tooltip: {
          backgroundColor: 'rgba(30, 37, 48, 0.95)',
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
          borderColor: '#4a5568',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 14,
          callbacks: {
            title: function(context) {
              const idx = context[0].dataIndex;
              const row = pageRows[idx];
              return row ? `${row.tyre_no} — ${row.brand || ''}` : '';
            },
            afterBody: function(context) {
              const idx = context[0].dataIndex;
              const row = pageRows[idx];
              if (!row) return '';
              return [
                `Truck: ${row.truck || '-'}`,
                `Tyre Life: ${formatNumber(row.tyre_life)} km`,
                `Original RTD: ${formatNumber(row.original_rtd)} mm`,
                `Removal RTD: ${formatNumber(row.removal_rtd)} mm`,
                `Value Remaining at Removal: ${formatCurrencyOrDash(row.value_lost)}`
              ].join('\n');
            }
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          ticks: { display: false },
          title: { display: true, text: 'Tyres', color: '#94a3b8', font: { size: 11, weight: '600' } },
          grid: { display: false }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          max: 100,
          title: { display: true, text: 'Utilisation %', font: { size: 11, weight: '600' } },
          grid: { color: 'rgba(148, 163, 184, 0.1)' }
        }
      }
    }
  });
}

/* ═══════════════════════════════════════════════════════════
   CHART 3: Brand-wise Performance Summary
   ─ Grouped bars: Avg Life Achieved vs Target Life (left Y-axis)
   ─ Line overlay: CPK — Cost Per Km (right Y-axis)
   ─ Achievement % shown in tooltip
   ─ Labels = "Brand (N tyres)"
   ═══════════════════════════════════════════════════════════ */
function renderBrandPerformanceChart(brandRows) {
  if (typeof Chart === 'undefined') return;
  const brandCanvas = document.getElementById('brandPerformanceChart');
  if (!brandCanvas) return;
  if (chartInstances.brand) chartInstances.brand.destroy();
  if (!brandRows?.length) return;

  const labels = brandRows.map(r => `${r.brand} (${r.tyre_count} tyres)`);

  chartInstances.brand = new Chart(brandCanvas, {
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Avg Life Achieved (km)',
          data: brandRows.map(r => Number(r.avg_life_achieved || 0)),
          backgroundColor: brandRows.map(r => {
            const pct = Number(r.achievement_pct || 0);
            if (pct >= 100) return 'rgba(16, 185, 129, 0.75)';
            if (pct >= 80) return 'rgba(245, 158, 11, 0.75)';
            return 'rgba(239, 68, 68, 0.75)';
          }),
          borderColor: brandRows.map(r => {
            const pct = Number(r.achievement_pct || 0);
            if (pct >= 100) return '#10b981';
            if (pct >= 80) return '#f59e0b';
            return '#ef4444';
          }),
          borderWidth: 2,
          borderRadius: 4,
          yAxisID: 'y',
          order: 2
        },
        {
          type: 'bar',
          label: 'Target Life (km)',
          data: brandRows.map(r => Number(r.target_life || 0)),
          backgroundColor: 'rgba(59, 130, 246, 0.25)',
          borderColor: '#3b82f6',
          borderWidth: 2,
          borderDash: [4, 2],
          borderRadius: 4,
          yAxisID: 'y',
          order: 3
        },
        {
          type: 'line',
          label: 'CPK ₹/km',
          data: brandRows.map(r => Number(r.cpk || 0)),
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          borderWidth: 3,
          pointRadius: 2,
          pointHoverRadius: 6,
          pointBackgroundColor: '#f59e0b',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          fill: false,
          tension: 0.3,
          yAxisID: 'y1',
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: true },
      plugins: {
        legend: {
          position: 'top',
          labels: { usePointStyle: true, padding: 16, font: { size: 12, weight: '600' } }
        },
        tooltip: {
          backgroundColor: 'rgba(30, 37, 48, 0.95)',
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
          borderColor: '#4a5568',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 14,
          callbacks: {
            afterBody: function(context) {
              const idx = context[0].dataIndex;
              const row = brandRows[idx];
              if (!row) return '';
              return [
                `Achievement: ${formatNumber(row.achievement_pct)}%`,
                `Avg Tyre Cost: ${currency(row.avg_tyre_cost)}`,
                `Year: ${row.year || '-'}`
              ].join('\n');
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { font: { size: 11, weight: '600' } },
          grid: { display: false }
        },
        y: {
          type: 'linear',
          position: 'left',
          beginAtZero: true,
          title: { display: true, text: 'Life (km)', font: { size: 11, weight: '600' } },
          grid: { color: 'rgba(148, 163, 184, 0.1)' }
        },
        y1: {
          type: 'linear',
          position: 'right',
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          ticks: { color: '#f59e0b' }
        }
      }
    }
  });
}

/* Table rendering functions for analytics sections */

function renderTyreLifeTable(pageRows) {
  const tbody = elements.analyticsLifeTableBody;
  if (!tbody) return;
  tbody.innerHTML = '';
  for (const row of pageRows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.tyre_no || '-'}</td>
      <td>${row.brand || '-'}</td>
      <td>${row.truck || '-'}</td>
      <td>${formatDateOnly(row.fitment_date)}</td>
      <td>${formatDateOnly(row.removal_date)}</td>
      <td>${formatNumber(row.target_life)}</td>
      <td>${formatNumber(row.actual_life)}</td>
      <td>${formatNumber(row.variance)}</td>
      <td>${row.tyre_status || '-'}</td>
      <td>${row.performance_status || '-'}</td>
      <td>${formatNumber(row.tyre_cost)}</td>
      <td>${formatNumber(row.cpk)}</td>
    `;
    tbody.appendChild(tr);
  }
}

/* Rubber Utilisation table */
function renderRubberTable(pageRows) {
  const tbody = elements.analyticsRubberTableBody;
  if (!tbody) return;
  tbody.innerHTML = '';
  for (const row of pageRows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.tyre_no || '-'}</td>
      <td>${row.brand || '-'}</td>
      <td>${row.truck || '-'}</td>
      <td>${formatNumber(row.tyre_life)}</td>
      <td>${formatNumber(row.original_rtd)}</td>
      <td>${formatNumber(row.removal_rtd)}</td>
      <td>${formatPercent(row.rubber_used_pct)}</td>
      <td>${formatPercent(row.rubber_wasted_pct)}</td>
      <td>${formatNumber(row.tyre_cost)}</td>
      <td>${formatCurrencyOrDash(row.value_lost)}</td>
    `;
    tbody.appendChild(tr);
  }
}

/* Brand-wise Performance table */
function renderBrandPerformanceTable(brandRows) {
  const tbody = elements.analyticsBrandTableBody;
  if (!tbody) return;
  tbody.innerHTML = '';
  for (const row of brandRows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.brand || '-'}</td>
      <td>${row.year || '-'}</td>
      <td>${row.tyre_count != null ? row.tyre_count : '-'}</td>
      <td>${formatNumber(row.avg_life_achieved)}</td>
      <td>${formatNumber(row.target_life)}</td>
      <td>${formatPercent(row.achievement_pct)}</td>
      <td>${formatCurrencyOrDash(row.avg_tyre_cost)}</td>
      <td>${formatNumber(row.cpk)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderPressureTable(pageRows, showDailyPressure) {
  const thead = elements.analyticsPressureTableHead;
  const tbody = elements.analyticsPressureTableBody;
  if (!thead || !tbody) return;

  if (showDailyPressure) {
    thead.innerHTML = `
      <tr>
        <th>Date</th>
        <th>Tyre No</th>
        <th>Truck</th>
        <th>Position</th>
        <th>Tyre PSI</th>
        <th>Leak/Day</th>
        <th>Fuel Increase %</th>
        <th>Rolling Resistance %</th>
        <th>Fuel Loss</th>
        <th>Tyre Value Loss</th>
        <th>Daily Loss</th>
        <th>Cumulative Loss</th>
      </tr>
    `;
  } else {
    thead.innerHTML = `
      <tr>
        <th>Tyre No</th>
        <th>Truck</th>
        <th>Position</th>
        <th>Current PSI</th>
        <th>Leak/Day</th>
        <th>Fuel Increase %</th>
        <th>Rolling Resistance %</th>
        <th>Hours Since Check</th>
        <th>Daily Loss</th>
        <th>MTD Loss</th>
        <th>Total Loss</th>
        <th>Confidence %</th>
      </tr>
    `;
  }

  tbody.innerHTML = '';
  if (!pageRows.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="12">No pressure rows found.</td>`;
    tbody.appendChild(tr);
    return;
  }

  for (const row of pageRows) {
    const tr = document.createElement('tr');
    if (showDailyPressure) {
      tr.innerHTML = `
        <td>${row.metric_date || '-'}</td>
        <td>${row.tyre_no || '-'}</td>
        <td>${row.truck || '-'}</td>
        <td>${row.position || '-'}</td>
        <td>${formatNumber(row.pressure_psi)}</td>
        <td>${formatNumber(row.psi_drop_per_day)}</td>
        <td>${formatPercent(row.fuel_increase_pct)}</td>
        <td>${formatPercent(row.rolling_resistance_increase_pct)}</td>
        <td>${formatCurrencyOrDash(row.fuel_loss_inr)}</td>
        <td>${formatCurrencyOrDash(row.tyre_value_loss_inr)}</td>
        <td>${formatCurrencyOrDash(row.total_loss_inr)}</td>
        <td>${formatCurrencyOrDash(row.cumulative_loss_inr)}</td>
      `;
    } else {
      tr.innerHTML = `
        <td>${row.tyre_no || '-'}</td>
        <td>${row.truck || '-'}</td>
        <td>${row.position || '-'}</td>
        <td>${formatNumber(row.last_psi)}</td>
        <td>${formatNumber(row.estimated_daily_psi_drop)}</td>
        <td>${formatPercent(row.fuel_increase_pct)}</td>
        <td>${formatPercent(row.rolling_resistance_increase_pct)}</td>
        <td>${formatNumber(row.hours_since_check)}</td>
        <td>${formatCurrencyOrDash(row.daily_loss_inr)}</td>
        <td>${formatCurrencyOrDash(row.mtd_loss_inr)}</td>
        <td>${formatCurrencyOrDash(row.total_loss_inr)}</td>
        <td>${formatPercent(row.confidence_pct)}</td>
      `;
    }
    tbody.appendChild(tr);
  }
}

/* ═══════════════════════════════════════════════════════════
   CHART 4: Pressure Leakage Impact (Redesigned)
   ─ Part 1: KPI summary cards (6 metrics)
   ─ Part 2a: Tyre Summary → Horizontal bar (Top 15 by loss)
   ─ Part 2b: Monthly Trend → Aggregated area chart
   ═══════════════════════════════════════════════════════════ */

function renderPressureKpis() {
  const container = document.getElementById('pressureKpiRow');
  if (!container) return;
  const p = state.analytics?.pressure?.summary;
  if (!p) { container.innerHTML = ''; return; }

  const fmt = v => {
    const n = Number(v || 0);
    if (Math.abs(n) >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
    if (Math.abs(n) >= 1e5) return '₹' + (n / 1e5).toFixed(1) + ' L';
    if (Math.abs(n) >= 1000) return '₹' + (n / 1000).toFixed(1) + 'k';
    return '₹' + n.toFixed(0);
  };

  container.innerHTML = `
    <div class="pkpi">
      <div class="pkpi-label">Total Cumulative Loss</div>
      <div class="pkpi-value" style="color:#ef4444">${fmt(p.cumulative_loss)}</div>
      <div class="pkpi-sub">Fuel + Tire combined</div>
    </div>
    <div class="pkpi">
      <div class="pkpi-label">Avg Daily Loss</div>
      <div class="pkpi-value" style="color:#f59e0b">${fmt(p.avg_daily_loss)}</div>
      <div class="pkpi-sub">Per day fleet-wide</div>
    </div>
    <div class="pkpi">
      <div class="pkpi-label">Tyres Monitored</div>
      <div class="pkpi-value" style="color:#3b82f6">${Number(p.active_tyres || 0)}</div>
      <div class="pkpi-sub">With pressure data</div>
    </div>
    <div class="pkpi">
      <div class="pkpi-label">Avg PSI Drop/Day</div>
      <div class="pkpi-value" style="color:#8b5cf6">${Number(p.avg_psi_drop_per_day || 0).toFixed(2)}</div>
      <div class="pkpi-sub">Fleet average</div>
    </div>
    <div class="pkpi">
      <div class="pkpi-label">Fuel Increase</div>
      <div class="pkpi-value" style="color:#e65100">${Number(p.avg_fuel_increase_pct || 0).toFixed(2)}%</div>
      <div class="pkpi-sub">Extra fuel burn</div>
    </div>
    <div class="pkpi">
      <div class="pkpi-label">Rolling Resistance ↑</div>
      <div class="pkpi-value" style="color:#c62828">${Number(p.avg_rr_increase_pct || 0).toFixed(2)}%</div>
      <div class="pkpi-sub">Crr increase</div>
    </div>
  `;
}

function renderPressureChart(pageRows, showDailyPressure) {
  if (typeof Chart === 'undefined') return;
  const pressureCanvas = document.getElementById('pressureChart');
  if (!pressureCanvas) return;
  if (chartInstances.pressure) chartInstances.pressure.destroy();

  // Always render KPI cards
  renderPressureKpis();

  if (!pageRows?.length) return;

  const scrollWrap = pressureCanvas.closest('.chart-row-scrollable');

  if (showDailyPressure) {
    /* ── Monthly Trend (Aggregated Area Chart) ──────────────
       Aggregate ALL daily rows by month → show full picture
       without pagination. Stacked areas + cumulative line.
    ─────────────────────────────────────────────────────────── */
    const allDaily = state.analytics?.sectionPressureDaily || [];

    // Aggregate by month
    const monthMap = new Map();
    for (const r of allDaily) {
      const month = String(r.metric_date || '').slice(0, 7); // "YYYY-MM"
      if (!month) continue;
      if (!monthMap.has(month)) {
        monthMap.set(month, { fuel: 0, tire: 0, total: 0, psiSum: 0, count: 0 });
      }
      const m = monthMap.get(month);
      m.fuel += Number(r.fuel_loss_inr || 0);
      m.tire += Number(r.tyre_value_loss_inr || 0);
      m.total += Number(r.total_loss_inr || 0);
      m.psiSum += Number(r.avg_psi_drop_per_day || 0);
      m.count += 1;
    }

    const months = Array.from(monthMap.keys()).sort();
    const fuelArr = [];
    const tireArr = [];
    const totalArr = [];
    const psiAvgArr = [];
    let cumTotal = 0;

    for (const m of months) {
      const d = monthMap.get(m);
      fuelArr.push(Math.round(d.fuel));
      tireArr.push(Math.round(d.tire));
      cumTotal += d.total;
      totalArr.push(Math.round(cumTotal));
      psiAvgArr.push(d.count > 0 ? d.psiSum / d.count : 0);
    }

    // Format month labels nicely
    const labels = months.map(m => {
      const parts = m.split('-');
      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return monthNames[parseInt(parts[1]) - 1] + ' ' + parts[0].slice(2);
    });

    if (scrollWrap) {
      scrollWrap.style.width = '100%';
    }

    const maxPsi = Math.max(...psiAvgArr, 0.5);

    chartInstances.pressure = new Chart(pressureCanvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            type: 'bar',
            label: 'Fuel Waste (₹)',
            data: fuelArr,
            backgroundColor: 'rgba(230, 81, 0, 0.6)',
            borderRadius: 3,
            stack: 'cost',
            order: 3
          },
          {
            type: 'bar',
            label: 'Tire Erosion (₹)',
            data: tireArr,
            backgroundColor: 'rgba(69, 39, 160, 0.55)',
            borderRadius: 3,
            stack: 'cost',
            order: 3
          },
          {
            type: 'line',
            label: 'Cumulative Loss (₹)',
            data: totalArr,
            borderColor: '#C62828',
            backgroundColor: 'rgba(198, 40, 40, 0.08)',
            fill: true,
            borderWidth: 2.5,
            pointRadius: 4,
            pointHoverRadius: 7,
            pointBackgroundColor: '#C62828',
            pointBorderColor: '#1e2530',
            pointBorderWidth: 2,
            yAxisID: 'y',
            order: 1,
            tension: 0.3
          },
          {
            type: 'line',
            label: 'Avg PSI Drop/Day',
            data: psiAvgArr,
            borderColor: '#0277BD',
            fill: false,
            borderWidth: 1.5,
            borderDash: [5, 3],
            pointRadius: 3,
            pointHoverRadius: 5,
            pointBackgroundColor: '#0277BD',
            yAxisID: 'y2',
            order: 2,
            tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true, position: 'top',
            labels: { usePointStyle: true, font: { size: 11 }, padding: 16 }
          },
          tooltip: {
            backgroundColor: 'rgba(30, 37, 48, 0.95)',
            titleColor: '#e2e8f0',
            bodyColor: '#cbd5e1',
            borderColor: '#4a5568',
            borderWidth: 1,
            cornerRadius: 8,
            padding: 14,
            callbacks: {
              label(ctx) {
                if (ctx.datasetIndex === 3) return ` Avg PSI Drop: ${ctx.parsed.y.toFixed(2)}/day`;
                const v = ctx.parsed.y;
                if (v >= 1e7) return ` ${ctx.dataset.label}: ₹${(v / 1e7).toFixed(2)} Cr`;
                if (v >= 1e5) return ` ${ctx.dataset.label}: ₹${(v / 1e5).toFixed(1)} L`;
                return ` ${ctx.dataset.label}: ₹${v.toLocaleString('en-IN')}`;
              }
            }
          }
        },
        scales: {
          x: {
            stacked: true,
            grid: { color: 'rgba(148, 163, 184, 0.07)' }
          },
          y: {
            stacked: true,
            position: 'left',
            grid: { color: 'rgba(148, 163, 184, 0.07)' },
            ticks: {
              font: { size: 11 },
              callback: v => v >= 1e7 ? '₹' + (v / 1e7).toFixed(1) + 'Cr'
                          : v >= 1e5 ? '₹' + (v / 1e5).toFixed(0) + 'L'
                          : v >= 1000 ? '₹' + (v / 1000).toFixed(1) + 'k'
                          : '₹' + v
            },
            title: { display: true, text: 'Cumulative cost (₹)', font: { size: 11, weight: '600' } }
          },
          y2: {
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { color: '#0277BD', font: { size: 11 } },
            title: { display: true, text: 'PSI Drop/Day', color: '#0277BD', font: { size: 11, weight: '600' } },
            min: 0,
            max: maxPsi * 1.5
          }
        }
      }
    });
  } else {
    /* ── Tyre Summary: Horizontal Bar (Top 15) ────────────── */
    const allTyres = state.analytics?.sectionPressureTyres || [];
    const sorted = [...allTyres]
      .filter(r => Number(r.total_loss_inr || 0) > 0)
      .sort((a, b) => Number(b.total_loss_inr || 0) - Number(a.total_loss_inr || 0))
      .slice(0, 15);

    if (!sorted.length) return;

    // Reverse for horizontal bar (top item at top)
    const displayRows = sorted.reverse();
    const tyreLabels = displayRows.map(r => r.tyre_no + (r.truck && r.truck !== '-' ? ` · ${r.truck}` : ''));

    // Compute fuel vs tire split using actual daily data ratios
    // (real data already has total, use ~35/65 split aligned with cascade)
    const fuelData = displayRows.map(r => Math.round(Number(r.total_loss_inr || 0) * 0.35));
    const tireData = displayRows.map(r => Math.round(Number(r.total_loss_inr || 0) * 0.65));

    if (scrollWrap) {
      scrollWrap.style.width = '100%';
      const minHeight = Math.max(350, sorted.length * 32);
      scrollWrap.style.height = minHeight + 'px';
    }

    chartInstances.pressure = new Chart(pressureCanvas, {
      type: 'bar',
      data: {
        labels: tyreLabels,
        datasets: [
          {
            label: 'Fuel Waste (₹)',
            data: fuelData,
            backgroundColor: 'rgba(230, 81, 0, 0.65)',
            borderRadius: 3,
            stack: 'loss'
          },
          {
            label: 'Tire Erosion (₹)',
            data: tireData,
            backgroundColor: 'rgba(69, 39, 160, 0.6)',
            borderRadius: 3,
            stack: 'loss'
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true, position: 'top',
            labels: { usePointStyle: true, font: { size: 11 }, padding: 16 }
          },
          tooltip: {
            backgroundColor: 'rgba(30, 37, 48, 0.95)',
            titleColor: '#e2e8f0',
            bodyColor: '#cbd5e1',
            borderColor: '#4a5568',
            borderWidth: 1,
            cornerRadius: 8,
            padding: 14,
            callbacks: {
              afterBody(contexts) {
                const idx = contexts[0]?.dataIndex;
                if (idx == null) return '';
                const row = displayRows[idx];
                const lines = [];
                if (row.estimated_daily_psi_drop) lines.push(`PSI Drop: ${Number(row.estimated_daily_psi_drop).toFixed(2)}/day`);
                if (row.days_since_check) lines.push(`Last Check: ${row.days_since_check} days ago`);
                if (row.rolling_resistance_increase_pct) lines.push(`RR Increase: ${Number(row.rolling_resistance_increase_pct).toFixed(2)}%`);
                if (row.fuel_increase_pct) lines.push(`Fuel Increase: ${Number(row.fuel_increase_pct).toFixed(2)}%`);
                lines.push(`Total: ₹${Number(row.total_loss_inr || 0).toLocaleString('en-IN')}`);
                return lines;
              }
            }
          }
        },
        scales: {
          x: {
            stacked: true,
            grid: { color: 'rgba(148, 163, 184, 0.07)' },
            ticks: {
              font: { size: 11 },
              callback: v => v >= 1000 ? '₹' + (v / 1000).toFixed(1) + 'k' : '₹' + v
            },
            title: { display: true, text: 'Financial Loss (₹)', font: { size: 11, weight: '600' } }
          },
          y: {
            stacked: true,
            grid: { display: false },
            ticks: { font: { size: 10 } }
          }
        }
      }
    });
  }
}

function renderSavings() {
  // Hero card
  const totalImpact = Number(state.analytics.totalImpact || 0);
  const isPositive = totalImpact >= 0;
  if (elements.savingsHero) {
    elements.savingsHero.classList.toggle('negative', !isPositive);
  }
  if (elements.savingsHeroValue) {
    elements.savingsHeroValue.textContent = financialImpactLabel(totalImpact);
  }
  if (elements.savingsHeroSub) {
    elements.savingsHeroSub.textContent = isPositive
      ? 'Cumulative operational savings since system onboarding'
      : 'Cumulative cost gap since system onboarding';
  }

  // Impact tiles
  if (elements.savingsGrid) {
    elements.savingsGrid.innerHTML = '';
    const totalAbs = state.analytics.savings.reduce((s, r) => s + Math.abs(Number(r.impact || 0)), 0);
    for (const row of state.analytics.savings) {
      const impact = Number(row.impact || 0);
      const impactPositive = impact >= 0;
      const pct = totalAbs > 0
        ? Math.min(100, Math.round((Math.abs(impact) / totalAbs) * 100))
        : 0;
      const ringColor = impactPositive ? 'var(--ok)' : 'var(--danger)';
      const tile = document.createElement('div');
      tile.className = 'impact-tile';
      tile.innerHTML = `
        <div class="impact-ring" style="--ring-pct: ${pct}; --ring-color: ${ringColor}">
          <div class="impact-ring-bg"></div>
          <span>${Math.round(pct)}%</span>
        </div>
        <div class="impact-tile-body">
          <span class="impact-tile-label">${row.parameter}</span>
          <div class="impact-tile-row">
            <span class="impact-tile-value">${financialImpactLabel(impact)}</span>
          </div>
          <div class="impact-tile-row">
            <span class="impact-tile-variance ${impactPositive ? 'positive' : 'negative'}">
              ${impactPositive ? '▲' : '▼'} ${row.variance || '0'}
            </span>
          </div>
        </div>
      `;
      elements.savingsGrid.appendChild(tile);
    }
  }

  // Detailed table
  elements.savingsBody.innerHTML = '';

  for (const row of state.analytics.savings) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.parameter}</td>
      <td>${row.target}</td>
      <td>${row.current}</td>
      <td>${row.variance}</td>
      <td>${financialImpactLabel(row.impact)}</td>
    `;
    elements.savingsBody.appendChild(tr);
  }

  const total = document.createElement('tr');
  total.innerHTML = `
    <td><strong>Total</strong></td>
    <td>-</td>
    <td>-</td>
    <td>-</td>
    <td><strong>${financialImpactLabel(state.analytics.totalImpact)}</strong></td>
  `;
  elements.savingsBody.appendChild(total);
}

function updateTabBadges() {
  if (elements.tabBadgeTyres) {
    elements.tabBadgeTyres.textContent = state.tyreRecords.length || '0';
  }
  if (elements.tabBadgeInspection) {
    elements.tabBadgeInspection.textContent = state.inspectionRecords.length || '0';
  }
  if (elements.tabBadgeAnalytics) {
    const totalAnalytics = (state.analytics?.sectionA?.length || 0)
      + (state.analytics?.sectionB?.length || 0)
      + (state.analytics?.sectionC?.length || 0);
    elements.tabBadgeAnalytics.textContent = totalAnalytics || '—';
  }
  if (elements.tabBadgeSavings) {
    const totalImpact = Number(state.analytics?.totalImpact || 0);
    elements.tabBadgeSavings.textContent = totalImpact >= 0 ? '▲' : '▼';
  }
}



async function reloadReviewQueue() {
  try {
    state.reviewItems = await fetchReviewQueue(state.session.siteId);
    state.selectedReviewIndex = state.reviewItems.length > 0 ? 0 : -1;
    renderReviewQueue();
    renderReviewDetail();
  } catch (error) {
    toast(error.message || 'Failed to refresh review queue', 'error');
  }
}

function renderReviewQueue() {
  elements.reviewQueueBody.innerHTML = '';
  elements.reviewQueueSummary.textContent = `${state.reviewItems.length} item(s) pending`;

  if (state.reviewItems.length === 0) {
    elements.reviewQueueBody.innerHTML = '<tr><td colspan="4">Review queue is clear.</td></tr>';
    return;
  }

  state.reviewItems.forEach((item, index) => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    if (index === state.selectedReviewIndex) {
      tr.style.background = '#e8f4fb';
    }

    tr.innerHTML = `
      <td>${item.form_type}</td>
      <td>${item.context?.vehicle_no || '-'}</td>
      <td>${item.priority || '-'}</td>
      <td>${item.reason || '-'}</td>
    `;
    tr.addEventListener('click', () => {
      state.selectedReviewIndex = index;
      renderReviewQueue();
      renderReviewDetail();
    });
    elements.reviewQueueBody.appendChild(tr);
  });
}

function renderReviewDetail() {
  const item = state.reviewItems[state.selectedReviewIndex];
  elements.reviewFieldBody.innerHTML = '';

  if (!item) {
    elements.reviewImage.removeAttribute('src');
    elements.reviewMetaTitle.textContent = 'No item selected';
    elements.reviewMetaSub.textContent = 'Select a queue item to review extraction fields.';
    elements.openEvidenceLink.removeAttribute('href');
    elements.openEvidenceLink.style.display = 'none';
    return;
  }

  const evidence = Array.isArray(item.evidence) ? item.evidence : [];
  const firstEvidence = evidence.find((entry) => entry.signed_url);

  if (firstEvidence) {
    elements.reviewImage.src = firstEvidence.signed_url;
    elements.openEvidenceLink.href = firstEvidence.signed_url;
    elements.openEvidenceLink.style.display = 'inline';
  } else {
    elements.reviewImage.removeAttribute('src');
    elements.openEvidenceLink.removeAttribute('href');
    elements.openEvidenceLink.style.display = 'none';
  }

  const firstPipeline = firstEvidence?.pipeline || null;
  const categoryLabel = firstPipeline?.photo_category || '-';
  const classifierState = firstPipeline?.classifier_error
    ? `Classifier fallback: ${firstPipeline.classifier_error}`
    : (firstPipeline?.classifier ? `Classifier: ${firstPipeline.classifier}` : 'Classifier: pending');
  const ocrState = firstPipeline
    ? (firstPipeline.ocr_enabled
      ? (firstPipeline.ocr_error ? `OCR error: ${firstPipeline.ocr_error}` : 'OCR extracted')
      : 'OCR skipped by category')
    : 'Pipeline pending';

  elements.reviewMetaTitle.textContent = `${item.form_type} • ${item.context?.vehicle_no || '-'} • ${item.context?.position_code || '-'}`;
  elements.reviewMetaSub.textContent = `Reason: ${item.reason || '-'} | Priority: ${item.priority || '-'} | Category: ${categoryLabel} | ${classifierState} | ${ocrState}`;

  const fields = Array.isArray(item.extracted_fields) ? item.extracted_fields : [];
  if (fields.length === 0) {
    elements.reviewFieldBody.innerHTML = '<tr><td colspan="4">No extracted fields available.</td></tr>';
    return;
  }

  for (const field of fields) {
    const confidence = Number(field.confidence ?? 0);
    const confClass = confidence >= 0.95 ? 'conf-high' : (confidence >= 0.8 ? 'conf-mid' : 'conf-low');
    const confLabel = `${Math.round(confidence * 100)}%`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${field.field_key}</td>
      <td>${formatFieldValue(field.field_value)}</td>
      <td><span class="confidence-pill ${confClass}">${confLabel}</span></td>
      <td><input data-correct-field="${field.field_key}" placeholder="Enter corrected value"></td>
    `;
    elements.reviewFieldBody.appendChild(tr);
  }
}

async function applyReviewAction(action) {
  const item = state.reviewItems[state.selectedReviewIndex];
  if (!item) {
    toast('Select a review item first.', 'info');
    return;
  }

  let correctedFields = {};
  if (action === 'correct') {
    correctedFields = collectCorrectedFields();
    if (Object.keys(correctedFields).length === 0) {
      toast('Enter at least one corrected value.', 'info');
      return;
    }
  }

  if (action === 'reject') {
    const confirmed = window.confirm('Reject this item and mark it unusable?');
    if (!confirmed) return;
  }

  try {
    await resolveReviewItem({
      reviewId: item.review_id,
      action,
      correctedFields,
      actorId: state.session.userId
    });

    toast(`Review action applied: ${action}.`, 'success');
    await loadCoreData();
    switchTab('review');
  } catch (error) {
    toast(error.message || 'Failed to apply review action', 'error');
  }
}

async function approveAllGreen() {
  const greenItems = state.reviewItems.filter((item) => {
    const fields = item.extracted_fields || [];
    if (fields.length === 0) return false;
    return fields.every((field) => Number(field.confidence ?? 0) >= 0.95);
  });

  if (greenItems.length === 0) {
    toast('No all-green review items in queue.', 'info');
    return;
  }

  let successCount = 0;
  for (const item of greenItems) {
    try {
      await resolveReviewItem({
        reviewId: item.review_id,
        action: 'approve',
        correctedFields: {},
        actorId: state.session.userId
      });
      successCount += 1;
    } catch (error) {
      toast(`Failed item ${item.review_id.slice(0, 8)}: ${error.message}`, 'error');
    }
  }

  toast(`Approved ${successCount}/${greenItems.length} green item(s).`, successCount === greenItems.length ? 'success' : 'info');
  await loadCoreData();
  switchTab('review');
}

function skipReviewItem() {
  if (state.reviewItems.length === 0) return;
  state.selectedReviewIndex = (state.selectedReviewIndex + 1) % state.reviewItems.length;
  renderReviewQueue();
  renderReviewDetail();
}

function collectCorrectedFields() {
  const corrected = {};
  const inputs = elements.reviewFieldBody.querySelectorAll('input[data-correct-field]');
  inputs.forEach((input) => {
    const key = input.dataset.correctField;
    const raw = input.value.trim();
    if (!key || !raw) return;
    corrected[key] = parseValue(raw);
  });
  return corrected;
}

function isTabAvailable(tab) {
  const button = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
  return Boolean(button) && button.style.display !== 'none';
}

function firstAvailableTab() {
  const button = Array.from(document.querySelectorAll('.tab-btn'))
    .find((item) => item.style.display !== 'none');
  return button?.dataset.tab || 'tyres';
}

function switchTab(tab) {
  const requested = String(tab || '').trim().toLowerCase();
  const safeTab = isTabAvailable(requested) ? requested : firstAvailableTab();
  state.activeTab = safeTab;

  if (window.location.hash !== `#${safeTab}`) {
    window.location.hash = safeTab;
  }

  document.querySelectorAll('.tab-btn').forEach((button) => {
    const active = button.dataset.tab === safeTab;
    button.classList.toggle('active', active);
  });

  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `tab-${safeTab}`);
  });
}

function applyReportDeepLink() {
  if (state.reportDeepLinkApplied) return;

  if (!state.reportDeepLink) {
    const raw = new URLSearchParams(window.location.search).get('report') || '';
    state.reportDeepLink = raw.trim().replace(/[^a-z0-9_-]/gi, '');
  }

  if (!state.reportDeepLink || !state.reportsVisibilityApplied) return;

  const key = state.reportDeepLink;
  const block = document.querySelector(`[data-report="${key}"]`);
  state.reportDeepLinkApplied = true;

  if (!block || block.style.display === 'none' || !isTabAvailable('analytics')) {
    switchTab('analytics');
    toast('That report is not enabled for this site. Showing Analytics.', 'info');
    return;
  }

  switchTab('analytics');
  requestAnimationFrame(() => {
    setTimeout(() => {
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const align = (behavior) => {
        const top = window.scrollY + block.getBoundingClientRect().top - 18;
        window.scrollTo({ top: Math.max(0, top), behavior });
      };

      align(reduceMotion ? 'auto' : 'smooth');

      let checks = 0;
      const correctDrift = () => {
        checks += 1;
        const delta = block.getBoundingClientRect().top - 18;
        if (Math.abs(delta) > 20) {
          window.scrollTo({ top: Math.max(0, window.scrollY + delta), behavior: 'auto' });
        }
        if (checks < 6) setTimeout(correctDrift, 500);
      };
      setTimeout(correctDrift, 400);
    }, 80);
  });
}

function selectReviewByTyre(tyreNo) {
  const normalized = normalize(tyreNo);
  const index = state.reviewItems.findIndex((item) => {
    const fields = item.extracted_fields || [];
    return fields.some((field) => field.field_key === 'tyre_serial' && normalize(String(field.field_value || '')) === normalized);
  });

  if (index === -1) {
    toast('No pending review item found for this tyre.', 'info');
    return;
  }

  state.selectedReviewIndex = index;
  renderReviewQueue();
  renderReviewDetail();
}

async function handleFuelSubmit(event) {
  event.preventDefault();

  const row = {
    truck_no: elements.fuelTruck.value.trim().toUpperCase(),
    date: elements.fuelDate.value,
    total_trips: Number(elements.fuelTrips.value || 0),
    total_kms: Number(elements.fuelKms.value || 0),
    total_fuel_consumed: Number(elements.fuelConsumed.value || 0),
    total_production: Number(elements.fuelProduction.value || 0)
  };

  if (!row.truck_no || !row.date) {
    toast('Truck and date are required.', 'error');
    return;
  }

  state.fuelRows = await appendFuelRow(state.session.siteId, row, state.session.userId);
  invalidateManagerDataset(state.session.siteId);

  state.analytics = buildAnalyticsSnapshot({
    tyreRecords: state.tyreRecords,
    fuelRows: state.fuelRows,
    targets: state.targets,
    pressureEvents: state.pressureEvents
  });

  renderFuelRows();
  renderAnalytics();
  renderSavings();
  elements.fuelForm.reset();
  toast('Fuel row saved to database.', 'success');
}

function exportTyreRows() {
  const rows = getFilteredTyreRows();
  if (rows.length === 0) {
    toast('No tyre rows to export.', 'info');
    return;
  }

  const tableReplicaRows = rows.map((row) => ({
    tyre_no: valueOrDash(row.tyre_no),
    make: valueOrDash(row.make),
    size: valueOrDash(row.size),
    vehicle_no: row.status === 'Running' ? valueOrDash(row.vehicle_no) : '-',
    position: valueOrDash(row.position),
    status: valueOrDash(row.status),
    last_activity_date: valueOrDash(row.last_activity_date),
    current_rtd1: valueOrDash(row.current_rtd1),
    current_rtd2: valueOrDash(row.current_rtd2),
    odometer: formatNumber(row.odometer),
    total_life_run: formatNumber(row.total_life_run),
    first_fitment_date: valueOrDash(row.first_fitment_date),
    removal_date: valueOrDash(row.removal_date)
  }));

  exportRowsAsExcel({
    filename: `tyre-records-${today()}.xlsx`,
    sheetName: 'Tyre Records',
    title: 'Tyre Records',
    subtitle: 'Filtered tyre records from manager dashboard',
    columns: tyreCardColumns(),
    rows: tableReplicaRows
  });

  toast(`Tyre Excel exported (${rows.length} records).`, 'success');
}

function exportTyreRepositoryRows() {
  const rows = state.tyreRecords;
  if (!rows.length) {
    toast('No tyre repository rows to export.', 'info');
    return;
  }

  const tableReplicaRows = rows.map((row) => ({
    tyre_no: valueOrDash(row.tyre_no),
    make: valueOrDash(row.make),
    size: valueOrDash(row.size),
    vehicle_no: row.status === 'Running' ? valueOrDash(row.vehicle_no) : '-',
    position: valueOrDash(row.position),
    status: valueOrDash(row.status),
    last_activity_date: valueOrDash(row.last_activity_date),
    current_rtd1: valueOrDash(row.current_rtd1),
    current_rtd2: valueOrDash(row.current_rtd2),
    odometer: formatNumber(row.odometer),
    total_life_run: formatNumber(row.total_life_run),
    first_fitment_date: valueOrDash(row.first_fitment_date),
    removal_date: valueOrDash(row.removal_date)
  }));

  exportRowsAsExcel({
    filename: `tyre-repository-${today()}.xlsx`,
    sheetName: 'Tyre Repository',
    title: 'Tyre Repository',
    subtitle: 'Complete tyre repository export',
    columns: tyreCardColumns(),
    rows: tableReplicaRows
  });

  toast(`Full repository Excel exported (${rows.length} records).`, 'success');
}

function exportTyreHistoryRows() {
  const normalizedTyre = normalize(state.activeTyreHistorySerial);
  if (!normalizedTyre) {
    toast('Open a tyre history view first.', 'info');
    return;
  }

  const rows = Array.isArray(state.activeTyreHistoryRows)
    ? state.activeTyreHistoryRows
    : [];

  if (!rows.length) {
    toast(`No history rows found for ${normalizedTyre}.`, 'info');
    return;
  }

  const tableReplicaRows = rows.map((row) => ({
    activity_date: valueOrDash(row.activity_date),
    activity_type: valueOrDash(row.activity_type),
    truck: valueOrDash(row.truck),
    tyre_no: valueOrDash(row.tyre_no),
    brand: valueOrDash(row.brand),
    position: valueOrDash(row.position),
    odometer: formatNumber(row.odometer),
    rtd1: valueOrDash(row.rtd1),
    rtd2: valueOrDash(row.rtd2),
    psi_found: valueOrDash(row.psi_found),
    psi_corrected: valueOrDash(row.psi_corrected),
    remarks: valueOrDash(row.remarks)
  }));

  exportRowsAsCsv({
    filename: `tyre-history-${normalizedTyre}-${today()}.csv`,
    columns: tyreHistoryColumns(),
    rows: tableReplicaRows
  });

  toast(`Full history CSV exported for ${normalizedTyre}.`, 'success');
}

function tyreHistoryColumns() {
  return [
    { label: 'Date', key: 'activity_date' },
    { label: 'Activity', key: 'activity_type' },
    { label: 'Truck', key: 'truck' },
    { label: 'Tyre Number', key: 'tyre_no' },
    { label: 'Brand', key: 'brand' },
    { label: 'Position', key: 'position' },
    { label: 'Odometer', key: 'odometer' },
    { label: 'RTD1', key: 'rtd1' },
    { label: 'RTD2', key: 'rtd2' },
    { label: 'PSI Found', key: 'psi_found' },
    { label: 'PSI Corrected', key: 'psi_corrected' },
    { label: 'Remarks', key: 'remarks' }
  ];
}

function tyreCardColumns() {
return [
      { label: 'Tyre Number', key: 'tyre_no' },
      { label: 'Brand', key: 'make' },
      { label: 'Size', key: 'size' },
      { label: 'Truck Number', key: 'vehicle_no' },
      { label: 'Position', key: 'position' },
      { label: 'Status', key: 'status' },
      { label: 'Last Activity', key: 'last_activity_date' },
      { label: 'RTD1', key: 'current_rtd1' },
      { label: 'RTD2', key: 'current_rtd2' },
      { label: 'Odometer', key: 'odometer' },
      { label: 'Tyre Life', key: 'total_life_run' },
      { label: 'First Fitment', key: 'first_fitment_date' }
    ];
}

function exportInspectionRows() {
  const rows = getLatestInspectionRows(getFilteredInspectionRows());

  if (rows.length === 0) {
    toast('No inspection rows to export.', 'info');
    return;
  }

  const tableReplicaRows = rows.map((row) => ({
    activity_date: valueOrDash(row.activity_date),
    activity_type: valueOrDash(row.activity_type),
    truck: valueOrDash(row.truck),
    tyre_no: valueOrDash(row.tyre_no),
    brand: valueOrDash(row.brand),
    position: valueOrDash(row.position),
    odometer: formatNumber(row.odometer),
    rtd1: valueOrDash(row.rtd1),
    rtd2: valueOrDash(row.rtd2),
    psi_found: valueOrDash(row.psi_found),
    psi_corrected: valueOrDash(row.psi_corrected),
    remarks: valueOrDash(row.remarks)
  }));

  exportRowsAsCsv({
    filename: `inspection-records-${today()}.csv`,
    columns: [
      { label: 'Date', key: 'activity_date' },
      { label: 'Activity', key: 'activity_type' },
      { label: 'Truck', key: 'truck' },
      { label: 'Tyre Number', key: 'tyre_no' },
      { label: 'Brand', key: 'brand' },
      { label: 'Position', key: 'position' },
      { label: 'Odometer', key: 'odometer' },
      { label: 'RTD1', key: 'rtd1' },
      { label: 'RTD2', key: 'rtd2' },
      { label: 'PSI Found', key: 'psi_found' },
      { label: 'PSI Corrected', key: 'psi_corrected' },
      { label: 'Remarks', key: 'remarks' }
    ],
    rows: tableReplicaRows
  });

  toast('Inspection CSV exported.', 'success');
}

function exportAnalyticsLifeExcel() {
  const rows = getAnalyticsLifeRows();
  if (!rows.length) {
    toast('No life analytics rows to export.', 'info');
    return;
  }

  exportRowsAsExcel({
    filename: `analytics-life-${today()}.xlsx`,
    sheetName: 'Life Analytics',
    title: 'Target vs Actual Tyre Life',
    subtitle: 'Per-tyre target comparison and CPK view',
    columns: [
      { label: 'Tyre No', key: 'tyre_no' },
      { label: 'Brand', key: 'brand' },
      { label: 'Truck', key: 'truck' },
      { label: 'Fitment Date', key: 'fitment_date' },
      { label: 'Removal Date', key: 'removal_date' },
      { label: 'Target Life', key: 'target_life' },
      { label: 'Actual Life', key: 'actual_life' },
      { label: 'Variance', key: 'variance' },
      { label: 'Tyre Status', key: 'tyre_status' },
      { label: 'Performance Status', key: 'performance_status' },
      { label: 'Tyre Cost', key: 'tyre_cost' },
      { label: 'CPK', key: 'cpk' }
    ],
    rows: rows.map((row) => ({
      ...row,
      target_life: formatNumber(row.target_life),
      actual_life: formatNumber(row.actual_life),
      variance: formatNumber(row.variance),
      tyre_cost: formatNumber(row.tyre_cost),
      cpk: formatNumber(row.cpk),
      fitment_date: valueOrDash(row.fitment_date),
      removal_date: valueOrDash(row.removal_date),
      tyre_status: valueOrDash(row.tyre_status),
      performance_status: valueOrDash(row.performance_status)
    }))
  });

  toast('Life analytics Excel exported.', 'success');
}

function exportAnalyticsRubberExcel() {
  const rows = getAnalyticsRubberRows();
  if (!rows.length) {
    toast('No rubber analytics rows to export.', 'info');
    return;
  }

  exportRowsAsExcel({
    filename: `analytics-rubber-${today()}.xlsx`,
    sheetName: 'Rubber Analytics',
    title: 'Rubber Utilisation Analysis',
    subtitle: 'Removed tyres only: original vs removal tread depth and value remaining at removal',
    columns: [
      { label: 'Tyre No', key: 'tyre_no' },
      { label: 'Brand', key: 'brand' },
      { label: 'Truck', key: 'truck' },
      { label: 'Tyre Life', key: 'tyre_life' },
      { label: 'Original RTD', key: 'original_rtd' },
      { label: 'Removal RTD', key: 'removal_rtd' },
      { label: 'Rubber Used %', key: 'rubber_used_pct' },
      { label: 'Rubber Wasted %', key: 'rubber_wasted_pct' },
      { label: 'Tyre Cost', key: 'tyre_cost' },
      { label: 'Value Lost', key: 'value_lost' }
    ],
    rows: rows.map((row) => ({
      ...row,
      tyre_life: formatNumber(row.tyre_life),
      original_rtd: formatNumber(row.original_rtd),
      removal_rtd: formatNumber(row.removal_rtd),
      rubber_used_pct: formatPercent(row.rubber_used_pct),
      rubber_wasted_pct: formatPercent(row.rubber_wasted_pct),
      tyre_cost: formatNumber(row.tyre_cost),
      value_lost: formatCurrencyOrDash(row.value_lost)
    }))
  });

  toast('Rubber analytics Excel exported.', 'success');
}

function exportAnalyticsBrandExcel() {
  if (!state.analytics?.sectionC?.length) {
    toast('No brand analytics rows to export.', 'info');
    return;
  }

  const rows = [...state.analytics.sectionC];

  exportRowsAsExcel({
    filename: `analytics-brand-${today()}.xlsx`,
    sheetName: 'Brand Analytics',
    title: 'Brand-wise Performance Summary',
    subtitle: 'Life and cost efficiency grouped by brand/year',
    columns: [
      { label: 'Brand', key: 'brand' },
      { label: 'Year', key: 'year' },
      { label: 'No. of Tyres', key: 'tyre_count' },
      { label: 'Avg Life Achieved', key: 'avg_life_achieved' },
      { label: 'Target Life', key: 'target_life' },
      { label: 'Achievement %', key: 'achievement_pct' },
      { label: 'Avg Tyre Cost', key: 'avg_tyre_cost' },
      { label: 'CPK', key: 'cpk' }
    ],
    rows: rows.map((row) => ({
      ...row,
      tyre_count: formatNumber(row.tyre_count),
      avg_life_achieved: formatNumber(row.avg_life_achieved),
      target_life: formatNumber(row.target_life),
      achievement_pct: formatPercent(row.achievement_pct),
      avg_tyre_cost: formatCurrencyOrDash(row.avg_tyre_cost),
      cpk: formatNumber(row.cpk)
    }))
  });

  toast('Brand analytics Excel exported.', 'success');
}

function exportAnalyticsFuelExcel() {
  if (!state.analytics?.sectionD?.length) {
    toast('No fuel analytics rows to export.', 'info');
    return;
  }

  const rows = state.analytics.sectionD.map((row) => ({
    ...row,
    total_trucks: formatNumber(row.total_trucks),
    total_trips: formatNumber(row.total_trips),
    total_kms: formatNumber(row.total_kms),
    diesel_consumed: formatNumber(row.diesel_consumed),
    km_per_litre: formatNumber(row.km_per_litre),
    fuel_per_truck: formatNumber(row.fuel_per_truck),
    variance_vs_base: formatNumber(row.variance_vs_base),
    variance_vs_previous: formatNumber(row.variance_vs_previous)
  }));

  exportRowsAsExcel({
    filename: `analytics-fuel-${today()}.xlsx`,
    sheetName: 'Fuel Analytics',
    title: 'Fleet Fuel Performance Snapshot',
    subtitle: 'Month-wise fuel trend and baseline variance',
    columns: [
      { label: 'Month', key: 'month' },
      { label: 'Total Trucks', key: 'total_trucks' },
      { label: 'Total Trips', key: 'total_trips' },
      { label: 'Total KMs', key: 'total_kms' },
      { label: 'Diesel Consumed', key: 'diesel_consumed' },
      { label: 'Km/L', key: 'km_per_litre' },
      { label: 'Fuel per Truck', key: 'fuel_per_truck' },
      { label: 'Variance vs Base', key: 'variance_vs_base' },
      { label: 'Variance vs Previous', key: 'variance_vs_previous' }
    ],
    rows
  });

  toast('Fuel analytics Excel exported.', 'success');
}

function exportAnalyticsPressureDailyExcel() {
  const showDailyPressure = state.pressureViewMode === 'daily';
  const rows = getAnalyticsPressureRows(showDailyPressure);

  if (!rows.length) {
    toast(showDailyPressure ? 'No pressure daily rows to export.' : 'No pressure summary rows to export.', 'info');
    return;
  }

  exportRowsAsExcel({
    filename: showDailyPressure
      ? `analytics-pressure-daily-${today()}.xlsx`
      : `analytics-pressure-summary-${today()}.xlsx`,
    sheetName: showDailyPressure ? 'Pressure Daily' : 'Pressure Summary',
    title: showDailyPressure ? 'Pressure Leakage Impact (Daily)' : 'Pressure Leakage Impact (Tyre Summary)',
    subtitle: showDailyPressure
      ? 'Observed pressure checks with calculated daily impact. Rows grouped by tyre then date.'
      : 'Tyre-wise pressure impact summary using observed checks only.',
    columns: showDailyPressure
      ? [
        { label: 'Date', key: 'metric_date' },
        { label: 'Tyre No', key: 'tyre_no' },
        { label: 'Truck', key: 'truck' },
        { label: 'Position', key: 'position' },
        { label: 'Tyre PSI (Day)', key: 'pressure_psi' },
        { label: 'Leak/Day', key: 'psi_drop_per_day' },
        { label: 'Fuel Increase %', key: 'fuel_increase_pct' },
        { label: 'Rolling Resistance %', key: 'rolling_resistance_increase_pct' },
        { label: 'Fuel Loss', key: 'fuel_loss_inr' },
        { label: 'Tyre Value Loss', key: 'tyre_value_loss_inr' },
        { label: 'Daily Loss', key: 'total_loss_inr' },
        { label: 'Cumulative Loss (Tyre)', key: 'cumulative_loss_inr' }
      ]
      : [
        { label: 'Tyre No', key: 'tyre_no' },
        { label: 'Truck', key: 'truck' },
        { label: 'Position', key: 'position' },
        { label: 'Current PSI', key: 'last_psi' },
        { label: 'Leak/Day', key: 'estimated_daily_psi_drop' },
        { label: 'Fuel Increase %', key: 'fuel_increase_pct' },
        { label: 'Rolling Resistance %', key: 'rolling_resistance_increase_pct' },
        { label: 'Hours Since Check', key: 'hours_since_check' },
        { label: 'Daily Loss', key: 'daily_loss_inr' },
        { label: 'MTD Loss', key: 'mtd_loss_inr' },
        { label: 'Total Loss', key: 'total_loss_inr' },
        { label: 'Confidence %', key: 'confidence_pct' }
      ],
    rows: showDailyPressure
      ? rows.map((row) => ({
        ...row,
        pressure_psi: formatNumber(row.pressure_psi),
        psi_drop_per_day: formatNumber(row.psi_drop_per_day),
        fuel_loss_inr: currency(row.fuel_loss_inr),
        tyre_value_loss_inr: currency(row.tyre_value_loss_inr),
        total_loss_inr: currency(row.total_loss_inr),
        cumulative_loss_inr: currency(row.cumulative_loss_inr),
        fuel_increase_pct: `${formatNumber(row.fuel_increase_pct)}%`,
        rolling_resistance_increase_pct: `${formatNumber(row.rolling_resistance_increase_pct)}%`
      }))
      : rows.map((row) => ({
        ...row,
        last_psi: formatNumber(row.last_psi),
        estimated_daily_psi_drop: formatNumber(row.estimated_daily_psi_drop),
        hours_since_check: formatNumber(row.hours_since_check),
        daily_loss_inr: currency(row.daily_loss_inr),
        mtd_loss_inr: currency(row.mtd_loss_inr),
        total_loss_inr: currency(row.total_loss_inr),
        confidence_pct: formatPercent(row.confidence_pct),
        fuel_increase_pct: `${formatNumber(row.fuel_increase_pct)}%`,
        rolling_resistance_increase_pct: `${formatNumber(row.rolling_resistance_increase_pct)}%`
      }))
  });

  toast(showDailyPressure ? 'Pressure daily Excel exported.' : 'Pressure summary Excel exported.', 'success');
}

function exportSavingsExcel() {
  if (!state.analytics?.savings?.length) {
    toast('No savings rows to export.', 'info');
    return;
  }

  const rows = state.analytics.savings.map((row) => ({
    parameter: row.parameter,
    target: row.target,
    current: row.current,
    variance: row.variance,
    impact: financialImpactLabel(row.impact)
  }));

  rows.push({
    parameter: 'Total',
    target: '-',
    current: '-',
    variance: '-',
    impact: financialImpactLabel(state.analytics.totalImpact)
  });

  exportRowsAsExcel({
    filename: `savings-${today()}.xlsx`,
    sheetName: 'Savings',
    title: 'Savings Achieved',
    subtitle: 'Financial impact rollup across tyre life, rubber, fuel and pressure leakage',
    columns: [
      { label: 'Parameter', key: 'parameter' },
      { label: 'Target', key: 'target' },
      { label: 'Current', key: 'current' },
      { label: 'Variance', key: 'variance' },
      { label: 'Financial Impact Since Start', key: 'impact' }
    ],
    rows
  });

  toast('Savings Excel exported.', 'success');
}

function renderTableBody(container, rows, rowRenderer, colSpan, emptyText) {
  container.innerHTML = '';
  if (!Array.isArray(rows) || rows.length === 0) {
    container.innerHTML = `<tr><td colspan="${colSpan}">${emptyText}</td></tr>`;
    return;
  }

  rows.forEach((row) => {
    container.insertAdjacentHTML('beforeend', rowRenderer(row));
  });
}

/* ═══════════════════════════════════════════════════════════
   Analytics Search Filter
   ═══════════════════════════════════════════════════════════ */

const ANALYTICS_REPORTS = [
  { id: 'fleetHealth', name: 'Fleet Health Score', cat: 'fleet', section: 'fleetHealth' },
  { id: 'tyreLifeCharts', name: 'Tyre Life Overview — Charts', cat: 'fleet', section: 'tyreLifeCharts' },
  { id: 'tyreLife', name: 'Target vs Actual Tyre Life', cat: 'fleet', section: 'tyreLife' },
  { id: 'rubberCharts', name: 'Rubber Utilisation — Charts', cat: 'fleet', section: 'rubberCharts' },
  { id: 'rubberUtil', name: 'Rubber Utilisation Analysis', cat: 'fleet', section: 'rubberUtil' },
  { id: 'brandCharts', name: 'Brand-wise Analysis — Charts', cat: 'brand', section: 'brandCharts' },
  { id: 'brandWise', name: 'Brand-wise Performance Summary', cat: 'brand', section: 'brandWise' },
  { id: 'pressureCharts', name: 'Reduced Pressure Losses — Charts', cat: 'pressure', section: 'pressureCharts' },
  { id: 'pressureLeakage', name: 'Pressure Leakage Impact', cat: 'pressure', section: 'pressureLeakage' },
  { id: 'pressureFuelCost', name: 'Pressure vs Fuel Cost', cat: 'financial', section: 'pressureFuelCost' },
  { id: 'pressureHeatmap', name: 'Pressure Heatmap', cat: 'pressure', section: 'pressureHeatmap' },
  { id: 'ageDist', name: 'Tyre Age Distribution', cat: 'fleet', section: 'ageDist' },
  { id: 'defectTrend', name: 'Defect Trend by Position', cat: 'fleet', section: 'defectTrend' },
  { id: 'removalReasons', name: 'Removal Reasons', cat: 'fleet', section: 'removalReasons' },
  { id: 'rtdScrapping', name: 'RTD Scrapping Recommendation', cat: 'fleet', section: 'rtdScrapping' },
  { id: 'retreadEligible', name: 'Retread Eligibility', cat: 'fleet', section: 'retreadEligible' },
  { id: 'brandCostPerKm', name: 'Brand-wise Cost per KM', cat: 'financial', section: 'brandCostPerKm' },
  { id: 'tyrePnL', name: 'P&L per Tyre', cat: 'financial', section: 'tyrePnL' },
  { id: 'savings', name: 'Savings Achieved', cat: 'financial', section: 'savings' }
];

function initAnalyticsSearch() {
  const input = document.getElementById('analyticsSearchInput');
  const clearBtn = document.getElementById('analyticsSearchClear');
  const dropdown = document.getElementById('analyticsSearchDropdown');
  if (!input || !dropdown) return;

  let debounceTimer = null;

  input.addEventListener('input', () => {
    const query = input.value.trim();
    clearBtn.style.display = query ? '' : 'none';

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (query.length === 0) {
        dropdown.style.display = 'none';
        return;
      }
      showSearchResults(query, dropdown);
    }, 200);
  });

  input.addEventListener('focus', () => {
    if (input.value.trim().length > 0) {
      showSearchResults(input.value.trim(), dropdown);
    }
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.style.display = 'none';
    dropdown.style.display = 'none';
    input.focus();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.ob-search-wrap')) {
      dropdown.style.display = 'none';
    }
  });

  input.addEventListener('keydown', (e) => {
    const items = dropdown.querySelectorAll('.ob-search-result');
    const active = dropdown.querySelector('.ob-search-result.active');
    let idx = Array.from(items).indexOf(active);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      idx = Math.min(idx + 1, items.length - 1);
      items.forEach(i => i.classList.remove('active'));
      if (items[idx]) items[idx].classList.add('active');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      idx = Math.max(idx - 1, 0);
      items.forEach(i => i.classList.remove('active'));
      if (items[idx]) items[idx].classList.add('active');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active) active.click();
    } else if (e.key === 'Escape') {
      dropdown.style.display = 'none';
      input.blur();
    }
  });
}

function showSearchResults(query, dropdown) {
  const q = query.toLowerCase();
  const enabledSet = new Set(state.enabledReports || []);

  let filtered = ANALYTICS_REPORTS.filter(r =>
    r.name.toLowerCase().includes(q) ||
    r.cat.toLowerCase().includes(q) ||
    r.id.toLowerCase().includes(q)
  );

  if (q === 'all') filtered = ANALYTICS_REPORTS;
  else if (q === 'unlocked') filtered = ANALYTICS_REPORTS.filter(r => enabledSet.has(r.section) || enabledSet.length === 0);
  else if (q === 'locked') filtered = ANALYTICS_REPORTS.filter(r => !enabledSet.has(r.section) && enabledSet.length > 0);

  if (filtered.length === 0) {
    dropdown.innerHTML = `<div class="ob-search-empty">No reports match "${escapeHtml(query)}"<br><span style="font-size:0.72rem;color:#64748b;">Try: pressure, brand, tyre, savings</span></div>`;
    dropdown.style.display = '';
    return;
  }

  dropdown.innerHTML = filtered.map(r => {
    const isUnlocked = enabledSet.length === 0 || enabledSet.has(r.section);
    const highlighted = r.name.replace(new RegExp(`(${escapeRegex(query)})`, 'gi'), '<mark>$1</mark>');
    return `
      <div class="ob-search-result" data-section="${r.section}" data-report-id="${r.id}">
        <span class="ob-search-result-name">${highlighted}</span>
        <span class="ob-search-result-cat cat-${r.cat}">${r.cat}</span>
        <span class="ob-search-result-dot ${isUnlocked ? 'dot-unlocked' : 'dot-locked'}"></span>
      </div>
    `;
  }).join('');

  dropdown.style.display = '';

  dropdown.querySelectorAll('.ob-search-result').forEach(el => {
    el.addEventListener('click', () => {
      const section = el.dataset.section;
      const reportId = el.dataset.reportId;
      dropdown.style.display = 'none';
      document.getElementById('analyticsSearchInput').value = '';

      switchTab('analytics');

      setTimeout(() => {
        const target = document.querySelector(`[data-report="${section}"]`) ||
                       document.getElementById(section);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.style.transition = 'box-shadow 0.3s ease';
          target.style.boxShadow = '0 0 20px rgba(218, 165, 32, 0.3)';
          setTimeout(() => { target.style.boxShadow = ''; }, 1500);
        }
      }, 100);
    });
  });
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function paginateRows(rows, page, pageSize) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const size = Math.max(1, Number(pageSize || 25));
  const total = normalizedRows.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const currentPage = Math.min(Math.max(1, Number(page || 1)), totalPages);
  const startIndex = (currentPage - 1) * size;
  const endIndex = Math.min(startIndex + size, total);

  return {
    rows: normalizedRows.slice(startIndex, endIndex),
    page: currentPage,
    totalPages,
    total,
    start: total === 0 ? 0 : startIndex + 1,
    end: endIndex
  };
}

function renderPagerState({ metaEl, pageEl, prevEl, nextEl }, pageData, noun = 'rows') {
  if (metaEl) {
    metaEl.textContent = pageData.total === 0
      ? `Showing 0 of 0 ${noun}`
      : `Showing ${pageData.start}-${pageData.end} of ${pageData.total} ${noun}`;
  }

  if (pageEl) {
    pageEl.textContent = `Page ${pageData.page} / ${pageData.totalPages}`;
  }

  if (prevEl) {
    prevEl.disabled = pageData.page <= 1;
  }

  if (nextEl) {
    nextEl.disabled = pageData.page >= pageData.totalPages;
  }
}

function formatFieldValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString();
}

function formatDateOnly(value) {
  if (!value) return '-';

  const raw = String(value).trim();
  if (!raw || raw === '-') return '-';

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function prettifyStepId(stepId) {
  const normalized = String(stepId || '').trim().toLowerCase();
  if (!normalized) return '-';
  return normalized
    .replace(/_voice$/i, '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatTranscript(transcript) {
  const text = String(transcript || '').trim();
  if (!text) return '-';
  if (text.length <= 140) {
    return text;
  }
  return `${text.slice(0, 140)}...`;
}

function parseValue(raw) {
  if (raw.toLowerCase() === 'true') return true;
  if (raw.toLowerCase() === 'false') return false;
  if (!Number.isNaN(Number(raw)) && raw.trim() !== '') return Number(raw);
  return raw;
}

function escapeHtml(str) {
  const text = String(str ?? '');
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

function formatWholeNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return Math.round(number).toLocaleString();
}

function normalize(value) {
  return String(value || '').trim().toUpperCase();
}

function valueOrDash(value) {
  if (value === undefined || value === null || value === '') {
    return '-';
  }
  return String(value);
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '' || value === '-') {
    return '-';
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    return '-';
  }
  return number.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return '-';
  }
  return `${formatNumber(number)}%`;
}

function currency(value) {
  const amount = Number(value || 0);
  return `INR ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatCurrencyOrDash(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return '-';
  }
  return currency(amount);
}

function financialImpactLabel(value) {
  const numeric = Number(value || 0);
  const amount = Math.abs(numeric);
  const label = numeric > 0 ? 'Profit' : (numeric < 0 ? 'Loss' : 'Neutral');
  const formatted = `INR ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `${formatted} (${label})`;
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function toast(message, type = 'info') {
  const toastNode = document.createElement('div');
  toastNode.className = `toast toast-${type}`;
  toastNode.textContent = message;
  elements.toastHost.appendChild(toastNode);
  setTimeout(() => toastNode.remove(), 3200);
}

} // end if (!__isOnboardingPreview)
