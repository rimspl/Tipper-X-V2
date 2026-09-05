import {
  applyCors,
  createAuditEvent,
  getActorId,
  getAdminClient,
  handlePreflight,
  isNoRowsError,
  methodGuard,
  parseBody,
  requireFields,
  toPublicPipelineStatus
} from '../../../services/api-sync/_lib.js';
import { runDeepProcessingForSubmission } from '../../../services/api-sync/_processing.js';

function hashMapFromList(items = []) {
  if (!Array.isArray(items)) return new Map();
  const map = new Map();

  for (const item of items) {
    if (!item) continue;
    const key = String(item.step_id || '').trim();
    const value = String(item.sha256 || '').trim();
    if (!key || !value) continue;
    map.set(key, value);
  }

  return map;
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

function isPermissionSetupError(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  return code === '42501' || message.includes('permission denied');
}

async function buildReplayFinalizePayload({ supabase, submission }) {
  const [{ data: finalReport, error: finalReportError }, { data: reviewItem, error: reviewError }] = await Promise.all([
    supabase
      .schema('ops')
      .from('final_reports')
      .select('id, approval_mode, approved_at, final_payload')
      .eq('submission_id', submission.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .schema('ops')
      .from('review_queue')
      .select('id, status, reason, priority, created_at, resolved_at')
      .eq('submission_id', submission.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  if (finalReportError && !isNoRowsError(finalReportError)) {
    throw new Error(finalReportError.message);
  }

  if (reviewError && !isNoRowsError(reviewError)) {
    throw new Error(reviewError.message);
  }

  const pipelineStatus = toPublicPipelineStatus({
    submission,
    reviewItem: reviewItem || null,
    finalReport: finalReport || null
  });

  const finalPayload = finalReport?.final_payload || {};

  return {
    success: true,
    replayed: true,
    submission: {
      id: submission.id,
      idempotency_key: submission.idempotency_key,
      sync_status: submission.sync_status,
      processing_status: submission.processing_status,
      pipeline_status: pipelineStatus
    },
    processing: {
      decision: finalPayload?.decision || null,
      overall_confidence: Number.isFinite(Number(finalPayload?.overall_confidence))
        ? Number(finalPayload.overall_confidence)
        : null,
      validation: finalPayload?.validation || null
    },
    extracted: finalPayload?.extracted || null,
    final_report: finalReport
      ? {
        id: finalReport.id,
        approval_mode: finalReport.approval_mode,
        approved_at: finalReport.approved_at
      }
      : null
  };
}

export default async function handler(req, res) {
  applyCors(res, 'POST, OPTIONS');
  if (handlePreflight(req, res)) return;
  if (!methodGuard(req, res, 'POST')) return;

  try {
    const body = parseBody(req);
    const missing = requireFields(body, ['submission_id']);
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missing.join(', ')}`
      });
    }

    const supabase = getAdminClient();
    const submissionId = body.submission_id;
    const actorId = getActorId(req, null);

    const { data: submission, error: submissionError } = await supabase
      .schema('ops')
      .from('offline_submissions')
      .select('id, idempotency_key, sync_status, processing_status, user_id, form_type')
      .eq('id', submissionId)
      .maybeSingle();

    if (submissionError && !isNoRowsError(submissionError)) {
      throw new Error(submissionError.message);
    }

    if (!submission) {
      return res.status(404).json({
        success: false,
        error: 'Submission not found'
      });
    }

    if (
      submission.sync_status === 'uploaded'
      && ['queued', 'running', 'needs_review', 'completed'].includes(submission.processing_status)
    ) {
      const replayPayload = await buildReplayFinalizePayload({ supabase, submission });
      return res.status(200).json(replayPayload);
    }

    const { data: mediaRows, error: mediaError } = await supabase
      .schema('ops')
      .from('submission_media')
      .select('id, step_id, storage_path, sha256')
      .eq('submission_id', submissionId);

    if (mediaError) {
      throw new Error(mediaError.message);
    }

    if (!mediaRows || mediaRows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No media rows found for this submission'
      });
    }

    const providedHashes = hashMapFromList(body.media_hashes);
    const mismatches = [];

    if (providedHashes.size > 0) {
      for (const row of mediaRows) {
        const expectedHash = providedHashes.get(row.step_id);
        if (!expectedHash) continue;
        if (expectedHash !== row.sha256) {
          mismatches.push({
            step_id: row.step_id,
            expected: row.sha256,
            received: expectedHash
          });
        }
      }
    }

    if (mismatches.length > 0) {
      await supabase
        .schema('ops')
        .from('offline_submissions')
        .update({ sync_status: 'failed', processing_status: 'failed' })
        .eq('id', submissionId);

      await createAuditEvent(supabase, {
        entityType: 'offline_submission',
        entityId: submissionId,
        eventType: 'submission_finalize_hash_mismatch',
        actorId: actorId || submission.user_id,
        payload: {
          mismatch_count: mismatches.length,
          mismatches
        }
      });

      return res.status(422).json({
        success: false,
        error: 'Media hash verification failed',
        mismatches
      });
    }

    const { error: submissionUpdateError } = await supabase
      .schema('ops')
      .from('offline_submissions')
      .update({
        sync_status: 'uploaded',
        processing_status: 'queued'
      })
      .eq('id', submissionId);

    if (submissionUpdateError) {
      throw new Error(submissionUpdateError.message);
    }

    const { error: jobUpsertError } = await supabase
      .schema('ops')
      .from('processing_jobs')
      .upsert(
        {
          submission_id: submissionId,
          job_type: 'extract_and_validate',
          status: 'queued',
          attempt_count: 0,
          last_error: null,
          next_run_at: new Date().toISOString()
        },
        { onConflict: 'submission_id,job_type' }
      );

    if (jobUpsertError) {
      throw new Error(jobUpsertError.message);
    }

    await createAuditEvent(supabase, {
      entityType: 'offline_submission',
      entityId: submissionId,
      eventType: 'submission_finalized',
      actorId: actorId || submission.user_id,
      payload: {
        media_count: mediaRows.length,
        finalized_at: new Date().toISOString()
      }
    });

    const processingResult = await runDeepProcessingForSubmission({
      supabase,
      submissionId,
      actorId: actorId || submission.user_id
    });

    const pipelineStatus = toPublicPipelineStatus({
      submission: {
        ...submission,
        sync_status: 'uploaded',
        processing_status: processingResult.processing_status || 'queued'
      },
      reviewItem: processingResult.pipeline_status === 'needs_review'
        ? { status: 'pending' }
        : null,
      finalReport: processingResult.pipeline_status === 'completed'
        ? { id: processingResult.final_report?.id || 'generated' }
        : null
    });

    return res.status(200).json({
      success: true,
      submission: {
        id: submission.id,
        idempotency_key: submission.idempotency_key,
        sync_status: 'uploaded',
        processing_status: processingResult.processing_status || 'queued',
        pipeline_status: pipelineStatus
      },
      processing: {
        decision: processingResult.decision,
        overall_confidence: processingResult.overall_confidence ?? null,
        validation: processingResult.validation || null
      },
      extracted: processingResult.extracted || null,
      final_report: processingResult.final_report || null
    });
  } catch (error) {
    console.error('sync finalize error:', error);

    if (isSchemaSetupError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Database setup incomplete. Expose schema "ops" in Supabase API settings and run migrations 001-004, then retry sync.'
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
      error: error.message || 'Failed to finalize submission'
    });
  }
}
