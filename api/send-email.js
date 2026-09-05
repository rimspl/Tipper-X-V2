import { createClient } from '@supabase/supabase-js';

const RESEND_API_KEY = process.env.RESEND_API_KEY;

function readEnv(name) {
  return String(process.env[name] || '')
    .replace(/^['"]|['"]$/g, '')
    .replace(/\\n/g, '')
    .trim();
}

const DEFAULT_SUPABASE_URL = 'https://ajbbcoygzoxdtejvhbfq.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJicXFkeXpjY2dic3NqY3lpYmJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwNjk1ODksImV4cCI6MjA4MjY0NTU4OX0.1UofV5EvtJOl62S_ducJ9mAdL7P3ABKhQpTsO_TvCK8';

const SUPABASE_URL = readEnv('SUPABASE_URL') || DEFAULT_SUPABASE_URL;
const SUPABASE_ANON_KEY = readEnv('SUPABASE_ANON_KEY') || readEnv('SUPABASE_KEY') || DEFAULT_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = readEnv('SUPABASE_SERVICE_ROLE_KEY');

function applyCors(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function safeJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { message: text || 'Invalid response' };
  }
}

function createDbClient(accessToken) {
  if (SUPABASE_SERVICE_ROLE_KEY) {
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });
}

async function loginWithPassword(email, password) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password }),
      signal: controller.signal
    });

    const payload = await safeJson(response);

    if (!response.ok) {
      const message = payload?.error_description || payload?.msg || payload?.message || 'Invalid login credentials';
      return { ok: false, message };
    }

    if (!payload?.user?.id || !payload?.access_token) {
      return { ok: false, message: 'Login response was incomplete.' };
    }

    return { ok: true, payload };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchProfileBundle(dbClient, userId, profileEmail) {
  const { data: profileData, error: profileError } = await dbClient
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (profileError || !profileData) {
    throw new Error('User profile not found. Please contact administrator.');
  }

  if (profileData.is_active === false) {
    throw new Error('Your account has been paused. Please contact your manager.');
  }

  if (profileData.license_id) {
    const { data: licenseData, error: licenseError } = await dbClient
      .from('licenses')
      .select('is_active')
      .eq('id', profileData.license_id)
      .single();

    if (!licenseError && licenseData && licenseData.is_active === false) {
      throw new Error('Your license is inactive. Please contact administrator.');
    }
  }

  let siteName = '';
  let customerName = '';
  let lifeUnit = 'KM';

  if (profileData.site_id) {
    const { data: siteData } = await dbClient
      .from('sites')
      .select('site_name, customers(name)')
      .eq('id', profileData.site_id)
      .single();

    if (siteData) {
      siteName = siteData.site_name || '';
      lifeUnit = 'KM';
      customerName = siteData.customers?.name || '';
    }
  } else if (profileData.customer_id) {
    const { data: customerData } = await dbClient
      .from('customers')
      .select('name')
      .eq('id', profileData.customer_id)
      .single();

    if (customerData) {
      customerName = customerData.name || '';
    }
  }

  return {
    token: null,
    uid: userId,
    email: profileEmail,
    username: profileData.full_name || profileEmail,
    role: profileData.user_type || 'user',
    userType: profileData.user_type || 'fitter',
    siteId: profileData.site_id || null,
    customerId: profileData.customer_id || null,
    licenseId: profileData.license_id || null,
    isActive: profileData.is_active !== false,
    siteName,
    customerName,
    lifeUnit
  };
}

async function handleAuthLogin(request, response) {
  const email = String(request.body?.email || '').trim().toLowerCase();
  const password = String(request.body?.password || '');

  if (!email || !isValidEmail(email)) {
    return response.status(400).json({ success: false, message: 'Valid email is required' });
  }

  if (!password) {
    return response.status(400).json({ success: false, message: 'Password is required' });
  }

  try {
    const loginResult = await loginWithPassword(email, password);
    if (!loginResult.ok) {
      const normalizedMessage = loginResult.message === 'Invalid login credentials'
        ? 'Incorrect email or password.'
        : loginResult.message;
      return response.status(401).json({ success: false, message: normalizedMessage });
    }

    const authPayload = loginResult.payload;
    const userId = authPayload.user.id;
    const accessToken = authPayload.access_token;
    const userEmail = authPayload.user.email || email;

    const dbClient = createDbClient(accessToken);
    const sessionData = await fetchProfileBundle(dbClient, userId, userEmail);

    sessionData.token = accessToken;

    return response.status(200).json({
      success: true,
      message: 'Authenticated successfully',
      session: sessionData
    });
  } catch (error) {
    const isTimeout = error?.name === 'AbortError';
    const message = isTimeout
      ? 'Supabase auth request timed out. Please retry.'
      : (error?.message || 'Authentication failed');

    console.error('auth-login proxy error:', error);
    return response.status(500).json({ success: false, message });
  }
}

async function handleSendEmail(request, response) {
  if (!RESEND_API_KEY) {
    return response.status(500).json({ success: false, error: 'Email service not configured' });
  }

  try {
    const { email, otp, purpose } = request.body;
    const subject = purpose === 'setup' ? 'Tipper Platform - Setup Verification' : 'Tipper Platform - Login OTP';

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Tipper Platform <onboarding@resend.dev>',
        to: email,
        subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
            <h2 style="color: #2c5282;">Tipper Platform</h2>
            <p>Your verification code is:</p>
            <h1 style="font-size: 32px; letter-spacing: 5px; color: #3182ce;">${otp}</h1>
            <p style="color: #718096;">This code expires in 10 minutes.</p>
          </div>
        `
      })
    });

    const data = await resendResponse.json();

    if (!resendResponse.ok) {
      throw new Error(data.message || 'Failed to send email');
    }

    return response.status(200).json({ success: true });
  } catch (error) {
    return response.status(500).json({ success: false, error: error.message });
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

  const action = String(request.body?.action || '').trim().toLowerCase();
  if (action === 'auth_login') {
    return handleAuthLogin(request, response);
  }

  return handleSendEmail(request, response);
}
