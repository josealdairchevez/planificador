// ═══════════════════════════════════════════════════
//  SERVICE WORKER UNIFICADO v6 — Planificador JCH
//  Offline completo + Firebase Cloud Messaging
// ═══════════════════════════════════════════════════

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyAKsILLuBeu6AXGzMICQtfIULL6-tMs5IE",
    authDomain: "mi-planificador-86095.firebaseapp.com",
    projectId: "mi-planificador-86095",
    storageBucket: "mi-planificador-86095.firebasestorage.app",
    messagingSenderId: "469097705640",
    appId: "1:469097705640:web:7df14de48ff7d625dc529d"
});

const messaging = firebase.messaging();

const CACHE_VERSION = 'v7';
const CACHE_NAME = 'planificador-jch-' + CACHE_VERSION;

const ASSETS_PROPIOS = [
  './splash.html',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

const FIREBASE_URLS = [
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(ASSETS_PROPIOS).then(() => {
          return Promise.allSettled(
            FIREBASE_URLS.map(url => 
              fetch(url, { mode: 'no-cors' })
                .then(r => cache.put(url, r))
                .catch(() => {}) 
            )
          );
        });
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  if (url.hostname.includes('github.io') || url.hostname === 'josealdairchevez.github.io') {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request)
          .then(response => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
            }
            return response;
          })
          .catch(() => caches.match('./index.html') || caches.match('./splash.html'));
      })
    );
    return;
  }

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

  if (url.hostname.includes('firebase') || url.hostname.includes('firebaseio.com') || url.hostname.includes('cloudfunctions.net')) {
    e.respondWith(
      fetch(e.request).catch(() => new Response(JSON.stringify({ offline: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }))
    );
    return;
  }

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

// ── EL ÚNICO MANEJADOR DE CLICS (Fusión de Firebase y App) ──
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'dismiss') return;

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

// ── Lógica Offline Original JCH ──
self.addEventListener('message', async e => {
  if (!e.data) return;
  if (e.data.type === 'SCHEDULE_NOTIFICATIONS') {
    const reminders = e.data.reminders || [];
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

      if ('TimestampTrigger' in self) opts.showTrigger = new TimestampTrigger(r.fireAt);

      try { await self.registration.showNotification(r.title, opts); } 
      catch(err) {
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
self.addEventListener('periodicsync', e => {
  if (e.tag === 'jch-periodic') e.waitUntil(Promise.resolve(doCheck()));
});

// ── RECEPTOR FIREBASE BACKGROUND (El eslabón perdido) ──
messaging.onBackgroundMessage((payload) => {
  console.log('[Service Worker] Paquete FCM recibido en background:', payload);

  // Extraemos los datos enviados desde index.js
  const notificationTitle = payload.notification?.title || payload.data?.title || 'Planificador JCH';
  
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || 'Tienes un recordatorio pendiente.',
    icon: './icon-192.png',
    badge: './icon-192.png',
    vibrate: [500, 200, 500, 200, 800],
    requireInteraction: true,
    data: { 
      url: './index.html', 
      evId: payload.data?.evId 
    },
    tag: 'fcm-jch-' + Date.now() // Etiqueta única para evitar el agrupamiento silencioso de Android
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});
