// ═══════════════════════════════════════════════════
//  SERVICE WORKER v4 — Planificador JCH
//  Soporta notificaciones programadas (showTrigger)
//  y alarmas en background via timer del SW
// ═══════════════════════════════════════════════════

const CACHE_VERSION = 'v4';
const CACHE_NAME = 'planificador-jch-' + CACHE_VERSION;
const ASSETS = ['./splash.html','./index.html','./manifest.json','./icon-192.png','./icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
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

// ── NOTIFICACIONES PROGRAMADAS (showTrigger) ─────────────────
// La app envía los recordatorios. El SW los programa usando
// TimestampTrigger — el SO los dispara aunque la app esté cerrada.
self.addEventListener('message', async e => {
  if (!e.data) return;

  if (e.data.type === 'SCHEDULE_NOTIFICATIONS') {
    const reminders = e.data.reminders || [];

    // Cancelar todas las notificaciones programadas anteriores del tag jch-*
    try {
      const scheduled = await self.registration.getNotifications({ tag: 'jch-scheduled' });
      scheduled.forEach(n => n.close());
    } catch(_) {}

    // Programar cada recordatorio con TimestampTrigger si está disponible
    for (const r of reminders) {
      const msUntilFire = r.fireAt - Date.now();
      if (msUntilFire < -60000) continue; // ya pasó

      const opts = {
        body: r.body,
        icon: './icon-192.png',
        badge: './icon-192.png',
        vibrate: [400, 100, 400, 100, 800],
        requireInteraction: true,
        tag: 'jch-' + r.evId + '-' + r.fireAt,
        data: { url: './index.html' }
      };

      // showTrigger: programa la notificación en el SO (funciona con app cerrada)
      if ('TimestampTrigger' in self) {
        opts.showTrigger = new TimestampTrigger(r.fireAt);
      }

      try {
        await self.registration.showNotification(r.title, opts);
      } catch(err) {
        // Si falla showTrigger, intentar sin trigger (mostrará inmediatamente si ya es la hora)
        delete opts.showTrigger;
        try { await self.registration.showNotification(r.title, opts); } catch(_) {}
      }
    }
  }

  // Fallback: timer interno para cuando la app está abierta
  if (e.data.type === 'SET_REMINDERS') {
    _mem = e.data.reminders || [];
    schedCheck();
  }
});

// ── TIMER FALLBACK (app abierta o SW recién activo) ──────────
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
      body: r.body, icon: './icon-192.png', badge: './icon-192.png',
      vibrate: [400,100,400,100,800], requireInteraction: true,
      tag: 'jch-fire-' + Date.now()
    }).catch(() => {});
  });
}

// ── CLICK EN NOTIFICACIÓN → abrir app ────────────────────────
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

// ── PERIODIC SYNC (reactivar SW periódicamente) ───────────────
self.addEventListener('periodicsync', e => {
  if (e.tag === 'jch-periodic') e.waitUntil(Promise.resolve(doCheck()));
});
