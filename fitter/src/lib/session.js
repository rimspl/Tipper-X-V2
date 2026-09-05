export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
const SESSION_KEY = 'rims_session';

function readSessionRaw() {
  let raw = sessionStorage.getItem(SESSION_KEY);
  if (raw) return raw;
  raw = localStorage.getItem(SESSION_KEY);
  if (raw) {
    sessionStorage.setItem(SESSION_KEY, raw);
  }
  return raw;
}

function writeSession(data) {
  const json = JSON.stringify(data);
  sessionStorage.setItem(SESSION_KEY, json);
  const userType = resolveSessionUserType(data);
  if (userType === 'fitter') {
    localStorage.setItem(SESSION_KEY, json);
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
}

function resolveSessionUserType(session = {}) {
  const explicit = String(session.userType || '').trim().toLowerCase();
  if (explicit === 'manager' || explicit === 'fitter') {
    return explicit;
  }

  const legacyRole = String(session.role || '').trim().toLowerCase();
  return legacyRole === 'manager' ? 'manager' : 'fitter';
}

function isSessionExpired(session) {
  if (!session) return true;
  const expiresAt = Number(session.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
    return false;
  }
  return Date.now() > expiresAt;
}

export function extendSession(rawSession = null) {
  try {
    const source = rawSession || JSON.parse(readSessionRaw() || '{}');
    if (!source || !source.uid) return null;
    source.expiresAt = Date.now() + SESSION_DURATION_MS;
    source.lastActivity = Date.now();
    writeSession(source);
    return source.expiresAt;
  } catch (err) {
    return null;
  }
}

export function requireFitterSession() {
  const raw = readSessionRaw();
  if (!raw) {
    window.location.replace('./login.html');
    return null;
  }

  try {
    const session = JSON.parse(raw);
    if (!session || !session.uid || !session.userType) {
      throw new Error('Invalid session payload');
    }

    if (isSessionExpired(session)) {
      clearSession();
      window.location.replace('./login.html');
      return null;
    }

    if (!session.expiresAt) {
      session.expiresAt = Date.now() + SESSION_DURATION_MS;
      writeSession(session);
    }

    const userType = resolveSessionUserType(session);
    const isManager = userType === 'manager';
    if (isManager) {
      window.location.replace('../manager/index.html');
      return null;
    }

    return {
      userId: session.uid,
      username: session.username || session.email || 'Fitter',
      siteId: session.siteId || null,
      customerId: session.customerId || null,
      siteName: session.siteName || 'Unknown Site',
      customerName: session.customerName || 'Unknown Customer',
      role: userType === 'manager' ? 'manager' : 'user',
      userType,
      expiresAt: session.expiresAt,
      raw: session
    };
  } catch (error) {
    clearSession();
    window.location.replace('./login.html');
    return null;
  }
}

export function logoutToLogin() {
  clearSession();
  window.location.replace('./login.html');
}
