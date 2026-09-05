import {
  applyCors,
  getAdminClient,
  handlePreflight,
  methodGuard,
  parseBody,
  toPublicPipelineStatus
} from '../../../services/api-sync/_lib.js';

function normalizeList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 200);
}

function asMapBySubmissionId(rows = []) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.submission_id)) {
      map.set(row.submission_id, row);
    }
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

export default async function handler(req, res) {
  applyCors(res, 'POST, OPTIONS');
  if (handlePreflight(req, res)) return;
  if (!methodGuard(req, res, 'POST')) return;

  try {
    const body = parseBody(req);
    const submissionIds = normalizeList(body.submission_ids);
    const idempotencyKeys = normalizeList(body.idempotency_keys);

    if (submissionIds.length === 0 && idempotencyKeys.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Provide submission_ids or idempotency_keys'
      });
    }

    const supabase = getAdminClient();
    let submissions = [];

    if (submissionIds.length > 0) {
      const { data, error } = await supabase
        .schema('ops')
        .from('offline_submissions')
        .select('id, idempotency_key, form_type, sync_status, processing_status, updated_at, site_id, user_id')
        .in('id', submissionIds);

      if (error) {
        throw new Error(error.message);
      }

      submissions = submissions.concat(data || []);
    }

    if (idempotencyKeys.length > 0) {
      const { data, error } = await supabase
        .schema('ops')
        .from('offline_submissions')
        .select('id, idempotency_key, form_type, sync_status, processing_status, updated_at, site_id, user_id')
        .in('idempotency_key', idempotencyKeys);

      if (error) {
        throw new Error(error.message);
      }

      submissions = submissions.concat(data || []);
    }

    const uniqueMap = new Map();
    for (const row of submissions) {
      uniqueMap.set(row.id, row);
    }
    const uniqueSubmissions = Array.from(uniqueMap.values());
    const uniqueSubmissionIds = uniqueSubmissions.map((item) => item.id);

    if (uniqueSubmissionIds.length === 0) {
      return res.status(200).json({
        success: true,
        statuses: []
      });
    }

    const [{ data: reviews }, { data: finals }] = await Promise.all([
      supabase
        .schema('ops')
        .from('review_queue')
        .select('submission_id, status, reason, priority, created_at, resolved_at')
        .in('submission_id', uniqueSubmissionIds)
        .order('created_at', { ascending: false }),
      supabase
        .schema('ops')
        .from('final_reports')
        .select('submission_id, approval_mode, approved_at, approved_by, created_at')
        .in('submission_id', uniqueSubmissionIds)
        .order('created_at', { ascending: false })
    ]);

    const reviewMap = asMapBySubmissionId(reviews || []);
    const finalMap = asMapBySubmissionId(finals || []);

    const statuses = uniqueSubmissions.map((submission) => {
      const reviewItem = reviewMap.get(submission.id) || null;
      const finalReport = finalMap.get(submission.id) || null;
      return {
        submission_id: submission.id,
        idempotency_key: submission.idempotency_key,
        form_type: submission.form_type,
        sync_status: submission.sync_status,
        processing_status: submission.processing_status,
        pipeline_status: toPublicPipelineStatus({ submission, reviewItem, finalReport }),
        updated_at: submission.updated_at,
        review: reviewItem,
        final_report: finalReport
      };
    });

    return res.status(200).json({
      success: true,
      statuses
    });
  } catch (error) {
    console.error('sync batch status error:', error);

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
      error: error.message || 'Failed to fetch batch status'
    });
  }
}
