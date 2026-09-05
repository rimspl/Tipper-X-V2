function isInManager() {
    return window.location.pathname.includes('/manager/');
}

function isInForms() {
    return window.location.pathname.includes('/forms/');
}

function resolveDashboardLink(isManagerUser) {
    if (isInManager()) return 'index.html';
    if (isInForms()) return isManagerUser ? '../manager/index.html' : '../index.html';
    return 'index.html';
}

function resolveSetupLink() {
    if (!isInManager()) {
        if (isInForms()) return '../manager/site-settings.html';
        return 'manager/site-settings.html';
    }
    return 'site-settings.html';
}
