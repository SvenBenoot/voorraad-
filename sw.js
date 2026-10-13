// ---- Offline werken
// Alle bestanden van de app worden bij de eerste keer bewaard, zodat de app ook zonder internet opent
// (in de bestelwagen, in een kelder…). Nieuwe versie = CACHE-naam ophogen (zelfde als js/version.js).
const CACHE = 'voorraad-1.0';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/files.js', 'js/icons.js', 'js/material.js', 'js/photo.js', 'js/qr.js', 'js/router.js',
  'js/scanner.js', 'js/store.js', 'js/ui.js', 'js/version.js',
  'js/screens/edit.js', 'js/screens/home.js', 'js/screens/item.js', 'js/screens/restock.js', 'js/screens/scan.js', 'js/screens/settings.js',
  'lib/fflate.js', 'lib/jsQR.js', 'lib/preact-htm.js', 'lib/qrcode.mjs',
  'img/logo_wit.png', 'img/logo_zwart.png', 'img/icon-192.png', 'img/icon-512.png', 'img/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Eerst het netwerk (dan heb je altijd de nieuwste versie), anders uit de cache.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});
