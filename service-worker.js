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

const CACHE_VERSION = 'v34';
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
  // Las notificaciones de relojes (Pomodoro, etc.) las atiende el manejador de "RELOJES" más abajo
  if (e.notification && e.notification.data && e.notification.data.jchTimer) return;
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

// ═══════════════════════════════════════════════════════════════
//  RELOJES — notificación persistente con botones (Fase 1: Pomodoro)
//  La página envía el estado del reloj (JCH_TIMER_NOTIFY); aquí se guarda en IndexedDB
//  y se muestra una notificación con título, descripción y botones Pausar / Reanudar / Detener.
//  Si se toca un botón con la app cerrada, el SW aplica la acción sobre el estado guardado
//  (con la hora real del toque) y deja la acción pendiente para que la app la aplique al abrir.
// ═══════════════════════════════════════════════════════════════
const JCH_TDB = 'jch_timers_v1';
function _tdb() {
  return new Promise((res, rej) => {
    const rq = indexedDB.open(JCH_TDB, 1);
    rq.onupgradeneeded = () => {
      const d = rq.result;
      if (!d.objectStoreNames.contains('timers'))  d.createObjectStore('timers',  { keyPath: 'id' });
      if (!d.objectStoreNames.contains('pending')) d.createObjectStore('pending', { keyPath: 'k', autoIncrement: true });
    };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}
function _tx(store, mode, fn) {
  return _tdb().then(db => new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => { db.close(); res(r && r.result); };
    t.onerror = t.onabort = () => { db.close(); rej(t.error); };
  }));
}
const tGet = id  => _tx('timers',  'readonly',  s => s.get(id));
const tPut = rec => _tx('timers',  'readwrite', s => s.put(rec));
const tDel = id  => _tx('timers',  'readwrite', s => s.delete(id));
const pAdd = p   => _tx('pending', 'readwrite', s => s.add(p));

// Identifica el estado de un reloj (la acción pendiente solo se aplica si la app sigue en ese mismo estado)
function _snapKey(s) { return (s.phase || '') + '|' + (s.running ? 'r' + s.endTs : 'p' + s.remaining); }
// Misma matemática que _pomoSnapApply() de la página. Devuelve el nuevo estado o null si no hay cambio.
function _snapApply(s, action, at) {
  s = Object.assign({}, s);
  if (action === 'pause') {
    if (!s.running || s.endTs <= at) return null;            // ya había terminado antes del toque
    s.remaining = Math.max(0, Math.ceil((s.endTs - at) / 1000)); s.running = false; s.endTs = 0; return s;
  }
  if (action === 'resume') {
    if (s.running) return null;
    if (!(s.remaining > 0)) s.remaining = s.total;
    s.running = true; s.endTs = at + s.remaining * 1000; return s;
  }
  return null;
}

function _timerNotifOpts(rec) {
  const s = rec.snap || {};
  const hm = ts => new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  const mmss = sec => { sec = Math.max(0, sec | 0); return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0'); };
  const pre = rec.desc ? rec.desc + ' · ' : '';
  const body = s.running ? pre + 'Termina a las ' + hm(s.endTs) : pre + '⏸ En pausa · quedan ' + mmss(s.remaining);
  const actions = s.running
    ? [{ action: 'pause', title: '⏸ Pausar' },   { action: 'stop', title: '⏹ Detener' }]
    : [{ action: 'resume', title: '▶ Reanudar' }, { action: 'stop', title: '⏹ Detener' }];
  return {
    body, actions,
    icon: './icon-192.png', badge: './icon-192.png',
    tag: 'jch-timer-' + rec.id, renotify: false, silent: true, requireInteraction: true,
    data: { jchTimer: true, id: rec.id, url: './index.html' }
  };
}
async function _showTimerNotif(rec) {
  const o = _timerNotifOpts(rec);
  try { await self.registration.showNotification(rec.title || 'Reloj', o); }
  catch (err) { delete o.actions; try { await self.registration.showNotification(rec.title || 'Reloj', o); } catch (_) {} }
}
async function _closeTimerNotif(id) {
  try { (await self.registration.getNotifications({ tag: 'jch-timer-' + id })).forEach(n => n.close()); } catch (_) {}
}

self.addEventListener('message', e => {
  const d = e.data;
  if (!d) return;
  if (d.type === 'JCH_TIMER_NOTIFY' && d.rec && d.rec.id) {
    e.waitUntil(tPut(d.rec).then(() => _showTimerNotif(d.rec)).catch(() => {}));
  } else if (d.type === 'JCH_TIMER_CLEAR' && d.id) {
    e.waitUntil(tDel(d.id).then(() => _closeTimerNotif(d.id)).catch(() => {}));
  }
});

async function _focusOrOpenApp() {
  try {
    const cls = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of cls) { if (c.url.includes('planificador') && 'focus' in c) return await c.focus(); }
    if (cls.length && 'focus' in cls[0]) return await cls[0].focus();
    if (self.clients.openWindow) return await self.clients.openWindow('./index.html');
  } catch (_) {}
}

self.addEventListener('notificationclick', e => {
  const n = e.notification, d = (n && n.data) || {};
  if (!d.jchTimer) return;
  n.close();
  const id = d.id, action = e.action || '';
  const work = (async () => {
    const at = Date.now();
    let rec = null;
    try { rec = await tGet(id); } catch (_) {}
    const cls = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    if (action === 'pause' || action === 'resume' || action === 'stop') {
      let applied = false, from = '';
      if (rec) {
        from = _snapKey(rec.snap || {});
        if (action === 'stop') { await tDel(id); applied = true; }
        else {
          const ns = _snapApply(rec.snap || {}, action, at);
          if (ns) { rec.snap = ns; await tPut(rec); applied = true; }
        }
      }
      // App abierta (aunque en segundo plano): ella aplica la acción con la hora real del toque.
      cls.forEach(c => { try { c.postMessage({ type: 'JCH_TIMER_ACTION', id, action, at }); } catch (_) {} });
      // App cerrada: se deja pendiente para aplicarla al abrir
      if (applied && !cls.length) { try { await pAdd({ id, action, at, from }); } catch (_) {} }
      if (rec && action !== 'stop') {
        if (applied) await _showTimerNotif(rec);
        else await _focusOrOpenApp();                             // el reloj ya había terminado: abrir la app
      }
      return;
    }
    // Toque en el cuerpo: abrir/enfocar la app y mantener la notificación
    await _focusOrOpenApp();
    if (rec) await _showTimerNotif(rec);
  })();
  self._jchLastClick = work;                                      // (pruebas)
  try { e.waitUntil(work); } catch (_) {}
});
