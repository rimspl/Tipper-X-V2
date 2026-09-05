import crypto from 'node:crypto';
import {
  ALLOWED_FORM_TYPES,
  applyCors,
  buildIdempotencyKey,
  buildStoragePath,
  createAuditEvent,
  getActorId,
  getAdminClient,
  getBucketName,
  getMediaExtension,
  handlePreflight,
  isNoRowsError,
  methodGuard,
  normalizeFormType,
  parseBody,
  requireFields,
  sanitizeStepId
} from '../../../services/api-sync/_lib.js';

function normalizeSteps(rawSteps = []) {
  if (!Array.isArray(rawSteps)) return [];

  return rawSteps
    .map((step, index) => {
      const stepId = sanitizeStepId(step.step_id, index);
      const mediaKind = String(step.media_kind || 'image').toLowerCase();
      return {
        step_id: stepId,
        media_kind: mediaKind,
        mime_type: step.mime_type || null,
        sha256: step.sha256 || null,
        captured_at: step.captured_at || null,
        meta: step.meta || {}
      };
    })
    .filter((step) => step.step_id && step.sha256);
}

function indexByStep(rows = []) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.step_id)) {
      map.set(row.step_id, row);
    }
  }
  return map;
}

async function createUploadDescriptor({ supabase, bucket, mediaRow }) {
  let { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(mediaRow.storage_path, { upsert: true });

  if (error && isStorageSetupError(error)) {
    const createResult = await supabase.storage.createBucket(bucket, { public: false });
    const createMessage = String(createResult?.error?.message || '').toLowerCase();
    const bucketAlreadyExists = createMessage.includes('already exists') || createMessage.includes('duplicate');

    if (createResult?.error && !bucketAlreadyExists) {
      throw new Error(`Failed to create storage bucket \"${bucket}\": ${createResult.error.message}`);
    }

    const retry = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(mediaRow.storage_path, { upsert: true });

    data = retry.data;
    error = retry.error;
  }

  if (error) {
    throw new Error(`Failed to create signed upload URL for ${mediaRow.step_id}: ${error.message}`);
  }

  return {
    step_id: mediaRow.step_id,
    media_id: mediaRow.id,
    media_kind: mediaRow.media_kind,
    storage_path: mediaRow.storage_path,
    upload: {
      path: data.path,
      token: data.token,
      signed_url: data.signedUrl
    }
  };
}

function isSchemaSetupError(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();

  if (code === '42p01' || code === 'pgrst205' || code === 'pgrst106') {
    return true;
  }

  return (
    message.includes('schema cache')
    || message.includes('does not exist')
    || message.includes('could not find the table')
    || message.includes('missing from schema')
    || message.includes('invalid schema')
    || message.includes('the schema must be one of')
    || message.includes('must be one of the following')
    || message.includes('accept-profile')
  );
}

function isStorageSetupError(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();

  if (code === '404' || code === 'not_found') {
    return true;
  }

  return (
    message.includes('bucket')
    || message.includes('related resource does not exist')
    || message.includes('not found')
  );
}

function isPermissionSetupError(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  return code === '42501' || message.includes('permission denied');
}

function normalizeUuid(value) {
  return String(value || '').trim().toLowerCase();
}

async function resolveSubmissionIdentityContext(supabase, userId) {
  const normalizedUserId = normalizeUuid(userId);
  if (!normalizedUserId) {
    throw new Error('Missing user identity for sync registration');
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('id, site_id, is_active')
    .eq('id', normalizedUserId)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Failed to validate user profile: ${profileError.message}`);
  }

  if (!profile?.id) {
    throw new Error('User profile not found. Please log in again.');
  }

  if (profile.is_active === false) {
    throw new Error('Your account has been paused. Please contact your manager.');
  }

  const normalizedSiteId = normalizeUuid(profile.site_id);
  if (!normalizedSiteId) {
    throw new Error('Your account is not mapped to any site. Please contact administrator.');
  }

  const { data: site, error: siteError } = await supabase
    .from('sites')
    .select('id')
    .eq('id', normalizedSiteId)
    .maybeSingle();

  if (siteError) {
    throw new Error(`Failed to validate site mapping: ${siteError.message}`);
  }

  if (!site?.id) {
    throw new Error('Your account site mapping is invalid. Please contact administrator.');
  }

  return {
    userId: normalizedUserId,
    siteId: normalizedSiteId
  };
}

export default async function handler(req, res) {
  applyCors(res, 'POST, OPTIONS');
  if (handlePreflight(req, res)) return;
  if (!methodGuard(req, res, 'POST')) return;

  try {
    const body = parseBody(req);
    const missing = requireFields(body, ['device_id', 'local_submission_id', 'form_type', 'site_id', 'user_id']);
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missing.join(', ')}`
      });
    }

    const formType = normalizeFormType(body.form_type);
    if (!ALLOWED_FORM_TYPES.has(formType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid form_type. Allowed: ${Array.from(ALLOWED_FORM_TYPES).join(', ')}`
      });
    }

    const steps = normalizeSteps(body.steps);
    if (steps.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'steps must contain at least one capture step with step_id and sha256'
      });
    }

    const supabase = getAdminClient();
    const bucket = getBucketName();
    const identityContext = await resolveSubmissionIdentityContext(supabase, body.user_id);
    const submittedSiteId = normalizeUuid(body.site_id);

    if (submittedSiteId && submittedSiteId !== identityContext.siteId) {
      console.warn('sync register site mismatch:', {
        user_id: identityContext.userId,
        expected_site_id: identityContext.siteId,
        received_site_id: submittedSiteId
      });
    }

    const idempotencyKey = buildIdempotencyKey({
      idempotencyKey: body.idempotency_key,
      deviceId: body.device_id,
      localSubmissionId: body.local_submission_id,
      formType
    });

    const { data: existingSubmission, error: existingSubmissionError } = await supabase
      .schema('ops')
      .from('offline_submissions')
      .select('id, idempotency_key, sync_status, processing_status, site_id, form_type, user_id')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existingSubmissionError && !isNoRowsError(existingSubmissionError)) {
      throw new Error(existingSubmissionError.message);
    }

    if (
      existingSubmission?.id
      && (
        normalizeUuid(existingSubmission.user_id) !== identityContext.userId
        || normalizeUuid(existingSubmission.site_id) !== identityContext.siteId
      )
    ) {
      return res.status(409).json({
        success: false,
        error: 'Submission identity mismatch. Please refresh login and retry sync.'
      });
    }

    const isReplay = Boolean(existingSubmission?.id);
    let submission = existingSubmission;

    if (!submission) {
      const insertPayload = {
        idempotency_key: idempotencyKey,
        device_id: body.device_id,
        local_submission_id: body.local_submission_id,
        form_type: formType,
        site_id: identityContext.siteId,
        user_id: identityContext.userId,
        context_json: body.context || {},
        capture_started_at: body.capture_started_at || null,
        capture_completed_at: body.capture_completed_at || null,
        app_version: body.app_version || null,
        schema_version: body.schema_version || null,
        sync_status: 'registered',
        processing_status: 'queued'
      };

      const { data: createdSubmission, error: createSubmissionError } = await supabase
        .schema('ops')
        .from('offline_submissions')
        .insert(insertPayload)
        .select('id, idempotency_key, sync_status, processing_status, site_id, form_type, user_id')
        .single();

      if (createSubmissionError) {
        throw new Error(createSubmissionError.message);
      }

      submission = createdSubmission;
    }

    const { data: existingMediaRows, error: existingMediaError } = await supabase
      .schema('ops')
      .from('submission_media')
      .select('id, submission_id, step_id, storage_path, media_kind, sha256')
      .eq('submission_id', submission.id);

    if (existingMediaError) {
      throw new Error(existingMediaError.message);
    }

    const mediaByStep = indexByStep(existingMediaRows || []);
    const mediaRows = [];

    for (const step of steps) {
      const cached = mediaByStep.get(step.step_id);
      if (cached) {
        mediaRows.push(cached);
        continue;
      }

      const mediaId = crypto.randomUUID();
      const extension = getMediaExtension(step);
      const storagePath = buildStoragePath({
        siteId: submission.site_id,
        submissionId: submission.id,
        stepId: step.step_id,
        mediaId,
        capturedAt: step.captured_at || body.capture_completed_at || new Date().toISOString(),
        extension
      });

      const insertMediaPayload = {
        id: mediaId,
        submission_id: submission.id,
        step_id: step.step_id,
        storage_path: storagePath,
        media_kind: step.media_kind,
        sha256: step.sha256,
        captured_at: step.captured_at,
        meta_json: step.meta
      };

      const { data: createdMedia, error: createMediaError } = await supabase
        .schema('ops')
        .from('submission_media')
        .insert(insertMediaPayload)
        .select('id, submission_id, step_id, storage_path, media_kind, sha256')
        .single();

      if (createMediaError) {
        throw new Error(createMediaError.message);
      }

      mediaRows.push(createdMedia);
    }

    const uploadDescriptors = [];
    for (const mediaRow of mediaRows) {
      uploadDescriptors.push(await createUploadDescriptor({ supabase, bucket, mediaRow }));
    }

    await supabase
      .schema('ops')
      .from('offline_submissions')
      .update({ sync_status: 'uploading' })
      .eq('id', submission.id);

    await createAuditEvent(supabase, {
      entityType: 'offline_submission',
      entityId: submission.id,
      eventType: isReplay ? 'submission_register_replayed' : 'submission_registered',
      actorId: getActorId(req, submission.user_id),
      payload: {
        idempotency_key: idempotencyKey,
        step_count: steps.length,
        upload_count: uploadDescriptors.length,
        replayed: isReplay
      }
    });

    return res.status(200).json({
      success: true,
      replayed: isReplay,
      submission: {
        id: submission.id,
        idempotency_key: idempotencyKey,
        form_type: submission.form_type,
        sync_status: 'uploading',
        processing_status: submission.processing_status
      },
      media_uploads: uploadDescriptors
    });
  } catch (error) {
    console.error('sync register error:', error);

    if (isSchemaSetupError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Database setup incomplete. Expose schema "ops" in Supabase API settings and run migrations 001-004, then retry sync.'
      });
    }

    if (isStorageSetupError(error)) {
      return res.status(503).json({
        success: false,
        error: `Storage setup incomplete. Create Supabase bucket "${getBucketName()}" (or set SYNC_MEDIA_BUCKET), then retry sync.`
      });
    }

    if (isPermissionSetupError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Database permissions incomplete. Grant service_role access on schema "ops" (tables, routines, sequences), then retry sync.'
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to register submission'
    });
  }
}
