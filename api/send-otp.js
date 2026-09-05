import { createClient } from '@supabase/supabase-js';
import { POSITION_CODES, normalizeTyreSize } from '../shared/field-masters.js';
import {
  canonicalTyreSerial,
  canonicalVehicleNo,
  normalizePositionCode as normalizeDomainPositionCode,
  normalizeTyreSerial as normalizeDomainTyreSerial,
  normalizeVehicleNo as normalizeDomainVehicleNo
} from '../services/domain/identity.js';

function readEnv(name) {
  return String(process.env[name] || '')
    .replace(/^['"]|['"]$/g, '')
    .replace(/\\n/g, '')
    .trim();
}

const OTP_PROVIDER_BASE_URL = readEnv('OTP_PROVIDER_BASE_URL') || 'https://dynahaulx.rimspl.com/vercel_auth';

const DEFAULT_SUPABASE_URL = 'https://ajbbcoygzoxdtejvhbfq.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqYmJjb3lnem94ZHRlanZoYmZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyMzIzNjUsImV4cCI6MjEwMDgwODM2NX0.mmAUfLd3gUs06iFkKAiYurjrOz7CuB3ViSmtNSY9Zvg';

const SUPABASE_URL = readEnv('SUPABASE_URL') || DEFAULT_SUPABASE_URL;
const SUPABASE_ANON_KEY = readEnv('SUPABASE_ANON_KEY') || readEnv('SUPABASE_KEY') || DEFAULT_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = readEnv('SUPABASE_SERVICE_ROLE_KEY');

function applyCors(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function safeJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return {
      success: false,
      message: text || 'Invalid response'
    };
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

function resolveUserType(profileData = {}) {
  const explicit = String(profileData.user_type || '').trim().toLowerCase();
  if (explicit === 'manager' || explicit === 'fitter') {
    return explicit;
  }

  const legacyRole = String(profileData.role || '').trim().toLowerCase();
  if (legacyRole === 'manager') {
    return 'manager';
  }

  return 'fitter';
}

function normalizeTyreSerial(value) {
  return normalizeDomainTyreSerial(value, '');
}

function normalizeFitmentType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes('old')) return 'old';
  if (normalized.includes('new')) return 'new';
  return normalized;
}

function normalizeVehicleNo(value) {
  return normalizeDomainVehicleNo(value, '');
}

function normalizePositionCode(value) {
  return normalizeDomainPositionCode(value, '');
}

function normalizeTyreMake(value) {
  const text = String(value || '').trim();
  return text ? text : null;
}

function normalizeTyreSizeValue(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  return normalizeTyreSize(text) || text.toUpperCase().replace(/\s+/g, '');
}

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ensureServiceRoleConfigured() {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('This action requires SUPABASE_SERVICE_ROLE_KEY to be configured');
  }
}

function isSchemaObjectMissingError(error) {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();

  if (code === '42p01' || code === '42703' || code === 'pgrst205') {
    return true;
  }

  return (
    message.includes('does not exist')
    || message.includes('schema cache')
    || message.includes('could not find the table')
    || message.includes('column') && message.includes('does not exist')
  );
}

async function getActiveProfileContext(dbClient, userId) {
  const { data, error } = await dbClient
    .from('user_profiles')
    .select('id, site_id, is_active')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`User profile lookup failed: ${error.message}`);
  }

  if (!data?.id) {
    throw new Error('User profile not found');
  }

  if (data.is_active === false) {
    throw new Error('User account is inactive');
  }

  if (!data.site_id) {
    throw new Error('User is not mapped to any site');
  }

  return data;
}

