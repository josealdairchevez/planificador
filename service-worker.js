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

const CACHE_VERSION = 'v41';
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
  // Los avisos de relojes (timer_tick / timer_end) los atiende el manejador de "RELOJES" (listener 'push' más abajo)
  { const _ty = payload && payload.data && payload.data.type; if (_ty === 'timer_tick' || _ty === 'timer_end') return; }

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
function _snapKey(s) { return (s.phase || '') + '|' + (s.running ? 'r' + (s.endTs || s.startTs || 0) : 'p' + s.remaining); }
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

function _timerNotifOpts(rec, live) {
  if (live === undefined) live = true;
  const s = rec.snap || {};
  const pad = n => String(n).padStart(2, '0');
  const hm = ts => new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  const clock = sec => {
    sec = Math.max(0, sec | 0);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = sec % 60;
    return (h ? h + ':' + pad(m) : pad(m)) + ':' + pad(x);
  };
  const pre = rec.desc ? rec.desc + '\n' : '';
  let body, actions;
  if (rec.kind === 'stopwatch' && s.running) {
    // Cronómetro: cuenta hacia arriba. s.startTs = instante de inicio de la toma (ya descontado lo acumulado)
    const up = Math.max(0, Math.floor((Date.now() - s.startTs) / 1000));
    body = pre + (live ? '⏱ ' + clock(up) + ' · Inició a las ' + hm(s.startTs) : '⏱ Inició a las ' + hm(s.startTs) + ' · abre la app para ver el tiempo');
    actions = [{ action: 'stop', title: '⏹ Detener' }];
  } else if (s.running) {
    const left = Math.ceil((s.endTs - Date.now()) / 1000);
    if (left <= 0) { body = pre + '⌛ Terminó a las ' + hm(s.endTs) + ' · abre la app'; actions = []; }
    else {
      body = pre + (live ? '⏳ Quedan ' + clock(left) + ' · Termina a las ' + hm(s.endTs) : '⏳ Termina a las ' + hm(s.endTs) + ' · abre la app para ver la cuenta');
      actions = [{ action: 'pause', title: '⏸ Pausar' }, { action: 'stop', title: '⏹ Detener' }];
    }
  } else {
    body = pre + '⏸ En pausa · quedan ' + clock(s.remaining);
    actions = [{ action: 'resume', title: '▶ Reanudar' }, { action: 'stop', title: '⏹ Detener' }];
  }
  return {
    body, actions,
    icon: './icon-192.png', badge: './icon-192.png',
    tag: 'jch-timer-' + rec.id, renotify: false, silent: true, requireInteraction: true,
    data: { jchTimer: true, id: rec.id, url: './index.html' }
  };
}
const _shownAt = new Map();
async function _showTimerNotif(rec, live) {
  const k0 = _snapKey(rec.snap || {});
  _shownAt.set(rec.id, Date.now());
  const o = _timerNotifOpts(rec, live);
  try { await self.registration.showNotification(rec.title || 'Reloj', o); }
  catch (err) { delete o.actions; try { await self.registration.showNotification(rec.title || 'Reloj', o); } catch (_) {} }
  // Si el reloj se detuvo/limpió mientras se estaba mostrando (el bucle va por segundo), no dejar la notificación viva
  if (typeof _recs !== 'undefined' && !_recs.has(rec.id)) { await _closeTimerNotif(rec.id); return; }
  // Si el estado cambió (pausa/reanudar) mientras se mostraba, lo que quedó en pantalla es el estado viejo: mostrar el actual
  if (typeof _recs !== 'undefined' && _snapKey(rec.snap || {}) !== k0 && _recs.get(rec.id) === rec) await _showTimerNotif(rec, live);
}
async function _closeTimerNotif(id) {
  try { (await self.registration.getNotifications({ tag: 'jch-timer-' + id })).forEach(n => n.close()); } catch (_) {}
}

