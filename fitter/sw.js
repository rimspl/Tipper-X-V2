const CACHE = 'dynahaul-fitter-v41';
const ASSETS = [
  './',
  './index.html',
  './login.html',
  './capture.html',
  './queue.html',
  './manifest.webmanifest',
  '../supabase-init.js',
  '../email-otp-service.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './src/assets/fonts/barlow-500-latin.woff2',
  './src/assets/fonts/barlow-600-latin.woff2',
  './src/assets/fonts/barlow-700-latin.woff2',
  './src/assets/fonts/rajdhani-600-latin.woff2',
  './src/assets/fonts/rajdhani-700-latin.woff2',
  './src/assets/icons/fields/tyre-number.svg',
  './src/assets/icons/fields/truck-number.svg',
  './src/assets/icons/fields/position.svg',
  './src/assets/icons/fields/make.svg',
  './src/assets/icons/fields/size.svg',
  './src/assets/icons/fields/odometer.svg',
  './src/assets/icons/fields/tread-depth.svg',
  './src/assets/icons/fields/condition.svg',
  './src/assets/icons/fields/pressure.svg',
  './src/assets/icons/fields/reason.svg',
  './src/assets/icons/fields/default.svg',
  './src/assets/icons/fields/model.svg',
  './src/assets/icons/fields/observation.svg',
  './src/assets/icons/modules/tyre-fitment.svg',
  './src/assets/icons/modules/pressure-entry.svg',
  './src/assets/icons/modules/inspection.svg',
  './src/assets/icons/modules/tyre-removal.svg',
  './src/assets/icons/modules/default.svg',
  './src/assets/icons/modules/observation.svg',
  './src/assets/layouts/truck-12-tyres.svg',
  './src/styles/app.css',
  './src/config/forms.js',
  './src/lib/constants.js',
  './src/lib/idb.js',
  './src/lib/media.js',
  './src/lib/pwa-bootstrap.js',
  './src/lib/queue-engine.js',
  './src/lib/session.js',
  './src/lib/sync-api.js',
  './src/lib/ui.js',
  './src/services/voice-capture.js',
  './src/services/voice-processing.js',
  './src/pages/home.js',
  './src/pages/capture.js',
  './src/pages/queue.js',
  '../shared/field-masters.js'
];

const NETWORK_FIRST_SUFFIXES = ['.js', '.css', '.html', '.webmanifest'];

function isSameOrigin(request) {
  try {
    const url = new URL(request.url);
    return url.origin === self.location.origin;
  } catch {
    return false;
  }
}

function shouldUseNetworkFirst(request) {
  if (!isSameOrigin(request)) {
    return false;
  }

  if (request.mode === 'navigate') {
    return true;
  }

  const url = new URL(request.url);
  return NETWORK_FIRST_SUFFIXES.some((suffix) => url.pathname.endsWith(suffix));
}

function canCacheResponse(response) {
  return Boolean(response && response.status === 200 && response.type === 'basic');
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(
      ASSETS.map(async (asset) => {
        try {
          await cache.add(asset);
        } catch (error) {
          console.warn('[fitter sw] precache skipped:', asset, error?.message || error);
        }
      })
    );
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const isNavigateRequest = event.request.mode === 'navigate';
  const useNetworkFirst = shouldUseNetworkFirst(event.request);

  if (useNetworkFirst) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (canCacheResponse(response)) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => {
          if (cached) {
            return cached;
          }
          if (isNavigateRequest) {
            return caches.match('./index.html');
          }
          return Promise.reject(new Error('Network request failed'));
        }))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request)
        .then((response) => {
          if (canCacheResponse(response)) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => {
          if (isNavigateRequest) {
            return caches.match('./index.html');
          }
          return Promise.reject(new Error('Network request failed'));
        });
    })
  );
});