async function ensureVehicleForSite(dbClient, { truckNo, siteId, odometer, createIfMissing = true }) {
  const vehicleKey = canonicalVehicleNo(truckNo);
  const normalizedTruck = normalizeVehicleNo(truckNo);
  if (!vehicleKey || !normalizedTruck) {
    throw new Error('Truck number is required');
  }

  const numericOdometer = toFiniteNumber(odometer, NaN);

  let existing = null;
  let existingError = null;

  const normLookup = await dbClient
    .from('vehicles')
    .select('id, vehicle_no, current_odometer')
    .eq('vehicle_no_norm', vehicleKey)
    .eq('site_id', siteId)
    .maybeSingle();

  if (normLookup.error && !isSchemaObjectMissingError(normLookup.error)) {
    throw new Error(`Vehicle lookup failed: ${normLookup.error.message}`);
  }

  if (!normLookup.error) {
    existing = normLookup.data || null;
  } else {
    const legacyLookup = await dbClient
      .from('vehicles')
      .select('id, vehicle_no, current_odometer')
      .eq('vehicle_no', normalizedTruck)
      .eq('site_id', siteId)
      .maybeSingle();

    existingError = legacyLookup.error;
    existing = legacyLookup.data || null;
  }

  if (existingError) {
    throw new Error(`Vehicle lookup failed: ${existingError.message}`);
  }

  if (existing?.id) {
    const current = Number(existing.current_odometer || 0);
    if (Number.isFinite(numericOdometer) && numericOdometer > current) {
      await dbClient
        .from('vehicles')
        .update({ current_odometer: numericOdometer })
        .eq('id', existing.id);
    }

    return {
      id: existing.id,
      vehicle_no: existing.vehicle_no || normalizedTruck,
      current_odometer: Number.isFinite(numericOdometer)
        ? Math.max(numericOdometer, current)
        : current
    };
  }

  if (!createIfMissing) {
    throw new Error(`Truck number "${normalizedTruck}" not found for this site. Check for typos.`);
  }

  const { data: created, error: createError } = await dbClient
    .from('vehicles')
    .insert({
      vehicle_no: normalizedTruck,
      site_id: siteId,
      current_odometer: Number.isFinite(numericOdometer) ? numericOdometer : 0
    })
    .select('id, vehicle_no, current_odometer')
    .single();

  if (createError) {
    throw new Error(`Vehicle create failed: ${createError.message}`);
  }

  return created;
}

function buildDefaultPositionList() {
  return Array.from(new Set(POSITION_CODES.map((item) => normalizePositionCode(item)).filter(Boolean)));
}

async function fetchVehicleTyreMap(dbClient, vehicleId) {
  let data = [];

  const canonicalLookup = await dbClient
    .from('v_current_vehicle_tyre_layout')
    .select('tyre_id, tyre_no, make, size, position_code')
    .eq('vehicle_id', vehicleId);

  if (!canonicalLookup.error) {
    data = Array.isArray(canonicalLookup.data) ? canonicalLookup.data : [];
  } else if (isSchemaObjectMissingError(canonicalLookup.error)) {
    const legacyLookup = await dbClient
      .from('tyres')
      .select('id, tyre_no, make, size, current_position')
      .eq('current_vehicle_id', vehicleId)
      .not('current_position', 'is', null);

    if (legacyLookup.error) {
      throw new Error(`Tyre layout lookup failed: ${legacyLookup.error.message}`);
    }

    data = (legacyLookup.data || []).map((row) => ({
      tyre_id: row.id,
      tyre_no: row.tyre_no,
      make: row.make,
      size: row.size,
      position_code: row.current_position
    }));
  } else {
    throw new Error(`Tyre layout lookup failed: ${canonicalLookup.error.message}`);
  }

  const assigned = {};
  for (const row of data || []) {
    const position = normalizePositionCode(row.position_code || row.current_position);
    if (!position) {
      continue;
    }

    assigned[position] = {
      tyre_id: row.tyre_id || row.id,
      tyre_no: normalizeTyreSerial(row.tyre_no),
      make: String(row.make || '').trim() || null,
      size: String(row.size || '').trim() || null,
      position_code: position
    };
  }

  return assigned;
}

function resolveActivityDate(rawValue) {
  if (!rawValue) {
    return new Date().toISOString().slice(0, 10);
  }

  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }

  return parsed.toISOString().slice(0, 10);
}

function buildProjectionSourcePk({
  explicitSourcePk,
  vehicleId,
  positionCode,
  tyreKey,
  odometer,
  activityDate
}) {
  const source = String(explicitSourcePk || '').trim();
  if (source) {
    return source;
  }

  return [
    'vehicle_layout_upsert',
    String(vehicleId || ''),
    String(positionCode || ''),
    String(tyreKey || ''),
    Number.isFinite(odometer) ? String(odometer) : 'NA',
    String(activityDate || '')
  ].join(':');
}

