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

// ── CLAVE: manejar notificaciones en segundo plano / app cerrada ──
messaging.onBackgroundMessage(function(payload) {
    console.log('[FCM-SW] Mensaje en background:', payload);

    // Extraer datos del mensaje (soporta notification y data)
    const title = (payload.notification && payload.notification.title)
        || (payload.data && payload.data.title)
        || '⏰ Recordatorio';

    const body = (payload.notification && payload.notification.body)
        || (payload.data && payload.data.body)
        || 'Tienes un hábito pendiente';

    const icon = (payload.notification && payload.notification.icon)
        || './icon-192.png';

    const notificationOptions = {
        body: body,
        icon: icon,
        badge: './icon-192.png',
        vibrate: [400, 100, 400, 100, 800],
        requireInteraction: true,
        tag: 'jch-reminder-' + Date.now(),
        data: {
            url: './index.html',
            payload: payload
        },
        actions: [
            { action: 'open', title: '📋 Abrir app' },
            { action: 'dismiss', title: '✕ Cerrar' }
        ]
    };

    return self.registration.showNotification(title, notificationOptions);
});

// ── Click en la notificación → abrir app ──
self.addEventListener('notificationclick', function(e) {
    e.notification.close();
    if (e.action === 'dismiss') return;

    e.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(function(cs) {
                for (var c of cs) {
                    if (c.url.includes('planificador') && 'focus' in c) return c.focus();
                }
                if (clients.openWindow) return clients.openWindow('./index.html');
            })
    );
});
