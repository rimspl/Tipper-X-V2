import {
  applyCors,
  createAuditEvent,
  getActorId,
  getAdminClient,
  handlePreflight,
  methodGuard,
  parseBody,
  requireFields
} from '../../../services/api-sync/_lib.js';
import { projectSubmissionToDomain, validateExtraction } from '../../../services/api-sync/_processing.js';

const ACTIONS = new Set(['approve', 'correct', 'reject']);

function isCompatibilitySchemaError(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();

  if (code === '42p01' || code === 'pgrst205') {
    return true;
  }

  return (
    message.includes('could not find the table')
    || message.includes('schema cache')
    || (message.includes('relation') && message.includes('does not exist'))
    || message.includes('does not exist')
    || message.includes('missing from schema')
  );
}

function toFieldMap(rows = []) {
  const map = {};
  for (const row of rows) {
    map[row.field_key] = row.field_value;
  }
  return map;
}

function toConfidenceMap(rows = []) {
  const map = {};
  for (const row of rows) {
    map[row.field_key] = row.confidence === null || row.confidence === undefined
      ? 0.8
      : Number(row.confidence);
  }
  return map;
}

async function overwriteExtractedFields({ supabase, submissionId, extracted, confidence }) {
  await supabase
    .schema('ops')
    .from('extracted_fields')
    .delete()
    .eq('submission_id', submissionId);

  const rows = Object.entries(extracted)
    .filter(([, fieldValue]) => fieldValue !== undefined && fieldValue !== null)
    .map(([fieldKey, fieldValue]) => ({
      submission_id: submissionId,
      field_key: fieldKey,
      field_value: fieldValue,
      confidence: confidence[fieldKey] ?? 0.95,
      source_media_id: null
    }));

  if (rows.length === 0) {
    return;
  }

  const { error } = await supabase.schema('ops').from('extracted_fields').insert(rows);
  if (error) {
    throw new Error(`Failed to update extracted fields: ${error.message}`);
  }
}

