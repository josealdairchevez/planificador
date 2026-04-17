// ═══════════════════════════════════════════════════
//  SERVICE WORKER v3 — Planificador JCH
//  - Cache de archivos
//  - Alarmas en background (funciona con app cerrada)
// ═══════════════════════════════════════════════════

const CACHE_VERSION = 'v3';
const CACHE_NAME = 'planificador-jch-' + CACHE_VERSION;

const ASSETS = [
  './splash.html',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

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

// ═══ SISTEMA DE ALARMAS EN BACKGROUND ═══════════════
let _reminders = [];
let _checkTimer = null;

// Recibir recordatorios desde la app
self.addEventListener('message', e => {
  if (!e.data) return;
  if (e.data.type === 'SET_REMINDERS' || e.data.type === 'UPDATE_REMINDERS') {
    _reminders = e.data.reminders || [];
    scheduleCheck();
  }
});

function scheduleCheck() {
  if (_checkTimer) clearTimeout(_checkTimer);
  checkReminders();
  _checkTimer = setTimeout(scheduleCheck, 25000);
}

function checkReminders() {
  const now = Date.now();
  const toFire = _reminders.filter(r => r.fireAt <= now + 12000);
  _reminders = _reminders.filter(r => r.fireAt > now + 12000);
  toFire.forEach(r => fireNotif(r.title, r.body));
}

function fireNotif(title, body) {
  self.registration.showNotification(title, {
    body: body,
    icon: './icon-192.png',
    badge: './icon-192.png',
    vibrate: [400, 100, 400, 100, 800],
    requireInteraction: true,
    tag: 'jch-' + Date.now()
  }).catch(() => {
    self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(clients => {
      clients.forEach(c => c.postMessage({ type: 'FIRE_REMINDER', title, body }));
    });
  });
}

self.addEventListener('sync', e => {
  if (e.tag === 'jch-reminder-check') e.waitUntil(Promise.resolve(checkReminders()));
});

self.addEventListener('periodicsync', e => {
  if (e.tag === 'jch-reminder-periodic') e.waitUntil(Promise.resolve(checkReminders()));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const c of clients) {
        if (c.url.includes('planificador') && 'focus' in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./index.html');
    })
  );
});