// ── CUENTA REGRESIVA VIVA ────────────────────────────────────────
// Una notificación web no puede contar sola (eso solo lo hacen las notificaciones nativas de Android), así que el SW
// la reemplaza cada segundo con el tiempo restante calculado con la hora real. El bucle vive dentro de un waitUntil
// (Chrome permite ~5 min por evento y cierra el SW si un evento los excede): cada aviso de la página (JCH_TIMER_PING)
// cede un nuevo tramo de _LOOP_MAX desde ESE instante, así que mientras la página avise la cuenta no se corta, y cuando
// la página se congela (otra app) la cuenta sigue ~_LOOP_MAX más y luego queda solo la hora de fin.
let _LOOP_MAX = 270000;
let _holdAt = 0, _holdUntil = 0, _loopP = null;
const _recs = new Map();
const _endedShown = new Set();
let _loopGen = 0, _loopStart = 0, _loopRunning = false, _lastPing = 0;
const tAll = () => _tx('timers', 'readonly', s => s.getAll());
const _sleepToSecond = () => new Promise(r => setTimeout(r, 1000 - (Date.now() % 1000) + 5));
async function _loadRecs() {
  if (_recs.size) return;
  try { (await tAll() || []).forEach(r => _recs.set(r.id, r)); } catch (_) {}
}
const _runningRecs = () => [..._recs.values()].filter(r => r.snap && r.snap.running);
const _isLive = (r, now) => r.kind === 'stopwatch' || r.snap.endTs > now;      // el cronómetro no termina solo
async function _tickLoop(gen) {
  _loopRunning = true; _loopStart = Date.now();
  try {
    await _loadRecs();
    while (gen === _loopGen && Date.now() < _holdUntil - 1500) {
      const now = Date.now();
      const run = _runningRecs();
      const live = run.filter(r => _isLive(r, now));
      const ended = run.filter(r => r.kind !== 'stopwatch' && r.snap.endTs <= now && r.snap.endTs > now - 3600000 && !_endedShown.has(r.id + '|' + r.snap.endTs));
      ended.forEach(r => _endedShown.add(r.id + '|' + r.snap.endTs));
      await Promise.all(
        live.filter(r => now - (_shownAt.get(r.id) || 0) > 700).map(r => _showTimerNotif(r))
          .concat(ended.map(r => r.alert ? _endAlert(r, null).then(res => { if (res !== 'visible') return _closeTimerNotif(r.id); }) : _showTimerNotif(r)))
      );
      if (!live.length) return;
      await _sleepToSecond();
    }
    // Tramo agotado: si la página no sigue avisando, dejar solo la hora de fin (sin una cuenta que quedaría atrasada)
    if (gen === _loopGen && Date.now() - _lastPing > 4000) {
      const now = Date.now();
      await Promise.all(_runningRecs().filter(r => _isLive(r, now)).map(r => _showTimerNotif(r, false)));
    }
  } finally { if (gen === _loopGen) _loopRunning = false; }
}
function _ensureLoop() {
  const now = Date.now();
  const need = !_loopRunning || now - _holdAt > 15000;      // cada evento retiene al SW como mucho _LOOP_MAX (límite de 5 min de Chrome)
  if (need) { _holdAt = now; _holdUntil = now + _LOOP_MAX; }
  if (!_loopRunning) _loopP = _tickLoop(++_loopGen);
  return need ? Promise.race([_loopP, new Promise(r => setTimeout(r, _LOOP_MAX))]) : Promise.resolve();
}

