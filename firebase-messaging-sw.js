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

// ÚNICO MANEJADOR PARA SEGUNDO PLANO (Recomendado por Firebase)
messaging.onBackgroundMessage(function(payload) {
    console.log('[SW] onBackgroundMessage recibido:', payload);

    var d = payload.data || {};
    var title  = d.title  || 'Planificador JCH';
    var body   = d.body   || 'Tienes un recordatorio';
    var evId   = d.evId   || '';
    var fireAt = d.fireAt || '';
    var isHabit = evId.startsWith('hab_');

    // Agregar hora al body si es hábito y el body no tiene ya la hora
    if (isHabit && fireAt && body.indexOf('⏰') === -1) {
        var hora = fmtHora(fireAt);
        if (hora) body = '⏰ ' + hora + ' · ' + body;
    }

    var tag = fireAt ? ('jch-notif-' + evId + '-' + fireAt) : ('jch-push-' + evId + '-' + Date.now());

    const notificationOptions = {
        body:    body,
        icon:    './icon-192.png',
        badge:   './icon-192.png',
        vibrate: [500, 200, 500, 200, 500, 200, 800],
        requireInteraction: true,
        tag:     tag,
        renotify: false,
        data:    { url: './index.html', evId: evId, fireAt: fireAt },
        actions: [
            { action: 'open',    title: isHabit ? '✅ Marcar hecho' : '📋 Ver tarea' },
            { action: 'dismiss', title: '✕ Cerrar' }
        ]
    };

    // Es crucial usar el return aquí para que Android espere a que se construya la alerta
    return self.registration.showNotification(title, notificationOptions);
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
