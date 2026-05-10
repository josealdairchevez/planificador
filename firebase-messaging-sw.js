// ═══════════════════════════════════════════════════════════
//  FIREBASE MESSAGING SERVICE WORKER
//  Archivo: firebase-messaging-sw.js
// ═══════════════════════════════════════════════════════════
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// ── REGISTRAR CANAL DE NOTIFICACIÓN EN ANDROID ───────────
self.addEventListener('activate', function(e) {
    e.waitUntil(
        self.clients.claim().then(function() {
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

// ── Notificaciones en BACKGROUND o APP CERRADA ───────────
messaging.onBackgroundMessage(function(payload) {
    console.log('[SW] onBackgroundMessage recibido:', JSON.stringify(payload));

    const title = (payload.data && payload.data.title) || 'Planificador JCH';
    const body  = (payload.data && payload.data.body)  || 'Tienes un recordatorio';

    const evId   = (payload.data && payload.data.evId)   || '';
    const fireAt = (payload.data && payload.data.fireAt) || '';

    // ── Tag único por hábito + día ──────────────────────────
    const tag = evId && fireAt
        ? 'jch-' + evId + '-' + fireAt
        : 'jch-fcm-' + Date.now();

    // ── Detectar si es hábito para personalizar el botón ───
    const isHabit = evId.startsWith('hab_');
    const actionLabel = isHabit ? '✅ Marcar hecho' : '📋 Ver tarea';

    return self.registration.showNotification(title, {
        body:    body,
        icon:    './icon-192.png',
        badge:   './icon-192.png',
        vibrate: [500, 200, 500, 200, 500, 200, 800],
        requireInteraction: true,
        tag:     tag,
        renotify: true,   // ← CAMBIO CLAVE: forzar mostrar aunque el tag exista
        silent:  false,
        data:    { url: './index.html', evId: evId, fireAt: fireAt },
        actions: [
            { action: 'open',    title: actionLabel },
            { action: 'dismiss', title: '✕ Cerrar'  }
        ]
    });
});

// ── Clic en notificación → abrir app ─────────────────────
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

// ── CRÍTICO: mantener SW activo para mensajes data-only ──
// Necesario para que Android procese notificaciones con app cerrada
self.addEventListener('fetch', function(e) {
    // No interceptar fetches — solo mantener el SW vivo
});
