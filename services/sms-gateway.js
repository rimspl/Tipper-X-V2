/* ═══════════════════════════════════════════════════════════
   DynaHaul X — SMS Gateway (Fast2SMS)
   Wrapper for Fast2SMS API with rate limiting and retry.
   Environment: FAST2SMS_API_KEY must be set.
   ═══════════════════════════════════════════════════════════ */

const FAST2SMS_BASE = 'https://www.fast2sms.com/dev/bulkV2';

function readEnv(name) {
  return String(process.env[name] || '')
    .replace(/^['"]|['"]$/g, '')
    .replace(/\\n/g, '')
    .trim();
}

const API_KEY = readEnv('FAST2SMS_API_KEY');
const SENDER_ID = readEnv('FAST2SMS_SENDER_ID') || 'DYNHLX';

// In-memory rate limiter: max 10 SMS per rolling 60s window per site
const rateLimitBuckets = new Map();

function checkRateLimit(siteId) {
  const now = Date.now();
  if (!rateLimitBuckets.has(siteId)) {
    rateLimitBuckets.set(siteId, []);
  }
  const bucket = rateLimitBuckets.get(siteId);
  const windowStart = now - 60_000;
  while (bucket.length > 0 && bucket[0] < windowStart) {
    bucket.shift();
  }
  if (bucket.length >= 10) {
    const waitMs = bucket[0] - windowStart;
    return { allowed: false, retryAfterMs: waitMs };
  }
  bucket.push(now);
  return { allowed: true, retryAfterMs: 0 };
}

function isValidIndianPhone(phone) {
  return /^[6-9]\d{9}$/.test(phone.replace(/\s+/g, ''));
}

export function isConfigured() {
  return Boolean(API_KEY);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function sendSms({ phone, message, siteId }) {
  if (!API_KEY) {
    throw new Error('FAST2SMS_API_KEY is not configured');
  }

  const cleanPhone = phone.replace(/\s+/g, '');
  if (!isValidIndianPhone(cleanPhone)) {
    throw new Error(`Invalid Indian phone number: ${phone}`);
  }

  const rateCheck = checkRateLimit(siteId || 'default');
  if (!rateCheck.allowed) {
    throw new Error(`Rate limited. Retry after ${Math.ceil(rateCheck.retryAfterMs / 1000)}s`);
  }

  const params = new URLSearchParams({
    route: 'q',
    sender_id: SENDER_ID,
    message: message,
    language: 'english',
    numbers: cleanPhone
  });

  const response = await fetch(`${FAST2SMS_BASE}?${params.toString()}`, {
    method: 'GET',
    headers: {
      'authorization': API_KEY,
      'cache-control': 'no-cache'
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.return === false) {
    throw new Error(data.message || `Fast2SMS error (${response.status})`);
  }

  return { success: true, messageId: data.request_id || null };
}

export async function sendSmsWithRetry({ phone, message, siteId }, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await sendSms({ phone, message, siteId });
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 5000;
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('SMS send failed after retries');
}
