importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

self.addEventListener('install', function(e) { self.skipWaiting(); });
self.addEventListener('activate', function(e) { e.waitUntil(self.clients.claim()); });

firebase.initializeApp({
    apiKey: "AIzaSyAKsILLuBeu6AXGzMICQtfIULL6-tMs5IE",
    authDomain: "mi-planificador-86095.firebaseapp.com",
    projectId: "mi-planificador-86095",
    storageBucket: "mi-planificador-86095.firebasestorage.app",
    messagingSenderId: "469097705640",
    appId: "1:469097705640:web:7df14de48ff7d625dc529d"
});

const messaging = firebase.messaging();

// Helper: formatear timestamp a hora local
function fmtHora(fireAt) {
    if (!fireAt) return '';
    try {
        var d = new Date(parseInt(fireAt));
        var h = String(d.getHours()).padStart(2,'0');
        var m = String(d.getMinutes()).padStart(2,'0');
        return h + ':' + m;
    } catch(e) { return ''; }
}

messaging.onBackgroundMessage(function(payload) {
    console.log('[SW] onBackgroundMessage:', payload.data && payload.data.evId);

    var title  = (payload.data && payload.data.title) || 'Planificador JCH';
    var body   = (payload.data && payload.data.body)  || 'Tienes un recordatorio';
    var evId   = (payload.data && payload.data.evId)  || '';
    var fireAt = (payload.data && payload.data.fireAt)|| '';
    var isHabit = evId.startsWith('hab_');

    // Agregar hora al body si es hábito y el body no tiene ya la hora
    if (isHabit && fireAt && body.indexOf('⏰') === -1) {
        var hora = fmtHora(fireAt);
        if (hora) body = '⏰ ' + hora + ' · ' + body;
    }

    // Tag fijo para deduplicar con check() del HTML
    var tag = 'jch-notif-' + evId + '-' + fireAt;

    return self.registration.showNotification(title, {
        body:    body,
        icon:    './icon-192.png',
        badge:   './icon-192.png',
        vibrate: [500, 200, 500, 200, 500, 200, 800],
        requireInteraction: true,
        tag:     tag,
        renotify: false,
        silent:  false,
        timestamp: Date.now(),
        data:    { url: './index.html', evId: evId, fireAt: fireAt },
        actions: [
            { action: 'open',    title: isHabit ? '✅ Marcar hecho' : '📋 Ver tarea' },
            { action: 'dismiss', title: '✕ Cerrar' }
        ]
    });
});

self.addEventListener('notificationclick', function(e) {
    e.notification.close();
    if (e.action === 'dismiss') return;
    e.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(cs) {
            for (var c of cs) {
                if (c.url.includes('planificador') && 'focus' in c) return c.focus();
            }
            if (clients.openWindow) return clients.openWindow('./index.html');
        })
    );
});

self.addEventListener('fetch', function(e) {});

self.addEventListener('push', function(e) {
    if (!e.data) return;
    var data = {};
    try { data = e.data.json(); } catch(err) { return; }
    if (data.notification) return;

    var d      = data.data || {};
    var title  = d.title  || 'Planificador JCH';
    var body   = d.body   || 'Tienes un recordatorio';
    var evId   = d.evId   || '';
    var fireAt = d.fireAt || '';
    var isHabit = evId.startsWith('hab_');

    // Agregar hora si no la tiene
    if (isHabit && fireAt && body.indexOf('⏰') === -1) {
        var hora = fmtHora(fireAt);
        if (hora) body = '⏰ ' + hora + ' · ' + body;
    }

    var tag = fireAt ? ('jch-notif-' + evId + '-' + fireAt) : ('jch-push-' + evId + '-' + Date.now());

    e.waitUntil(
        self.registration.showNotification(title, {
            body:    body,
            icon:    './icon-192.png',
            badge:   './icon-192.png',
            vibrate: [500, 200, 500, 200, 800],
            requireInteraction: true,
            tag:     tag,
            renotify: false,
            silent:  false,
            data:    { url: './index.html', evId: evId },
            actions: [
                { action: 'open',    title: isHabit ? '✅ Marcar hecho' : '📋 Ver tarea' },
                { action: 'dismiss', title: '✕ Cerrar' }
            ]
        })
    );
});
