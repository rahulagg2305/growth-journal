// Service worker: caches the app shell for offline use. Never caches GitHub API calls.
const VERSION = 'gj-v1';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css', './vendor/chart.umd.min.js',
  './js/app.js', './js/state.js', './js/store.js', './js/sync.js', './js/logic.js', './js/model.js', './js/quotes.js',
  './js/ui/dom.js', './js/ui/today.js', './js/ui/targets.js', './js/ui/insights.js', './js/ui/review.js', './js/ui/settings.js', './js/ui/wizard.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // GitHub API goes straight to network
  // Network-first so updates arrive quickly; fall back to cache offline.
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))));
});
