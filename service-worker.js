// ═══════════════════════════════════════════════════
//  SERVICE WORKER — Planificador JCH
//  Versión: 1.0.0
//  Estrategia: Cache First para assets, Network First para HTML
// ═══════════════════════════════════════════════════

const CACHE_NAME = 'planificador-jch-v1';

// Archivos a cachear en la instalación
const ASSETS_TO_CACHE = [
  '/planificador/',
  '/planificador/index.html',
  '/planificador/manifest.json',
  '/planificador/icon-192.png',
  '/planificador/icon-512.png'
];

// ── INSTALACIÓN: guardar assets en caché ──────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Cacheando assets...');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVACIÓN: limpiar cachés antiguas ──────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Eliminando caché antigua:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ── FETCH: estrategia según tipo de recurso ──────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar requests externos (Firebase, Google Fonts, CDN)
  if (!url.origin.includes('josealdairchevez.github.io')) {
    return;
  }

  // HTML principal → Network First (siempre intenta obtener la versión más nueva)
  if (request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Guardar copia fresca en caché
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => {
          // Sin conexión → servir desde caché
          return caches.match(request) || caches.match('/planificador/');
        })
    );
    return;
  }

  // Resto de assets → Cache First
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
