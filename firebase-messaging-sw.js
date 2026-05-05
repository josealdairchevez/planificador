// ═══════════════════════════════════════════════════════════
//  FIREBASE MESSAGING SERVICE WORKER
//  Archivo: firebase-messaging-sw.js
// ═══════════════════════════════════════════════════════════

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

// ── Notificaciones FCM en background/app cerrada ─────────
messaging.onBackgroundMessage(function(payload) {
    console.log('[SW] onBackgroundMessage recibido:', JSON.stringify(payload));
    const title = payload.notification?.title || payload.data?.title || 'Planificador JCH';
    const body  = payload.notification?.body  || payload.data?.body  || 'Recordatorio';
    const evId   = payload.data?.evId   || '';
    const fireAt = payload.data?.fireAt || '';
    const tag    = 'jch-' + (evId || 'fcm') + '-' + (fireAt || Date.now());

    return self.registration.showNotification(title, {
        body,
        icon:    'https://josealdairchevez.github.io/planificador/icon-192.png',
        badge:   'https://josealdairchevez.github.io/planificador/icon-96.png',
        vibrate: [500, 200, 500, 200, 800],
        requireInteraction: true,
        tag,
        renotify: true,
        silent:   false,
        data:    { url: 'https://josealdairchevez.github.io/planificador/', evId, fireAt },
        actions: [
            { action: 'open',    title: '📋 Ver hábitos' },
            { action: 'dismiss', title: 'Cerrar' }
        ]
    });
});

// ── CHECK LOCAL — disparar recordatorios desde el SW ─────
// Funciona aunque la Cloud Function falle
// Se ejecuta cada vez que el SW recibe un push vacío o mensaje interno
function checkLocalReminders() {
    try {
        var reminders = JSON.parse(self.__jchReminders || '[]');
        var now = Date.now();
        var toFire = reminders.filter(function(r) {
            return r.fireAt <= now && r.fireAt >= (now - 300000);
        });
        var rest = reminders.filter(function(r) { return r.fireAt > now; });

        toFire.forEach(function(r) {
            var tag = 'jch-local-' + r.evId + '-' + r.fireAt;
            self.registration.showNotification(r.title || 'Recordatorio', {
                body:    r.body || '¡Es hora de tu hábito!',
                icon:    'https://josealdairchevez.github.io/planificador/icon-192.png',
                badge:   'https://josealdairchevez.github.io/planificador/icon-96.png',
                vibrate: [500, 200, 500, 200, 800],
                requireInteraction: true,
                tag:      tag,
                renotify: true,
                silent:   false,
                data:    { url: 'https://josealdairchevez.github.io/planificador/' }
            });
            console.log('[SW] Local reminder fired:', r.title);
        });

        if (toFire.length > 0) {
            self.__jchReminders = JSON.stringify(rest);
        }
    } catch(e) {
        console.warn('[SW] checkLocalReminders error:', e);
    }
}

// ── Recibir lista de recordatorios desde la app ──────────
self.addEventListener('message', function(e) {
    if (!e.data) return;
    if (e.data.type === 'SET_REMINDERS') {
        self.__jchReminders = JSON.stringify(e.data.reminders || []);
        console.log('[SW] Reminders actualizados:', (e.data.reminders||[]).length);
        // Verificar inmediatamente
        checkLocalReminders();
    }
    if (e.data.type === 'CHECK_NOW') {
        checkLocalReminders();
    }
    if (e.data.type === 'REGISTER_NOTIFICATION_CHANNEL') {
        console.log('[SW] REGISTER_NOTIFICATION_CHANNEL recibido');
    }
});

// ── Al activar el SW ─────────────────────────────────────
self.addEventListener('activate', function(e) {
    console.log('[SW] Activado');
    e.waitUntil(self.clients.claim());
});

// ── Clic en notificación → abrir app ─────────────────────
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
