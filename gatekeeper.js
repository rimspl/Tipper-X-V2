(function() {
    var path = window.location.pathname;
    var prefix = (path.includes('/manager/') || path.includes('/forms/') || path.includes('/fitter/')) ? '../' : './';
    var script = document.createElement('script');
    script.src = prefix + 'src/lib/auth.js';
    script.onerror = function() { console.error('Failed to load auth.js'); };
    document.body.appendChild(script);
})();