export default async function handler(req, res) {
  applyCors(res, 'POST, OPTIONS');
  if (handlePreflight(req, res)) return;
  if (!methodGuard(req, res, 'POST')) return;

  try {
    const body = parseBody(req);
    const missing = requireFields(body, ['review_id', 'action']);
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missing.join(', ')}`
      });
    }

    const action = String(body.action || '').trim().toLowerCase();
    if (!ACTIONS.has(action)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid action. Use approve, correct, or reject.'
      });
    }

    const correctedFields = body.corrected_fields && typeof body.corrected_fields === 'object'
      ? body.corrected_fields
      : {};

    if (action === 'correct' && Object.keys(correctedFields).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'corrected_fields is required for action=correct'
      });
    }

    const supabase = getAdminClient();
    const actorId = getActorId(req, body.actor_id || null);

    const { data: reviewItem, error: reviewError } = await supabase
      .schema('ops')
      .from('review_queue')
      .select('id, submission_id, status, reason, priority')
      .eq('id', body.review_id)
      .maybeSingle();

    if (reviewError || !reviewItem) {
      return res.status(404).json({
        success: false,
        error: 'Review item not found'
      });
    }

    if (reviewItem.status === 'resolved' || reviewItem.status === 'rejected') {
      return res.status(409).json({
        success: false,
        error: `Review item already ${reviewItem.status}`
      });
    }

    const { data: submission, error: submissionError } = await supabase
      .schema('ops')
      .from('offline_submissions')
      .select('id, form_type, site_id, user_id, device_id, local_submission_id, context_json, capture_started_at, capture_completed_at, created_at, projection_version')
      .eq('id', reviewItem.submission_id)
      .maybeSingle();

    if (submissionError || !submission) {
      return res.status(404).json({
        success: false,
        error: 'Submission not found for review'
      });
    }

    if (action === 'reject') {
      await supabase
        .schema('ops')
        .from('review_queue')
        .update({ status: 'rejected', resolved_at: new Date().toISOString() })
        .eq('id', reviewItem.id);

      await supabase
        .schema('ops')
        .from('offline_submissions')
        .update({ processing_status: 'failed' })
        .eq('id', submission.id);

      await createAuditEvent(supabase, {
        entityType: 'review_queue',
        entityId: reviewItem.id,
        eventType: 'review_rejected',
        actorId,
        payload: {
          submission_id: submission.id,
          reason: reviewItem.reason
        }
      });

      return res.status(200).json({
        success: true,
        review_id: reviewItem.id,
        status: 'rejected'
      });
    }

    const { data: extractedRows, error: extractedError } = await supabase
      .schema('ops')
      .from('extracted_fields')
      .select('field_key, field_value, confidence')
      .eq('submission_id', submission.id);

    if (extractedError) {
      throw new Error(`Failed to fetch extracted fields: ${extractedError.message}`);
    }

    const extracted = toFieldMap(extractedRows || []);
    const confidence = toConfidenceMap(extractedRows || []);

    if (Object.keys(extracted).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No extracted fields found for this submission'
      });
    }

    if (action === 'correct') {
      for (const [fieldKey, fieldValue] of Object.entries(correctedFields)) {
        extracted[fieldKey] = fieldValue;
        confidence[fieldKey] = 0.99;
      }
    }

    const validation = validateExtraction(submission.form_type, extracted);
    if (!validation.is_valid) {
      return res.status(400).json({
        success: false,
        error: `Invalid extraction after review: ${validation.errors.join('; ')}`
      });
    }

    await overwriteExtractedFields({
      supabase,
      submissionId: submission.id,
      extracted,
      confidence
    });

    const overallConfidenceValues = Object.values(confidence).filter((value) => Number.isFinite(Number(value)));
    const overallConfidence = overallConfidenceValues.length > 0
      ? overallConfidenceValues.reduce((sum, value) => sum + Number(value), 0) / overallConfidenceValues.length
      : 0.95;

    const extraction = {
      extracted,
      field_confidence: confidence,
      overall_confidence: Number(overallConfidence.toFixed(4)),
      context: submission.context_json || {},
      validation
    };
    const approvalMode = action === 'correct' ? 'manager_corrected' : 'manager_approved';

    let compatibilityWrite;
    try {
      compatibilityWrite = await projectSubmissionToDomain({
        supabase,
        submission,
        extraction,
        actorId,
        approvalMode,
        pipelineStatus: 'completed',
        sourceType: 'offline_submission',
        sourcePk: submission.id,
        projectionVersion: submission.projection_version || 1
      });
    } catch (error) {
      compatibilityWrite = {
        table: null,
        activity_type: null,
        skipped: true,
        reason: error.message || 'Compatibility write skipped'
      };

      await createAuditEvent(supabase, {
        entityType: 'review_queue',
        entityId: reviewItem.id,
        eventType: isCompatibilitySchemaError(error)
          ? 'review_compatibility_write_skipped_schema'
          : 'review_compatibility_write_skipped_runtime',
        actorId,
        payload: {
          submission_id: submission.id,
          reason: compatibilityWrite.reason
        }
      });
    }

    const finalPayload = {
      generated_at: new Date().toISOString(),
      form_type: submission.form_type,
      context: extraction.context,
      extracted,
      field_confidence: confidence,
      overall_confidence: extraction.overall_confidence,
      validation,
      decision: approvalMode,
      compatibility_write: compatibilityWrite
    };

    const { data: finalReport, error: finalError } = await supabase
      .schema('ops')
      .from('final_reports')
      .insert({
        submission_id: submission.id,
        final_payload: finalPayload,
        approval_mode: approvalMode,
        approved_by: actorId,
        approved_at: new Date().toISOString()
      })
      .select('id, approval_mode, approved_at')
      .single();

    if (finalError) {
      throw new Error(`Failed to write final report: ${finalError.message}`);
    }

    await supabase
      .schema('ops')
      .from('review_queue')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', reviewItem.id);

    await supabase
      .schema('ops')
      .from('offline_submissions')
      .update({ processing_status: 'completed' })
      .eq('id', submission.id);

    await supabase
      .schema('ops')
      .from('processing_jobs')
      .update({ status: 'completed', last_error: null })
      .eq('submission_id', submission.id)
      .eq('job_type', 'extract_and_validate');

    await createAuditEvent(supabase, {
      entityType: 'review_queue',
      entityId: reviewItem.id,
      eventType: action === 'correct' ? 'review_corrected' : 'review_approved',
      actorId,
      payload: {
        submission_id: submission.id,
        final_report_id: finalReport.id,
        corrected_fields: correctedFields,
        validation
      }
    });

    return res.status(200).json({
      success: true,
      review_id: reviewItem.id,
      status: 'resolved',
      final_report: finalReport,
      compatibility_write: compatibilityWrite
    });
  } catch (error) {
    console.error('review action error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to apply review action'
    });
  }
}
