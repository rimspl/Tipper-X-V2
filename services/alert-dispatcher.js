/* ═══════════════════════════════════════════════════════════
   DynaHaul X — Alert Dispatcher
   Called from _processing.js after domain writes to
   evaluate alert rules and dispatch SMS alerts.
   ═══════════════════════════════════════════════════════════ */

import { pressureDropAlert, fitmentOverdueAlert, inspectionDueAlert, tyreRemovedAlert, rtdThresholdAlert } from '../shared/alert-templates.js';
import { sendSmsWithRetry } from './sms-gateway.js';

const TEMPLATES = {
  pressure_drop: pressureDropAlert,
  fitment_overdue: fitmentOverdueAlert,
  inspection_due: inspectionDueAlert,
  tyre_removed: tyreRemovedAlert,
  rtd_threshold: rtdThresholdAlert
};

function parseChannels(channels) {
  if (Array.isArray(channels)) return channels;
  if (typeof channels === 'string') {
    try { return JSON.parse(channels); } catch { return ['sms']; }
  }
  return ['sms'];
}

export async function checkAndDispatchAlerts(supabase, { siteId, eventType, payload }) {
  if (!siteId || !eventType || !TEMPLATES[eventType]) return;

  try {
    const { data: rules } = await supabase
      .from('alert_rules')
      .select('*')
      .eq('site_id', siteId)
      .eq('event_type', eventType)
      .eq('enabled', true);

    if (!rules || rules.length === 0) return;

    const { data: subscribers } = await supabase
      .from('subscriber_contacts')
      .select('name, phone, channels')
      .eq('site_id', siteId)
      .eq('is_active', true);

    if (!subscribers || subscribers.length === 0) return;

    const templateFn = TEMPLATES[eventType];
    const messages = templateFn(payload);
    const smsText = messages.en.slice(0, 160);

    for (const rule of rules) {
      const channels = parseChannels(rule.notification_channel);

      for (const sub of subscribers) {
        const subChannels = parseChannels(sub.channels);

        for (const ch of channels) {
          if (!subChannels.includes(ch)) continue;

          try {
            if (ch === 'sms' || ch === 'whatsapp') {
              await sendSmsWithRetry({ phone: sub.phone, message: smsText, siteId }, 2);
            }

            await supabase.from('alert_logs').insert({
              site_id: siteId,
              rule_id: rule.id,
              event_type: eventType,
              message: smsText,
              channel: ch,
              recipient: sub.phone,
              status: 'sent',
              delivered_at: new Date().toISOString()
            });
          } catch (err) {
            console.warn(`Alert dispatch failed for ${sub.phone}:`, err.message);

            await supabase.from('alert_logs').insert({
              site_id: siteId,
              rule_id: rule.id,
              event_type: eventType,
              message: smsText,
              channel: ch,
              recipient: sub.phone,
              status: 'failed',
              error_message: err.message
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn('Alert dispatcher error (non-blocking):', err.message);
  }
}
