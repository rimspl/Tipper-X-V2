/* ═══════════════════════════════════════════════════════════
   DynaHaul X — Alert Engine
   Evaluates trigger conditions, generates messages via
   alert-templates.js, dispatches via sms-gateway.js, and
   logs deliveries to alert_logs.
   ═══════════════════════════════════════════════════════════ */

import { createClient } from '@supabase/supabase-js';
import {
  pressureDropAlert,
  fitmentOverdueAlert,
  inspectionDueAlert,
  tyreRemovedAlert,
  rtdThresholdAlert
} from '../shared/alert-templates.js';
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
    throw new Error('SUPABASE_SERVICE_ROLE_KEY required for alert engine');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

async function loadAlertRules(supabase, siteId) {
  const { data, error } = await supabase
    .from('alert_rules')
    .select('*')
    .eq('site_id', siteId)
    .eq('enabled', true);

  if (error) throw new Error(`Alert rules load failed: ${error.message}`);
  return data || [];
}

async function loadSubscribers(supabase, siteId, channel = 'sms') {
  const { data, error } = await supabase
    .from('subscriber_contacts')
    .select('name, phone, role, channels')
    .eq('site_id', siteId)
    .eq('is_active', true);

  if (error) throw new Error(`Subscriber load failed: ${error.message}`);
  if (!data) return [];
  return data.filter(sub => {
    const ch = sub.channels;
    if (Array.isArray(ch)) return ch.includes(channel);
    if (typeof ch === 'string') {
      try { return JSON.parse(ch).includes(channel); } catch { return false; }
    }
    return false;
  });
}

async function logAlert(supabase, { siteId, ruleId, eventType, message, channel, recipient, status, errorMessage }) {
  await supabase.from('alert_logs').insert({
    site_id: siteId,
    rule_id: ruleId || null,
    event_type: eventType,
    message,
    channel,
    recipient,
    delivered_at: status === 'sent' ? new Date().toISOString() : null,
    status,
    error_message: errorMessage || null,
    attempts: 1
  });
}

const TEMPLATES = {
  pressure_drop: pressureDropAlert,
  fitment_overdue: fitmentOverdueAlert,
  inspection_due: inspectionDueAlert,
  tyre_removed: tyreRemovedAlert,
  rtd_threshold: rtdThresholdAlert
};

async function dispatchAlert({ supabase, siteId, rule, eventType, templatePayload, channel }) {
  const templateFn = TEMPLATES[eventType];
  if (!templateFn) throw new Error(`Unknown event type: ${eventType}`);

  const messages = templateFn(templatePayload);
  const text = channel === 'sms' ? messages.en.slice(0, 160) : messages.en;

  const subscribers = await loadSubscribers(supabase, siteId, channel);
  if (subscribers.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  for (const sub of subscribers) {
    try {
      if (channel === 'sms' || channel === 'whatsapp') {
        await sendSmsWithRetry({ phone: sub.phone, message: text, siteId });
      }
      await logAlert(supabase, {
        siteId,
        ruleId: rule?.id || null,
        eventType,
        message: text,
        channel,
        recipient: sub.phone,
        status: 'sent',
        errorMessage: null
      });
      sent++;
    } catch (error) {
      await logAlert(supabase, {
        siteId,
        ruleId: rule?.id || null,
        eventType,
        message: text,
        channel,
        recipient: sub.phone,
        status: 'failed',
        errorMessage: error.message
      });
      failed++;
    }
  }

  return { sent, failed };
}

function validatePayload(eventType, payload) {
  switch (eventType) {
    case 'pressure_drop':
      return payload.tyreNo && payload.position != null && payload.currentPsi != null && payload.targetPsi != null && payload.truckNo;
    case 'fitment_overdue':
      return payload.position && payload.truckNo && payload.hoursElapsed != null;
    case 'inspection_due':
      return payload.tyreNo && payload.daysSinceInspection != null;
    case 'tyre_removed':
      return payload.tyreNo;
    case 'rtd_threshold':
      return payload.tyreNo && payload.currentRtd != null && payload.thresholdRtd != null;
    default:
      return false;
  }
}

async function isValidUser(supabase, userId) {
  if (!userId) return false;
  try {
    const { data } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();
    return Boolean(data);
  } catch {
    return false;
  }
}

export default async function handler(request, response) {
  applyCors(response);

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  if (request.method !== 'POST') {
    return response.status(405).json({ success: false, message: 'Method not allowed' });
  }

  if (!isConfigured()) {
    return response.status(500).json({ success: false, message: 'SMS gateway not configured. Set FAST2SMS_API_KEY.' });
  }

  try {
    const supabase = getDbClient();

    const authHeader = String(request.headers['authorization'] || '').trim();
    const clientUserId = String(request.headers['x-user-id'] || '').trim();
    const isCronAuthorized = Boolean(CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`);
    const isClientAuthorized = Boolean(clientUserId) && await isValidUser(supabase, clientUserId);

    if (!isCronAuthorized && !isClientAuthorized) {
      return response.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { site_id: siteId, event_type: eventType, payload } = request.body;

    if (!siteId || !eventType) {
      return response.status(400).json({ success: false, message: 'site_id and event_type are required' });
    }

    if (!validatePayload(eventType, payload || {})) {
      return response.status(400).json({ success: false, message: `Invalid payload for event type: ${eventType}` });
    }

    const rules = await loadAlertRules(supabase, siteId);
    const matchingRule = rules.find(r => r.event_type === eventType);

    if (!matchingRule) {
      return response.status(200).json({ success: true, skipped: true, message: `No active rule for ${eventType}` });
    }

    const channels = matchingRule.notification_channel || ['sms'];
    const results = [];

    for (const channel of channels) {
      const result = await dispatchAlert({
        supabase,
        siteId,
        rule: matchingRule,
        eventType,
        templatePayload: payload,
        channel
      });
      results.push({ channel, ...result });
    }

    return response.status(200).json({
      success: true,
      event_type: eventType,
      results
    });
  } catch (error) {
    console.error('Alert engine error:', error);
    return response.status(500).json({ success: false, message: error.message });
  }
}
