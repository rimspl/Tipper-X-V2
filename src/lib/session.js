function getSession() {
    try { return JSON.parse(sessionStorage.getItem('rims_session') || '{}'); } catch (e) { return {}; }
}

function saveSession(data) {
    const current = getSession();
    Object.assign(current, data);
    sessionStorage.setItem('rims_session', JSON.stringify(current));
}

function clearSession() {
    sessionStorage.removeItem('rims_session');
}

async function logout() {
    if (window.supabaseClient) await window.supabaseClient.auth.signOut();
    clearSession();
    const path = window.location.pathname;
    const inSubDir = path.includes('/manager/') || path.includes('/forms/');
    window.location.replace(inSubDir ? '../fitter/login.html' : 'fitter/login.html');
}
