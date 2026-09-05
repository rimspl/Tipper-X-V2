/* ═══════════════════════════════════════════════════════════
   DynaHaul X — Daily Digest Generator
   Composes SMS-length fleet summary and triggers delivery.
   Called by cron or manually for a given site_id.
   ═══════════════════════════════════════════════════════════ */

import { createClient } from '@supabase/supabase-js';
import { dailyDigest } from '../shared/alert-templates.js';
import { sendSmsWithRetry, isConfigured } from '../services/sms-gateway.js';

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
const CRON_SECRET = readEnv('ALERT_CRON_SECRET') || '';

function applyCors(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function getDbClient() {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY required for digest generator');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

async function loadSubscribers(supabase, siteId) {
  const { data, error } = await supabase
    .from('subscriber_contacts')
    .select('name, phone, role')
    .eq('site_id', siteId)
    .eq('is_active', true);

  if (error) throw new Error(`Subscriber load failed: ${error.message}`);
  return data || [];
}

async function fetchDigestData(supabase, siteId) {
  const [siteResult, healthResult, tyreResult, alertResult, savingsResult] = await Promise.all([
    supabase.from('sites').select('site_name').eq('id', siteId).maybeSingle(),
    supabase.from('v_fleet_health_score').select('health_score').eq('site_id', siteId).maybeSingle(),
    supabase.from('v_manager_tyre_records').select('id, status').eq('site_id', siteId),
    supabase.from('alert_logs').select('id, event_type').eq('site_id', siteId).eq('status', 'sent').gte('created_at', new Date(Date.now() - 86400000).toISOString()),
    supabase.from('v_manager_tyre_records').select('life_achieved').eq('site_id', siteId)
  ]);

  const siteName = siteResult.data?.site_name || 'Site';
  const healthScore = healthResult.data?.health_score ?? null;
  const tyres = tyreResult.data || [];
  const recentAlerts = alertResult.data || [];
  const savingsRows = savingsResult.data || [];

  const fleetSize = tyres.length;
  const pressureIssues = recentAlerts.filter(a => a.event_type === 'pressure_drop').length;
  const pendingFitments = recentAlerts.filter(a => a.event_type === 'fitment_overdue').length;
  const overdueInspections = recentAlerts.filter(a => a.event_type === 'inspection_due').length;
  const totalSavings = savingsRows.reduce((sum, r) => sum + Number(r.life_achieved || 0), 0);

  return {
    siteName,
    healthScore,
    fleetSize,
    pressureIssues,
    pendingFitments,
    overdueInspections,
    savings: totalSavings > 0 ? `₹${Math.round(totalSavings / 1000)}K saved` : null
  };
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

  if (!isConfigured()) {
    return response.status(500).json({ success: false, message: 'SMS gateway not configured.' });
  }

  try {
    const supabase = getDbClient();
    const siteId = String(request.body?.site_id || '').trim();

    if (!siteId) {
      return response.status(400).json({ success: false, message: 'site_id is required' });
    }

    const digestData = await fetchDigestData(supabase, siteId);
    const messages = dailyDigest(digestData);
    const text = messages.en.slice(0, 160);

    const subscribers = await loadSubscribers(supabase, siteId);
    const smsSubscribers = subscribers.filter(s => !s.phone.includes('@'));

    let sent = 0;
    let failed = 0;

    for (const sub of smsSubscribers) {
      try {
        await sendSmsWithRetry({ phone: sub.phone, message: text, siteId });
        sent++;
      } catch (error) {
        console.error(`Digest SMS failed for ${sub.phone}:`, error.message);
        failed++;
      }
    }

    return response.status(200).json({
      success: true,
      digest: text,
      subscribers: smsSubscribers.length,
      sent,
      failed
    });
  } catch (error) {
    console.error('Digest generator error:', error);
    return response.status(500).json({ success: false, message: error.message });
  }
}
