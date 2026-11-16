// Offline-Betrieb: alle App-Dateien werden zwischengespeichert. Bei jeder neuen Version VERSION erhöhen.
const VERSION = 'stundenwerk-v1.3.2';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/core.js', 'js/store.js', 'js/backup.js', 'js/dropbox.js', 'js/config.js', 'js/ui.js', 'js/nav.js',
  'js/components.js', 'js/edit.js', 'js/roster.js', 'js/export.js', 'js/settings.js', 'js/pdf.js',
  'vendor/jspdf.umd.min.js', 'fonts/LiberationSans-Regular.ttf', 'fonts/LiberationSans-Bold.ttf', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' = immer frisch vom Server holen (sonst könnten alte Dateien aus dem Browser-Zwischenspeicher kommen)
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Dropbox usw. nie zwischenspeichern
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)),
  );
});

// Neue Version erst übernehmen, wenn der Nutzer auf den Hinweis tippt (Seite neu laden)
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