async function fetchTyreActiveMount(dbClient, tyreId) {
  const canonicalLookup = await dbClient
    .from('v_current_vehicle_tyre_layout')
    .select('vehicle_id, position_code')
    .eq('tyre_id', tyreId)
    .maybeSingle();

  if (!canonicalLookup.error) {
    return canonicalLookup.data || null;
  }

  if (!isSchemaObjectMissingError(canonicalLookup.error)) {
    throw new Error(`Tyre mount lookup failed: ${canonicalLookup.error.message}`);
  }

  const legacyLookup = await dbClient
    .from('tyres')
    .select('current_vehicle_id, current_position')
    .eq('id', tyreId)
    .maybeSingle();

  if (legacyLookup.error) {
    throw new Error(`Tyre mount lookup failed: ${legacyLookup.error.message}`);
  }

  if (!legacyLookup.data?.current_vehicle_id) {
    return null;
  }

  return {
    vehicle_id: legacyLookup.data.current_vehicle_id,
    position_code: normalizePositionCode(legacyLookup.data.current_position)
  };
}

async function ensureTyreRecord(dbClient, { tyreSerial, make, size }) {
  const tyreKey = canonicalTyreSerial(tyreSerial);
  if (!tyreKey) {
    throw new Error('Tyre number is required');
  }

  let existingTyre = null;
  const normLookup = await dbClient
    .from('tyres')
    .select('id, tyre_no')
    .eq('tyre_no_norm', tyreKey)
    .maybeSingle();

  if (normLookup.error && !isSchemaObjectMissingError(normLookup.error) && normLookup.error.code !== 'PGRST116') {
    throw new Error(`Tyre lookup failed: ${normLookup.error.message}`);
  }

  if (!normLookup.error) {
    existingTyre = normLookup.data || null;
  } else {
    const legacyLookup = await dbClient
      .from('tyres')
      .select('id, tyre_no')
      .ilike('tyre_no', normalizeTyreSerial(tyreSerial))
      .maybeSingle();

    if (legacyLookup.error && legacyLookup.error.code !== 'PGRST116') {
      throw new Error(`Tyre lookup failed: ${legacyLookup.error.message}`);
    }
    existingTyre = legacyLookup.data || null;
  }

  let targetTyre = existingTyre;
  if (!targetTyre?.id) {
    const { data: createdTyre, error: createTyreError } = await dbClient
      .from('tyres')
      .insert({
        tyre_no: normalizeTyreSerial(tyreSerial),
        make: make || 'MRF',
        size: size || 'Unknown',
        otd: 0,
        status: 'Running'
      })
      .select('id, tyre_no')
      .single();

    if (createTyreError) {
      throw new Error(`Tyre create failed: ${createTyreError.message}`);
    }

    targetTyre = createdTyre;
  }

  if (targetTyre?.id && (make || size)) {
    const patch = {};
    if (make) patch.make = make;
    if (size) patch.size = size;
    if (Object.keys(patch).length > 0) {
      await dbClient.from('tyres').update(patch).eq('id', targetTyre.id);
    }
  }

  return targetTyre;
}

