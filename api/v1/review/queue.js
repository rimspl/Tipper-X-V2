import {
  applyCors,
  getAdminClient,
  getBucketName,
  handlePreflight,
  methodGuard
} from '../../../services/api-sync/_lib.js';

function normalizeLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 40;
  return Math.max(1, Math.min(120, Math.floor(parsed)));
}

function indexBySubmission(rows = []) {
  const map = new Map();
  for (const row of rows) {
    if (!row.submission_id) continue;
    if (!map.has(row.submission_id)) {
      map.set(row.submission_id, []);
    }
    map.get(row.submission_id).push(row);
  }
  return map;
}

async function buildEvidenceUrls({ supabase, bucket, mediaRows }) {
  const evidence = [];

  for (const row of mediaRows.slice(0, 4)) {
    const { data, error } = await supabase
      .storage
      .from(bucket)
      .createSignedUrl(row.storage_path, 60 * 60);

    evidence.push({
      media_id: row.id,
      step_id: row.step_id,
      storage_path: row.storage_path,
      signed_url: !error ? data?.signedUrl || null : null,
      pipeline: row.meta_json?.pipeline || null
    });
  }

  return evidence;
}

export default async function handler(req, res) {
  applyCors(res, 'GET, OPTIONS');
  if (handlePreflight(req, res)) return;
  if (!methodGuard(req, res, 'GET')) return;

  try {
    const supabase = getAdminClient();
    const bucket = getBucketName();
    const siteId = String(req.query.site_id || '').trim() || null;
    const limit = normalizeLimit(req.query.limit);

    let queueQuery = supabase
      .schema('ops')
      .from('review_queue')
      .select('id, submission_id, reason, priority, status, assigned_to, created_at, resolved_at')
      .in('status', ['pending', 'in_progress'])
      .order('created_at', { ascending: true })
      .limit(limit * 3);

    const { data: queueRows, error: queueError } = await queueQuery;
    if (queueError) {
      throw new Error(`Review queue fetch failed: ${queueError.message}`);
    }

    if (!queueRows || queueRows.length === 0) {
      return res.status(200).json({ success: true, items: [] });
    }

    const submissionIds = Array.from(new Set(queueRows.map((row) => row.submission_id)));
    const { data: submissions, error: submissionError } = await supabase
      .schema('ops')
      .from('offline_submissions')
      .select('id, site_id, form_type, context_json, user_id, capture_completed_at, created_at')
      .in('id', submissionIds);

    if (submissionError) {
      throw new Error(`Submission fetch failed: ${submissionError.message}`);
    }

    const submissionMap = new Map((submissions || []).map((row) => [row.id, row]));
    const filteredQueue = queueRows
      .filter((row) => {
        if (!siteId) return true;
        const submission = submissionMap.get(row.submission_id);
        return submission?.site_id === siteId;
      })
      .slice(0, limit);

    if (filteredQueue.length === 0) {
      return res.status(200).json({ success: true, items: [] });
    }

    const filteredSubmissionIds = Array.from(new Set(filteredQueue.map((row) => row.submission_id)));

    const [{ data: extractedRows, error: extractedError }, { data: mediaRows, error: mediaError }] = await Promise.all([
      supabase
        .schema('ops')
        .from('extracted_fields')
        .select('submission_id, field_key, field_value, confidence')
        .in('submission_id', filteredSubmissionIds),
      supabase
        .schema('ops')
        .from('submission_media')
        .select('id, submission_id, step_id, storage_path, media_kind, captured_at, meta_json')
        .in('submission_id', filteredSubmissionIds)
        .order('captured_at', { ascending: true })
    ]);

    if (extractedError) {
      throw new Error(`Extracted fields fetch failed: ${extractedError.message}`);
    }
    if (mediaError) {
      throw new Error(`Submission media fetch failed: ${mediaError.message}`);
    }

    const extractedBySubmission = indexBySubmission(extractedRows || []);
    const mediaBySubmission = indexBySubmission(mediaRows || []);

    const items = [];
    for (const queueItem of filteredQueue) {
      const submission = submissionMap.get(queueItem.submission_id);
      if (!submission) continue;

      const extractedFields = (extractedBySubmission.get(queueItem.submission_id) || [])
        .map((row) => ({
          field_key: row.field_key,
          field_value: row.field_value,
          confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence)
        }))
        .sort((a, b) => Number(a.confidence || 0) - Number(b.confidence || 0));

      const mediaForSubmission = mediaBySubmission.get(queueItem.submission_id) || [];
      const evidence = await buildEvidenceUrls({
        supabase,
        bucket,
        mediaRows: mediaForSubmission
      });

      items.push({
        review_id: queueItem.id,
        submission_id: queueItem.submission_id,
        form_type: submission.form_type,
        status: queueItem.status,
        reason: queueItem.reason,
        priority: queueItem.priority,
        assigned_to: queueItem.assigned_to,
        created_at: queueItem.created_at,
        context: submission.context_json || {},
        extracted_fields: extractedFields,
        evidence
      });
    }

    return res.status(200).json({
      success: true,
      items
    });
  } catch (error) {
    console.error('review queue error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch review queue'
    });
  }
}
