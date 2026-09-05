import {
  FORM_LABELS,
  MAX_SYNC_RETRIES,
  QUEUE_STATUS,
  SETTINGS_KEYS,
  SYNC_STATE
} from './constants.js';
import {
  getSetting,
  getSubmission,
  listMediaBySubmission,
  listQueueItems,
  listSubmissions,
  putMediaItems,
  putQueueItem,
  putSubmission,
  setSetting,
  updateQueueItem,
  updateSubmission
} from './idb.js';
import { fetchBatchStatuses, syncSubmissionBundle } from './sync-api.js';

let activeSyncCyclePromise = null;
const STALE_RUNNING_MS = 45000;

export async function initializeDeviceContext(session) {
  const deviceId = (await getSetting(SETTINGS_KEYS.deviceId)) || createId();
  await setSetting(SETTINGS_KEYS.deviceId, deviceId);

  if (session?.siteId) {
    await setSetting('session_site_id', session.siteId);
  }
  if (session?.userId) {
    await setSetting('session_user_id', session.userId);
  }

  return { deviceId };
}

export async function getMergedContext(queryContext = {}) {
  const assigned = (await getSetting(SETTINGS_KEYS.assignedContext, {})) || {};
  const last = (await getSetting(SETTINGS_KEYS.lastContext, {})) || {};

  const positions = Array.isArray(queryContext.positions)
    ? queryContext.positions
    : (Array.isArray(assigned.positions) ? assigned.positions : (Array.isArray(last.positions) ? last.positions : []));

  return {
    vehicle_no: queryContext.vehicle_no || assigned.vehicle_no || last.vehicle_no || '',
    position_code: queryContext.position_code || assigned.position_code || last.position_code || '',
    shift: queryContext.shift || assigned.shift || last.shift || '',
    positions
  };
}

export async function saveCaptureSubmission({ session, formType, context, captures }) {
  if (!session?.userId || !session.siteId) {
    throw new Error('Missing session site/user context');
  }
  if (!Array.isArray(captures) || captures.length === 0) {
    throw new Error('No captures to save');
  }

  const deviceId = (await getSetting(SETTINGS_KEYS.deviceId)) || createId();
  const localId = createId();
  const now = new Date().toISOString();

  const captureTimes = captures
    .map((item) => item.captured_at)
    .filter(Boolean)
    .sort();

  const captureStartedAt = captureTimes[0] || now;
  const captureCompletedAt = captureTimes[captureTimes.length - 1] || now;

  const submission = {
    local_id: localId,
    local_submission_id: localId,
    idempotency_key: `${deviceId}-${localId}-${formType}-v1`,
    device_id: deviceId,
    site_id: session.siteId,
    user_id: session.userId,
    form_type: formType,
    context_json: {
      vehicle_no: context.vehicle_no,
      position_code: context.position_code,
      shift: context.shift
    },
    sync_state: SYNC_STATE.ready,
    pipeline_status: null,
    needs_review: true,
    retry_count: 0,
    last_error: null,
    server_submission_id: null,
    capture_started_at: captureStartedAt,
    capture_completed_at: captureCompletedAt,
    app_version: '1.0.0',
    schema_version: '2026-02-19',
    created_at: now,
    updated_at: now
  };

  const mediaRows = captures.map((capture) => ({
    media_local_id: createId(),
    submission_local_id: localId,
    step_id: capture.step_id,
    media_kind: capture.media_kind,
    mime_type: capture.mime_type,
    sha256: capture.sha256,
    captured_at: capture.captured_at,
    size_bytes: capture.blob?.size || 0,
    blob: capture.blob,
    meta_json: capture.meta_json || {},
    created_at: now
  }));

  const queueItem = {
    queue_id: createId(),
    submission_local_id: localId,
    form_type: formType,
    status: QUEUE_STATUS.pending,
    attempts: 0,
    next_retry_at: now,
    last_error: null,
    created_at: now,
    updated_at: now
  };

  await putSubmission(submission);
  await putMediaItems(mediaRows);
  await putQueueItem(queueItem);
  await setSetting(SETTINGS_KEYS.lastContext, {
    vehicle_no: context.vehicle_no,
    position_code: context.position_code,
    shift: context.shift,
    positions: Array.isArray(context.positions) ? context.positions : []
  });

  return {
    submission,
    queueItem
  };
}

