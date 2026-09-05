import { analyzeCaptureQuality, createPreviewUrl, hashBlob } from '../lib/media.js';
import { QUEUE_STATUS } from '../lib/constants.js';
import {
  getQueueView,
  initializeDeviceContext,
  recoverInterruptedQueueItems,
  retryQueueItemById,
  runSyncCycle,
  saveCaptureSubmission
} from '../lib/queue-engine.js';
import { logoutToLogin, requireFitterSession } from '../lib/session.js';
import { bootstrapFitterPwa, isStandaloneMode } from '../lib/pwa-bootstrap.js';
import { createId, showToast } from '../lib/ui.js';
import {
  VoiceCaptureService,
  convertAudioToWavBlob,
  getMicrophonePermissionState,
  requestMicrophonePermissionPrompt
} from '../services/voice-capture.js';
import {
  buildVoiceStepId,
  enrichPreferredForForm,
  normalizeFieldValue,
  requestVoiceExtraction,
  resolvePreferredFieldValue
} from '../services/voice-processing.js';
import { POSITION_CODES, normalizePositionCode, listPositionMasters } from '../../../shared/field-masters.js';

const POSITION_FRIENDLY_NAMES = Object.fromEntries(
  listPositionMasters().map(p => [p.code, p.name])
);

const session = requireFitterSession();
if (!session) {
  throw new Error('No valid fitter session');
}

// Shared field components for the Tyre Fitment and Tyre Inspection modules so
// both screens expose an identical set of inputs.
const TYRE_FITMENT_INSPECTION_FIELDS = [
  { id: 'tyre_number', dataKey: 'tyre_serial', icon: 'serial', label: 'Tyre Number', required: true },
  { id: 'fitment_type', dataKey: 'fitment_type', icon: 'condition', label: 'Tyre Condition (New/Old)', required: true },
  { id: 'truck_number', dataKey: 'vehicle_no', icon: 'truck', label: 'Truck Number', required: true },
  { id: 'position', dataKey: 'position_code', icon: 'pin', label: 'Position', required: true },
  { id: 'make', dataKey: 'make', icon: 'make', label: 'Make', required: true },
  { id: 'model', dataKey: 'model', icon: 'model', label: 'Tyre Model', required: false },
  { id: 'size', dataKey: 'size', icon: 'size', label: 'Size', required: true },
  { id: 'odometer_reading', dataKey: 'meter_reading', icon: 'odometer', label: 'Odometer Reading', required: true },
  { id: 'rtd1', dataKey: 'rtd1', icon: 'rtd', label: 'RTD 1', required: true },
  { id: 'rtd2', dataKey: 'rtd2', icon: 'rtd', label: 'RTD 2', required: true },
  { id: 'remarks', dataKey: 'remarks', icon: 'reason', label: 'Remarks', required: false }
];

const MODULES = [
  {
    id: 'fitment',
    formType: 'tyre_card',
    label: 'Tyre Fitment',
    icon: 'wheel',
    fields: TYRE_FITMENT_INSPECTION_FIELDS
  },
  {
    id: 'pressure',
    formType: 'pressure_check',
    label: 'Pressure Entry',
    icon: 'pressure',
    fields: [
      { id: 'truck_number', dataKey: 'vehicle_no', icon: 'truck', label: 'Truck Number', required: true },
      { id: 'odometer_reading', dataKey: 'meter_reading', icon: 'odometer', label: 'Odometer Reading', required: true },
      { id: 'tyre_number', dataKey: 'tyre_serial', icon: 'serial', label: 'Tyre Number', required: true },
      { id: 'make', dataKey: 'make', icon: 'make', label: 'Brand', required: false },
      { id: 'size', dataKey: 'size', icon: 'size', label: 'Size', required: false },
      { id: 'position', dataKey: 'position_code', icon: 'pin', label: 'Position', required: true },
      { id: 'tyre_not_found', dataKey: 'tyre_not_found', icon: 'reason', label: 'Tyre Not Found (Yes/No)', required: false },
      { id: 'pressure', dataKey: 'found_psi', icon: 'pressure', label: 'Pressure', required: true }
    ]
  },
  {
    id: 'inspection',
    formType: 'tyre_inspection',
    label: 'Inspection',
    icon: 'rtd',
    fields: TYRE_FITMENT_INSPECTION_FIELDS
  },
  {
    id: 'removal',
    formType: 'tyre_removal',
    label: 'Tyre Removal',
    icon: 'removal',
    fields: [
      { id: 'truck_number', dataKey: 'vehicle_no', icon: 'truck', label: 'Truck Number', required: true },
      { id: 'tyre_number', dataKey: 'tyre_serial', icon: 'serial', label: 'Tyre Number', required: true },
      { id: 'make', dataKey: 'make', icon: 'make', label: 'Brand', required: false },
      { id: 'size', dataKey: 'size', icon: 'size', label: 'Size', required: false },
      { id: 'position', dataKey: 'position_code', icon: 'pin', label: 'Position', required: true },
      { id: 'odometer_reading', dataKey: 'current_reading', icon: 'odometer', label: 'Odometer Reading', required: true },
      { id: 'rtd1', dataKey: 'rtd1', icon: 'rtd', label: 'RTD 1', required: true },
      { id: 'rtd2', dataKey: 'rtd2', icon: 'rtd', label: 'RTD 2', required: true },
      { id: 'removal_reason', dataKey: 'removal_reason', icon: 'reason', label: 'Removal Reason', required: true }
    ]
  }
];

const FITMENT_INTRO_FIELD_IDS = ['fitment_type', 'tyre_number'];
const FITMENT_AUTOFILL_DATA_KEYS = ['vehicle_no', 'position_code', 'make', 'size', 'rtd1', 'rtd2'];

const MODULE_SEQUENCE_CONFIG = {
  fitment: {
    initialKeys: ['vehicle_no', 'meter_reading'],
    fixedKeys: ['vehicle_no', 'meter_reading'],
    dynamicKeys: ['position_code', 'tyre_serial', 'fitment_type', 'make', 'model', 'size', 'rtd1', 'rtd2'],
    optionalDynamicKeys: ['remarks']
  },
  inspection: {
    initialKeys: ['vehicle_no', 'meter_reading'],
    fixedKeys: ['vehicle_no', 'meter_reading'],
    dynamicKeys: ['position_code', 'tyre_serial', 'fitment_type', 'make', 'model', 'size', 'rtd1', 'rtd2'],
    optionalDynamicKeys: ['remarks']
  },
  pressure: {
    initialKeys: ['vehicle_no', 'meter_reading'],
    fixedKeys: ['vehicle_no', 'meter_reading'],
    dynamicKeys: ['position_code', 'tyre_serial', 'found_psi', 'tyre_not_found'],
    optionalDynamicKeys: ['make', 'size']
  },
  removal: {
    initialKeys: ['vehicle_no'],
    fixedKeys: ['vehicle_no'],
    dynamicKeys: ['position_code', 'tyre_serial', 'current_reading', 'rtd1', 'rtd2', 'removal_reason'],
    optionalDynamicKeys: ['make', 'size']
  }
};

const TYRE_POSITION_IMG_SRC = './src/assets/layouts/tyre-position.png';

const MODULE_ICON_ASSETS = {
  wheel: './src/assets/icons/modules/tyre-fitment.svg',
  pressure: './src/assets/icons/modules/pressure-entry.svg',
  rtd: './src/assets/icons/modules/inspection.svg',
  removal: './src/assets/icons/modules/tyre-removal.svg',
  observation: './src/assets/icons/modules/observation.svg',
  default: './src/assets/icons/modules/default.svg'
};

const FIELD_ICON_ASSETS = {
  serial: './src/assets/icons/fields/tyre-number.svg',
  truck: './src/assets/icons/fields/truck-number.svg',
  pin: './src/assets/icons/fields/position.svg',
  make: './src/assets/icons/fields/make.svg',
  model: './src/assets/icons/fields/model.svg',
  size: './src/assets/icons/fields/size.svg',
  odometer: './src/assets/icons/fields/odometer.svg',
  rtd: './src/assets/icons/fields/tread-depth.svg',
  condition: './src/assets/icons/fields/condition.svg',
  pressure: './src/assets/icons/fields/pressure.svg',
  reason: './src/assets/icons/fields/reason.svg',
  removal: './src/assets/icons/fields/reason.svg',
  observation: './src/assets/icons/fields/observation.svg',
  wheel: './src/assets/icons/fields/tyre-number.svg',
  default: './src/assets/icons/fields/default.svg'
};

const state = {
  activeModuleId: null,
  draftByModule: {},
  recordingFieldId: null,
  pendingRecordingFieldId: null,
  isSaving: false,
  isAutoSyncing: false,
  micPermissionState: 'unknown',
  liveTranscript: '',
  recordingTimerInterval: null
};

const recorder = new VoiceCaptureService();

const elements = {
  dashboardView: document.getElementById('dashboardView'),
  moduleGrid: document.getElementById('moduleGrid'),
  dashboardCompanyName: document.getElementById('dashboardCompanyName'),
  dashboardUserName: document.getElementById('dashboardUserName'),
  dashboardLogoutBtn: document.getElementById('dashboardLogoutBtn'),
  dashboardPendingCount: document.getElementById('dashboardPendingCount'),
  dashboardNetworkHint: document.getElementById('dashboardNetworkHint'),
  dashboardSyncBtn: document.getElementById('dashboardSyncBtn'),
  micPermissionBanner: document.getElementById('micPermissionBanner'),
  micPermissionText: document.getElementById('micPermissionText'),
  micPermissionBtn: document.getElementById('micPermissionBtn'),
  modulePanel: document.getElementById('modulePanel'),
  panelBackBtn: document.getElementById('panelBackBtn'),
  panelIcon: document.getElementById('panelIcon'),
  panelTitle: document.getElementById('panelTitle'),
  fieldGrid: document.getElementById('fieldGrid'),
  panelActions: document.querySelector('.panel-actions'),
  saveOfflineBtn: document.getElementById('saveOfflineBtn'),
  saveSyncBtn: document.getElementById('saveSyncBtn'),
  progressStrip: document.getElementById('progressStrip'),
  progressFill: document.getElementById('progressFill'),
  progressText: document.getElementById('progressText')
};

const MODULE_ACCENT_MAP = {
  fitment:    { accent: 'var(--module-fitment)', soft: 'var(--module-fitment-soft)' },
  pressure:   { accent: 'var(--module-pressure)', soft: 'var(--module-pressure-soft)' },
  inspection: { accent: 'var(--module-inspection)', soft: 'var(--module-inspection-soft)' },
  removal:    { accent: 'var(--module-removal)', soft: 'var(--module-removal-soft)' }
};

init().catch((error) => {
  console.error(error);
  showToast(error.message || 'Failed to initialize fitter voice dashboard', 'error');
});

async function init() {
  void bootstrapFitterPwa();

  await initializeDeviceContext(session);
  await recoverInterruptedQueueItems();
  bindEvents();

  if (elements.dashboardCompanyName) {
    elements.dashboardCompanyName.textContent = session.customerName || session.siteName || 'Company';
  }

  if (elements.dashboardUserName) {
    elements.dashboardUserName.textContent = session.raw?.email || session.username || 'User';
  }

  renderModuleGrid();

  await refreshMicrophoneBanner();
  await refreshDashboardSyncStrip();
  void autoSyncPending({ notify: false, reason: 'init' });

  window.addEventListener('online', () => {
    void refreshDashboardSyncStrip();
    void autoSyncPending({ notify: true, reason: 'online' });
    void autoProcessPendingCaptures();
  });

  window.addEventListener('offline', () => {
    void refreshDashboardSyncStrip();
  });

  window.addEventListener('focus', () => {
    void refreshMicrophoneBanner();
  });

  window.setInterval(() => {
    if (document.visibilityState === 'hidden') {
      return;
    }
    void autoSyncPending({ notify: false, reason: 'interval' });
  }, 20000);
}

async function refreshMicrophoneBanner() {
  if (!elements.micPermissionBanner || !elements.micPermissionText || !elements.micPermissionBtn) {
    return;
  }

  const permission = await getMicrophonePermissionState();
  state.micPermissionState = permission.state;

  if (permission.state === 'granted') {
    elements.micPermissionBanner.classList.add('hidden');
    return;
  }

  elements.micPermissionBanner.classList.remove('hidden');
  elements.micPermissionText.textContent = permission.message;

  if (permission.state === 'denied') {
    elements.micPermissionBtn.textContent = isStandaloneMode() ? 'Try Permission Again' : 'Allow Microphone';
  } else if (permission.state === 'unsupported' || permission.state === 'insecure') {
    elements.micPermissionBtn.textContent = 'Check Microphone';
  } else {
    elements.micPermissionBtn.textContent = 'Enable Microphone';
  }
}

async function handleMicrophonePermissionClick() {
  try {
    await requestMicrophonePermissionPrompt();
    showToast('Microphone access enabled for DX Fitter.', 'success');
  } catch (error) {
    showToast(error.message || 'Unable to enable microphone right now.', 'error');
  } finally {
    await refreshMicrophoneBanner();
  }
}

function bindEvents() {
  elements.panelBackBtn.addEventListener('click', closeModulePanel);
  elements.fieldGrid.addEventListener('click', handleFieldActionClick);
  elements.fieldGrid.addEventListener('input', handleFieldInput);

  if (elements.dashboardLogoutBtn) {
    elements.dashboardLogoutBtn.addEventListener('click', () => {
      logoutToLogin();
    });
  }

  if (elements.dashboardSyncBtn) {
    elements.dashboardSyncBtn.addEventListener('click', () => {
      void manualSyncBypassBackoff();
    });
  }

  if (elements.micPermissionBtn) {
    elements.micPermissionBtn.addEventListener('click', () => {
      void handleMicrophonePermissionClick();
    });
  }
  elements.saveOfflineBtn.addEventListener('click', () => {
    void handlePanelSecondaryAction();
  });
  elements.saveSyncBtn.addEventListener('click', () => {
    void handlePanelPrimaryAction();
  });
}

