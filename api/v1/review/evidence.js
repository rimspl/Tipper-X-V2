import {
  applyCors,
  getAdminClient,
  getBucketName,
  handlePreflight,
  methodGuard
} from '../../../services/api-sync/_lib.js';

function toFieldLabel(stepId) {
  const normalized = String(stepId || '').trim().toLowerCase();
  if (!normalized) return '-';
  return normalized
    .replace(/_voice$/i, '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default async function handler(req, res) {
  applyCors(res, 'GET, OPTIONS');
  if (handlePreflight(req, res)) return;
  if (!methodGuard(req, res, 'GET')) return;

  try {
    const submissionId = String(req.query.submission_id || '').trim();
    if (!submissionId) {
      return res.status(400).json({
        success: false,
        error: 'submission_id is required'
      });
    }

    const supabase = getAdminClient();
    const bucket = getBucketName();

    const { data: rows, error } = await supabase
      .schema('ops')
      .from('submission_media')
      .select('id, step_id, storage_path, media_kind, captured_at, meta_json')
      .eq('submission_id', submissionId)
      .order('captured_at', { ascending: true });

    if (error) {
      throw new Error(`Evidence fetch failed: ${error.message}`);
    }

    const evidence = [];
    for (const row of rows || []) {
      const { data, error: signError } = await supabase
        .storage
        .from(bucket)
        .createSignedUrl(row.storage_path, 60 * 60);

      evidence.push({
        media_id: row.id,
        step_id: row.step_id,
        field_label: toFieldLabel(row.step_id),
        media_kind: row.media_kind,
        captured_at: row.captured_at,
        storage_path: row.storage_path,
        signed_url: signError ? null : data?.signedUrl || null,
        transcript: row.meta_json?.pipeline?.asr_transcript || row.meta_json?.pipeline?.ocr_text || null,
        pipeline: row.meta_json?.pipeline || null
      });
    }

    return res.status(200).json({
      success: true,
      evidence
    });
  } catch (error) {
    console.error('review evidence error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch evidence'
    });
  }
}
