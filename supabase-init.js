/**
 * supabase-init.js
 * Central configuration for Supabase Connection
 */

const SUPABASE_URL = 'https://ajbbcoygzoxdtejvhbfq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqYmJjb3lnem94ZHRlanZoYmZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyMzIzNjUsImV4cCI6MjEwMDgwODM2NX0.mmAUfLd3gUs06iFkKAiYurjrOz7CuB3ViSmtNSY9Zvg';

function readRimsSession() {
    try {
        let raw = sessionStorage.getItem('rims_session');
        if (!raw) { raw = localStorage.getItem('rims_session'); if (raw) sessionStorage.setItem('rims_session', raw); }
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (error) {
        return null;
    }
}

function writeRimsSession(patch = {}) {
    try {
        const existing = readRimsSession() || {};
        const next = { ...existing, ...patch };
        const json = JSON.stringify(next);
        sessionStorage.setItem('rims_session', json);
        const userType = String(next.userType || next.role || '').toLowerCase();
        if (userType === 'fitter') {
            localStorage.setItem('rims_session', json);
        } else {
            localStorage.removeItem('rims_session');
        }
    } catch (error) {
        // Ignore storage errors.
    }
}

function readRimsAccessToken() {
    try {
        let raw = sessionStorage.getItem('rims_session');
        if (!raw) { raw = localStorage.getItem('rims_session'); if (raw) sessionStorage.setItem('rims_session', raw); }
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const token = String(parsed && parsed.token ? parsed.token : '').trim();
        return token || null;
    } catch (error) {
        return null;
    }
}

function readRimsRefreshToken() {
    try {
        let raw = sessionStorage.getItem('rims_session');
        if (!raw) { raw = localStorage.getItem('rims_session'); if (raw) sessionStorage.setItem('rims_session', raw); }
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const token = String(parsed && parsed.refreshToken ? parsed.refreshToken : '').trim();
        return token || null;
    } catch (error) {
        return null;
    }
}

function decodeJwtPayload(token) {
    try {
        const raw = String(token || '').trim();
        const parts = raw.split('.');
        if (parts.length < 2) return null;

        const base64Url = parts[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const json = atob(base64);
        return JSON.parse(json);
    } catch (error) {
        return null;
    }
}

function describeToken(accessToken) {
    if (!accessToken) return 'anon';
    const payload = decodeJwtPayload(accessToken);
    if (!payload || !payload.exp) return 'session token';
    const msLeft = payload.exp * 1000 - Date.now();
    const minutesLeft = Math.floor(msLeft / 60000);
    return minutesLeft >= 0 ? `session token (~${minutesLeft}m left)` : 'session token (expired)';
}

function createRimsFetch() {
    return async function rimsFetch(input, init = {}) {
        const token = readRimsAccessToken();
        const headers = new Headers(init.headers || {});
        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        }
        return fetch(input, { ...init, headers });
    };
}

if (typeof supabase === 'undefined') {
    console.error("Supabase Library not loaded! Check your HTML <script> tags.");
} else {
    const accessToken = readRimsAccessToken();
    const refreshToken = readRimsRefreshToken();
    const hasRefreshToken = Boolean(accessToken && refreshToken);

    window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
            autoRefreshToken: hasRefreshToken,
            persistSession: false,
            detectSessionInUrl: false
        },
        global: {
            fetch: createRimsFetch()
        }
    });

    if (hasRefreshToken) {
        window.supabaseClient.auth
            .setSession({
                access_token: accessToken,
                refresh_token: refreshToken
            })
            .then(({ data, error }) => {
                if (error) {
                    console.warn('Supabase session init failed:', error.message);
                    return;
                }

                if (data && data.session && data.session.access_token) {
                    writeRimsSession({
                        token: data.session.access_token,
                        refreshToken: data.session.refresh_token || refreshToken
                    });
                }
            })
            .catch((error) => {
                console.warn('Supabase session init failed:', error?.message || error);
            });

        window.supabaseClient.auth.onAuthStateChange((event, session) => {
            if ((event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') && session?.access_token) {
                writeRimsSession({
                    token: session.access_token,
                    refreshToken: session.refresh_token || readRimsRefreshToken()
                });
            }
        });
    }

    console.log(`Supabase Client Initialized (${describeToken(accessToken)})`);
}