async function handlePanelSecondaryAction() {
  const module = getActiveModule();
  if (!module) return;

  const draft = ensureDraft(module.id);
  const flow = ensureDraftFlow(draft);

  if (!isPagedModule(module.id)) {
    await saveActiveModule({ sync: false });
    return;
  }

  const sequence = ensurePositionSequence(module, draft);
  const sequenceReady = Boolean(sequence?.layoutReady);
  const viewStage = String(sequence?.viewStage || (sequenceReady ? 'layout' : 'setup'));

  if (!sequenceReady || viewStage === 'setup' || viewStage === 'layout') {
    closeModulePanel();
    return;
  }

  if (viewStage === 'entry') {
    if (recorder.isRecording) {
      recorder.stop();
      state.recordingFieldId = null;
    }
    persistSequenceDraft(module, draft);
    sequence.dialog = null;
    sequence.prompt = null;
    sequence.viewStage = 'layout';
    renderActiveModuleFields();
  }
}

async function handlePanelPrimaryAction() {
  if (state.isSaving || state.isAutoSyncing) return;
  const module = getActiveModule();
  if (!module) return;

  const draft = ensureDraft(module.id);
  const flow = ensureDraftFlow(draft);

  if (!isPagedModule(module.id)) {
    await saveActiveModule({ sync: true });
    return;
  }

  const sequence = ensurePositionSequence(module, draft);
  const sequenceReady = Boolean(sequence?.layoutReady);
  const viewStage = String(sequence?.viewStage || (sequenceReady ? 'layout' : 'setup'));

  if (!sequenceReady || viewStage === 'setup') {
    if (state.isSaving) return;
    await loadTruckLayoutForModule(module, draft);
    return;
  }

  if (viewStage === 'entry') {
    await saveActiveModule({ sync: navigator.onLine });
  }
}

function renderModuleGrid() {
  elements.moduleGrid.innerHTML = '';

  for (const module of MODULES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'module-box';
    button.dataset.moduleId = module.id;
    const accent = MODULE_ACCENT_MAP[module.id];
    if (accent) {
      button.style.setProperty('--module-accent', accent.accent);
      button.style.setProperty('--module-accent-soft', accent.soft);
    }
    const cardMeta = 'Voice Enabled';
    button.innerHTML = `
      <span class="module-box-icon">${getModuleIconMarkup(module.icon, module.label)}</span>
      <span class="module-box-label">${module.label}</span>
      <span class="module-box-meta">${cardMeta}</span>
      <span class="module-box-hint">Tap anywhere to start</span>
    `;
    button.addEventListener('click', () => openModulePanel(module.id));
    elements.moduleGrid.appendChild(button);
  }
}

async function refreshDashboardSyncStrip() {
  if (!elements.dashboardPendingCount || !elements.dashboardNetworkHint) {
    return;
  }

  try {
    const queue = await getQueueView();
    const now = Date.now();
    const pendingItems = queue.filter(
      (item) => item.status === QUEUE_STATUS.pending
        || item.status === QUEUE_STATUS.retry
        || item.status === QUEUE_STATUS.running
    );

    const actionablePending = pendingItems.filter((item) => {
      if (item.status === QUEUE_STATUS.pending) return true;
      if (item.status === QUEUE_STATUS.retry) {
        const retryAt = Date.parse(item.next_retry_at || 0);
        return Number.isNaN(retryAt) || retryAt <= now;
      }
      return state.isAutoSyncing;
    }).length;

    const waitingRetry = pendingItems.filter((item) => {
      if (item.status !== QUEUE_STATUS.retry) return false;
      const retryAt = Date.parse(item.next_retry_at || 0);
      return Number.isFinite(retryAt) && retryAt > now;
    }).length;

    const pending = pendingItems.length;
    const failed = queue.filter((item) => item.status === QUEUE_STATUS.failed).length;
    const isOnline = navigator.onLine;

    elements.dashboardPendingCount.textContent = `Pending ${pending}`;

    if (pending === 0 && failed === 0) {
      elements.dashboardNetworkHint.textContent = isOnline
        ? 'All submissions are synced.'
        : 'Offline. New submits will queue and auto-sync when network is back.';
    } else if (isOnline) {
      elements.dashboardNetworkHint.textContent = state.isAutoSyncing
        ? `Network available. Auto-syncing ${actionablePending} pending submission(s)...`
        : (failed > 0
          ? `Network available. ${failed} failed item(s) pending retry.`
          : (waitingRetry > 0 && actionablePending === 0
            ? `Network available. ${waitingRetry} item(s) waiting for retry window.`
            : 'Network available. Pending submissions will auto-sync.'));
    } else {
      elements.dashboardNetworkHint.textContent = 'Offline. Pending submissions will auto-sync after you reconnect.';
    }

    if (elements.dashboardSyncBtn) {
      const hasPendingOrRetry = pending > 0;
      const canRunManual = isOnline && hasPendingOrRetry && !state.isAutoSyncing;
      elements.dashboardSyncBtn.disabled = !canRunManual;
      elements.dashboardSyncBtn.textContent = state.isAutoSyncing
        ? `Auto-syncing (${actionablePending})`
        : (actionablePending > 0
          ? `Sync Pending (${actionablePending})`
          : (hasPendingOrRetry ? 'Retry Now' : 'Sync Pending'));
    }
  } catch (error) {
    console.warn('Dashboard sync strip refresh failed:', error);
    elements.dashboardPendingCount.textContent = 'Pending --';
    elements.dashboardNetworkHint.textContent = 'Unable to read local queue right now.';
    if (elements.dashboardSyncBtn) {
      elements.dashboardSyncBtn.disabled = true;
      elements.dashboardSyncBtn.textContent = 'Sync Pending';
    }
  }
}

async function manualSyncBypassBackoff() {
  if (!navigator.onLine) {
    showToast('Offline now. Saved items will auto-sync when internet is back.', 'info');
    return;
  }
  if (state.isSaving || state.isAutoSyncing) {
    return;
  }

  try {
    const queue = await getQueueView();
    const retrying = queue.filter(
      (item) => item.status === QUEUE_STATUS.retry
        && item.next_retry_at
        && Date.parse(item.next_retry_at) > Date.now()
    );

    for (const item of retrying) {
      try {
        await retryQueueItemById(item.queue_id);
      } catch (err) {
        console.warn('Manual retry reset failed for queue item:', item.queue_id, err);
      }
    }

    await refreshDashboardSyncStrip();
  } catch (err) {
    console.warn('Unable to reset retry items before manual sync:', err);
  }

  await autoSyncPending({ notify: true, reason: 'manual' });
}

async function autoSyncPending({ notify = false, reason = 'auto' } = {}) {
  if (!navigator.onLine) {
    if (notify) {
      showToast('Offline now. Saved items will auto-sync when internet is back.', 'info');
    }
    return;
  }

  if (state.isSaving || state.isAutoSyncing) {
    return;
  }

  let queue = [];
  try {
    queue = await getQueueView();
  } catch (error) {
    console.warn('Unable to read queue before auto-sync:', error);
    if (notify) {
      showToast('Unable to read local queue right now.', 'error');
    }
    return;
  }
  const pending = queue.filter(
    (item) => item.status === QUEUE_STATUS.pending
      || item.status === QUEUE_STATUS.retry
      || item.status === QUEUE_STATUS.running
  ).length;

  if (pending === 0) {
    await refreshDashboardSyncStrip();
    return;
  }

  state.isAutoSyncing = true;
  await refreshDashboardSyncStrip();

  const syncSafetyTimeout = setTimeout(() => {
    if (state.isAutoSyncing) {
      state.isAutoSyncing = false;
      refreshDashboardSyncStrip();
      showToast('Sync is taking longer than expected. Your submission is safe and will retry automatically.', 'info');
    }
  }, 60000);

  try {
    const result = await runSyncCycle({
      force: reason === 'manual',
      onProgress: ({ type, message }) => {
        if (type === 'failed') {
          showToast(message, 'error');
        }
      }
    });

    if (notify && result.processed > 0) {
      showToast(
        reason === 'submit'
          ? `Submitted and synced: ${result.synced} synced, ${result.failed} failed.`
          : `Auto-sync complete: ${result.synced} synced, ${result.failed} failed.`,
        result.failed > 0 ? 'info' : 'success'
      );
    }
  } catch (error) {
    console.error(error);
    if (notify) {
      showToast(error.message || 'Auto-sync failed', 'error');
    }
  } finally {
    clearTimeout(syncSafetyTimeout);
    state.isAutoSyncing = false;
    await refreshDashboardSyncStrip();
  }
}

async function autoProcessPendingCaptures() {
  if (!navigator.onLine) return;

  const module = getActiveModule();
  if (!module) return;

  const draft = ensureDraft(module.id);
  if (!draft?.captures) return;

  let processedCount = 0;

  for (const field of module.fields) {
    const capture = draft.captures[field.id];
    if (!capture?.pipeline?.pendingServerSync || !capture.blob) continue;

    // This capture was recorded offline — process through NVIDIA now
    try {
      const preview = await requestVoiceExtraction({
        audioBlob: capture.blob,
        formType: module.formType,
        stepId: capture.step_id,
        userId: session.userId
      });

      // Server processed successfully — update field value
      const preferredFromAsr = preview.preferredFields || {};
      const candidate = resolvePreferredFieldValue(preferredFromAsr, field.dataKey);
      const transcriptValue = normalizeFieldValue(field.dataKey, preview.transcript || '');
      const candidateValue = normalizeFieldValue(field.dataKey, candidate);
      const value = pickBestFieldValue(field.dataKey, candidateValue, transcriptValue);
      const preserveManualValue = shouldPreserveManualFieldValue(draft, field, capture);
      const appliedAutoValue = hasValue(value) && !preserveManualValue;

      if (appliedAutoValue) {
        draft.values[field.dataKey] = value;
      }

      const scopedPreferred = buildScopedPreferredFields({
        module,
        field,
        preferredFromAsr,
        resolvedValue: hasValue(value) ? value : null
      });
      const normalizedPreferred = enrichPreferredForForm(module.formType, scopedPreferred, draft.values);
      capture.pipeline.extracted_data = {
        preferred_fields: normalizedPreferred
      };
      capture.step_extracted = {
        preferred_fields: normalizedPreferred
      };

      // Update capture pipeline — no longer pending
      capture.pipeline.pendingServerSync = false;
      capture.pipeline.asr_model = preview.asrModel;
      capture.pipeline.asr_transcript = preview.transcript;
      capture.pipeline.asr_confidence = preview.confidence;
      capture.pipeline.asr_error = preview.asrError;
      capture.pipeline.processed_at = new Date().toISOString();

      draft.transcript[field.id] = preview.transcript || '';
      draft.errors[field.id] = preview.asrError || null;
      if (appliedAutoValue) {
        draft.confirmed[field.id] = false;
      }

      processedCount++;
    } catch {
      // Still can't process — leave as pending
    }
  }

  if (processedCount > 0) {
    if (isPagedModule(module.id)) {
      persistSequenceDraft(module, draft);
    }
    renderActiveModuleFields();
    showToast(`${processedCount} voice recording(s) processed. Please review values.`, 'info');
  }
}

function openModulePanel(moduleId) {
  const module = getModule(moduleId);
  if (!module) {
    showToast('Module not found', 'error');
    return;
  }

  state.activeModuleId = module.id;
  state.recordingFieldId = null;
  const draft = ensureDraft(module.id);
  const flow = ensureDraftFlow(draft);

  if (isPagedModule(module.id)) {
    ensurePositionSequence(module, draft, { forceLoad: true });
  }

  elements.panelIcon.innerHTML = getModuleIconMarkup(module.icon, `${module.label} icon`);
  elements.panelTitle.textContent = module.label;
  if (isPagedModule(module.id)) {
    elements.saveOfflineBtn.textContent = 'Exit';
    elements.saveSyncBtn.textContent = 'Continue';
  } else {
    elements.saveOfflineBtn.textContent = 'Save Draft';
    elements.saveSyncBtn.textContent = 'Submit';
  }

  elements.dashboardView.classList.add('hidden');
  elements.modulePanel.classList.remove('hidden');

  renderActiveModuleFields();
}

function closeModulePanel() {
  const module = getActiveModule();
  if (module && isPagedModule(module.id)) {
    const draft = ensureDraft(module.id);
    persistSequenceDraft(module, draft);
  }

  if (recorder.isRecording) {
    recorder.stop();
  }
  recorder.cleanup();
  state.recordingFieldId = null;
  state.pendingRecordingFieldId = null;
  state.activeModuleId = null;

  elements.modulePanel.classList.add('hidden');
  elements.dashboardView.classList.remove('hidden');
  if (elements.panelActions) {
    elements.panelActions.classList.remove('hidden');
  }
  void refreshDashboardSyncStrip();
}

