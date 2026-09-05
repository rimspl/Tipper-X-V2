import {
  applyCors,
  getAdminClient,
  handlePreflight,
  isNoRowsError,
  methodGuard,
  toPublicPipelineStatus
} from '../../../services/api-sync/_lib.js';

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

export default async function handler(req, res) {
  applyCors(res, 'GET, OPTIONS');
  if (handlePreflight(req, res)) return;
  if (!methodGuard(req, res, 'GET')) return;

  try {
    const submissionId = req.query.submission_id;
    const idempotencyKey = req.query.idempotency_key;

    if (!submissionId && !idempotencyKey) {
      return res.status(400).json({
        success: false,
        error: 'Provide submission_id or idempotency_key'
      });
    }

    const supabase = getAdminClient();
    let query = supabase
      .schema('ops')
      .from('offline_submissions')
      .select('id, idempotency_key, form_type, sync_status, processing_status, created_at, updated_at, site_id, user_id');

    if (submissionId) {
      query = query.eq('id', submissionId);
    } else {
      query = query.eq('idempotency_key', idempotencyKey);
    }

    const { data: submission, error: submissionError } = await query.maybeSingle();

    if (submissionError && !isNoRowsError(submissionError)) {
      throw new Error(submissionError.message);
    }

    if (!submission) {
      return res.status(404).json({
        success: false,
        error: 'Submission not found'
      });
    }

    const { data: reviewItem } = await supabase
      .schema('ops')
      .from('review_queue')
      .select('id, status, reason, priority, created_at, resolved_at')
      .eq('submission_id', submission.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: finalReport } = await supabase
      .schema('ops')
      .from('final_reports')
      .select('id, approval_mode, approved_at, approved_by, created_at')
      .eq('submission_id', submission.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: processingJob } = await supabase
      .schema('ops')
      .from('processing_jobs')
      .select('id, job_type, status, attempt_count, last_error, next_run_at, created_at')
      .eq('submission_id', submission.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const pipelineStatus = toPublicPipelineStatus({ submission, reviewItem, finalReport });

    return res.status(200).json({
      success: true,
      submission: {
        ...submission,
        pipeline_status: pipelineStatus
      },
      processing_job: processingJob || null,
      review: reviewItem || null,
      final_report: finalReport || null
    });
  } catch (error) {
    console.error('sync status error:', error);

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
      error: error.message || 'Failed to fetch submission status'
    });
  }
}
