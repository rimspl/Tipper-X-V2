function resolveSessionUserType(session = {}) {
  const explicit = String(session.userType || '').trim().toLowerCase();
  if (explicit === 'manager' || explicit === 'fitter') {
    return explicit;
  }

  const legacyRole = String(session.role || '').trim().toLowerCase();
  return legacyRole === 'manager' ? 'manager' : 'fitter';
}

export function requireManagerSession() {
  const raw = sessionStorage.getItem('rims_session');
  if (!raw) {
    window.location.replace('../fitter/login.html');
    return null;
  }

  try {
    const session = JSON.parse(raw);
    const userType = resolveSessionUserType(session);
    const isManager = userType === 'manager';
    if (!session?.uid || !isManager) {
      window.location.replace('../fitter/index.html');
      return null;
    }

    return {
      userId: session.uid,
      username: session.username || session.email || 'Manager',
      siteId: session.siteId || null,
      siteName: session.siteName || 'Unknown Site',
      customerId: session.customerId || null,
      customerName: session.customerName || 'Unknown Customer',
      raw: session
    };
  } catch (error) {
    sessionStorage.removeItem('rims_session');
    window.location.replace('../fitter/login.html');
    return null;
  }
}
