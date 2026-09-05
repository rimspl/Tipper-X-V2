/* ═══════════════════════════════════════════════════════════
   DynaHaul X — Scheduled Report Delivery Endpoint
   Called by cron (or manually) to generate and deliver
   the weekly/daily fleet report via email.
   ═══════════════════════════════════════════════════════════ */

import { createClient } from '@supabase/supabase-js';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const CRON_SECRET = process.env.ALERT_CRON_SECRET || '';

function readEnv(name) {
  return String(process.env[name] || '')
    .replace(/^['"]|['"]$/g, '')
    .replace(/\\n/g, '')
    .trim();
}

const DEFAULT_SUPABASE_URL = 'https://ajbbcoygzoxdtejvhbfq.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJicXFkeXpjY2dic3NqY3lpYmJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwNjk1ODksImV4cCI6MjA4MjY0NTU4OX0.1UofV5EvtJOl62S_ducJ9mAdL7P3ABKhQpTsO_TvCK8';

const SUPABASE_URL = readEnv('SUPABASE_URL') || DEFAULT_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = readEnv('SUPABASE_SERVICE_ROLE_KEY');

function applyCors(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function getSupabaseClient() {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for report delivery');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

async function fetchReportSchedule(supabase, siteId, scheduleType) {
  const { data, error } = await supabase
    .from('scheduled_reports')
    .select('*')
    .eq('site_id', siteId)
    .eq('report_type', scheduleType)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw new Error(`Schedule lookup failed: ${error.message}`);
  return data;
}

async function fetchSubscriberEmails(supabase, siteId) {
  const { data, error } = await supabase
    .from('subscriber_contacts')
    .select('name, phone')
    .eq('site_id', siteId)
    .eq('is_active', true);

  if (error) throw new Error(`Subscriber lookup failed: ${error.message}`);
  return data || [];
}

async function sendEmailViaResend(htmlContent, subject, recipients) {
  if (!RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY not configured');
  }

  const emails = recipients.map(r => r.name ? `${r.name} <${r.phone}@sms.local>` : r.phone).join(', ');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'DynaHaul X Reports <reports@dynahaulx.rimspl.com>',
      to: recipients.filter(r => r.phone.includes('@')).map(r => r.phone),
      subject,
      html: htmlContent
    })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || `Email send failed (${response.status})`);
  }

  return response.json();
}

async function recordDelivery(supabase, scheduleId, status, errorMessage) {
  await supabase.from('report_deliveries').insert({
    schedule_id: scheduleId,
    generated_at: new Date().toISOString(),
    delivered_at: status === 'sent' ? new Date().toISOString() : null,
    delivery_status: status,
    error_message: errorMessage || null
  });
}

export default async function handler(request, response) {
  applyCors(response);

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  if (request.method !== 'POST') {
    return response.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const authHeader = String(request.headers['authorization'] || '').trim();
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return response.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const siteId = String(request.body?.site_id || '').trim();
  const scheduleType = String(request.body?.schedule_type || 'weekly').trim();

  if (!siteId) {
    return response.status(400).json({ success: false, message: 'site_id is required' });
  }

  try {
    const supabase = getSupabaseClient();
    const schedule = await fetchReportSchedule(supabase, siteId, scheduleType);

    if (!schedule) {
      return response.status(200).json({ success: true, skipped: true, message: `No active ${scheduleType} schedule for this site.` });
    }

    const { generateWeeklyFleetReport } = await import('../manager/src/report/generate-report.js');
    const htmlContent = await generateWeeklyFleetReport(siteId, supabase);

    const subject = scheduleType === 'daily'
      ? `Daily Fleet Digest — ${new Date().toLocaleDateString('en-IN')}`
      : `Weekly Fleet Report — Week ${getWeekNumber(new Date())}`;

    const subscribers = await fetchSubscriberEmails(supabase, siteId);
    const emailRecipients = subscribers.filter(s => s.phone && s.phone.includes('@'));

    if (emailRecipients.length > 0) {
      const emailRecipientsWithNames = emailRecipients.map(s => ({ name: s.name, phone: s.phone }));
      await sendEmailViaResend(htmlContent, subject, emailRecipientsWithNames);
    }

    await recordDelivery(supabase, schedule.id, 'sent', null);

    return response.status(200).json({
      success: true,
      schedule_type: scheduleType,
      recipients: emailRecipients.length,
      format: schedule.format || 'html'
    });
  } catch (error) {
    console.error('Report delivery error:', error);
    return response.status(500).json({ success: false, message: error.message });
  }
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}
