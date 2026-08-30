/* Service worker mínimo: cachea la app para que funcione sin conexión. */
const CACHE = 'rutin-app-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/styles.css',
  './assets/icon.svg',
  './src/store.js',
  './src/timer.js',
  './src/ui.js',
  './src/app.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
      return response;
    }).catch(() => cached))
  );
});
