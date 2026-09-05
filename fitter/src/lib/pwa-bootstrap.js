let registrationPromise = null;

export function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true
    || document.referrer.startsWith('android-app://');
}

export function bootstrapFitterPwa() {
  if (!('serviceWorker' in navigator)) {
    return Promise.resolve(null);
  }

  if (registrationPromise) {
    return registrationPromise;
  }

  registrationPromise = navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((error) => {
    console.warn('Service worker registration failed:', error?.message || error);
    return null;
  });

  return registrationPromise;
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'complete') {
    void bootstrapFitterPwa();
  } else {
    window.addEventListener('load', () => {
      void bootstrapFitterPwa();
    }, { once: true });
  }
}