function renderActiveModuleFields() {
  const module = getActiveModule();
  if (!module) {
    elements.fieldGrid.innerHTML = '';
    return;
  }

  const draft = ensureDraft(module.id);
  const flow = ensureDraftFlow(draft);
  const sequenceState = isPagedModule(module.id)
    ? ensurePositionSequence(module, draft)
    : null;
  const sequenceReady = Boolean(sequenceState?.layoutReady);
  const viewStage = sequenceState
    ? String(sequenceState.viewStage || (sequenceReady ? 'layout' : 'setup'))
    : null;
  const isFitmentIntroStage = false;
  const fields = resolveVisibleFields({
    module,
    draft,
    sequenceState,
    isFitmentIntroStage: false,
    sequenceReady
  });

  elements.fieldGrid.innerHTML = '';
  let preFieldsSequenceCard = null;
  let postFieldsSequenceCard = null;
  let sequenceDialogCard = null;
  let pressurePromptCard = null;

  if (sequenceState) {
    const showLayoutStageCards = !sequenceReady || viewStage === 'layout';

    if (showLayoutStageCards) {
      const sequenceCard = renderSequenceLayoutCard({ module, draft, sequenceState, sequenceReady });
      if (sequenceCard) {
        if (!sequenceReady) {
          postFieldsSequenceCard = sequenceCard;
        } else {
          preFieldsSequenceCard = sequenceCard;
        }
      }

      if (sequenceReady && sequenceState.dialog?.open) {
        const dialogCard = renderVerificationDialogCard({ module, sequenceState });
        if (dialogCard) {
          sequenceDialogCard = dialogCard;
        }
      }
    }

    if (sequenceReady && module.id === 'pressure' && sequenceState.prompt?.open) {
      const promptCard = renderPressureCorrectionDialogCard({ sequenceState });
      if (promptCard) {
        pressurePromptCard = promptCard;
      }
    }
  }

  if (preFieldsSequenceCard) {
    elements.fieldGrid.appendChild(preFieldsSequenceCard);
  }

  if (sequenceDialogCard) {
    elements.fieldGrid.appendChild(sequenceDialogCard);
  }

  if (pressurePromptCard) {
    elements.fieldGrid.appendChild(pressurePromptCard);
  }

  if (module.id === 'pressure' && sequenceReady && viewStage === 'entry') {
    const banner = document.createElement('article');
    banner.className = 'flow-banner';
    const psi = Number(draft.values.target_psi ?? sequenceState?.targetPsi);
    const psiText = Number.isFinite(psi) ? String(Math.round(psi)) : '-';
    banner.innerHTML = `
      <strong>Recommended PSI: ${escapeHtml(psiText)}</strong>
      <span>Record pressure for this position.</span>
    `;
    elements.fieldGrid.appendChild(banner);
  }

  if (module.id === 'removal' && sequenceReady && viewStage === 'entry') {
    const banner = document.createElement('article');
    banner.className = 'flow-banner';
    const tyre = String(draft.values.tyre_serial || '').trim().toUpperCase() || '-';
    const position = String(draft.values.position_code || '').trim().toUpperCase() || '-';
    banner.innerHTML = `
      <strong>Remove Tyre: ${escapeHtml(tyre)}</strong>
      <span>Position ${escapeHtml(position)}. Record odometer, RTD1, RTD2 and reason.</span>
    `;
    elements.fieldGrid.appendChild(banner);
  }

  for (const field of fields) {
    const key = field.dataKey;
    const value = draft.values[key] ?? '';
    const confirmed = Boolean(draft.confirmed[field.id]);
    const transcript = String(draft.transcript[field.id] || '').trim();
    const error = draft.validationErrors[field.dataKey] || draft.errors[field.id] || null;
    const capture = draft.captures[field.id] || null;
    const isRecording = state.recordingFieldId === field.id;
    const lockInput = isFieldLocked({ module, field, draft, sequenceState, isFitmentIntroStage, sequenceReady });
    const micDisabled = isMicDisabled({ module, field, draft, sequenceState, isFitmentIntroStage, sequenceReady }) || state.isSaving;

    const isPendingProcess = Boolean(capture?.pipeline?.pendingServerSync);
    const hasCaptureNoValue = Boolean(capture) && !hasValue(value);
    let statusText = 'Awaiting voice input';
    if (isRecording) {
      const elapsed = recorder.durationMs ? (recorder.durationMs / 1000).toFixed(1) : '0.0';
      const live = state.liveTranscript ? ` — "${state.liveTranscript}"` : '';
      statusText = `🔴 Recording ${elapsed}s${live} — Tap Stop when done.`;
    } else if (isPendingProcess && hasCaptureNoValue) {
      statusText = '🎙️ Captured ✓ — will process when online';
    } else if (isPendingProcess && hasValue(value)) {
      statusText = '⏳ Voice captured — will verify when online';
    } else if (error) {
      statusText = friendlyDetectionError(error);
    } else if (hasValue(value)) {
      statusText = confirmed ? 'Confirmed value' : 'Detected value';
    }

    const card = document.createElement('article');
    card.className = `field-card${confirmed ? ' is-confirmed' : ''}${hasValue(value) && !confirmed ? ' needs-confirm' : ''}`;
    card.dataset.fieldId = field.id;
    card.innerHTML = `
      <div class="field-head">
        <div class="field-title-wrap">
          <span class="field-icon">${getFieldIconMarkup(field.icon, field.label)}</span>
          <span class="field-label">${field.label}</span>
        </div>
        <button
          type="button"
          class="mic-btn${isRecording ? ' is-recording' : ''}"
          data-action="record"
          aria-label="${isRecording ? 'Stop recording' : `Record ${field.label}`}"
          ${micDisabled ? 'disabled' : ''}
        >${isRecording ? 'Stop' : 'Mic'}</button>
      </div>

      <div class="confirm-box${error ? ' has-error' : ''}">
        <p class="confirm-status">${escapeHtml(statusText)}</p>
        <input
          type="text"
          class="value-input"
          data-action="value-input"
          data-field-id="${field.id}"
          value="${escapeAttribute(String(value))}"
          placeholder="Detected value will appear here"
          ${lockInput ? 'readonly' : ''}
        >

        <div class="confirm-actions">
          <button type="button" class="mini-btn" data-action="confirm" ${lockInput ? 'disabled' : ''}>${confirmed ? 'Confirmed' : 'Confirm'}</button>
          <button type="button" class="mini-btn" data-action="edit" ${lockInput ? 'disabled' : ''}>Edit</button>
          <button type="button" class="mini-btn" data-action="rerecord" ${micDisabled ? 'disabled' : ''}>Re-record</button>
        </div>

        ${transcript ? `<p class="transcript-line">Heard: ${escapeHtml(transcript)}</p>` : ''}
        ${capture?.previewUrl ? '<p class="transcript-line">Voice captured and stored.</p>' : ''}
      </div>
    `;

    elements.fieldGrid.appendChild(card);
  }

  if (postFieldsSequenceCard) {
    elements.fieldGrid.appendChild(postFieldsSequenceCard);
  }

  if (isFitmentIntroStage) {
    const canContinue = hasValue(draft.values.fitment_type)
      && hasValue(draft.values.tyre_serial);

    const gateActions = document.createElement('div');
    gateActions.className = 'fitment-gate-actions';
    gateActions.innerHTML = `
      <button
        type="button"
        class="action-btn primary"
        data-action="fitment-continue"
        ${canContinue ? '' : 'disabled'}
      >Continue</button>
    `;
    elements.fieldGrid.appendChild(gateActions);
  }

  updateModuleActionButtons(module, draft);
  updateProgressStrip(module, sequenceState, sequenceReady, isFitmentIntroStage, fields, draft);
}

function updateProgressStrip(module, sequenceState, sequenceReady, isFitmentIntroStage, fields, draft) {
  const strip = elements.progressStrip;
  const fill = elements.progressFill;
  const text = elements.progressText;
  if (!strip || !fill) return;

  let pct = 0;
  let label = '';

  if (isPagedModule(module.id) && sequenceReady && sequenceState) {
    const positions = Array.isArray(sequenceState.positions) ? sequenceState.positions : [];
    const doneCount = positions.filter(p => Boolean(sequenceState.saved?.[p])).length;
    const total = positions.length;
    pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
    label = `${doneCount} of ${total} positions completed`;
  } else if (!isPagedModule(module.id)) {
    const total = fields.length;
    if (total > 0) {
      const confirmed = fields.filter(f => Boolean(draft?.confirmed?.[f.id])).length;
      pct = Math.round((confirmed / total) * 100);
      label = `${confirmed} of ${total} fields confirmed`;
    }
  }

  fill.style.width = `${pct}%`;
  if (text) text.textContent = label;
  strip.style.display = (label && pct >= 0) ? '' : 'none';
  if (text) text.style.display = label ? '' : 'none';
}

function renderSequenceLayoutCard({ module, draft, sequenceState, sequenceReady }) {
  if (!sequenceState) {
    return null;
  }

  const card = document.createElement('article');
  card.className = 'truck-layout-card';

  const heading = module.label || 'Module';

  if (!sequenceReady) {
    const config = getModuleSequenceConfig(module.id);
    const initialKeys = Array.isArray(config?.initialKeys) && config.initialKeys.length > 0
      ? config.initialKeys
      : ['vehicle_no'];

    const canLoad = initialKeys.every((key) => hasValue(normalizeFieldValue(key, draft.values[key])));
    const needsOdometer = initialKeys.includes('meter_reading') || initialKeys.includes('current_reading');
    const prompt = needsOdometer
      ? 'Enter truck number and odometer reading to continue.'
      : 'Enter truck number to continue.';

    card.innerHTML = `
      <div class="truck-layout-head">
        <h3>${heading}</h3>
        <p>${prompt}</p>
      </div>
    `;
    return card;
  }

  const positions = Array.isArray(sequenceState.positions) ? sequenceState.positions : [];
  const doneCount = positions.filter(p => Boolean(sequenceState.saved?.[p])).length;

  const tyreCards = positions
    .map((positionCode, index) => {
      const selected = index === sequenceState.currentIndex;
      const verified = Boolean(sequenceState.verified?.[positionCode]);
      const saved = Boolean(sequenceState.saved?.[positionCode]);
      const tyreNo = String(sequenceState.serverTyres?.[positionCode] || '').trim().toUpperCase();
      const friendlyName = POSITION_FRIENDLY_NAMES[positionCode] || positionCode;
      const statusLabel = saved ? 'Done' : (verified ? 'Verified' : 'Pending');
      const ariaTyre = module.id === 'removal' && tyreNo ? `, Tyre ${tyreNo}` : '';

      const disableSelect = module.id === 'removal' && saved;

      const details = module.id === 'removal'
        ? `<div class="tyre-details"><span class="tyre-pos-serial">${escapeHtml(tyreNo || 'Not mapped')}</span></div>`
        : '';

      return `
        <button
          type="button"
          class="tyre-pos-card pos-${positionCode}${module.id === 'removal' ? ' is-removal' : ''}${selected ? ' is-selected' : ''}${verified ? ' is-verified' : ''}${saved ? ' is-saved' : ''}"
          data-action="select-position"
          data-position-code="${escapeAttribute(positionCode)}"
          aria-label="Position ${escapeAttribute(positionCode)}, ${escapeAttribute(friendlyName)}${escapeAttribute(ariaTyre)}, ${escapeAttribute(statusLabel)}"
          ${disableSelect ? 'disabled' : ''}
        >
          <img src="${TYRE_POSITION_IMG_SRC}" alt="" class="tyre-pos-img" draggable="false">
          ${details}
          ${saved ? '<span class="tyre-pos-status status-done" aria-hidden="true">✓</span>' : ''}
        </button>
      `;
    })
    .join('');

  card.innerHTML = `
    <div class="truck-layout-head">
      <h3>${heading}</h3>
      <p>Truck ${escapeHtml(draft.values.vehicle_no || '-')} &bull; ${doneCount}/${positions.length} positions done</p>
    </div>
    <div class="truck-layout-container">
      <div class="truck-tyre-layout" role="listbox" aria-label="Select tyre position">
        <div class="truck-spine">
           <div class="truck-cab"></div>
           <div class="truck-chassis"></div>
        </div>
        ${tyreCards}
      </div>
    </div>
    <p class="truck-layout-hint">${module.id === 'removal' ? 'Tap a tyre to select for removal.' : 'Tap a tyre to select and verify.'}</p>
  `;

  return card;
}

function renderVerificationDialogCard({ module, sequenceState }) {
  const dialog = sequenceState?.dialog;
  if (!dialog?.open) {
    return null;
  }

  const card = document.createElement('article');
  card.className = 'verify-dialog-card verify-overlay';

  const knownTyre = String(dialog.knownTyre || '').trim().toUpperCase();
  const positionName = POSITION_FRIENDLY_NAMES[dialog.position] || dialog.position;
  const promptText = knownTyre
    ? (
      module.id === 'removal'
        ? `Remove tyre <strong>${escapeHtml(knownTyre)}</strong> from <strong>${escapeHtml(positionName)}</strong>?`
        : `Is tyre <strong>${escapeHtml(knownTyre)}</strong> correctly installed at <strong>${escapeHtml(positionName)}</strong>?`
    )
    : `No tyre mapped for <strong>${escapeHtml(positionName)}</strong>.`;

  const showInput = dialog.mode === 'not_found' || !knownTyre;
  const isRecording = state.recordingFieldId === 'dialog_tyre_serial';

  card.innerHTML = `
    <div class="verify-overlay-inner">
      <div class="verify-overlay-header">
        <img src="${TYRE_POSITION_IMG_SRC}" alt="" class="verify-overlay-tyre-img" draggable="false">
        <div style="flex:1;">
          <h3>Tyre Verification</h3>
          <p class="verify-overlay-position">${escapeHtml(dialog.position)} &mdash; ${escapeHtml(positionName)}</p>
        </div>
        <button type="button" class="verify-close-btn" data-action="verify-cancel" aria-label="Close">&times;</button>
      </div>
      <p class="verify-overlay-prompt">${promptText}</p>
      <div class="verify-dialog-actions">
        ${knownTyre ? `<button type="button" class="action-btn primary" data-action="verify-yes">${module.id === 'removal' ? 'Select Tyre' : 'Yes / Present'}</button>` : ''}
        <button type="button" class="action-btn secondary" data-action="verify-mark-not-found">Tyre Not Found</button>
      </div>
      ${showInput ? `
        <div class="field-card" style="margin-top: 8px; border: 1px solid rgba(218, 165, 32, 0.44);">
          <div class="field-head">
            <div class="field-title-wrap">
              <span class="field-icon">${getFieldIconMarkup('serial', 'New Tyre Number')}</span>
              <span class="field-label">New Tyre Number</span>
            </div>
            <button
              type="button"
              class="mic-btn${isRecording ? ' is-recording' : ''}"
              data-action="dialog-record-tyre"
              aria-label="Record tyre number"
            >${isRecording ? 'Stop' : 'Mic'}</button>
          </div>
          <div class="confirm-box">
            <p class="confirm-status">${isRecording ? 'Recording in progress... Tap Stop when done.' : 'Awaiting voice or manual input'}</p>
            <input id="verifyTyreInput" type="text" class="value-input" data-action="dialog-tyre-input" value="${escapeAttribute(dialog.inputTyre || '')}" placeholder="Speak or enter new tyre">
            ${dialog.heardText ? `<p class="transcript-line">Heard: ${escapeHtml(dialog.heardText)}</p>` : ''}
          </div>
        </div>
        <div class="verify-dialog-actions" style="margin-top: 8px;">
          <button type="button" class="action-btn primary" data-action="verify-save-correct">Continue</button>
        </div>
      ` : ''}
      ${dialog.message ? `<p class="verify-dialog-message">${escapeHtml(dialog.message)}</p>` : ''}
      <p class="verify-dialog-note">${module.id === 'pressure'
        ? 'After verification, record PSI for this position.'
        : (module.id === 'removal'
          ? 'After selection, record odometer, RTD1, RTD2 and removal reason.'
          : 'After verification, record RTD1 and RTD2 for this position.')
      }</p>
    </div>
  `;

  return card;
}