// ── AVISO DE FIN (Fase 2) ────────────────────────────────────────
// Se muestra con sonido/vibración y etiqueta propia (jch-timer-alert-<id>) para que no lo pise la cuenta regresiva.
// Lo puede disparar el propio SW (si sigue vivo cuando el reloj termina) o el push del servidor (timer_end);
// la clave id|hora-de-fin evita avisar dos veces.
async function _hasVisibleClient() {
  try {
    const cls = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    return cls.some(c => c.visibilityState === 'visible');
  } catch (_) { return false; }
}
const _alertedKeys = new Set();
async function _endAlert(rec, info) {
  const id = rec.id, s = rec.snap || {};
  const base = (info && info.base) || s.endTs;
  const key = id + '|' + base;
  if (_alertedKeys.has(key)) return 'dup';
  const al = (info && info.title) ? info : (rec.alert || {});
  try {
    if (await _hasVisibleClient()) return 'visible';          // con la app a la vista, ella misma avisa
    const tag = 'jch-timer-alert-' + id;
    const old = await self.registration.getNotifications({ tag });
    if (old.some(n => n.data && n.data.key === key)) return 'dup';
    await self.registration.showNotification(al.title || '⏰ Reloj terminado', {
      body: al.body || 'Tu reloj terminó.',
      icon: './icon-192.png', badge: './icon-192.png',
      vibrate: [400, 100, 400, 100, 800],
      requireInteraction: true, tag, renotify: true, silent: false,
      data: { jchTimer: true, ended: true, id, key, url: './index.html' }
    });
    _alertedKeys.add(key);
    return 'shown';
  } catch (_) { return 'err'; }
}
// Chrome exige mostrar algo al recibir un push: si no es para este dispositivo se muestra y se cierra al instante
async function _voidNotif() {
  try {
    await self.registration.showNotification('Planificador JCH', { tag: 'jch-void', silent: true, body: ' ', icon: './icon-192.png' });
    (await self.registration.getNotifications({ tag: 'jch-void' })).forEach(n => n.close());
  } catch (_) {}
}
async function _onTimerPush(d) {
  await _loadRecs();
  const isTick = d.type === 'timer_tick';
  const ids = String(isTick ? (d.ids || d.id || 'pomo') : (d.id || 'pomo')).split(',');
  let handled = false;
  for (const id of ids) {
    let rec = _recs.get(id);
    if (!rec) { try { rec = await tGet(id); } catch (_) {} if (rec) _recs.set(id, rec); }
    if (!rec || !rec.snap) continue;                                // este dispositivo no tiene ese reloj
    const s = rec.snap, now = Date.now();
    if (isTick) {
      handled = true;
      if (!(s.running && s.endTs <= now)) await _showTimerNotif(rec);   // (los ya terminados los avisa el bucle)
    } else {
      const base = Number(d.base) || 0;
      const same = s.running && Math.abs((s.endTs || 0) - base) < 5000;                                 // la página/SW no se enteró: sigue "corriendo"
      const adv  = s.running && (s.endTs || 0) > base + 5000 && (s.phase || '') !== (d.phase || '');    // la página ya pasó a la fase siguiente
      if (!same && !adv) continue;                                  // pausado / detenido / reiniciado: aviso viejo
      handled = true;
      const res = await _endAlert(rec, { title: d.title, body: d.body, base: String(base) });
      if (same && res !== 'visible') { _endedShown.add(id + '|' + s.endTs); await _closeTimerNotif(id); }
    }
  }
  if (isTick) await _ensureLoop();
  if (!handled) await _voidNotif();
}
self.addEventListener('push', e => {
  let d = null;
  try { const p = e.data && e.data.json(); d = p && p.data; } catch (_) {}
  if (!d || (d.type !== 'timer_tick' && d.type !== 'timer_end')) return;
  const w = _onTimerPush(d).catch(() => {});
  self._jchLastPush = w;                                            // (pruebas)
  e.waitUntil(w);
});

