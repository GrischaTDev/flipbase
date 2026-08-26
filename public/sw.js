/**
 * Service Worker für Flipbase.
 *
 * Aufgabe: die statischen Dateien der Anwendung offline verfügbar halten.
 *
 * Ausdrücklich NICHT seine Aufgabe: Datenverkehr mit der Datenbank oder der
 * Anmeldung anzufassen. Die vorherige Fassung hat jede erfolgreiche GET-Antwort
 * zwischengespeichert - also auch Supabase-Abfragen mit Geschäftsdaten und
 * Anmeldedaten. Diese blieben unbegrenzt im Browser-Cache liegen, überlebten
 * ein Abmelden und wurden nie ungültig. Zusätzlich beantwortete der Worker
 * fehlgeschlagene Abfragen mit "503 Offline", wodurch die Anwendung die
 * Datenbank auch dann nicht erreichte, wenn sie lief.
 */

const CACHE_NAME = 'flipbase-os-v4';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/icons/icon-48.png',
  '/icons/icon-96.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/images/logo-mark.png',
];

/** Dateiendungen, die als statische Anwendungsdateien gelten. */
const STATIC_EXTENSIONS =
  /\.(?:js|css|woff2?|ttf|otf|eot|svg|png|jpg|jpeg|gif|ico|webp|avif|json|webmanifest)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

/**
 * Entscheidet, ob eine Anfrage vom Worker behandelt wird.
 *
 * Nur eigene, statische GET-Anfragen. Alles andere - insbesondere jede
 * Anfrage an eine fremde Herkunft wie den Supabase-Server - wird unberührt
 * an das Netzwerk durchgereicht.
 */
function shouldHandle(request) {
  if (request.method !== 'GET') return false;

  const url = new URL(request.url);

  // Fremde Herkunft: Datenbank, Anmeldung, Speicher, externe Dienste.
  if (url.origin !== self.location.origin) return false;

  // Sicherheitsnetz, falls die Anwendung später eigene API-Pfade bekommt.
  if (url.pathname.startsWith('/rest/') || url.pathname.startsWith('/auth/')) return false;
  if (url.pathname.startsWith('/storage/') || url.pathname.startsWith('/functions/')) return false;

  // Seitenaufrufe und statische Dateien.
  if (request.mode === 'navigate') return true;
  return STATIC_EXTENSIONS.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  if (!shouldHandle(event.request)) {
    return; // an das Netzwerk durchreichen, ohne einzugreifen
  }

  const isNavigation = event.request.mode === 'navigate';

  if (isNavigation) {
    // Seitenaufrufe: erst Netzwerk, damit nach einem Neu-Deploy sofort die
    // aktuelle Fassung erscheint; nur bei Netzausfall aus dem Cache.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('/index.html').then((cached) => cached || Response.error())),
    );
    return;
  }

  // Statische Dateien: erst Cache (schnell), im Hintergrund auffrischen.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fromNetwork = fetch(event.request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached || Response.error());

      return cached || fromNetwork;
    }),
  );
});