function renderPressureCorrectionDialogCard({ sequenceState }) {
  const prompt = sequenceState?.prompt;
  if (!prompt?.open || prompt.kind !== 'low_pressure') {
    return null;
  }

  const card = document.createElement('article');
  card.className = 'verify-dialog-card verify-overlay';

  const foundPsi = Number(prompt.foundPsi);
  const targetPsi = Number(prompt.targetPsi);
  const foundText = Number.isFinite(foundPsi) ? String(Math.round(foundPsi)) : '-';
  const targetText = Number.isFinite(targetPsi) ? String(Math.round(targetPsi)) : '-';

  card.innerHTML = `
    <div class="verify-overlay-inner">
      <div class="verify-overlay-header">
        <img src="${TYRE_POSITION_IMG_SRC}" alt="" class="verify-overlay-tyre-img" draggable="false">
        <div style="flex:1;">
          <h3>Pressure Check</h3>
          <p class="verify-overlay-position">Low pressure detected</p>
        </div>
        <button type="button" class="verify-close-btn" data-action="pressure-prompt-close" aria-label="Close">&times;</button>
      </div>
      <p class="verify-overlay-prompt">
        Pressure found <strong>${escapeHtml(foundText)} PSI</strong> is below recommended <strong>${escapeHtml(targetText)} PSI</strong>.
        Have you corrected the pressure?
      </p>
      <div class="verify-dialog-actions">
        <button type="button" class="action-btn primary" data-action="pressure-correct-yes">Yes - corrected</button>
        <button type="button" class="action-btn secondary" data-action="pressure-correct-no">No - not corrected</button>
      </div>
    </div>
  `;

  return card;
}

async function handleFieldActionClick(event) {
  const actionNode = event.target.closest('[data-action]');
  if (!actionNode) {
    return;
  }

  const action = actionNode.dataset.action;

  if (action === 'fitment-continue') {
    await continueFitmentIntro();
    return;
  }

  if (action === 'load-layout') {
    const module = getActiveModule();
    if (!module) return;
    const draft = ensureDraft(module.id);
    await loadTruckLayoutForModule(module, draft);
    return;
  }

  if (action === 'select-position') {
    const positionCode = String(actionNode.dataset.positionCode || '').trim().toUpperCase();
    if (!positionCode) {
      return;
    }
    await selectSequencePosition(positionCode);
    return;
  }

  if (action === 'sequence-prev') {
    await navigateSequence(-1);
    return;
  }

  if (action === 'sequence-next') {
    await navigateSequence(1);
    return;
  }

  if (action === 'sequence-exit') {
    closeModulePanel();
    return;
  }

  if (action === 'sequence-back-layout') {
    const module = getActiveModule();
    if (!module || !isPagedModule(module.id)) return;
    const draft = ensureDraft(module.id);
    const sequence = ensurePositionSequence(module, draft);
    if (!sequence?.layoutReady) {
      return;
    }

    if (recorder.isRecording) {
      recorder.stop();
      state.recordingFieldId = null;
    }

    persistSequenceDraft(module, draft);
    sequence.dialog = null;
    sequence.prompt = null;
    sequence.viewStage = 'layout';
    renderActiveModuleFields();
    return;
  }

  if (action === 'verify-yes') {
    applyTyreVerificationYes();
    return;
  }

  if (action === 'verify-save-correct') {
    await saveTyreVerificationCorrection();
    return;
  }

  if (action === 'verify-cancel') {
    const module = getActiveModule();
    if (!module || !isPagedModule(module.id)) return;

    if (recorder.isRecording && state.recordingFieldId === 'dialog_tyre_serial') {
      recorder.stop();
      state.recordingFieldId = null;
    }

    const draft = ensureDraft(module.id);
    const sequence = ensurePositionSequence(module, draft);
    if (sequence) sequence.dialog = null;
    renderActiveModuleFields();
    return;
  }

  if (action === 'pressure-prompt-close') {
    const module = getActiveModule();
    if (!module || module.id !== 'pressure' || !isPagedModule(module.id)) return;
    const draft = ensureDraft(module.id);
    const sequence = ensurePositionSequence(module, draft);
    if (sequence) {
      sequence.prompt = null;
    }
    renderActiveModuleFields();
    return;
  }

  if (action === 'pressure-correct-yes' || action === 'pressure-correct-no') {
    const module = getActiveModule();
    if (!module || module.id !== 'pressure' || !isPagedModule(module.id)) return;
    const draft = ensureDraft(module.id);
    const sequence = ensurePositionSequence(module, draft);
    if (!sequence?.prompt) {
      return;
    }

    const nextSync = Boolean(sequence.prompt.nextSync);
    draft.values.pressure_corrected = action === 'pressure-correct-yes' ? 'Yes' : 'No';
    draft.values.action = action === 'pressure-correct-yes'
      ? 'Air Added'
      : 'Low Pressure - Not Corrected';
    sequence.prompt = null;
    persistSequenceDraft(module, draft);
    renderActiveModuleFields();
    await saveActiveModule({ sync: nextSync });
    return;
  }

  if (action === 'dialog-record-tyre') {
    const activeModule = getActiveModule();
    if (!activeModule) {
      return;
    }
    await toggleDialogFieldRecording(activeModule);
    return;
  }

  if (action === 'verify-mark-not-found') {
    applyTyreVerificationNotFound();
    return;
  }

  const module = getActiveModule();
  if (!module) {
    return;
  }

  const card = actionNode.closest('.field-card');
  const fieldId = card?.dataset.fieldId;
  const field = module.fields.find((item) => item.id === fieldId);
  if (!field) {
    return;
  }

  const draft = ensureDraft(module.id);

  if (action === 'record') {
    await toggleFieldRecording(module, field);
    return;
  }

  if (action === 'confirm') {
    if (!hasValue(draft.values[field.dataKey])) {
      showToast('Record or enter a value before confirming.', 'info');
      return;
    }
    draft.confirmed[field.id] = true;
    renderActiveModuleFields();
    return;
  }

  if (action === 'edit') {
    const input = card.querySelector('input[data-action="value-input"]');
    if (input) {
      input.focus();
      input.select();
    }
    return;
  }

  if (action === 'rerecord') {
    await toggleFieldRecording(module, field, { forceStart: true });
    return;
  }
}

function handleFieldInput(event) {
  const dialogInput = event.target.closest('input[data-action="dialog-tyre-input"]');
  if (dialogInput) {
    const module = getActiveModule();
    if (!module || !isPagedModule(module.id)) {
      return;
    }

    const draft = ensureDraft(module.id);
    const sequence = ensurePositionSequence(module, draft);
    if (!sequence?.dialog) {
      return;
    }

    sequence.dialog.inputTyre = normalizeFieldValue('tyre_serial', dialogInput.value) || '';
    return;
  }

  const input = event.target.closest('input[data-action="value-input"]');
  if (!input) {
    return;
  }

  const module = getActiveModule();
  if (!module) {
    return;
  }

  const fieldId = input.dataset.fieldId;
  const field = module.fields.find((item) => item.id === fieldId);
  if (!field) {
    return;
  }

  const draft = ensureDraft(module.id);
  const flow = ensureDraftFlow(draft);
  const previousValue = normalizeFieldValue(field.dataKey, draft.values[field.dataKey]);
  const nextValue = field.dataKey === 'tyre_not_found'
    ? normalizeTyreNotFoundValue(input.value)
    : normalizeFieldValue(field.dataKey, input.value);

  draft.values[field.dataKey] = nextValue;

  draft.confirmed[field.id] = false;

  if (module.id === 'fitment') {
    const autofillState = ensureFitmentAutofillState(flow);

    if (FITMENT_AUTOFILL_DATA_KEYS.includes(field.dataKey)) {
      delete autofillState.keys[field.dataKey];
    }

    if (field.dataKey === 'tyre_serial') {
      const previousCompact = compactAlphaNum(previousValue);
      const nextCompact = compactAlphaNum(nextValue);

      if (previousCompact !== nextCompact) {
        clearAutofilledFitmentValues(draft, autofillState);
        autofillState.lastLookupKey = '';
        autofillState.source = null;
        autofillState.lookup = null;
        autofillState.keys = {};
      }
    }
  }

  if (isPagedModule(module.id)) {
    persistSequenceDraft(module, draft);
  }

  updateModuleActionButtons(module, draft);

  if (
    module.id === 'fitment'
    && (field.dataKey === 'tyre_serial' || field.dataKey === 'fitment_type')
    && hasValue(normalizeFieldValue('tyre_serial', draft.values.tyre_serial))
    && hasValue(normalizeFieldValue('fitment_type', draft.values.fitment_type))
  ) {
    void maybeAutofillFitmentFromTyreSerial({ module, draft, force: false, notify: false });
  }
}

async function toggleFieldRecording(module, field, options = {}) {
  const forceStart = options.forceStart === true;

  if (recorder.isRecording && state.recordingFieldId === field.id && !forceStart) {
    state.pendingRecordingFieldId = null;
    recorder.stop();
    return;
  }

  if (recorder.isRecording && state.recordingFieldId === field.id && forceStart) {
    state.pendingRecordingFieldId = field.id;
    recorder.stop();
    return;
  }

  if (recorder.isRecording) {
    const shouldNotifySwitch = state.pendingRecordingFieldId !== field.id;
    state.pendingRecordingFieldId = field.id;
    recorder.stop();
    if (shouldNotifySwitch) {
      showToast(`Switching recording to ${field.label}...`, 'info');
    }
    return;
  }

  try {
    // State will be updated in onStart to ensure it aligns with actual recording
    state.liveTranscript = '';

    // Start timer to update recording duration display
    if (state.recordingTimerInterval) {
      window.clearInterval(state.recordingTimerInterval);
    }
    state.recordingTimerInterval = window.setInterval(() => {
      if (!recorder.isRecording) {
        window.clearInterval(state.recordingTimerInterval);
        state.recordingTimerInterval = null;
        return;
      }
      // Update just the status text without full re-render
      const card = document.querySelector(`[data-field-id="${field.id}"] .confirm-status`);
      if (card) {
        const elapsed = (recorder.durationMs / 1000).toFixed(1);
        const live = state.liveTranscript ? ` — "${state.liveTranscript}"` : '';
        card.textContent = `🔴 Recording ${elapsed}s${live} — Tap Stop when done.`;
      }
    }, 500);

    await recorder.start({
      onStart: () => {
        state.recordingFieldId = field.id;
        state.liveTranscript = '';
        renderActiveModuleFields();
      },
      onInterimTranscript: (liveText) => {
        state.liveTranscript = liveText;
        // Update live transcript in UI without full re-render
        const card = document.querySelector(`[data-field-id="${field.id}"] .confirm-status`);
        if (card && recorder.isRecording) {
          const elapsed = (recorder.durationMs / 1000).toFixed(1);
          card.textContent = `🔴 Recording ${elapsed}s — "${liveText}" — Tap Stop when done.`;
        }
      },
      onStop: async (recordedBlob, meta) => {
        // Clear timer
        if (state.recordingTimerInterval) {
          window.clearInterval(state.recordingTimerInterval);
          state.recordingTimerInterval = null;
        }
        state.liveTranscript = '';

        // Handle too-short recordings (accidental taps)
        if (!recordedBlob || meta?.tooShort) {
          showToast('Recording too short. Hold mic and speak clearly.', 'error');
          state.recordingFieldId = null;
          renderActiveModuleFields();
          return;
        }

        try {
          await processAudioForField(module, field, recordedBlob, {
            clientTranscript: meta?.clientTranscript || ''
          });
          showToast(`${field.label} captured.`, 'success');
        } catch (error) {
          console.error(error);
          showToast(error.message || `Failed to process ${field.label}`, 'error');
        } finally {
          state.recordingFieldId = null;
          renderActiveModuleFields();
          const capturedCard = document.querySelector(`.field-card[data-field-id="${field.id}"]`);
          if (capturedCard && capturedCard.scrollIntoView) {
            capturedCard.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }
        }
      },
      onError: (error) => {
        if (state.recordingTimerInterval) {
          window.clearInterval(state.recordingTimerInterval);
          state.recordingTimerInterval = null;
        }
        state.liveTranscript = '';
        console.error(error);
        showToast(error?.message || 'Recorder error', 'error');
        state.recordingFieldId = null;
        renderActiveModuleFields();
      }
    });

    showToast(`Recording ${field.label}. Tap mic again to stop.`, 'info');
  } catch (error) {
    if (state.recordingTimerInterval) {
      window.clearInterval(state.recordingTimerInterval);
      state.recordingTimerInterval = null;
    }
    state.liveTranscript = '';
    console.error(error);
    state.recordingFieldId = null;
    renderActiveModuleFields();
    showToast(error.message || 'Unable to access microphone', 'error');
  }
}

function queuePendingFieldRecording(moduleId) {
  const pendingFieldId = state.pendingRecordingFieldId;
  if (!pendingFieldId) {
    return;
  }

  state.pendingRecordingFieldId = null;

  const activeModule = getActiveModule();
  if (!activeModule || activeModule.id !== moduleId) {
    return;
  }

  const nextField = activeModule.fields.find((item) => item.id === pendingFieldId);
  if (!nextField) {
    return;
  }

  window.setTimeout(() => {
    if (state.isSaving || recorder.isRecording) {
      return;
    }
    void toggleFieldRecording(activeModule, nextField);
  }, 80);
}

