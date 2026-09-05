(function() {
    var scripts = [
        'src/lib/config.js',
        'src/lib/session.js',
        'src/lib/navigation.js',
        'src/lib/header.js',
        'src/lib/database.js',
        'src/lib/toast.js',
        'src/lib/confirm.js',
        'src/lib/app-init.js'
    ];

    function loadNext(index) {
        if (index >= scripts.length) return;
        var script = document.createElement('script');
        script.src = scripts[index];
        script.onload = function() { loadNext(index + 1); };
        script.onerror = function() { console.error('Failed to load: ' + scripts[index]); };
        document.body.appendChild(script);
    }

    loadNext(0);
})();
