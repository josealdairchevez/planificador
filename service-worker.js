// ═══════════════════════════════════════════════════
//  SERVICE WORKER v2 — Planificador JCH
//  IMPORTANTE: Cambiar CACHE_VERSION fuerza que el
//  navegador descarte el caché anterior y descargue
//  los íconos y archivos nuevos.
// ═══════════════════════════════════════════════════

const CACHE_VERSION = 'v2';
const CACHE_NAME = 'planificador-jch-' + CACHE_VERSION;

const ASSETS = [
  './splash.html',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// INSTALACIÓN: cachear archivos
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ACTIVACIÓN: eliminar cachés viejas
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// FETCH: Network first para HTML, Cache first para resto
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (!url.host.includes('github.io')) return;

  if (e.request.destination === 'document') {
    e.respondWith(
      fetch(e.request)
        .then(r => { caches.open(CACHE_NAME).then(c => c.put(e.request, r.clone())); return r; })
        .catch(() => caches.match(e.request).then(r => r || caches.match('./splash.html')))
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request)
        .then(r2 => { caches.open(CACHE_NAME).then(c => c.put(e.request, r2.clone())); return r2; })
      )
    );
  }
});