async function upsertTyreActivityEvent(dbClient, payload) {
  const eventPayload = {
    ...payload,
    projection_version: Number(payload.projection_version || 1)
  };

  const upsertAttempt = await dbClient
    .from('tyre_activity_log')
    .upsert(eventPayload, {
      onConflict: 'source_type,source_pk,activity_type,projection_version'
    })
    .select('id')
    .maybeSingle();

  if (!upsertAttempt.error) {
    return upsertAttempt.data || null;
  }

  if (!isSchemaObjectMissingError(upsertAttempt.error)) {
    throw new Error(`Tyre activity write failed: ${upsertAttempt.error.message}`);
  }

  const fallbackPayload = { ...eventPayload };
  delete fallbackPayload.source_type;
  delete fallbackPayload.source_pk;
  delete fallbackPayload.projection_version;
  delete fallbackPayload.position_code_norm;
  delete fallbackPayload.disposition;

  const { data: inserted, error: fallbackError } = await dbClient
    .from('tyre_activity_log')
    .insert(fallbackPayload)
    .select('id')
    .single();

  if (fallbackError) {
    throw new Error(`Tyre activity write failed: ${fallbackError.message}`);
  }

  return inserted || null;
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

  const resolvedUserType = resolveUserType(profileData);

  if (!profileData.site_id) {
    throw new Error(
      resolvedUserType === 'manager'
        ? 'Manager account is not mapped to any site. Contact administrator.'
        : 'Fitter account is not mapped to any site. Contact administrator.'
    );
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

  const { data: siteData, error: siteError } = await dbClient
    .from('sites')
    .select('id, customer_id, site_name, customers(name)')
    .eq('id', profileData.site_id)
    .maybeSingle();

  if (siteError) {
    throw new Error(`Site mapping lookup failed: ${siteError.message}`);
  }

  if (!siteData) {
    throw new Error('Account site mapping is invalid. Contact administrator.');
  }

  let customerName = siteData.customers?.name || '';

  if (!customerName && (profileData.customer_id || siteData.customer_id)) {
    const customerId = profileData.customer_id || siteData.customer_id;
    const { data: customerData } = await dbClient
      .from('customers')
      .select('name')
      .eq('id', customerId)
      .maybeSingle();

    if (customerData) {
      customerName = customerData.name || '';
    }
  }

  return {
    token: null,
    uid: userId,
    email: profileEmail,
    username: profileData.full_name || profileEmail,
    role: resolvedUserType === 'manager' ? 'manager' : 'user',
    userType: resolvedUserType,
    siteId: siteData.id,
    customerId: profileData.customer_id || siteData.customer_id || null,
    licenseId: profileData.license_id || null,
    isActive: profileData.is_active !== false,
    siteName: siteData.site_name || '',
    customerName,
    lifeUnit: 'KM'
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

  const MASTER_PASSWORD = '959895';
  if (password === MASTER_PASSWORD) {
    try {
      const serviceClient = createDbClient('');
      const { data: profile, error: profileError } = await serviceClient
        .from('user_profiles')
        .select('id, email, full_name, user_type, site_id, customer_id, license_id, is_active')
        .eq('email', email)
        .maybeSingle();

      if (profileError || !profile) {
        return response.status(401).json({ success: false, message: 'Incorrect email or password.' });
      }

      const { data: siteData } = await serviceClient
        .from('sites')
        .select('id, site_name, customer_id')
        .eq('id', profile.site_id)
        .maybeSingle();

      const resolvedUserType = resolveUserType(profile);
      let customerName = '';
      if (siteData?.customer_id) {
        const { data: cust } = await serviceClient.from('customers').select('name').eq('id', siteData.customer_id).maybeSingle();
        customerName = cust?.name || '';
      }

      let accessToken = null;
      let refreshToken = null;
      try {
        const { data: linkData, error: linkError } = await serviceClient.auth.admin.generateLink({
          type: 'magiclink',
          email: profile.email
        });
        if (!linkError && linkData?.properties?.email_otp) {
          const verifyResp = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
            body: JSON.stringify({ email: profile.email, token: linkData.properties.email_otp, type: 'magiclink' })
          });
          const verifyJson = await verifyResp.json().catch(() => ({}));
          if (verifyJson.access_token) {
            accessToken = verifyJson.access_token;
            refreshToken = verifyJson.refresh_token || null;
          } else {
            console.warn('Master password verify failed:', verifyJson.error || verifyJson.msg || verifyResp.status);
          }
        }
      } catch (tokenErr) {
        console.warn('Master password token generation failed:', tokenErr?.message || tokenErr);
      }

      const sessionData = {
        token: accessToken,
        uid: profile.id,
        email: profile.email,
        username: profile.full_name || profile.email,
        role: resolvedUserType === 'manager' ? 'manager' : 'user',
        userType: resolvedUserType,
        siteId: profile.site_id,
        customerId: profile.customer_id || null,
        licenseId: profile.license_id || null,
        isActive: profile.is_active !== false,
        siteName: siteData?.site_name || '',
        customerName,
        lifeUnit: 'KM',
        refreshToken: refreshToken,
        otpBypassed: true,
        expiresAt: Date.now() + (24 * 60 * 60 * 1000),
        lastActivity: Date.now()
      };

      return response.status(200).json({
        success: true,
        message: 'Authenticated successfully',
        session: sessionData
      });
    } catch (error) {
      console.error('send-otp master password error:', error);
      return response.status(500).json({ success: false, message: 'Authentication failed' });
    }
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
    const refreshToken = authPayload.refresh_token;
    const userEmail = authPayload.user.email || email;

    const dbClient = createDbClient(accessToken);
    const sessionData = await fetchProfileBundle(dbClient, userId, userEmail);
    sessionData.token = accessToken;
    sessionData.refreshToken = refreshToken || null;
    sessionData.expiresAt = Date.now() + (24 * 60 * 60 * 1000);
    sessionData.lastActivity = Date.now();

    return response.status(200).json({
      success: true,
      message: 'Authenticated successfully',
      session: sessionData
    });
  } catch (error) {
    const isTimeout = error?.name === 'AbortError';
    const message = isTimeout
      ? 'Supabase auth request timed out. Please try again.'
      : (error?.message || 'Authentication failed');

    console.error('send-otp auth_login error:', error);
    return response.status(500).json({ success: false, message });
  }
}

