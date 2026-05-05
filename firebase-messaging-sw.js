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

// ── Recibir lista de recordatorios desde la app ──────────
self.addEventListener('message', function(e) {
    if (!e.data) return;
    if (e.data.type === 'SET_REMINDERS') {
        // Solo almacenar — NO disparar aquí
        // El disparo lo hace check() en la app cuando está abierta,
        // y la Cloud Function cuando está cerrada
        self.__jchReminders = JSON.stringify(e.data.reminders || []);
        console.log('[SW] Reminders almacenados:', (e.data.reminders||[]).length);
    }
    if (e.data.type === 'CHECK_NOW') {
        // Este mensaje lo envía la app cuando quiere forzar un check
        // Solo se usa internamente, no al recibir la lista
        console.log('[SW] CHECK_NOW recibido');
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