export async function getHomeStats() {
  const submissions = await listSubmissions();

  const countByState = submissions.reduce((acc, row) => {
    const key = row.sync_state || SYNC_STATE.ready;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const pending =
    (countByState[SYNC_STATE.ready] || 0)
    + (countByState[SYNC_STATE.syncing] || 0)
    + (countByState[SYNC_STATE.failed] || 0)
    + (countByState[SYNC_STATE.processing] || 0);

  return {
    total: submissions.length,
    pending,
    synced: countByState[SYNC_STATE.reportReady] || 0,
    failed: countByState[SYNC_STATE.failed] || 0,
    countByState
  };
}

export async function getQueueView() {
  const [queue, submissions] = await Promise.all([listQueueItems(), listSubmissions()]);
  const submissionMap = new Map(submissions.map((item) => [item.local_id, item]));

  return queue
    .map((item) => {
      const submission = submissionMap.get(item.submission_local_id);
      return {
        ...item,
        submission
      };
    })
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}

export async function recoverInterruptedQueueItems() {
  const queue = await listQueueItems();
  const now = Date.now();
  let recovered = 0;

  for (const item of queue) {
    if (item.status !== QUEUE_STATUS.running) {
      continue;
    }

    const updatedAtMs = Date.parse(item.updated_at || item.created_at || 0);
    const isStale = Number.isNaN(updatedAtMs) || (now - updatedAtMs) > STALE_RUNNING_MS;
    if (!isStale) {
      continue;
    }

    await updateQueueItem(item.queue_id, {
      status: QUEUE_STATUS.retry,
      next_retry_at: new Date().toISOString(),
      last_error: 'Previous sync was interrupted. Retrying.'
    });

    await updateSubmission(item.submission_local_id, {
      sync_state: SYNC_STATE.ready,
      last_error: null
    });

    recovered += 1;
  }

  return recovered;
}

export async function retryQueueItemById(queueId) {
  const queueItem = await updateQueueItem(queueId, {
    status: QUEUE_STATUS.pending,
    next_retry_at: new Date().toISOString(),
    last_error: null
  });

  if (!queueItem) {
    throw new Error('Queue item not found');
  }

  const submission = await updateSubmission(queueItem.submission_local_id, {
    sync_state: SYNC_STATE.ready,
    last_error: null
  });

  return {
    queueItem,
    submission
  };
}

export async function runSyncCycle({ onProgress, force = false } = {}) {
  if (activeSyncCyclePromise) {
    return activeSyncCyclePromise;
  }

  activeSyncCyclePromise = (async () => {
    await recoverInterruptedQueueItems();
    const queue = await listQueueItems();
    const now = Date.now();

    const candidates = queue
      .filter((item) => {
        if (item.status !== QUEUE_STATUS.pending && item.status !== QUEUE_STATUS.retry) {
          return false;
        }

        if (item.status === QUEUE_STATUS.pending) {
          return true;
        }

        const nextRetryAt = Date.parse(item.next_retry_at || 0);
        return force || Number.isNaN(nextRetryAt) || nextRetryAt <= now;
      })
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    if (candidates.length === 0) {
      return {
        processed: 0,
        synced: 0,
        failed: 0
      };
    }

    let synced = 0;
    let failed = 0;

    for (const candidate of candidates) {
      const queueItem = await updateQueueItem(candidate.queue_id, {
        status: QUEUE_STATUS.running,
        last_error: null
      });

      await updateSubmission(candidate.submission_local_id, {
        sync_state: SYNC_STATE.syncing,
        last_error: null
      });

      emitProgress(onProgress, {
        type: 'started',
        queueItem,
        message: `${FORM_LABELS[candidate.form_type] || candidate.form_type}: sync started`
      });

      try {
        const submission = await getSubmission(candidate.submission_local_id);
        const mediaItems = await listMediaBySubmission(candidate.submission_local_id);

        if (!submission) {
          throw new Error('Submission missing in local storage');
        }
        if (!Array.isArray(mediaItems) || mediaItems.length === 0) {
          throw new Error('Submission media missing in local storage');
        }

        const result = await syncSubmissionBundle({ submission, mediaItems });

        const finalize = result.finalize || {};
        const pipeline = result.preview_mode
          ? 'preview_only'
          : (finalize.submission?.pipeline_status || finalize.processing?.decision || 'processing');

        let nextState = SYNC_STATE.processing;
        if (pipeline === 'completed') {
          nextState = SYNC_STATE.reportReady;
        } else if (pipeline === 'needs_review') {
          nextState = SYNC_STATE.reportReady;
        } else if (pipeline === 'failed') {
          nextState = SYNC_STATE.failed;
        } else if (pipeline === 'preview_only') {
          nextState = SYNC_STATE.reportReady;
        }

        await updateSubmission(candidate.submission_local_id, {
          sync_state: nextState,
          pipeline_status: pipeline,
          server_submission_id: result.submissionId,
          last_error: null,
          extracted: finalize.extracted || null,
          preview_mode: Boolean(result.preview_mode)
        });

        await updateQueueItem(candidate.queue_id, {
          status: QUEUE_STATUS.completed,
          attempts: queueItem.attempts || 0,
          next_retry_at: null,
          last_error: null
        });

        if (finalize.extracted && typeof finalize.extracted === 'object') {
          await setSetting(`last_extraction_${submission.form_type}`, finalize.extracted);
        }

        synced += 1;
        emitProgress(onProgress, {
          type: 'synced',
          queueItem,
          message: result.preview_mode
            ? `${FORM_LABELS[candidate.form_type] || candidate.form_type}: OCR preview generated (DB setup pending)`
            : `${FORM_LABELS[candidate.form_type] || candidate.form_type}: synced`
        });
      } catch (error) {
        const attempts = (queueItem?.attempts || 0) + 1;
        const shouldRetry = attempts < MAX_SYNC_RETRIES;

        await updateQueueItem(candidate.queue_id, {
          status: shouldRetry ? QUEUE_STATUS.retry : QUEUE_STATUS.failed,
          attempts,
          next_retry_at: shouldRetry ? nextRetryTimestamp(attempts) : null,
          last_error: error.message || 'Sync failed'
        });

        await updateSubmission(candidate.submission_local_id, {
          sync_state: shouldRetry ? SYNC_STATE.ready : SYNC_STATE.failed,
          retry_count: attempts,
          last_error: error.message || 'Sync failed'
        });

        failed += 1;
        emitProgress(onProgress, {
          type: 'failed',
          queueItem,
          message: `${FORM_LABELS[candidate.form_type] || candidate.form_type}: ${error.message || 'Sync failed'}`
        });

        if (isNetworkError(error)) {
          break;
        }
      }
    }

    try {
      await refreshProcessingStates();
    } catch (error) {
      console.warn('Processing status refresh skipped:', error);
    }
    await setSetting(SETTINGS_KEYS.lastSyncAt, new Date().toISOString());

    return {
      processed: candidates.length,
      synced,
      failed
    };
  })();

  try {
    return await activeSyncCyclePromise;
  } finally {
    activeSyncCyclePromise = null;
  }
}

export async function refreshProcessingStates() {
  const submissions = await listSubmissions();

  const processing = submissions.filter(
    (item) =>
      item.sync_state === SYNC_STATE.processing
      && item.server_submission_id
  );

  if (processing.length === 0) {
    return;
  }

  const statuses = await fetchBatchStatuses({
    submissionIds: processing.map((item) => item.server_submission_id)
  });

  const statusMap = new Map(statuses.map((item) => [item.submission_id, item]));

  for (const submission of processing) {
    const status = statusMap.get(submission.server_submission_id);
    if (!status) continue;

    let nextState = submission.sync_state;
    if (status.pipeline_status === 'completed' || status.pipeline_status === 'needs_review') {
      nextState = SYNC_STATE.reportReady;
    } else if (status.pipeline_status === 'failed') {
      nextState = SYNC_STATE.failed;
    } else if (status.pipeline_status === 'processing' || status.pipeline_status === 'uploading' || status.pipeline_status === 'uploaded') {
      nextState = SYNC_STATE.processing;
    }

    await updateSubmission(submission.local_id, {
      sync_state: nextState,
      pipeline_status: status.pipeline_status,
      last_error: nextState === SYNC_STATE.failed ? 'Processing failed on server' : null
    });
  }
}

export async function getLastExtraction(formType) {
  return getSetting(`last_extraction_${formType}`, null);
}

function emitProgress(onProgress, payload) {
  if (typeof onProgress === 'function') {
    onProgress(payload);
  }
}

function nextRetryTimestamp(attempts) {
  const backoffMinutes = Math.pow(2, Math.max(0, attempts - 1));
  return new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();
}

function isNetworkError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('network')
    || message.includes('failed to fetch')
    || message.includes('timeout');
}

function createId() {
  if (crypto && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