async function toggleDialogFieldRecording(module) {
  const fieldId = 'dialog_tyre_serial';

  if (recorder.isRecording && state.recordingFieldId === fieldId) {
    recorder.stop();
    return;
  }

  if (recorder.isRecording) {
    recorder.stop();
    return;
  }

  try {
    await recorder.start({
      onStart: () => {
        state.recordingFieldId = fieldId;
        renderActiveModuleFields();
      },
      onStop: async (recordedBlob, meta) => {
        if (!recordedBlob || meta?.tooShort) {
          showToast('Recording too short. Hold mic and speak clearly.', 'error');
          state.recordingFieldId = null;
          renderActiveModuleFields();
          return;
        }

        try {
          const wav = await convertAudioToWavBlob(recordedBlob);
          let extracted = '';
          let heardText = meta?.clientTranscript || '';

          if (navigator.onLine) {
            try {
              const preview = await requestVoiceExtraction({
                audioBlob: wav.blob,
                formType: 'tyre_card',
                stepId: 'dialog_tyre_serial',
                userId: session.userId
              });
              const preferredFromAsr = preview.preferredFields || {};
              extracted = resolvePreferredFieldValue(preferredFromAsr, 'tyre_serial');
              if (!hasValue(extracted)) {
                extracted = preview.transcript || '';
              }
              heardText = String(preview.transcript || heardText).trim();
            } catch {
              // Server failed — use client transcript
              extracted = meta?.clientTranscript || '';
            }
          } else {
            // Offline — use client transcript
            extracted = meta?.clientTranscript || '';
          }

          const draft = ensureDraft(module.id);
          const sequence = ensurePositionSequence(module, draft);
          if (sequence?.dialog) {
            sequence.dialog.inputTyre = normalizeFieldValue('tyre_serial', extracted) || '';
            sequence.dialog.heardText = heardText;
          }
          showToast('New tyre captured.', 'success');
        } catch (error) {
          console.error(error);
          showToast(error.message || 'Failed to process voice input', 'error');
        } finally {
          state.recordingFieldId = null;
          renderActiveModuleFields();
        }
      },
      onError: (error) => {
        console.error(error);
        showToast(error?.message || 'Recorder error', 'error');
        state.recordingFieldId = null;
        renderActiveModuleFields();
      }
    });

    showToast('Recording new tyre number. Tap stop when done.', 'info');
  } catch (error) {
    console.error(error);
    state.recordingFieldId = null;
    renderActiveModuleFields();
    showToast(error.message || 'Unable to access microphone', 'error');
  }
}


async function processAudioForField(module, field, rawAudioBlob, options = {}) {
  const { clientTranscript = '' } = options;
  const draft = ensureDraft(module.id);
  const rawSha256 = await hashBlob(rawAudioBlob);
  const wav = await convertAudioToWavBlob(rawAudioBlob);
  const processedBlob = wav.blob;
  const previewUrl = createPreviewUrl(processedBlob);
  const sha256 = await hashBlob(processedBlob);
  const quality = await analyzeCaptureQuality(processedBlob, 'audio');

  const stepId = buildVoiceStepId(module.id, field.dataKey);
  let preview = null;
  let pendingServerSync = false;

  // DUAL PATH: Try server ASR, fall back to client-side transcript
  if (navigator.onLine) {
    try {
      preview = await requestVoiceExtraction({
        audioBlob: processedBlob,
        formType: module.formType,
        stepId,
        userId: session.userId
      });
    } catch (error) {
      // Server ASR failed even though online — use client transcript
      preview = null;
      pendingServerSync = true;
    }
  } else {
    // Offline — skip server call entirely, use client transcript
    pendingServerSync = true;
  }

  // If no server result, build preview from client-side Web Speech transcript
  if (!preview) {
    const fallbackTranscript = clientTranscript || '';
    preview = {
      asrModel: 'web-speech-api',
      asrError: pendingServerSync ? null : 'ASR unavailable',
      transcript: fallbackTranscript,
      tokens: [],
      confidence: fallbackTranscript ? 0.5 : null,
      durationSeconds: wav.durationSeconds,
      extractedData: { preferred_fields: {} },
      preferredFields: {}
    };
  }

  const previousCapture = draft.captures[field.id];
  if (previousCapture?.previewUrl) {
    URL.revokeObjectURL(previousCapture.previewUrl);
  }

  const preferredFromAsr = {
    ...(preview.preferredFields || {})
  };

  // Resolve field value from server ASR when available, otherwise use local transcript normalization.
  const candidate = resolvePreferredFieldValue(preferredFromAsr, field.dataKey);
  const transcriptValue = normalizeFieldValue(field.dataKey, preview.transcript || '');
  const candidateValue = normalizeFieldValue(field.dataKey, candidate);
  let value = null;

  if (!pendingServerSync || hasValue(transcriptValue)) {
    value = pickBestFieldValue(field.dataKey, candidateValue, transcriptValue);
  }

  if (hasValue(value)) {
    draft.values[field.dataKey] = value;
  }

  if (module.id === 'fitment') {
    const flow = ensureDraftFlow(draft);
    const autofillState = ensureFitmentAutofillState(flow);

    if (FITMENT_AUTOFILL_DATA_KEYS.includes(field.dataKey)) {
      delete autofillState.keys[field.dataKey];
    }

    if (field.dataKey === 'tyre_serial') {
      autofillState.lastLookupKey = '';
      autofillState.source = null;
      autofillState.keys = {};
    }
  }

  draft.confirmed[field.id] = false;
  draft.transcript[field.id] = preview.transcript || '';
  draft.errors[field.id] = pendingServerSync ? null : (preview.asrError || null);

  const scopedPreferred = buildScopedPreferredFields({
    module,
    field,
    preferredFromAsr,
    resolvedValue: value
  });

  const normalizedPreferred = enrichPreferredForForm(module.formType, scopedPreferred, draft.values);

  draft.captures[field.id] = {
    capture_id: createId(),
    step_id: stepId,
    media_kind: 'audio',
    mime_type: 'audio/wav',
    blob: processedBlob,
    sha256,
    captured_at: new Date().toISOString(),
    accepted: quality.accepted,
    issues: quality.issues,
    quality,
    previewUrl,
    pipeline: {
      asr_enabled: true,
      asr_model: preview.asrModel,
      asr_error: preview.asrError,
      asr_transcript: preview.transcript,
      asr_tokens: preview.tokens,
      asr_confidence: preview.confidence,
      asr_duration_seconds: preview.durationSeconds,
      pendingServerSync,
      client_transcript: clientTranscript || null,
      processed_at: new Date().toISOString(),
      extracted_data: {
        preferred_fields: normalizedPreferred
      }
    },
    step_extracted: {
      preferred_fields: normalizedPreferred
    },
    exif_datetime_original: null,
    raw_sha256: rawSha256,
    raw_size_bytes: rawAudioBlob.size,
    processed_size_bytes: processedBlob.size
  };

  if (
    module.id === 'fitment'
    && (field.dataKey === 'tyre_serial' || field.dataKey === 'fitment_type')
    && hasValue(normalizeFieldValue('tyre_serial', draft.values.tyre_serial))
    && hasValue(normalizeFieldValue('fitment_type', draft.values.fitment_type))
  ) {
    await maybeAutofillFitmentFromTyreSerial({ module, draft, force: false, notify: false });
  }

}

async function saveActiveModule({ sync }) {
  const module = getActiveModule();
  if (!module) {
    return;
  }

  const draft = ensureDraft(module.id);
  const flow = ensureDraftFlow(draft);

  if (isPagedModule(module.id)) {
    persistSequenceDraft(module, draft);
  }

  const missingValues = module.fields
    .filter((field) => field.required !== false)
    .filter((field) => !hasValue(draft.values[field.dataKey]));

  if (missingValues.length > 0) {
    showToast(`Missing values: ${missingValues.map((field) => field.label).join(', ')}`, 'error');
    return;
  }

  if (module.id === 'pressure' && isPressureTyreNotFound(draft) && !hasValue(draft.values.tyre_serial)) {
    showToast('Tyre marked as not found. Enter the new tyre number for this position.', 'error');
    return;
  }

  if (needsTyreBrandSize(module, draft)) {
    showToast('Enter tyre Brand and Size to continue.', 'error');
    return;
  }

  // Relaxed RTD check for old tyres to allow manual overrides

  const missingCaptures = module.fields
    .filter((field) => field.required !== false)
    .filter((field) => isCaptureRequiredForField(module, field, draft))
    .filter((field) => !draft.captures[field.id]);

  if (missingCaptures.length > 0) {
    showToast(`Record voice for: ${missingCaptures.map((field) => field.label).join(', ')}`, 'error');
    return;
  }

  if (module.id === 'pressure' && isPagedModule(module.id)) {
    const sequence = ensurePositionSequence(module, draft);
    const targetPsi = Number(normalizeFieldValue('target_psi', draft.values.target_psi) ?? sequence?.targetPsi);
    const foundPsi = Number(normalizeFieldValue('found_psi', draft.values.found_psi));
    const alreadyAnswered = hasValue(draft.values.pressure_corrected);

    if (
      sequence
      && sequence.layoutReady
      && String(sequence.viewStage || '') === 'entry'
      && !isPressureTyreNotFound(draft)
      && Number.isFinite(foundPsi)
      && Number.isFinite(targetPsi)
      && foundPsi < targetPsi
      && !alreadyAnswered
    ) {
      sequence.prompt = {
        open: true,
        kind: 'low_pressure',
        foundPsi,
        targetPsi,
        position: getCurrentSequencePosition(sequence),
        nextSync: Boolean(sync)
      };
      persistSequenceDraft(module, draft);
      renderActiveModuleFields();
      return;
    }
  }

  if (state.isSaving) {
    showToast('Please wait, previous submit is still in progress.', 'info');
    return;
  }

  state.isSaving = true;
  elements.saveOfflineBtn.disabled = true;
  elements.saveSyncBtn.disabled = true;

  const captures = module.fields
    .map((field) => buildCapturePayload(module, field, draft))
    .filter(Boolean);

  const context = {
    vehicle_no: normalizeFieldValue('vehicle_no', draft.values.vehicle_no) || '',
    position_code: normalizeFieldValue('position_code', draft.values.position_code) || '',
    shift: '',
    positions: getContextPositions(module, draft)
  };

  try {
    await saveCaptureSubmission({
      session,
      formType: module.formType,
      context,
      captures
    });

    if (!isPagedModule(module.id)) {
      showToast(`${module.label} submitted.`, 'success');
    }

    if (sync && !navigator.onLine) {
      showToast('Offline now. Saved to queue and will auto-sync once internet is back.', 'info');
    }

    if (isPagedModule(module.id)) {
      markCurrentSequencePageSaved(module, draft);
      const sequence = ensurePositionSequence(module, draft);
      if (sequence) {
        if (module.id === 'removal') {
          const position = normalizeFieldValue('position_code', draft.values.position_code);
          if (position) {
            sequence.serverTyres[position] = '';
          }
        }
        sequence.viewStage = 'layout';
        sequence.dialog = null;
      }
      showToast(`${module.label} saved for position ${normalizeFieldValue('position_code', draft.values.position_code) || '-'}.`, 'success');
      renderActiveModuleFields();
    } else {
      clearDraft(module.id);
      closeModulePanel();
    }

    await refreshDashboardSyncStrip();

    if (sync) {
      void autoSyncPending({ notify: navigator.onLine, reason: 'submit' });
    }
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Failed to save module', 'error');
  } finally {
    state.isSaving = false;
    elements.saveOfflineBtn.disabled = false;
    elements.saveSyncBtn.disabled = false;
    await refreshDashboardSyncStrip();
  }
}

function buildCapturePayload(module, field, draft) {
  const capture = draft.captures[field.id];
  if (!capture) {
    return null;
  }

  const value = normalizeFieldValue(field.dataKey, draft.values[field.dataKey]);
  const preferred = enrichPreferredForForm(module.formType, {
    ...(capture.step_extracted?.preferred_fields || {}),
    [field.dataKey]: value
  }, draft.values);

  const sequenceConfig = getModuleSequenceConfig(module.id);
  if (sequenceConfig) {
    const scopedKeys = [...sequenceConfig.fixedKeys, ...sequenceConfig.dynamicKeys, ...(sequenceConfig.optionalDynamicKeys || [])];
    for (const dataKey of scopedKeys) {
      const normalized = dataKey === 'tyre_not_found'
        ? (isPressureTyreNotFound(draft) ? 'Yes' : 'No')
        : normalizeFieldValue(dataKey, draft.values[dataKey]);
      if (hasValue(normalized)) {
        preferred[dataKey] = normalized;
      }
    }
  }

  const extractedData = {
    preferred_fields: preferred
  };

  return {
    ...capture,
    step_extracted: extractedData,
    meta_json: {
      ...capture.quality,
      quality_issues: capture.issues,
      exif_datetime_original: null,
      raw_sha256: capture.raw_sha256 || null,
      raw_size_bytes: capture.raw_size_bytes || capture.blob?.size || 0,
      processed_size_bytes: capture.processed_size_bytes || capture.blob?.size || 0,
      mime_type: capture.mime_type || null,
      pipeline: {
        ...(capture.pipeline || {}),
        extracted_data: extractedData
      },
      extracted_data: extractedData
    }
  };
}

function ensureDraft(moduleId) {
  if (!state.draftByModule[moduleId]) {
    state.draftByModule[moduleId] = createEmptyDraft();
  }

  if (!state.draftByModule[moduleId].validationErrors) {
    state.draftByModule[moduleId].validationErrors = {};
  }

  if (!state.draftByModule[moduleId].flow || typeof state.draftByModule[moduleId].flow !== 'object') {
    state.draftByModule[moduleId].flow = createDefaultFlowState();
  }

  return state.draftByModule[moduleId];
}

function clearDraft(moduleId) {
  const draft = state.draftByModule[moduleId];
  if (!draft) {
    return;
  }

  for (const capture of Object.values(draft.captures)) {
    if (capture?.previewUrl) {
      URL.revokeObjectURL(capture.previewUrl);
    }
  }

  state.draftByModule[moduleId] = {
    ...createEmptyDraft()
  };
}

function createDefaultFlowState() {
  return {
    sequence: null,
    fitmentAutofill: {
      lastLookupKey: '',
      inFlight: false,
      source: null,
      keys: {}
    }
  };
}

function createEmptyDraft() {
  return {
    values: {},
    confirmed: {},
    transcript: {},
    errors: {},
    validationErrors: {},
    captures: {},
    flow: createDefaultFlowState()
  };
}

