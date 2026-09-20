/* Gymmy service worker — offline app shell.
   Strategy: network-first for our own files (always get fresh code when online),
   fall back to cache when offline. Bump CACHE on release. */
const CACHE = 'gymmy-v2';
const ASSETS = [
  '.', 'index.html',
  'css/styles.css',
  'js/data.js', 'js/store.js', 'js/charts.js', 'js/training.js', 'js/nutrition.js', 'js/app.js',
  'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // let cross-origin pass through
  // Network-first: fetch fresh, update cache, fall back to cache when offline.
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then(c => c || caches.match('index.html')))
  );
});
