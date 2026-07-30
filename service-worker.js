// ═══════════════════════════════════════════════════
//  SERVICE WORKER v5 — Planificador JCH
//  Offline completo para TWA + PWA
//  Cache-first para assets propios
//  Network-first para Firebase (con fallback offline)
// ═══════════════════════════════════════════════════
 
const CACHE_VERSION = 'v5';
const CACHE_NAME = 'planificador-jch-' + CACHE_VERSION;
 
// ── Archivos propios que SIEMPRE deben estar cacheados offline ──
const ASSETS_PROPIOS = [
  './splash.html',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];
 
// ── URLs de Firebase SDK a cachear (para uso offline parcial) ──
const FIREBASE_URLS = [
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js',
];
 
// ─────────────────────────────────────────────────────────────────
//  INSTALL — cachear todos los assets propios inmediatamente
// ─────────────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // Cachear assets propios (críticos — si falla, SW no instala)
        return cache.addAll(ASSETS_PROPIOS).then(() => {
          // Intentar cachear Firebase SDK (no crítico — puede fallar)
          return Promise.allSettled(
            FIREBASE_URLS.map(url => 
              fetch(url, { mode: 'no-cors' })
                .then(r => cache.put(url, r))
                .catch(() => {}) // Silenciar error si no hay internet al instalar
            )
          );
        });
      })
      .then(() => self.skipWaiting())
  );
});
 
// ─────────────────────────────────────────────────────────────────
//  ACTIVATE — limpiar caches viejos
// ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});
 
// ─────────────────────────────────────────────────────────────────
//  FETCH — estrategia inteligente por tipo de recurso
// ─────────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
 
  // 1. Ignorar peticiones que no son GET
  if (e.request.method !== 'GET') return;
 
  // 2. Ignorar peticiones de extensiones del navegador
  if (url.protocol === 'chrome-extension:') return;
 
  // 3. Assets PROPIOS del planificador → Cache First
  //    (funciona offline siempre)
  if (
    url.hostname.includes('github.io') ||
    url.hostname === 'josealdairchevez.github.io'
  ) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        // No está en caché → intentar red y cachear para la próxima
        return fetch(e.request)
          .then(response => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
            }
            return response;
          })
          .catch(() => {
            // Sin red y sin caché → página offline de fallback
            return caches.match('./index.html')
              || caches.match('./splash.html');
          });
      })
    );
    return;
  }
 
  // 4. Firebase SDK (gstatic) → Cache First con fallback de red
  if (url.hostname.includes('gstatic.com') || url.hostname.includes('googleapis.com')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          }
          return response;
        }).catch(() => cached || new Response('', { status: 503 }));
      })
    );
    return;
  }
 
  // 5. Firebase API (firestore, auth, fcm) → Network First
  //    Si no hay red, devuelve respuesta vacía sin romper la app
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('cloudfunctions.net')
  ) {
    e.respondWith(
      fetch(e.request)
        .catch(() => new Response(JSON.stringify({ offline: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }))
    );
    return;
  }
 
  // 6. Todo lo demás → intentar red, luego caché
  e.respondWith(
    fetch(e.request)
      .then(response => {
        if (response && response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
 
// ─────────────────────────────────────────────────────────────────
//  NOTIFICACIONES PROGRAMADAS (TimestampTrigger)
// ─────────────────────────────────────────────────────────────────
self.addEventListener('message', async e => {
  if (!e.data) return;
 
  if (e.data.type === 'SCHEDULE_NOTIFICATIONS') {
    const reminders = e.data.reminders || [];
 
    // Cancelar notificaciones anteriores
    try {
      const scheduled = await self.registration.getNotifications({ tag: 'jch-scheduled' });
      scheduled.forEach(n => n.close());
    } catch(_) {}
 
    for (const r of reminders) {
      const msUntilFire = r.fireAt - Date.now();
      if (msUntilFire < -60000) continue;
 
      const opts = {
        body: r.body,
        icon: './icon-192.png',
        badge: './icon-192.png',
        vibrate: [400, 100, 400, 100, 800],
        requireInteraction: true,
        tag: 'jch-' + r.evId + '-' + r.fireAt,
        data: { url: './index.html' }
      };
 
      if ('TimestampTrigger' in self) {
        opts.showTrigger = new TimestampTrigger(r.fireAt);
      }
 
      try {
        await self.registration.showNotification(r.title, opts);
      } catch(err) {
        delete opts.showTrigger;
        try { await self.registration.showNotification(r.title, opts); } catch(_) {}
      }
    }
  }
 
  if (e.data.type === 'SET_REMINDERS') {
    _mem = e.data.reminders || [];
    schedCheck();
  }
});
 
// ─────────────────────────────────────────────────────────────────
//  TIMER FALLBACK (recordatorios cuando app está abierta)
// ─────────────────────────────────────────────────────────────────
let _mem = [];
let _ct = null;
 
function schedCheck() {
  if (_ct) clearTimeout(_ct);
  doCheck();
  _ct = setTimeout(schedCheck, 20000);
}
 
function doCheck() {
  const now = Date.now();
  const fire = _mem.filter(r => r.fireAt <= now + 10000);
  _mem = _mem.filter(r => r.fireAt > now + 10000);
  fire.forEach(r => {
    self.registration.showNotification(r.title, {
      body: r.body,
      icon: './icon-192.png',
      badge: './icon-192.png',
      vibrate: [400, 100, 400, 100, 800],
      requireInteraction: true,
      tag: 'jch-fire-' + Date.now()
    }).catch(() => {});
  });
}
 
// ─────────────────────────────────────────────────────────────────
//  CLICK EN NOTIFICACIÓN → abrir app
// ─────────────────────────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        for (const c of clients) {
          if (c.url.includes('planificador') && 'focus' in c) return c.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow('./index.html');
      })
  );
});
 
// ─────────────────────────────────────────────────────────────────
//  PERIODIC SYNC
// ─────────────────────────────────────────────────────────────────
self.addEventListener('periodicsync', e => {
  if (e.tag === 'jch-periodic') e.waitUntil(Promise.resolve(doCheck()));
});
 