function ensureDraftFlow(draft) {
  if (!draft.flow || typeof draft.flow !== 'object') {
    draft.flow = createDefaultFlowState();
  }

  ensureFitmentAutofillState(draft.flow);

  return draft.flow;
}

function getModuleSequenceConfig(moduleId) {
  return MODULE_SEQUENCE_CONFIG[moduleId] || null;
}

function isPagedModule(moduleId) {
  return Boolean(getModuleSequenceConfig(moduleId));
}

function normalizeTyreNotFoundValue(value) {
  if (value === true || value === false) {
    return value;
  }

  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'yes'
    || normalized === 'y'
    || normalized === 'true'
    || normalized === '1'
    || normalized.includes('not found');
}

function isPressureTyreNotFound(draft) {
  return normalizeTyreNotFoundValue(draft?.values?.tyre_not_found);
}

function normalizeTyreMetaValue(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  if (lower === '-' || lower === 'unknown' || lower === 'na' || lower === 'n/a') {
    return null;
  }
  return text;
}

function needsTyreBrandSize(module, draft) {
  if (!module || !draft) return false;
  if (!(module.id === 'pressure' || module.id === 'inspection' || module.id === 'removal')) {
    return false;
  }

  const serial = normalizeFieldValue('tyre_serial', draft.values.tyre_serial);
  if (!hasValue(serial)) {
    return false;
  }

  const make = normalizeTyreMetaValue(draft.values.make);
  const size = normalizeTyreMetaValue(draft.values.size);
  return !make || !size;
}

function getInitialSequencePositions() {
  return Array.from(new Set(
    POSITION_CODES
      .map((item) => String(item || '').trim().toUpperCase())
      .filter(Boolean)
  ));
}

function getCurrentSequencePosition(sequence) {
  if (!sequence || !Array.isArray(sequence.positions) || sequence.positions.length === 0) {
    return null;
  }
  return sequence.positions[sequence.currentIndex] || sequence.positions[0] || null;
}

function createEmptySequenceSlot() {
  return {
    values: {},
    confirmed: {},
    transcript: {},
    errors: {},
    validationErrors: {},
    captures: {}
  };
}

function getFieldByDataKey(module, dataKey) {
  return module.fields.find((field) => field.dataKey === dataKey) || null;
}

function ensurePositionSequence(module, draft, options = {}) {
  const config = getModuleSequenceConfig(module.id);
  if (!config) {
    return null;
  }

  const forceLoad = options.forceLoad === true;

  const flow = ensureDraftFlow(draft);
  const currentPosition = normalizePositionCode(draft.values.position_code)
    || normalizeFieldValue('position_code', draft.values.position_code);
  let created = false;

  if (!flow.sequence || flow.sequence.moduleId !== module.id) {
    const positions = getInitialSequencePositions();
    const index = positions.indexOf(currentPosition);

      flow.sequence = {
        moduleId: module.id,
        positions,
        currentIndex: index >= 0 ? index : 0,
        pages: {},
        common: createEmptySequenceSlot(),
        saved: {},
        verified: {},
        serverTyres: {},
        serverTyreMeta: {},
        layoutReady: false,
        viewStage: 'setup',
        dialog: null,
        vehicleId: null,
        targetPsi: null,
        prompt: null,
        setupKey: null
      };

    created = true;
  }

  const sequence = flow.sequence;
  const position = getCurrentSequencePosition(sequence);
  if (position && sequence.positions.indexOf(position) !== sequence.currentIndex) {
    sequence.currentIndex = sequence.positions.indexOf(position);
  }

  if (created) {
    persistSequenceDraft(module, draft);
  }

  if (forceLoad || created) {
    loadSequenceDraft(module, draft);
  }

  return flow.sequence;
}

function persistFieldState(target, field, value, draft) {
  if (!field) return;
  if (hasValue(value)) {
    target.values[field.dataKey] = value;
  }
  if (draft.confirmed[field.id]) target.confirmed[field.id] = true;
  if (hasValue(draft.transcript[field.id])) target.transcript[field.id] = draft.transcript[field.id];
  if (hasValue(draft.errors[field.id])) target.errors[field.id] = draft.errors[field.id];
  if (hasValue(draft.validationErrors[field.dataKey])) {
    target.validationErrors[field.dataKey] = draft.validationErrors[field.dataKey];
  }
  if (draft.captures[field.id]) target.captures[field.id] = draft.captures[field.id];
}

function getCapturePreferredFieldValue(capture, dataKey) {
  const preferred = capture?.step_extracted?.preferred_fields
    || capture?.pipeline?.extracted_data?.preferred_fields
    || {};
  return normalizeFieldValue(dataKey, preferred[dataKey]);
}

function shouldPreserveManualFieldValue(draft, field, capture) {
  const currentValue = normalizeFieldValue(field?.dataKey, draft?.values?.[field?.dataKey]);
  if (!hasValue(currentValue)) {
    return false;
  }

  const capturedValue = getCapturePreferredFieldValue(capture, field?.dataKey);
  if (!hasValue(capturedValue)) {
    return true;
  }

  return currentValue !== capturedValue;
}

function persistSequenceDraft(module, draft) {
  const sequence = ensurePositionSequence(module, draft);
  if (!sequence) {
    return;
  }

  const config = getModuleSequenceConfig(module.id);
  const position = getCurrentSequencePosition(sequence);
  if (!position) {
    return;
  }

  if (!sequence.pages[position]) {
    sequence.pages[position] = createEmptySequenceSlot();
  }

  const page = sequence.pages[position];
  const tyreNotFound = module.id === 'pressure' ? isPressureTyreNotFound(draft) : false;

  for (const dataKey of config.fixedKeys) {
    if (module.id === 'pressure' && dataKey === 'tyre_serial' && tyreNotFound) {
      continue;
    }
    const field = getFieldByDataKey(module, dataKey);
    if (!field) continue;
    const value = normalizeFieldValue(dataKey, draft.values[dataKey]);
    persistFieldState(sequence.common, field, value, draft);
  }

  const dynamicKeys = [...config.dynamicKeys, ...(config.optionalDynamicKeys || [])];
  for (const dataKey of dynamicKeys) {
    const field = getFieldByDataKey(module, dataKey);
    if (!field) continue;

    const value = dataKey === 'tyre_not_found'
      ? (isPressureTyreNotFound(draft) ? 'Yes' : 'No')
      : normalizeFieldValue(dataKey, draft.values[dataKey]);

    persistFieldState(page, field, value, draft);
  }

  if (module.id === 'pressure' && tyreNotFound) {
    const tyreField = getFieldByDataKey(module, 'tyre_serial');
    if (tyreField) {
      const overrideValue = normalizeFieldValue('tyre_serial', draft.values.tyre_serial);
      if (hasValue(overrideValue)) {
        page.values.tyre_serial = overrideValue;
      }
      if (draft.captures[tyreField.id]) {
        page.captures[tyreField.id] = draft.captures[tyreField.id];
      }
      if (hasValue(draft.transcript[tyreField.id])) {
        page.transcript[tyreField.id] = draft.transcript[tyreField.id];
      }
      if (hasValue(draft.errors[tyreField.id])) {
        page.errors[tyreField.id] = draft.errors[tyreField.id];
      }
      if (draft.confirmed[tyreField.id]) {
        page.confirmed[tyreField.id] = true;
      }
    }
  }

  if (module.id === 'pressure') {
    const targetPsi = normalizeFieldValue('target_psi', draft.values.target_psi);
    if (Number.isFinite(Number(targetPsi))) {
      sequence.common.values.target_psi = Number(targetPsi);
      sequence.targetPsi = Number(targetPsi);
    }

    const action = String(draft.values.action || '').trim();
    if (action) {
      page.values.action = action.slice(0, 160);
    }

    const corrected = String(draft.values.pressure_corrected || '').trim();
    if (corrected) {
      page.values.pressure_corrected = corrected.slice(0, 40);
    }
  }
}

function loadSequenceDraft(module, draft) {
  const flow = ensureDraftFlow(draft);
  const sequence = flow.sequence;
  if (!sequence || sequence.moduleId !== module.id) {
    return draft;
  }

  const config = getModuleSequenceConfig(module.id);
  const position = getCurrentSequencePosition(sequence);
  if (!position) {
    return draft;
  }

  const page = sequence.pages[position] || createEmptySequenceSlot();
  sequence.pages[position] = page;

  draft.values = {};
  draft.confirmed = {};
  draft.transcript = {};
  draft.errors = {};
  draft.validationErrors = {};
  draft.captures = {};

  for (const dataKey of config.fixedKeys) {
    const field = getFieldByDataKey(module, dataKey);
    if (!field) continue;

    const value = sequence.common.values[dataKey];
    if (hasValue(value)) {
      draft.values[dataKey] = value;
    }
    if (sequence.common.confirmed[field.id]) draft.confirmed[field.id] = true;
    if (hasValue(sequence.common.transcript[field.id])) draft.transcript[field.id] = sequence.common.transcript[field.id];
    if (hasValue(sequence.common.errors[field.id])) draft.errors[field.id] = sequence.common.errors[field.id];
    if (hasValue(sequence.common.validationErrors[dataKey])) draft.validationErrors[dataKey] = sequence.common.validationErrors[dataKey];
    if (sequence.common.captures[field.id]) draft.captures[field.id] = sequence.common.captures[field.id];
  }

  const dynamicKeys = [...config.dynamicKeys, ...(config.optionalDynamicKeys || [])];
  for (const dataKey of dynamicKeys) {
    const field = getFieldByDataKey(module, dataKey);
    if (!field) continue;

    const value = page.values[dataKey];
    if (hasValue(value)) {
      draft.values[dataKey] = value;
    }
    if (page.confirmed[field.id]) draft.confirmed[field.id] = true;
    if (hasValue(page.transcript[field.id])) draft.transcript[field.id] = page.transcript[field.id];
    if (hasValue(page.errors[field.id])) draft.errors[field.id] = page.errors[field.id];
    if (hasValue(page.validationErrors[dataKey])) draft.validationErrors[dataKey] = page.validationErrors[dataKey];
    if (page.captures[field.id]) draft.captures[field.id] = page.captures[field.id];
  }

  draft.values.position_code = position;

  if (module.id === 'pressure') {
    const tyreNotFound = normalizeTyreNotFoundValue(page.values.tyre_not_found);
    draft.values.tyre_not_found = tyreNotFound ? 'Yes' : 'No';

    if (tyreNotFound && hasValue(page.values.tyre_serial)) {
      const tyreField = getFieldByDataKey(module, 'tyre_serial');
      draft.values.tyre_serial = page.values.tyre_serial;
      if (tyreField && page.captures[tyreField.id]) {
        draft.captures[tyreField.id] = page.captures[tyreField.id];
      }
    }

    const targetPsi = Number(sequence.common.values.target_psi);
    if (Number.isFinite(targetPsi)) {
      draft.values.target_psi = targetPsi;
      sequence.targetPsi = targetPsi;
    }

    const action = String(page.values.action || '').trim();
    if (action) {
      draft.values.action = action;
    }

    const corrected = String(page.values.pressure_corrected || '').trim();
    if (corrected) {
      draft.values.pressure_corrected = corrected;
    }
  }

  return draft;
}

function sortFieldsById(module, ids) {
  const orderMap = new Map(ids.map((id, index) => [id, index]));
  return module.fields
    .filter((field) => orderMap.has(field.id))
    .sort((a, b) => orderMap.get(a.id) - orderMap.get(b.id));
}

function resolveVisibleFields({ module, draft, sequenceState, isFitmentIntroStage, sequenceReady }) {
  if (!sequenceState) {
    return module.fields;
  }

  const viewStage = String(sequenceState.viewStage || (sequenceReady ? 'layout' : 'setup'));

  if (!sequenceReady) {
    const config = getModuleSequenceConfig(module.id);
    const initialKeys = config?.initialKeys || [];
    const ids = module.fields
      .filter((field) => initialKeys.includes(field.dataKey))
      .map((field) => field.id);
    return sortFieldsById(module, ids);
  }

  if (viewStage === 'layout') {
    return [];
  }

  if (module.id === 'inspection') {
    const ids = needsTyreBrandSize(module, draft)
      ? ['make', 'size', 'rtd1', 'rtd2', 'remarks']
      : ['rtd1', 'rtd2', 'remarks'];
    return sortFieldsById(module, ids);
  }

  if (module.id === 'pressure') {
    const ids = needsTyreBrandSize(module, draft)
      ? ['make', 'size', 'pressure']
      : ['pressure'];
    return sortFieldsById(module, ids);
  }

  if (module.id === 'removal') {
    const ids = needsTyreBrandSize(module, draft)
      ? ['make', 'size', 'odometer_reading', 'rtd1', 'rtd2', 'removal_reason']
      : ['odometer_reading', 'rtd1', 'rtd2', 'removal_reason'];
    return sortFieldsById(module, ids);
  }

  if (module.id === 'fitment') {
    const ids = needsTyreBrandSize(module, draft)
      ? ['make', 'model', 'size', 'fitment_type', 'rtd1', 'rtd2']
      : ['fitment_type', 'rtd1', 'rtd2'];
    return sortFieldsById(module, ids);
  }

  return module.fields;
}

function isFieldLocked({ module, field, draft, sequenceState, isFitmentIntroStage, sequenceReady }) {
  if (!sequenceState) {
    return false;
  }

  if (!sequenceReady) {
    return false;
  }

  const viewStage = String(sequenceState.viewStage || 'layout');
  if (viewStage !== 'entry') {
    return true;
  }

  if (field.dataKey === 'position_code') {
    return true;
  }

  if (field.dataKey === 'vehicle_no' || field.dataKey === 'meter_reading') {
    return true;
  }

  if (field.dataKey === 'tyre_serial') {
    if (module.id === 'pressure' && isPressureTyreNotFound(draft)) {
      return false;
    }
    return true;
  }

  const config = getModuleSequenceConfig(module.id);
  if (!config) {
    return false;
  }

  if (!config.fixedKeys.includes(field.dataKey)) {
    return false;
  }

  return true;
}

