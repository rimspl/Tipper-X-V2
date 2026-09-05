const DEFAULT_TIMEOUT_MS = 60000;
const FINALIZE_TIMEOUT_MS = 90000;
const UPLOAD_TIMEOUT_MS = 120000;
const STATUS_TIMEOUT_MS = 30000;
const PREVIEW_TIMEOUT_MS = 45000;

function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const reason = new Error(`Request to ${url} timed out after ${Math.round(timeoutMs / 1000)}s`);
  reason.name = 'SyncTimeoutError';
  const timer = setTimeout(() => controller.abort(reason), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function ensureJson(response) {
  return response.json().catch(() => ({}));
}

function isDatabaseSetupError(message) {
  const normalized = String(message || '').toLowerCase();
  return (
    normalized.includes('database setup is incomplete')
    || normalized.includes('database setup incomplete')
    || normalized.includes('run migrations 001-004')
    || normalized.includes('invalid schema')
    || normalized.includes('schema "ops"')
    || normalized.includes('expose schema')
  );
}

function normalizeSyncError(message) {
  const raw = String(message || '').trim();
  const lower = raw.toLowerCase();

  if (
    lower.includes('synctimeouterror')
    || lower.includes('timed out')
    || lower.includes('signal is aborted')
  ) {
    return 'Sync is taking longer than expected. Your submission is safe and will retry automatically in the background.';
  }

  if (
    lower.includes('networkerror')
    || lower.includes('failed to fetch')
    || lower.includes('fetch failed')
    || lower.includes('network request failed')
    || lower.includes('load failed')
  ) {
    return 'Network connection was lost. Your submission is saved and will auto-sync when the network returns.';
  }

  if (
    lower.includes('schema cache')
    || lower.includes('does not exist')
    || lower.includes('could not find the table')
    || lower.includes('missing from schema')
    || lower.includes('invalid schema')
    || lower.includes('the schema must be one of')
    || lower.includes('must be one of the following')
    || lower.includes('accept-profile')
  ) {
    return 'Database setup is incomplete. Expose schema "ops" in Supabase API settings and run required migrations (001-004) before syncing.';
  }

  if (
    lower.includes('permission denied')
    || lower.includes('database permissions incomplete')
    || lower.includes('grant service_role access')
  ) {
    return 'Database permissions are incomplete. In Supabase, grant service_role access on schema "ops" tables/routines/sequences, then retry sync.';
  }

  if (
    lower.includes('submission identity mismatch')
    || lower.includes('site mapping is invalid')
    || lower.includes('not mapped to any site')
    || lower.includes('vehicles_site_id_fkey')
    || (lower.includes('foreign key') && lower.includes('site_id'))
  ) {
    return 'Your account-site mapping is invalid or out of date. Log out, log in again, then retry sync. If it still fails, ask admin to verify your site mapping.';
  }

  if (
    (lower.includes('bucket') && lower.includes('not found'))
    || lower.includes('storage setup incomplete')
    || lower.includes('related resource does not exist')
  ) {
    return 'Storage setup is incomplete. Create Supabase bucket "fitter-evidence" (or set SYNC_MEDIA_BUCKET) before syncing.';
  }

  return raw || 'Sync request failed';
}

function toStepPayload(mediaItems = []) {
  return mediaItems.map((media) => ({
    step_id: media.step_id,
    media_kind: media.media_kind,
    mime_type: media.mime_type,
    sha256: media.sha256,
    captured_at: media.captured_at,
    meta: media.meta_json || {}
  }));
}

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Failed to read capture blob'));
    reader.readAsDataURL(blob);
  });
}

async function runPreviewExtraction({ submission, mediaItems }) {
  const steps = [];

  for (const media of mediaItems) {
    let dataUrl = null;
    const mediaKind = String(media.media_kind || '').toLowerCase();
    if (media.blob && (mediaKind === 'image' || mediaKind === 'audio')) {
      dataUrl = await blobToDataUrl(media.blob);
    }

    steps.push({
      step_id: media.step_id,
      media_kind: media.media_kind,
      mime_type: media.mime_type,
      sha256: media.sha256,
      captured_at: media.captured_at,
      data_url: dataUrl,
      meta: media.meta_json || {}
    });
  }

  const response = await fetchWithTimeout('/api/v1/sync/extract-preview', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': submission.user_id
    },
    body: JSON.stringify({
      form_type: submission.form_type,
      context: submission.context_json || {},
      steps
    })
  }, PREVIEW_TIMEOUT_MS);

  const json = await ensureJson(response);
  if (!response.ok || !json.success) {
    throw new Error(normalizeSyncError(json.error || `Preview extraction failed (${response.status})`));
  }

  return json;
}

