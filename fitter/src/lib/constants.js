export const DB_NAME = 'dynahaul_fitter_offline_v1';
export const DB_VERSION = 1;

export const STORES = {
  submissions: 'submissions',
  media: 'media',
  syncQueue: 'sync_queue',
  settings: 'settings'
};

export const SYNC_STATE = {
  draft: 'draft',
  ready: 'ready_to_sync',
  syncing: 'syncing',
  synced: 'synced',
  processing: 'processing',
  reportReady: 'report_ready',
  failed: 'failed'
};

export const QUEUE_STATUS = {
  pending: 'pending',
  running: 'running',
  retry: 'retry',
  completed: 'completed',
  failed: 'failed'
};

export const QUALITY = {
  minImageWidth: 720,
  minImageHeight: 540,
  minImagePixels: 420000,
  hardMinImagePixels: 220000,
  warningBlurScore: 0.72,
  hardBlurScore: 0.86,
  minBrightness: 0.14,
  maxBrightness: 0.94,
  hardMinBrightness: 0.08,
  hardMaxBrightness: 0.98
};

export const MAX_SYNC_RETRIES = 5;

export const SETTINGS_KEYS = {
  deviceId: 'device_id',
  assignedContext: 'assigned_context',
  lastContext: 'last_context',
  lastSyncAt: 'last_sync_at'
};

export const FORM_LABELS = {
  tyre_card: 'Tyre Card',
  pressure_check: 'Pressure Check',
  tyre_inspection: 'Tyre Inspection',
  tyre_removal: 'Tyre Removal',
  observation: 'Observation'
};
