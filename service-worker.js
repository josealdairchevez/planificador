// SERVICE WORKER v3 — Planificador JCH
const CACHE_VERSION = 'v3';
const CACHE_NAME = 'planificador-jch-' + CACHE_VERSION;
const ASSETS = ['./splash.html','./index.html','./manifest.json','./icon-192.png','./icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
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

// ── ALARMAS EN BACKGROUND ────────────────────────────────────
let _rem = [];
let _timer = null;

self.addEventListener('message', e => {
  if (!e.data) return;
  if (e.data.type === 'SET_REMINDERS' || e.data.type === 'UPDATE_REMINDERS') {
    _rem = e.data.reminders || [];
    sched();
  }
});

function sched() {
  if (_timer) clearTimeout(_timer);
  check();
  _timer = setTimeout(sched, 25000);
}

function check() {
  const now = Date.now();
  const fire = _rem.filter(r => r.fireAt <= now + 12000);
  _rem = _rem.filter(r => r.fireAt > now + 12000);
  fire.forEach(r => show(r.title, r.body));
}

function show(title, body) {
  self.registration.showNotification(title, {
    body, icon: './icon-192.png', badge: './icon-192.png',
    vibrate: [400,100,400,100,800], requireInteraction: true,
    tag: 'jch-' + Date.now()
  }).catch(() => {
    self.clients.matchAll({includeUncontrolled:true,type:'window'}).then(clients => {
      clients.forEach(c => c.postMessage({type:'FIRE_REMINDER', title, body}));
    });
  });
}

self.addEventListener('sync', e => {
  if (e.tag === 'jch-check') e.waitUntil(Promise.resolve(check()));
});

self.addEventListener('periodicsync', e => {
  if (e.tag === 'jch-periodic') e.waitUntil(Promise.resolve(check()));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients => {
      for (const c of clients) {
        if (c.url.includes('planificador') && 'focus' in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./index.html');
    })
  );
});