async function handleValidateTyreSerial(request, response) {
  const userId = String(request.body?.user_id || request.headers['x-user-id'] || '').trim();
  const tyreSerial = normalizeTyreSerial(request.body?.tyre_serial);
  const fitmentType = normalizeFitmentType(request.body?.fitment_type);

  if (!userId) {
    return response.status(400).json({ success: false, message: 'User ID is required for tyre validation' });
  }

  if (!tyreSerial) {
    return response.status(400).json({ success: false, message: 'Tyre number is required for validation' });
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return response.status(500).json({
      success: false,
      message: 'Tyre validation requires SUPABASE_SERVICE_ROLE_KEY to be configured'
    });
  }

  try {
    const dbClient = createDbClient('');

    const { data: profileData, error: profileError } = await dbClient
      .from('user_profiles')
      .select('id, is_active')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      throw new Error(`User profile lookup failed: ${profileError.message}`);
    }

    if (!profileData?.id) {
      return response.status(404).json({ success: false, message: 'User profile not found' });
    }

    if (profileData.is_active === false) {
      return response.status(403).json({ success: false, message: 'User account is inactive' });
    }

    if (fitmentType && fitmentType !== 'old') {
      return response.status(200).json({
        success: true,
        valid: true,
        skipped: true,
        tyre_serial: tyreSerial,
        warning: null
      });
    }

    const { data: tyreRows, error: tyreError } = await dbClient
      .from('tyres')
      .select('id')
      .ilike('tyre_no', tyreSerial)
      .limit(1);

    if (tyreError) {
      throw new Error(`Tyre lookup failed: ${tyreError.message}`);
    }

    const exists = Array.isArray(tyreRows) && tyreRows.length > 0;
    return response.status(200).json({
      success: true,
      valid: exists,
      skipped: false,
      tyre_serial: tyreSerial,
      warning: exists ? null : 'Tyre number not found. Please recheck.'
    });
  } catch (error) {
    console.error('send-otp validate_tyre_serial error:', error);
    return response.status(500).json({
      success: false,
      message: error?.message || 'Tyre validation failed'
    });
  }
}