function isMicDisabled({ module, field, draft, sequenceState, isFitmentIntroStage, sequenceReady }) {
  if (field.dataKey === 'tyre_not_found') {
    return true;
  }

  if (isFitmentIntroStage) {
    return false;
  }

  if (!sequenceState) {
    return false;
  }

  if (!sequenceReady) {
    return false;
  }

  const viewStage = String(sequenceState.viewStage || 'layout');
  if (viewStage !== 'entry') {
    return true;
  }

  if (field.dataKey === 'position_code') {
    return true;
  }

  if (field.dataKey === 'vehicle_no' || field.dataKey === 'meter_reading') {
    return true;
  }

  if (field.dataKey === 'tyre_serial') {
    return !(module.id === 'pressure' && isPressureTyreNotFound(draft));
  }

  return false;
}

async function continueFitmentIntro() {
  const module = getActiveModule();
  if (!module || module.id !== 'fitment') {
    return;
  }

  const draft = ensureDraft(module.id);
  const flow = ensureDraftFlow(draft);

  if (!hasValue(draft.values.fitment_type) || !hasValue(draft.values.tyre_serial)) {
    showToast('Capture Tyre Condition and Tyre Number to continue.', 'info');
    return;
  }

  const lookup = await maybeAutofillFitmentFromTyreSerial({ module, draft, force: true, notify: false });
  if (draft.values.fitment_type === 'Old' && !lookup?.found) {
    showToast('Tyre number not found in database. Check for typos or select "New".', 'error');
    return;
  }

  flow.fitmentIntroPassed = true;
  renderActiveModuleFields();
}

function ensureFitmentAutofillState(flow) {
  if (!flow.fitmentAutofill || typeof flow.fitmentAutofill !== 'object') {
    flow.fitmentAutofill = {
      lastLookupKey: '',
      inFlight: false,
      source: null,
      lookup: null,
      keys: {}
    };
  }

  if (!flow.fitmentAutofill.keys || typeof flow.fitmentAutofill.keys !== 'object') {
    flow.fitmentAutofill.keys = {};
  }

  return flow.fitmentAutofill;
}

function clearAutofilledFitmentValues(draft, autofillState) {
  if (!draft || !autofillState || !autofillState.keys || typeof autofillState.keys !== 'object') {
    return;
  }

  for (const dataKey of Object.keys(autofillState.keys)) {
    if (dataKey === 'tyre_serial' || autofillState.keys[dataKey] !== true) {
      continue;
    }
    draft.values[dataKey] = '';
  }
}

function getOldFitmentRtdMismatch(draft) {
  if (!draft?.flow || !draft.values) {
    return null;
  }

  const fitmentType = String(normalizeFieldValue('fitment_type', draft.values.fitment_type) || '').trim().toLowerCase();
  if (fitmentType !== 'old') {
    return null;
  }

  const lookup = draft.flow.fitmentAutofill && typeof draft.flow.fitmentAutofill === 'object'
    ? draft.flow.fitmentAutofill.lookup
    : null;
  if (!lookup?.found) {
    return null;
  }

  const latestRtd1 = Number(lookup.rtd1);
  const latestRtd2 = Number(lookup.rtd2);
  const currentRtd1 = Number(normalizeFieldValue('rtd1', draft.values.rtd1));
  const currentRtd2 = Number(normalizeFieldValue('rtd2', draft.values.rtd2));

  if (![latestRtd1, latestRtd2, currentRtd1, currentRtd2].every(Number.isFinite)) {
    return null;
  }

  const mismatch = Math.abs(currentRtd1 - latestRtd1) > 10 || Math.abs(currentRtd2 - latestRtd2) > 10;
  if (!mismatch) {
    return null;
  }

  return {
    latestRtd1,
    latestRtd2,
    currentRtd1,
    currentRtd2
  };
}

async function requestTyreAutofill({ tyreSerial, fitmentType }) {
   const response = await fetch(`${window.location.origin}/api/send-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'lookup_tyre_context',
       user_id: session.userId,
       tyre_serial: normalizeFieldValue('tyre_serial', tyreSerial),
       fitment_type: normalizeFieldValue('fitment_type', fitmentType)
     })
   });

  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) {
    throw new Error(json.message || json.error || `Tyre lookup failed (${response.status})`);
  }

  return json;
}

async function maybeAutofillFitmentFromTyreSerial({ module, draft, force = false, notify = false }) {
  if (!module || module.id !== 'fitment' || !draft) {
    return;
  }

  const tyreSerial = normalizeFieldValue('tyre_serial', draft.values.tyre_serial);
  if (!hasValue(tyreSerial)) {
    return;
  }

  const lookupKey = compactAlphaNum(tyreSerial);
  if (!force && lookupKey.length < 6) {
    return;
  }

  const flow = ensureDraftFlow(draft);
  const autofillState = ensureFitmentAutofillState(flow);

  if (!force && (autofillState.inFlight || autofillState.lastLookupKey === lookupKey)) {
    return;
  }

  autofillState.inFlight = true;

  try {
    const fitmentType = normalizeFieldValue('fitment_type', draft.values.fitment_type);
    const lookup = await requestTyreAutofill({ tyreSerial, fitmentType });
    autofillState.lastLookupKey = lookupKey;
    autofillState.lookup = lookup;

    if (!lookup?.found) {
      return lookup;
    }

    const keyLabel = {
      vehicle_no: 'truck',
      position_code: 'position',
      make: 'make',
      size: 'size',
      rtd1: 'RTD 1',
      rtd2: 'RTD 2'
    };

    const shouldAutofillRtd = String(fitmentType || '').trim().toLowerCase() === 'old';

    const candidates = [
      ['vehicle_no', lookup.truck_no],
      ['position_code', lookup.position_code],
      ['make', lookup.make],
      ['model', lookup.model],
      ['size', lookup.size],
      ['rtd1', shouldAutofillRtd ? lookup.rtd1 : null],
      ['rtd2', shouldAutofillRtd ? lookup.rtd2 : null]
    ];

    const appliedKeys = [];
    for (const [dataKey, rawValue] of candidates) {
      const normalized = normalizeFieldValue(dataKey, rawValue);
      if (!hasValue(normalized)) {
        continue;
      }

      const existing = normalizeFieldValue(dataKey, draft.values[dataKey]);
      if (hasValue(existing)) {
        continue;
      }

      draft.values[dataKey] = normalized;
      autofillState.keys[dataKey] = true;
      appliedKeys.push(dataKey);

      const mappedField = module.fields.find((item) => item.dataKey === dataKey);
      if (mappedField) {
        draft.confirmed[mappedField.id] = false;
      }
    }

    if (lookup.source) {
      autofillState.source = lookup.source;
    }

    if (appliedKeys.length > 0) {
      if (notify) {
        const labels = appliedKeys.map((item) => keyLabel[item] || item);
        showToast(`Auto-filled ${labels.join(', ')} from tyre history.`, 'info');
      }

      updateModuleActionButtons(module, draft);
      renderActiveModuleFields();
    }

    return lookup;
  } catch (error) {
    if (notify) {
      showToast(error.message || 'Unable to auto-fill tyre details.', 'error');
    }
  } finally {
    autofillState.inFlight = false;
  }
}

async function requestVehicleTyreLayout({ module, draft, positionCode }) {
  const resolvedOdometer = normalizeFieldValue('meter_reading', draft.values.meter_reading)
    ?? normalizeFieldValue('current_reading', draft.values.current_reading);

  const payload = {
    action: 'get_vehicle_tyre_layout',
    user_id: session.userId,
    truck_no: normalizeFieldValue('vehicle_no', draft.values.vehicle_no),
    odometer: resolvedOdometer,
    module: module.id
  };

  if (positionCode) {
    payload.position_code = positionCode;
  }

  const response = await fetch(`${window.location.origin}/api/send-otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) {
    throw new Error(json.message || json.error || `Truck layout request failed (${response.status})`);
  }

  return json;
}

