// StormWatch Service Worker
// Caches the app shell (index.html, icons, manifest) for offline use.
// API calls (api.open-meteo.com) are NOT intercepted — the app handles
// offline fallback via its own localStorage cache. This avoids having two
// competing offline strategies that fight each other.

const CACHE_NAME = 'stormwatch-shell-v4';
const SHELL_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];
// Secrets live here and can change independently of the shell — always
// revalidate from the network first. If the request 404s (file never created),
// the <script onerror> handler in index.html already defaults the config.
const NETWORK_FIRST_URLS = ['./config.local.js'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).catch(() => {
      // Individual resource failures (e.g. missing icons) are non-fatal —
      // the SW still activates with whatever it managed to cache.
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

// Only intercept requests for the app's own origin. Cross-origin API calls
// (api.open-meteo.com) are left to the browser so the app sees real network
// errors and falls back to its localStorage cache.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (!isSameOrigin) {
    // Network-only for third-party requests (Open-Meteo API).
    return;
  }

  // Navigations (the app shell itself): network-first so users get fresh
  // code on every deploy, falling back to the cached shell when offline.
  // (A pure cache-first shell never updates — a redeploy would never reach
  // returning visitors.) The v2 cache name also purges any stale v1 cache
  // on activation, via the cleanup in the 'activate' handler above.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((res) => {
        if (res.ok && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return res;
      }).catch(() =>
        caches.match(event.request).then((cached) => cached || caches.match('./index.html'))
      )
    );
    return;
  }

  // Secrets config: network-first so edited keys reach the client without
  // waiting for a cache-version bump. Never cache a failed/404 response.
  if (NETWORK_FIRST_URLS.some((p) => url.pathname.endsWith(p.replace('./', '/')))) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            return res;
          }
          // 404/204 etc → fall through to cache, else propagate the error so
          // the page's onerror handler runs and the config stays null.
          return caches.match(event.request).then((cached) => cached || Promise.reject(res));
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Other same-origin assets (icons, manifest): cache-first, only cache successful responses.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        if (res.ok && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return res;
      }).catch(() => caches.match(event.request));
    })
  );
});
