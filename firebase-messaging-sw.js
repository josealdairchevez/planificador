// ═══════════════════════════════════════════════════════════
//  FIREBASE MESSAGING SERVICE WORKER
//  Archivo: firebase-messaging-sw.js
// ═══════════════════════════════════════════════════════════

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// ── REGISTRAR CANAL DE NOTIFICACIÓN EN ANDROID ───────────
// Esto crea la categoría "Recordatorios JCH" visible en
// Ajustes → Aplicaciones → Planificador JCH → Notificaciones
self.addEventListener('activate', function(e) {
    e.waitUntil(
        self.clients.claim().then(function() {
            // Notificar a todos los clientes para que registren el canal
            return self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
                .then(function(clients) {
                    clients.forEach(function(client) {
                        client.postMessage({ type: 'REGISTER_NOTIFICATION_CHANNEL' });
                    });
                });
        })
    );
});

firebase.initializeApp({
    apiKey: "AIzaSyAKsILLuBeu6AXGzMICQtfIULL6-tMs5IE",
    authDomain: "mi-planificador-86095.firebaseapp.com",
    projectId: "mi-planificador-86095",
    storageBucket: "mi-planificador-86095.firebasestorage.app",
    messagingSenderId: "469097705640",
    appId: "1:469097705640:web:7df14de48ff7d625dc529d"
});

const messaging = firebase.messaging();

// Notificaciones en BACKGROUND o CERRADA
messaging.onBackgroundMessage(function(payload) {
    const title = payload.notification?.title || payload.data?.title || 'Planificador JCH';
    const body  = payload.notification?.body  || payload.data?.body  || 'Recordatorio';
    
    // Tag SIEMPRE único con timestamp para que SIEMPRE suene aunque ya haya sonado antes
    const evId   = payload.data?.evId   || '';
    const fireAt = payload.data?.fireAt || '';
    const tag    = 'jch-' + (evId || 'fcm') + '-' + (fireAt || Date.now());

    return self.registration.showNotification(title, {
        body:    body,
        icon:    'https://josealdairchevez.github.io/planificador/icon-192.png',
        badge:   'https://josealdairchevez.github.io/planificador/icon-96.png',
        vibrate: [500, 200, 500, 200, 500, 200, 800],
        requireInteraction: true,
        tag:      tag,
        renotify: true,   // FIX: siempre mostrar aunque el tag sea el mismo
        silent:   false,
        data:    { url: 'https://josealdairchevez.github.io/planificador/', evId: evId, fireAt: fireAt },
        actions: [
            { action: 'open',    title: '📋 Ver hábitos' },
            { action: 'dismiss', title: 'Cerrar'         }
        ]
    });
});

// Clic en notificación → abrir app
self.addEventListener('notificationclick', function(e) {
    e.notification.close();
    if (e.action === 'dismiss') return;
    const targetUrl = (e.notification.data && e.notification.data.url)
        ? e.notification.data.url
        : 'https://josealdairchevez.github.io/planificador/';
    e.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(cs) {
            for (var c of cs) {
                if (c.url.includes('planificador') && 'focus' in c) return c.focus();
            }
            if (clients.openWindow) return clients.openWindow(targetUrl);
        })
    );
});