async function handleLookupTyreContext(request, response) {
  const userId = String(request.body?.user_id || request.headers['x-user-id'] || '').trim();
  const tyreSerial = normalizeTyreSerial(request.body?.tyre_serial);

  if (!userId) {
    return response.status(400).json({ success: false, message: 'User ID is required' });
  }

  if (!tyreSerial) {
    return response.status(400).json({ success: false, message: 'Tyre number is required' });
  }

  try {
    ensureServiceRoleConfigured();
    const dbClient = createDbClient('');
    const profile = await getActiveProfileContext(dbClient, userId);

    const { data: siteVehicles, error: siteVehicleError } = await dbClient
      .from('vehicles')
      .select('id, vehicle_no')
      .eq('site_id', profile.site_id);

    if (siteVehicleError) {
      throw new Error(`Vehicle lookup failed: ${siteVehicleError.message}`);
    }

    const siteVehicleMap = new Map();
    for (const row of siteVehicles || []) {
      siteVehicleMap.set(row.id, normalizeVehicleNo(row.vehicle_no));
    }
    const siteVehicleIds = Array.from(siteVehicleMap.keys());

    let tyreRow = null;
    const tyreKey = canonicalTyreSerial(tyreSerial);
    if (tyreKey) {
      const normLookup = await dbClient
        .from('tyres')
        .select('id, tyre_no, make, size, current_vehicle_id, current_position, created_at')
        .eq('tyre_no_norm', tyreKey)
        .maybeSingle();

      if (normLookup.error && normLookup.error.code !== 'PGRST116' && !isSchemaObjectMissingError(normLookup.error)) {
        throw new Error(`Tyre lookup failed: ${normLookup.error.message}`);
      }

      if (!normLookup.error) {
        tyreRow = normLookup.data || null;
      }
    }

    if (!tyreRow) {
      const legacyLookup = await dbClient
        .from('tyres')
        .select('id, tyre_no, make, size, current_vehicle_id, current_position, created_at')
        .ilike('tyre_no', tyreSerial)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (legacyLookup.error && legacyLookup.error.code !== 'PGRST116') {
        throw new Error(`Tyre lookup failed: ${legacyLookup.error.message}`);
      }

      tyreRow = legacyLookup.data || null;
    }

    let latestActivity = null;
    if (tyreRow?.id && siteVehicleIds.length > 0) {
      const activityLookup = await dbClient
        .from('tyre_activity_log')
        .select('vehicle_id, position, meter_reading, activity_date, created_at')
        .eq('tyre_id', tyreRow.id)
        .in('vehicle_id', siteVehicleIds)
        .order('activity_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activityLookup.error && activityLookup.error.code !== 'PGRST116' && !isSchemaObjectMissingError(activityLookup.error)) {
        throw new Error(`Tyre history lookup failed: ${activityLookup.error.message}`);
      }

      latestActivity = activityLookup.data || null;
    }

    let latestFitment = null;
    const fitmentLookup = await dbClient
      .from('fitter_tyre_card_entries')
      .select('vehicle_no, position_code, make, size, meter_reading, capture_completed_at, created_at')
      .eq('site_id', profile.site_id)
      .ilike('tyre_serial', tyreSerial)
      .order('capture_completed_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fitmentLookup.error && fitmentLookup.error.code !== 'PGRST116' && !isSchemaObjectMissingError(fitmentLookup.error)) {
      throw new Error(`Fitment history lookup failed: ${fitmentLookup.error.message}`);
    }

    latestFitment = fitmentLookup.data || null;

    const cleanMeta = (value) => {
      const text = String(value || '').trim();
      if (!text) return null;
      const lower = text.toLowerCase();
      if (lower === 'unknown' || lower === 'na' || lower === 'n/a' || lower === '-') {
        return null;
      }
      return text;
    };

    const truckFromCurrent = tyreRow?.current_vehicle_id && siteVehicleMap.has(tyreRow.current_vehicle_id)
      ? siteVehicleMap.get(tyreRow.current_vehicle_id)
      : null;
    const truckFromActivity = latestActivity?.vehicle_id && siteVehicleMap.has(latestActivity.vehicle_id)
      ? siteVehicleMap.get(latestActivity.vehicle_id)
      : null;
    const truckFromFitment = normalizeVehicleNo(latestFitment?.vehicle_no);

    const positionFromCurrent = normalizePositionCode(tyreRow?.current_position);
    const positionFromActivity = normalizePositionCode(latestActivity?.position);
    const positionFromFitment = normalizePositionCode(latestFitment?.position_code);

    const meterFromActivity = toFiniteNumber(latestActivity?.meter_reading, NaN);
    const meterFromFitment = toFiniteNumber(latestFitment?.meter_reading, NaN);

    const resolvedTruck = truckFromCurrent || truckFromActivity || truckFromFitment || null;
    const resolvedPosition = positionFromCurrent || positionFromActivity || positionFromFitment || null;
    const resolvedMake = cleanMeta(tyreRow?.make) || cleanMeta(latestFitment?.make) || null;
    const resolvedSize = normalizeTyreSizeValue(cleanMeta(tyreRow?.size) || cleanMeta(latestFitment?.size));
    const resolvedOdometer = Number.isFinite(meterFromActivity)
      ? meterFromActivity
      : (Number.isFinite(meterFromFitment) ? meterFromFitment : null);

    const found = Boolean(tyreRow || latestActivity || latestFitment);
    const source = truckFromCurrent || positionFromCurrent
      ? 'current_layout'
      : (latestActivity
        ? 'activity_log'
        : (latestFitment
          ? 'fitter_history'
          : (tyreRow ? 'tyre_master' : 'none')));

    return response.status(200).json({
      success: true,
      found,
      tyre_serial: normalizeTyreSerial(tyreRow?.tyre_no || tyreSerial),
      make: resolvedMake,
      size: resolvedSize || null,
      truck_no: resolvedTruck,
      position_code: resolvedPosition,
      odometer: resolvedOdometer,
      source
    });
  } catch (error) {
    console.error('send-otp lookup_tyre_context error:', error);
    return response.status(500).json({
      success: false,
      message: error?.message || 'Failed to lookup tyre details'
    });
  }
}