self.addEventListener('message', e => {
  const d = e.data;
  if (!d) return;
  if (d.type === 'JCH_TIMER_NOTIFY' && d.rec && d.rec.id) {
    const prev = _recs.get(d.rec.id);
    const same = !!prev && prev.title === d.rec.title && prev.desc === d.rec.desc && _snapKey(prev.snap || {}) === _snapKey(d.rec.snap || {});
    _recs.set(d.rec.id, d.rec); _lastPing = Date.now();
    e.waitUntil(tPut(d.rec).then(() => same ? null : _showTimerNotif(d.rec)).then(() => _ensureLoop()).catch(() => {}));
  } else if (d.type === 'JCH_TIMER_DONE' && d.id) {
    // La página terminó el reloj (con la app oculta/en otra app): avisar con sonido y retirar la cuenta regresiva
    e.waitUntil((async () => {
      let rec = _recs.get(d.id);
      if (!rec) { try { rec = await tGet(d.id); } catch (_) {} }
      if (rec && rec.snap && rec.snap.running && rec.kind !== 'stopwatch') { if (d.alert) rec.alert = d.alert; await _endAlert(rec, null); }
      _recs.delete(d.id); try { await tDel(d.id); } catch (_) {}
      await _closeTimerNotif(d.id);
    })().catch(() => {}));
  } else if (d.type === 'JCH_TIMER_CLEAR_ALL') {
    // El usuario apagó las notificaciones de relojes: borrar relojes, acciones pendientes y notificaciones visibles
    _recs.clear();
    e.waitUntil((async () => {
      try { const all = await tAll(); for (const r of all) { try { await tDel(r.id); } catch (_) {} } } catch (_) {}
      try { await _tx('pending', 'readwrite', s => s.clear()); } catch (_) {}
      try { (await self.registration.getNotifications()).forEach(n => { const t = n.tag || ''; if (t.indexOf('jch-timer-') === 0) n.close(); }); } catch (_) {}
    })().catch(() => {}));
  } else if (d.type === 'JCH_TIMER_CLEAR' && d.id) {
    _recs.delete(d.id);
    e.waitUntil(tDel(d.id).then(() => _closeTimerNotif(d.id)).catch(() => {}));
  } else if (d.type === 'JCH_TIMER_PING') {
    _lastPing = Date.now();
    e.waitUntil(_loadRecs().then(() => _ensureLoop()).catch(() => {}));
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
  if (d.ended) {                                                   // aviso de fin: solo abrir la app (no volver a mostrar la cuenta)
    try { n.close(); } catch (_) {}
    const w = _focusOrOpenApp(); self._jchLastClick = w;
    try { e.waitUntil(w); } catch (_) {}
    return;
  }
  const id = d.id, action = e.action || '';
  const at = Date.now();
  // Android/Chrome retiran la notificación al tocarla (también un botón) y desde JS no se puede impedir. Para que no se note,
  // NO se cierra ni se espera nada: lo primero es volver a mostrar la MISMA notificación (mismo tag) ya con el estado nuevo,
  // calculado en memoria. Después se guarda, se avisa a la app o se deja la acción pendiente.
  const work = (async () => {
    let rec = _recs.get(id) || null;
    if (!rec) { try { rec = await tGet(id); } catch (_) {} if (rec) _recs.set(id, rec); }   // SW recién despertado
    const isAct = action === 'pause' || action === 'resume' || action === 'stop';
    let applied = false, from = '';
    if (isAct && rec) {
      from = _snapKey(rec.snap || {});
      if (action === 'stop') { _recs.delete(id); applied = true; }
      else { const ns = _snapApply(rec.snap || {}, action, at); if (ns) { rec.snap = ns; applied = true; } }
    }
    // 1) volver a mostrar ya (pausa / reanudar / toque en el cuerpo); en "detener" se cierra
    if (rec && action !== 'stop' && (applied || !isAct)) await _showTimerNotif(rec);
    if (action === 'stop') { try { n.close(); } catch (_) {} await _closeTimerNotif(id); }
    // 2) persistir
    if (rec && applied) { try { if (action === 'stop') await tDel(id); else await tPut(rec); } catch (_) {} }
    const cls = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (isAct) {
      // App abierta (aunque en segundo plano): ella aplica la acción con la hora real del toque.
      cls.forEach(c => { try { c.postMessage({ type: 'JCH_TIMER_ACTION', id, action, at }); } catch (_) {} });
      // App cerrada: se deja pendiente para aplicarla al abrir
      if (applied && !cls.length) { try { await pAdd({ id, action, at, from }); } catch (_) {} }
      if (rec && action !== 'stop' && !applied) await _focusOrOpenApp();   // el reloj ya había terminado: abrir la app
      return;
    }
    // Toque en el cuerpo: abrir/enfocar la app
    await _focusOrOpenApp();
  })();
  self._jchLastClick = work;                                      // (pruebas)
  try { e.waitUntil(work.then(() => _ensureLoop()).catch(() => {})); } catch (_) {}
});