export async function syncSubmissionBundle({ submission, mediaItems }) {
  const registerPayload = {
    idempotency_key: submission.idempotency_key,
    device_id: submission.device_id,
    local_submission_id: submission.local_submission_id,
    form_type: submission.form_type,
    site_id: submission.site_id,
    user_id: submission.user_id,
    capture_started_at: submission.capture_started_at,
    capture_completed_at: submission.capture_completed_at,
    context: submission.context_json || {},
    steps: toStepPayload(mediaItems),
    app_version: submission.app_version || '1.0.0',
    schema_version: submission.schema_version || '2026-02-19'
  };

  const registerResponse = await fetchWithTimeout('/api/v1/sync/submissions-register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': submission.user_id
    },
    body: JSON.stringify(registerPayload)
  }, DEFAULT_TIMEOUT_MS);

  const registerJson = await ensureJson(registerResponse);
  if (!registerResponse.ok || !registerJson.success) {
    const registerError = normalizeSyncError(registerJson.error || `Register failed (${registerResponse.status})`);

    if (isDatabaseSetupError(registerError)) {
      const preview = await runPreviewExtraction({ submission, mediaItems });

      return {
        submissionId: null,
        sync: {
          id: null,
          preview_mode: true
        },
        preview_mode: true,
        finalize: {
          success: true,
          submission: {
            pipeline_status: preview.submission?.pipeline_status || 'completed',
            processing_status: preview.submission?.processing_status || 'completed'
          },
          processing: preview.processing || null,
          extracted: preview.extracted || null,
          final_report: {
            id: null,
            approval_mode: 'preview_only',
            preview_mode: true,
            final_payload: {
              extracted: preview.extracted || null,
              processing: preview.processing || null,
              ocr_hints: preview.ocr_hints || null
            }
          }
        }
      };
    }

    throw new Error(registerError);
  }

  const mediaMap = new Map(mediaItems.map((item) => [item.step_id, item]));
  const uploads = Array.isArray(registerJson.media_uploads) ? registerJson.media_uploads : [];

  for (const upload of uploads) {
    const media = mediaMap.get(upload.step_id);
    if (!media || !media.blob) {
      throw new Error(`Missing local media for ${upload.step_id}`);
    }

    const uploadResponse = await fetchWithTimeout(upload.upload.signed_url, {
      method: 'PUT',
      headers: {
        'Content-Type': media.mime_type || media.blob.type || 'application/octet-stream'
      },
      body: media.blob
    }, UPLOAD_TIMEOUT_MS);

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed for ${upload.step_id}`);
    }
  }

  const finalizePayload = {
    submission_id: registerJson.submission.id,
    media_hashes: mediaItems.map((media) => ({
      step_id: media.step_id,
      sha256: media.sha256
    }))
  };

  const finalizeResponse = await fetchWithTimeout('/api/v1/sync/submissions-finalize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': submission.user_id
    },
    body: JSON.stringify(finalizePayload)
  }, FINALIZE_TIMEOUT_MS);

  const finalizeJson = await ensureJson(finalizeResponse);
  if (!finalizeResponse.ok || !finalizeJson.success) {
    throw new Error(normalizeSyncError(finalizeJson.error || `Finalize failed (${finalizeResponse.status})`));
  }

  return {
    submissionId: registerJson.submission.id,
    sync: registerJson.submission,
    finalize: finalizeJson
  };
}

export async function fetchBatchStatuses({ submissionIds = [] }) {
  if (!Array.isArray(submissionIds) || submissionIds.length === 0) {
    return [];
  }

  const response = await fetchWithTimeout('/api/v1/sync/status-batch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ submission_ids: submissionIds })
  }, STATUS_TIMEOUT_MS);

  const json = await ensureJson(response);
  if (!response.ok || !json.success) {
    throw new Error(normalizeSyncError(json.error || `Status batch failed (${response.status})`));
  }

  return Array.isArray(json.statuses) ? json.statuses : [];
}