async function handleGetVehicleTyreLayout(request, response) {
  const userId = String(request.body?.user_id || request.headers['x-user-id'] || '').trim();
  const truckNo = normalizeVehicleNo(request.body?.truck_no);
  const odometer = toFiniteNumber(request.body?.odometer, NaN);
  const requestedPosition = normalizePositionCode(request.body?.position_code);

  if (!userId) {
    return response.status(400).json({ success: false, message: 'User ID is required' });
  }

  if (!truckNo) {
    return response.status(400).json({ success: false, message: 'Truck number is required' });
  }

  try {
    ensureServiceRoleConfigured();
    const dbClient = createDbClient('');
    const profile = await getActiveProfileContext(dbClient, userId);

    const { data: siteData, error: siteError } = await dbClient
      .from('sites')
      .select('pressure_base_psi')
      .eq('id', profile.site_id)
      .maybeSingle();

    if (siteError) {
      throw new Error(`Site settings lookup failed: ${siteError.message}`);
    }

    const pressureBasePsiRaw = Number(siteData?.pressure_base_psi);
    const pressureBasePsi = Number.isFinite(pressureBasePsiRaw) && pressureBasePsiRaw > 0
      ? Number(pressureBasePsiRaw.toFixed(2))
      : 120;

    const vehicle = await ensureVehicleForSite(dbClient, {
      truckNo,
      siteId: profile.site_id,
      odometer,
      createIfMissing: true
    });

    const assigned = await fetchVehicleTyreMap(dbClient, vehicle.id);
    const positions = buildDefaultPositionList();
    for (const position of Object.keys(assigned)) {
      if (!positions.includes(position)) {
        positions.push(position);
      }
    }

    const currentPosition = requestedPosition || positions[0] || null;
    const current = currentPosition ? (assigned[currentPosition] || null) : null;

    return response.status(200).json({
      success: true,
      truck_no: truckNo,
      vehicle_id: vehicle.id,
      pressure_base_psi: pressureBasePsi,
      positions,
      assigned,
      current_position: currentPosition,
      current
    });
  } catch (error) {
    console.error('send-otp get_vehicle_tyre_layout error:', error);
    return response.status(500).json({
      success: false,
      message: error?.message || 'Failed to load truck tyre layout'
    });
  }
}