async function requestUpdateVehicleTyrePosition({ draft, positionCode, tyreSerial }) {
  const resolvedOdometer = normalizeFieldValue('meter_reading', draft.values.meter_reading)
    ?? normalizeFieldValue('current_reading', draft.values.current_reading);

  const response = await fetch(`${window.location.origin}/api/send-otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'upsert_vehicle_position_tyre',
      user_id: session.userId,
      truck_no: normalizeFieldValue('vehicle_no', draft.values.vehicle_no),
      odometer: resolvedOdometer,
      position_code: positionCode,
      tyre_serial: normalizeFieldValue('tyre_serial', tyreSerial),
      make: normalizeFieldValue('make', draft.values.make),
      size: normalizeFieldValue('size', draft.values.size)
    })
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) {
    throw new Error(json.message || json.error || `Tyre update failed (${response.status})`);
  }

  return json;
}

async function loadTruckLayoutForModule(module, draft) {
  const config = getModuleSequenceConfig(module.id);
  const initialKeys = Array.isArray(config?.initialKeys) && config.initialKeys.length > 0
    ? config.initialKeys
    : ['vehicle_no'];

  const missing = initialKeys.filter((key) => !hasValue(normalizeFieldValue(key, draft.values[key])));
  if (missing.length > 0) {
    const label = (key) => {
      if (key === 'vehicle_no') return 'truck number';
      if (key === 'meter_reading' || key === 'current_reading') return 'odometer';
      return String(key || '').replace(/_/g, ' ');
    };

    const message = missing.length === 1
      ? `Enter ${label(missing[0])} first.`
      : `Enter ${label(missing[0])} and ${label(missing[1])} first.`;

    showToast(message, 'info');
    return;
  }

  const sequence = ensurePositionSequence(module, draft);
  if (!sequence) {
    return;
  }

  const setupKey = `${module.id}|${initialKeys
    .map((key) => `${key}:${String(normalizeFieldValue(key, draft.values[key]) || '')}`)
    .join('|')}`;

  const hasPreviousRunState = Boolean(sequence.layoutReady)
    || (sequence.saved && Object.keys(sequence.saved).length > 0)
    || (sequence.pages && Object.keys(sequence.pages).length > 0);

  if (hasPreviousRunState && sequence.setupKey !== setupKey) {
    // Reset any previous truck run state to avoid stale done/values.
    sequence.pages = {};
    sequence.common = createEmptySequenceSlot();
    sequence.saved = {};
    sequence.verified = {};
    sequence.serverTyres = {};
    sequence.serverTyreMeta = {};
    sequence.dialog = null;
    sequence.prompt = null;
    sequence.targetPsi = null;
    sequence.vehicleId = null;
    sequence.layoutReady = false;
    sequence.viewStage = 'setup';
  }

  sequence.setupKey = setupKey;

  try {
    const layout = await requestVehicleTyreLayout({ module, draft });
    const positions = Array.isArray(layout.positions) && layout.positions.length > 0
      ? layout.positions.map((item) => String(item || '').trim().toUpperCase()).filter(Boolean)
      : getInitialSequencePositions();

    sequence.positions = Array.from(new Set(positions));
    sequence.currentIndex = 0;
    sequence.serverTyres = {};
    sequence.serverTyreMeta = {};
    sequence.verified = {};
    sequence.saved = sequence.saved || {};
    sequence.layoutReady = true;
    sequence.viewStage = 'layout';
    sequence.vehicleId = layout.vehicle_id || null;
    sequence.dialog = null;

    if (module.id === 'pressure') {
      const rawPsi = Number(layout.pressure_base_psi);
      const basePsi = Number.isFinite(rawPsi) && rawPsi > 0 ? Number(rawPsi.toFixed(2)) : 120;
      sequence.targetPsi = basePsi;
      sequence.common.values.target_psi = basePsi;
      draft.values.target_psi = basePsi;
    }

    const assigned = layout.assigned && typeof layout.assigned === 'object' ? layout.assigned : {};
    for (const position of sequence.positions) {
      const row = assigned[position] || assigned[position.toLowerCase()] || null;
      const tyreNo = String(row?.tyre_no || '').trim().toUpperCase();
      const make = String(row?.make || '').trim();
      const size = String(row?.size || '').trim();
      sequence.serverTyres[position] = tyreNo;
      sequence.serverTyreMeta[position] = {
        make: make || null,
        size: size || null
      };
      sequence.verified[position] = false;
    }

    persistSequenceDraft(module, draft);
    loadSequenceDraft(module, draft);
    renderActiveModuleFields();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Failed to load truck layout', 'error');
  }
}

async function openVerificationDialogForCurrentPosition(module, draft) {
  const sequence = ensurePositionSequence(module, draft);
  if (!sequence || !sequence.layoutReady) {
    return;
  }

  const positionCode = getCurrentSequencePosition(sequence);
  if (!positionCode) {
    return;
  }

  try {
    const result = await requestVehicleTyreLayout({ module, draft, positionCode });
    const current = result.current || {};
    const knownTyre = String(current.tyre_no || sequence.serverTyres[positionCode] || '').trim().toUpperCase();
    const knownMake = String(current.make || sequence.serverTyreMeta?.[positionCode]?.make || '').trim();
    const knownSize = String(current.size || sequence.serverTyreMeta?.[positionCode]?.size || '').trim();
    sequence.serverTyres[positionCode] = knownTyre;
    sequence.serverTyreMeta[positionCode] = {
      make: knownMake || null,
      size: knownSize || null
    };
    sequence.viewStage = 'layout';
    sequence.dialog = {
      open: true,
      mode: knownTyre ? 'confirm' : 'not_found',
      position: positionCode,
      knownTyre,
      inputTyre: knownTyre || '',
      message: '',
      heardText: ''
    };

    draft.values.position_code = positionCode;
    if (knownTyre && !isPressureTyreNotFound(draft)) {
      draft.values.tyre_serial = knownTyre;
    }
    renderActiveModuleFields();
  } catch (error) {
    console.error(error);
    showToast(error.message || `Failed to fetch tyre for ${positionCode}`, 'error');
  }
}

async function selectSequencePosition(positionCode) {
  const module = getActiveModule();
  if (!module || !isPagedModule(module.id)) {
    return;
  }

  const draft = ensureDraft(module.id);
  const sequence = ensurePositionSequence(module, draft);
  if (!sequence || !sequence.layoutReady) {
    showToast('Load truck layout first.', 'info');
    return;
  }

  const index = sequence.positions.indexOf(positionCode);
  if (index < 0) {
    return;
  }

  persistSequenceDraft(module, draft);
  sequence.currentIndex = index;
  loadSequenceDraft(module, draft);

  if (module.id === 'removal') {
    const mappedTyre = String(sequence?.serverTyres?.[positionCode] || '').trim().toUpperCase();
    if (mappedTyre) {
      const meta = sequence?.serverTyreMeta?.[positionCode] || {};

      draft.values.position_code = positionCode;
      draft.values.tyre_serial = mappedTyre;

      if (meta.make) {
        draft.values.make = meta.make;
      } else {
        delete draft.values.make;
      }

      if (meta.size) {
        draft.values.size = meta.size;
      } else {
        delete draft.values.size;
      }

      sequence.verified[positionCode] = true;
      sequence.dialog = null;
      sequence.viewStage = 'entry';
      persistSequenceDraft(module, draft);
      renderActiveModuleFields();
      return;
    }
  }

  renderActiveModuleFields();
  await openVerificationDialogForCurrentPosition(module, draft);
}

function applyTyreVerificationYes() {
  const module = getActiveModule();
  if (!module || !isPagedModule(module.id)) {
    return;
  }

  const draft = ensureDraft(module.id);
  const sequence = ensurePositionSequence(module, draft);
  const positionCode = getCurrentSequencePosition(sequence);
  const knownTyre = String(sequence?.serverTyres?.[positionCode] || '').trim().toUpperCase();
  if (!knownTyre) {
    showToast('No tyre mapped. Use Tyre Not Found to proceed.', 'info');
    return;
  }

  draft.values.tyre_serial = knownTyre;
  if (module.id === 'pressure') {
    draft.values.tyre_not_found = 'No';
  }

  const meta = sequence?.serverTyreMeta?.[positionCode] || {};
  if (meta.make) {
    draft.values.make = meta.make;
  } else {
    delete draft.values.make;
  }

  if (meta.size) {
    draft.values.size = meta.size;
  } else {
    delete draft.values.size;
  }

  sequence.verified[positionCode] = true;
  sequence.dialog = null;
  sequence.viewStage = 'entry';
  persistSequenceDraft(module, draft);
  renderActiveModuleFields();
}

async function saveTyreVerificationCorrection() {
  const module = getActiveModule();
  if (!module || !isPagedModule(module.id)) {
    return;
  }

  const draft = ensureDraft(module.id);
  const sequence = ensurePositionSequence(module, draft);
  if (!sequence?.dialog) {
    return;
  }

  const positionCode = sequence.dialog.position || getCurrentSequencePosition(sequence);
  const tyreSerial = normalizeFieldValue('tyre_serial', sequence.dialog.inputTyre || draft.values.tyre_serial);

  if (!hasValue(tyreSerial)) {
    sequence.dialog.message = 'Enter new tyre number to continue.';
    renderActiveModuleFields();
    return;
  }

  try {
    const result = await requestUpdateVehicleTyrePosition({
      draft,
      positionCode,
      tyreSerial
    });

    const assignedTyre = normalizeFieldValue('tyre_serial', result?.assigned?.tyre_no || tyreSerial);
    const assignedMake = normalizeFieldValue('make', result?.assigned?.make || draft.values.make);
    const assignedSize = normalizeFieldValue('size', result?.assigned?.size || draft.values.size);
    sequence.serverTyres[positionCode] = assignedTyre;
    sequence.serverTyreMeta[positionCode] = {
      make: assignedMake || null,
      size: assignedSize || null
    };
    sequence.verified[positionCode] = true;
    sequence.dialog = null;
    sequence.viewStage = 'entry';
    draft.values.tyre_serial = assignedTyre;
    if (module.id === 'pressure') {
      draft.values.tyre_not_found = 'No';
    }

    if (assignedMake) {
      draft.values.make = assignedMake;
    } else {
      delete draft.values.make;
    }

    if (assignedSize) {
      draft.values.size = assignedSize;
    } else {
      delete draft.values.size;
    }

    persistSequenceDraft(module, draft);
    showToast(`Tyre updated for ${positionCode}.`, 'success');
    renderActiveModuleFields();
  } catch (error) {
    console.error(error);
    sequence.dialog.message = error.message || 'Unable to update tyre mapping.';
    renderActiveModuleFields();
  }
}

function applyTyreVerificationNotFound() {
  const module = getActiveModule();
  if (!module || !isPagedModule(module.id)) {
    return;
  }

  const draft = ensureDraft(module.id);
  const sequence = ensurePositionSequence(module, draft);
  if (!sequence?.dialog) {
    return;
  }

  sequence.dialog.mode = 'not_found';
  sequence.dialog.message = '';
  if (!sequence.dialog.inputTyre) {
    sequence.dialog.inputTyre = '';
  }
  renderActiveModuleFields();
}

async function navigateSequence(step) {
  const module = getActiveModule();
  if (!module || !isPagedModule(module.id)) {
    return;
  }

  const draft = ensureDraft(module.id);
  const sequence = ensurePositionSequence(module, draft);
  if (!sequence || !sequence.layoutReady) {
    showToast('Load truck layout first.', 'info');
    return;
  }

  persistSequenceDraft(module, draft);

  const nextIndex = sequence.currentIndex + Number(step || 0);
  if (nextIndex < 0 || nextIndex >= sequence.positions.length) {
    return;
  }

  sequence.currentIndex = nextIndex;
  loadSequenceDraft(module, draft);

  const positionCode = getCurrentSequencePosition(sequence);
  if (module.id === 'removal' && positionCode) {
    const mappedTyre = String(sequence?.serverTyres?.[positionCode] || '').trim().toUpperCase();
    if (mappedTyre) {
      const meta = sequence?.serverTyreMeta?.[positionCode] || {};

      draft.values.position_code = positionCode;
      draft.values.tyre_serial = mappedTyre;

      if (meta.make) {
        draft.values.make = meta.make;
      } else {
        delete draft.values.make;
      }

      if (meta.size) {
        draft.values.size = meta.size;
      } else {
        delete draft.values.size;
      }

      sequence.verified[positionCode] = true;
      sequence.dialog = null;
      sequence.viewStage = 'entry';
      persistSequenceDraft(module, draft);
      renderActiveModuleFields();
      return;
    }
  }

  renderActiveModuleFields();
  await openVerificationDialogForCurrentPosition(module, draft);
}

function getContextPositions(module, draft) {
  if (isPagedModule(module.id)) {
    const sequence = ensurePositionSequence(module, draft);
    if (sequence?.layoutReady && Array.isArray(sequence.positions) && sequence.positions.length > 0) {
      return sequence.positions;
    }
  }

  if (hasValue(draft.values.position_code)) {
    return [normalizeFieldValue('position_code', draft.values.position_code)].filter(Boolean);
  }

  return [];
}

function markCurrentSequencePageSaved(module, draft) {
  const sequence = ensurePositionSequence(module, draft);
  if (!sequence) {
    return;
  }

  persistSequenceDraft(module, draft);

  const explicitPosition = normalizeFieldValue('position_code', draft.values.position_code);
  if (explicitPosition) {
    const idx = Array.isArray(sequence.positions) ? sequence.positions.indexOf(explicitPosition) : -1;
    if (idx >= 0) {
      sequence.currentIndex = idx;
    }
  }

  const position = explicitPosition || getCurrentSequencePosition(sequence);
  if (!position) {
    return;
  }

  sequence.saved[position] = new Date().toISOString();
}

function updateModuleActionButtons(module, draft) {
  if (!elements.saveOfflineBtn || !elements.saveSyncBtn) {
    return;
  }

  if (!isPagedModule(module.id)) {
    if (elements.panelActions) {
      elements.panelActions.classList.remove('hidden');
    }
    elements.saveOfflineBtn.textContent = 'Save Draft';
    elements.saveSyncBtn.textContent = 'Submit';
    elements.saveOfflineBtn.disabled = Boolean(state.isSaving);
    elements.saveSyncBtn.disabled = Boolean(state.isSaving);
    return;
  }

  const sequence = ensurePositionSequence(module, draft);
  const sequenceReady = Boolean(sequence?.layoutReady);
  const viewStage = String(sequence?.viewStage || (sequenceReady ? 'layout' : 'setup'));

  const isBlockedOverlayOpen = Boolean(sequence?.dialog?.open)
    || (module.id === 'pressure' && Boolean(sequence?.prompt?.open));

  if (elements.panelActions) {
    elements.panelActions.classList.toggle('hidden', isBlockedOverlayOpen);
  }

  if (isBlockedOverlayOpen) {
    elements.saveOfflineBtn.disabled = true;
    elements.saveSyncBtn.disabled = true;
    return;
  }

  // Default labels
  elements.saveOfflineBtn.textContent = 'Exit';
  elements.saveSyncBtn.textContent = 'Continue';

  if (!sequenceReady || viewStage === 'setup') {
    const config = getModuleSequenceConfig(module.id);
    const initialKeys = Array.isArray(config?.initialKeys) && config.initialKeys.length > 0
      ? config.initialKeys
      : ['vehicle_no'];
    const canContinue = initialKeys.every((key) => hasValue(normalizeFieldValue(key, draft.values[key])));

    elements.saveOfflineBtn.textContent = 'Exit';
    elements.saveSyncBtn.textContent = 'Continue';
    elements.saveOfflineBtn.disabled = Boolean(state.isSaving);
    elements.saveSyncBtn.disabled = Boolean(state.isSaving) || !canContinue;
    return;
  }

  if (viewStage === 'layout') {
    elements.saveOfflineBtn.textContent = 'Exit';
    elements.saveSyncBtn.textContent = 'Select Tyre';
    elements.saveOfflineBtn.disabled = Boolean(state.isSaving);
    elements.saveSyncBtn.disabled = true;
    return;
  }

  // Entry stage
  elements.saveOfflineBtn.textContent = 'Back to layout';
  elements.saveSyncBtn.textContent = 'Continue';
  elements.saveOfflineBtn.disabled = Boolean(state.isSaving);
  elements.saveSyncBtn.disabled = Boolean(state.isSaving);
}

function isCaptureRequiredForField(module, field, draft) {
  if (!module || !field || !draft) {
    return true;
  }

  if (!isPagedModule(module.id)) {
    if (module.id === 'fitment' && FITMENT_AUTOFILL_DATA_KEYS.includes(field.dataKey)) {
      const flow = draft.flow && typeof draft.flow === 'object' ? draft.flow : {};
      const autofillKeys = flow.fitmentAutofill && typeof flow.fitmentAutofill === 'object'
        ? (flow.fitmentAutofill.keys || {})
        : {};

      if (autofillKeys[field.dataKey] === true) {
        return false;
      }
    }

    return true;
  }

  if (module.id === 'inspection') {
    return field.dataKey === 'rtd1' || field.dataKey === 'rtd2';
  }

  if (module.id === 'pressure') {
    return field.dataKey === 'found_psi';
  }

  if (module.id === 'removal') {
    return field.dataKey === 'current_reading'
      || field.dataKey === 'rtd1'
      || field.dataKey === 'rtd2'
      || field.dataKey === 'removal_reason';
  }

  return false;
}

function getModule(moduleId) {
  return MODULES.find((module) => module.id === moduleId) || null;
}

function getActiveModule() {
  if (!state.activeModuleId) {
    return null;
  }
  return getModule(state.activeModuleId);
}

function pickBestFieldValue(dataKey, candidateValue, transcriptValue) {
  if (!hasValue(candidateValue)) {
    return transcriptValue;
  }

  if (!hasValue(transcriptValue)) {
    return candidateValue;
  }

  if (dataKey === 'vehicle_no' || dataKey === 'tyre_serial') {
    const candidateCompact = compactAlphaNum(candidateValue);
    const transcriptCompact = compactAlphaNum(transcriptValue);

    if (
      transcriptCompact.length > candidateCompact.length
      && transcriptCompact.includes(candidateCompact)
    ) {
      return transcriptValue;
    }
  }

  return candidateValue;
}

function buildScopedPreferredFields({ module, field, preferredFromAsr, resolvedValue }) {
  const scoped = {};
  const fieldKey = field.dataKey;

  if (hasValue(resolvedValue)) {
    scoped[fieldKey] = resolvedValue;
  } else {
    const rawPreferred = resolvePreferredFieldValue(preferredFromAsr, fieldKey);
    if (hasValue(rawPreferred)) {
      const normalized = normalizeFieldValue(fieldKey, rawPreferred);
      if (hasValue(normalized)) {
        scoped[fieldKey] = normalized;
      }
    }
  }

  if (module.formType === 'observation' && fieldKey === 'category' && hasValue(scoped.category)) {
    scoped.observation_type = scoped.category;
  }

  return scoped;
}

function compactAlphaNum(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function hasValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

function friendlyDetectionError(error) {
  const message = String(error || '').trim();
  const lower = message.toLowerCase();

  if (lower.includes('voice ai key missing') || lower.includes('nvidia_asr_api_key missing')) {
    return 'Voice service key is not configured by admin.';
  }
  if (lower.includes('configured speech model is unavailable')) {
    return 'Speech model not available in endpoint. Contact admin to update ASR model settings.';
  }
  if (lower.includes('model') && lower.includes('not available')) {
    return 'Speech model not available in endpoint. Contact admin to update ASR model settings.';
  }
  if (lower.includes('deadline exceeded') || lower.includes('timeout')) {
    return 'Voice service timeout. Please re-record clearly.';
  }
  if (lower.includes('unavailable') || lower.includes('network')) {
    return 'Voice service temporarily unavailable. Retry shortly.';
  }

  return message || 'Unknown voice detection issue';
}

function getModuleIconMarkup(icon, label) {
  const src = MODULE_ICON_ASSETS[icon] || MODULE_ICON_ASSETS.default;
  return buildImageIconMarkup(src, label || 'Module icon', 'module-icon-img');
}

function getFieldIconMarkup(icon, label) {
  const src = FIELD_ICON_ASSETS[icon] || FIELD_ICON_ASSETS.default;
  return buildImageIconMarkup(src, label || 'Field icon', 'field-icon-img');
}

function buildImageIconMarkup(src, alt, className) {
  return `<img class="${className}" src="${src}" alt="${escapeAttribute(alt)}" draggable="false">`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
