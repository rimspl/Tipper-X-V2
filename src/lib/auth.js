function enforceAuth() {
    let sessionStr = sessionStorage.getItem('rims_session');
    const currentPath = window.location.pathname;

    if (currentPath.includes('login.html') ||
        currentPath.includes('join-company.html') ||
        currentPath.includes('reset-password.html')) {
        return;
    }

    if (!sessionStr) {
        redirectToLogin();
        return;
    }

    try {
        const session = JSON.parse(sessionStr);
        if (!session || !session.uid) {
            throw new Error('Invalid session structure');
        }
    } catch (e) {
        console.error('GATEKEEPER: Invalid session data', e);
        sessionStorage.removeItem('rims_session');
        localStorage.removeItem('rims_session');
        redirectToLogin();
    }
}

function redirectToLogin() {
    const currentPath = window.location.pathname;
    const inSubDir = currentPath.includes('/manager/') || currentPath.includes('/forms/') || currentPath.includes('/fitter/');
    const loginPage = inSubDir ? '../fitter/login.html' : './fitter/login.html';

    if (!window.location.href.includes('login.html')) {
        window.location.replace(loginPage);
    }
}

enforceAuth();