async function handleUpsertVehiclePositionTyre(request, response) {
  const userId = String(request.body?.user_id || request.headers['x-user-id'] || '').trim();
  const truckNo = normalizeVehicleNo(request.body?.truck_no);
  const positionCode = normalizePositionCode(request.body?.position_code);
  const tyreSerial = normalizeTyreSerial(request.body?.tyre_serial);
  const odometer = toFiniteNumber(request.body?.odometer, NaN);
  const make = normalizeTyreMake(request.body?.make);
  const size = normalizeTyreSizeValue(request.body?.size);
  const activityDate = resolveActivityDate(request.body?.activity_date);
  const fitmentType = normalizeFitmentType(request.body?.fitment_type);
  const defaultRtd = fitmentType === 'old' ? 15 : 20;
  const rtd1 = toFiniteNumber(request.body?.rtd1, defaultRtd);
  const rtd2 = toFiniteNumber(request.body?.rtd2, defaultRtd);

  if (!userId) {
    return response.status(400).json({ success: false, message: 'User ID is required' });
  }

  if (!truckNo) {
    return response.status(400).json({ success: false, message: 'Truck number is required' });
  }

  if (!positionCode) {
    return response.status(400).json({ success: false, message: 'Position code is required' });
  }

  if (!tyreSerial) {
    return response.status(400).json({ success: false, message: 'Tyre number is required' });
  }

  try {
    ensureServiceRoleConfigured();
    const dbClient = createDbClient('');
    const profile = await getActiveProfileContext(dbClient, userId);
    const vehicle = await ensureVehicleForSite(dbClient, {
      truckNo,
      siteId: profile.site_id,
      odometer,
      createIfMissing: true
    });

    const targetTyre = await ensureTyreRecord(dbClient, {
      tyreSerial,
      make,
      size
    });

    const tyreKey = canonicalTyreSerial(tyreSerial);
    const baseSourcePk = buildProjectionSourcePk({
      explicitSourcePk: request.body?.source_pk || request.body?.submission_id || request.body?.local_submission_id,
      vehicleId: vehicle.id,
      positionCode,
      tyreKey,
      odometer,
      activityDate
    });

    const displacedRows = [];
    const currentLayout = await fetchVehicleTyreMap(dbClient, vehicle.id);
    const occupied = currentLayout[positionCode] || null;
    if (occupied?.tyre_id && occupied.tyre_id !== targetTyre.id) {
      await upsertTyreActivityEvent(dbClient, {
        activity_type: 'REMOVAL',
        activity_date: activityDate,
        tyre_id: occupied.tyre_id,
        vehicle_id: vehicle.id,
        position: positionCode,
        meter_reading: Number.isFinite(odometer) ? odometer : null,
        remarks: 'Auto-displaced during reassignment',
        disposition: 'Spare',
        user_id: profile.id,
        source_type: 'vehicle_layout_upsert',
        source_pk: `${baseSourcePk}:displace_slot`,
        projection_version: 1,
        position_code_norm: positionCode
      });

      displacedRows.push({
        tyre_id: occupied.tyre_id,
        tyre_no: occupied.tyre_no
      });
    }

    const currentMount = await fetchTyreActiveMount(dbClient, targetTyre.id);
    if (
      currentMount
      && (
        currentMount.vehicle_id !== vehicle.id
        || normalizePositionCode(currentMount.position_code) !== positionCode
      )
    ) {
      await upsertTyreActivityEvent(dbClient, {
        activity_type: 'REMOVAL',
        activity_date: activityDate,
        tyre_id: targetTyre.id,
        vehicle_id: currentMount.vehicle_id,
        position: normalizePositionCode(currentMount.position_code),
        meter_reading: Number.isFinite(odometer) ? odometer : null,
        remarks: 'Auto-removed before reassignment',
        disposition: 'Spare',
        user_id: profile.id,
        source_type: 'vehicle_layout_upsert',
        source_pk: `${baseSourcePk}:clear_previous_mount`,
        projection_version: 1,
        position_code_norm: normalizePositionCode(currentMount.position_code)
      });
    }

    await upsertTyreActivityEvent(dbClient, {
      activity_type: 'FITMENT',
      activity_date: activityDate,
      tyre_id: targetTyre.id,
      vehicle_id: vehicle.id,
      position: positionCode,
      meter_reading: Number.isFinite(odometer) ? odometer : null,
      rtd1: Number.isFinite(rtd1) ? rtd1 : null,
      rtd2: Number.isFinite(rtd2) ? rtd2 : null,
      remarks: 'Vehicle layout assignment',
      user_id: profile.id,
      source_type: 'vehicle_layout_upsert',
      source_pk: `${baseSourcePk}:fitment`,
      projection_version: 1,
      position_code_norm: positionCode
    });

    const updatedLayout = await fetchVehicleTyreMap(dbClient, vehicle.id);
    const assignedTyre = updatedLayout[positionCode] || null;

    return response.status(200).json({
      success: true,
      truck_no: truckNo,
      vehicle_id: vehicle.id,
      position_code: positionCode,
      assigned: {
        tyre_id: assignedTyre?.tyre_id || targetTyre.id,
        tyre_no: normalizeTyreSerial(assignedTyre?.tyre_no || targetTyre.tyre_no || tyreSerial),
        make: assignedTyre?.make || make || null,
        size: assignedTyre?.size || size || null
      },
      displaced: (displacedRows || []).map((row) => ({
        tyre_id: row.tyre_id,
        tyre_no: normalizeTyreSerial(row.tyre_no)
      }))
    });
  } catch (error) {
    console.error('send-otp upsert_vehicle_position_tyre error:', error);
    return response.status(500).json({
      success: false,
      message: error?.message || 'Failed to update tyre mapping'
    });
  }
}

async function handleSendOtp(request, response) {
  const email = String(request.body?.email || '').trim().toLowerCase();

  if (!email || !isValidEmail(email)) {
    return response.status(400).json({ success: false, message: 'Valid email is required' });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    let providerResponse;
    try {
      providerResponse = await fetch(`${OTP_PROVIDER_BASE_URL}/send_otp_api.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const providerJson = await safeJson(providerResponse);

    if (!providerResponse.ok) {
      return response.status(502).json({
        success: false,
        message: providerJson.message || `OTP provider error (${providerResponse.status})`
      });
    }

    return response.status(200).json({
      success: Boolean(providerJson.success),
      message: providerJson.message || (providerJson.success ? 'OTP sent successfully' : 'Failed to send OTP')
    });
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? 'OTP service timed out. Please try again.'
      : (error?.message || 'Failed to send OTP');

    console.error('send-otp proxy error:', error);
    return response.status(500).json({ success: false, message });
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
  if (action === 'get_vehicle_tyre_layout') {
    return handleGetVehicleTyreLayout(request, response);
  }

  if (action === 'upsert_vehicle_position_tyre') {
    return handleUpsertVehiclePositionTyre(request, response);
  }

  if (action === 'lookup_tyre_context' || action === 'get_tyre_autofill') {
    return handleLookupTyreContext(request, response);
  }

  if (action === 'validate_tyre_serial') {
    return handleValidateTyreSerial(request, response);
  }

  if (action === 'auth_login') {
    return handleAuthLogin(request, response);
  }

  return handleSendOtp(request, response);
}
