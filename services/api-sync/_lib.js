import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const ALLOWED_FORM_TYPES = new Set([
  'tyre_card',
  'pressure_check',
  'tyre_inspection',
  'tyre_removal',
  'observation'
]);

export function applyCors(res, methods = 'GET, POST, OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id');
}

export function handlePreflight(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}

export function methodGuard(req, res, allowed) {
  const list = Array.isArray(allowed) ? allowed : [allowed];
  if (!list.includes(req.method)) {
    res.status(405).json({
      success: false,
      error: 'Method not allowed',
      allowed_methods: list
    });
    return false;
  }
  return true;
}

export function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch (error) {
      throw new Error('Invalid JSON body');
    }
  }
  return req.body;
}

export function requireFields(data, fields) {
  return fields.filter((field) => data[field] === undefined || data[field] === null || data[field] === '');
}

export function normalizeFormType(formType) {
  return String(formType || '').trim().toLowerCase().replace(/\s+/g, '_');
}

export function buildIdempotencyKey({ idempotencyKey, deviceId, localSubmissionId, formType }) {
  if (idempotencyKey && String(idempotencyKey).trim()) {
    return String(idempotencyKey).trim();
  }

  const safeDevice = String(deviceId || '').trim() || 'unknown_device';
  const safeLocal = String(localSubmissionId || '').trim() || crypto.randomUUID();
  const safeForm = normalizeFormType(formType) || 'unknown_form';
  return `${safeDevice}-${safeLocal}-${safeForm}-v1`;
}

export function sanitizeStepId(stepId, index) {
  const safe = String(stepId || '').trim().toLowerCase().replace(/[^a-z0-9_\-]/g, '_');
  if (safe) return safe;
  return `capture_${index + 1}`;
}

export function getMediaExtension(step = {}) {
  const mimeType = String(step.mime_type || '').toLowerCase();

  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('quicktime')) return 'mov';
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';

  const kind = String(step.media_kind || '').toLowerCase();
  if (kind === 'video') return 'mp4';
  if (kind === 'audio') return 'wav';
  return 'jpg';
}

export function buildStoragePath({ siteId, submissionId, stepId, mediaId, capturedAt, extension }) {
  const date = capturedAt ? new Date(capturedAt) : new Date();
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');

  const safeSite = String(siteId || 'unknown_site').replace(/[^a-zA-Z0-9_\-]/g, '_');
  const safeSubmission = String(submissionId || 'unknown_submission').replace(/[^a-zA-Z0-9_\-]/g, '_');
  const safeStep = String(stepId || 'capture').replace(/[^a-zA-Z0-9_\-]/g, '_');
  const safeMedia = String(mediaId || crypto.randomUUID()).replace(/[^a-zA-Z0-9_\-]/g, '_');
  const ext = String(extension || 'jpg').replace(/[^a-zA-Z0-9]/g, '');

  return `site/${safeSite}/date/${yyyy}-${mm}-${dd}/submission/${safeSubmission}/${safeStep}-${safeMedia}.${ext}`;
}

export function getActorId(req, fallback) {
  const fromHeader = req.headers['x-user-id'];
  if (fromHeader && String(fromHeader).trim()) return String(fromHeader).trim();
  return fallback || null;
}

export function getBucketName() {
  return process.env.SYNC_MEDIA_BUCKET || 'fitter-evidence';
}

export function getAdminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export async function createAuditEvent(supabase, { entityType, entityId, eventType, actorId, payload }) {
  try {
    await supabase.schema('ops').from('audit_log').insert({
      entity_type: entityType,
      entity_id: entityId,
      event_type: eventType,
      actor_id: actorId,
      payload: payload || {}
    });
  } catch (error) {
    console.warn('Audit log insert failed:', error?.message || error);
  }
}

export function isNoRowsError(error) {
  return error && (error.code === 'PGRST116' || error.details?.includes('0 rows'));
}

export function toPublicPipelineStatus({ submission, reviewItem, finalReport }) {
  if (!submission) return 'not_found';
  if (finalReport) return 'completed';
  if (reviewItem && reviewItem.status === 'pending') return 'needs_review';
  if (submission.processing_status === 'failed') return 'failed';
  if (submission.processing_status === 'queued' || submission.processing_status === 'running') return 'processing';
  if (submission.sync_status === 'registered' || submission.sync_status === 'uploading') return 'uploading';
  if (submission.sync_status === 'uploaded') return 'uploaded';
  return 'processing';
}
