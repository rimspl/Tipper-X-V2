/* ═══════════════════════════════════════════════════════════
   DynaHaul X — Centralized Environment Variable Loader
   Import this module instead of duplicating readEnv() logic.
   ═══════════════════════════════════════════════════════════ */

function readEnv(name) {
  return String(process.env[name] || '')
    .replace(/^['"]|['"]$/g, '')
    .replace(/\\n/g, '')
    .trim();
}

export function requireEnv(name) {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set.`);
  }
  return value;
}

export function optionalEnv(name, defaultValue = '') {
  const value = readEnv(name);
  return value || defaultValue;
}

export const ENV = {
  SUPABASE_URL: optionalEnv('SUPABASE_URL', 'https://ajbbcoygzoxdtejvhbfq.supabase.co'),
  SUPABASE_ANON_KEY: optionalEnv('SUPABASE_ANON_KEY', ''),
  SUPABASE_SERVICE_ROLE_KEY: optionalEnv('SUPABASE_SERVICE_ROLE_KEY', ''),
  RESEND_API_KEY: optionalEnv('RESEND_API_KEY', ''),
  FAST2SMS_API_KEY: optionalEnv('FAST2SMS_API_KEY', ''),
  FAST2SMS_SENDER_ID: optionalEnv('FAST2SMS_SENDER_ID', 'DYNHLX'),
  OTP_PROVIDER_BASE_URL: optionalEnv('OTP_PROVIDER_BASE_URL', 'https://dynahaulx.rimspl.com/vercel_auth'),
  ALERT_CRON_SECRET: optionalEnv('ALERT_CRON_SECRET', '')
};
