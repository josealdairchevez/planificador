// ═══════════════════════════════════════════════════════════
//  FIREBASE MESSAGING SERVICE WORKER
//  Archivo: firebase-messaging-sw.js
// ═══════════════════════════════════════════════════════════
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

self.addEventListener('install', function(e) {
    self.skipWaiting();
});

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

// ── Flag para evitar doble notificación ──────────────────
// onBackgroundMessage y el evento push nativo pueden disparar
// juntos en algunos dispositivos Android — este flag evita duplicados
var _notifShownKeys = {};

// ── Función para obtener hora local del recordatorio ─────
function _getHoraLocal(fireAt) {
    if (!fireAt) return '';
    try {
        var fecha = new Date(parseInt(fireAt));
        var hh = String(fecha.getHours()).padStart(2, '0');
        var mm = String(fecha.getMinutes()).padStart(2, '0');
        return ' · ' + hh + ':' + mm;
    } catch(e) { return ''; }
}

// ── Notificaciones en BACKGROUND o APP CERRADA ───────────
messaging.onBackgroundMessage(function(payload) {
    console.log('[SW] onBackgroundMessage recibido:', JSON.stringify(payload));

    var title  = (payload.data && payload.data.title) || 'Planificador JCH';
    var body   = (payload.data && payload.data.body)  || 'Tienes un recordatorio';
    var evId   = (payload.data && payload.data.evId)  || '';
    var fireAt = (payload.data && payload.data.fireAt) || '';

    // ── Marcar esta notificación como ya mostrada (anti-duplicado) ──
    var dedupeKey = evId + '-' + fireAt;
    if (_notifShownKeys[dedupeKey]) {
        console.log('[SW] Notificación ya mostrada, ignorando duplicado:', dedupeKey);
        return;
    }
    _notifShownKeys[dedupeKey] = true;
    // Limpiar la key después de 10 segundos
    setTimeout(function() { delete _notifShownKeys[dedupeKey]; }, 10000);

    var isHabit     = evId.startsWith('hab_');
    var actionLabel = isHabit ? '✅ Marcar hecho' : '📋 Ver tarea';
    var horaStr     = _getHoraLocal(fireAt);
    var tag         = 'jch-' + evId + '-' + Date.now();

    return self.registration.showNotification(title, {
        body:               body + horaStr,
        icon:               './icon-192.png',
        badge:              './icon-192.png',
        vibrate:            [500, 200, 500, 200, 500, 200, 800],
        requireInteraction: true,
        tag:                tag,
        renotify:           true,
        silent:             false,
        timestamp:          Date.now(),
        data:               { url: './index.html', evId: evId, fireAt: fireAt },
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
self.addEventListener('fetch', function(e) {
    // No interceptar — solo mantener el SW vivo en Android
});

// ── Push directo (fallback si onBackgroundMessage no dispara) ─
self.addEventListener('push', function(e) {
    if (!e.data) return;
    var data = {};
    try { data = e.data.json(); } catch(err) { return; }

    // Si tiene bloque notification, Firebase lo maneja solo
    if (data.notification) return;

    var d      = data.data || {};
    var evId   = d.evId   || '';
    var fireAt = d.fireAt  || '';

    // ── Anti-duplicado: si onBackgroundMessage ya lo mostró, ignorar ──
    var dedupeKey = evId + '-' + fireAt;
    if (_notifShownKeys[dedupeKey]) {
        console.log('[SW] push ignorado — ya mostrado por onBackgroundMessage:', dedupeKey);
        return;
    }
    _notifShownKeys[dedupeKey] = true;
    setTimeout(function() { delete _notifShownKeys[dedupeKey]; }, 10000);

    var title   = d.title || 'Planificador JCH';
    var body    = d.body  || 'Tienes un recordatorio';
    var horaStr = _getHoraLocal(fireAt);
    var isHabit = evId.startsWith('hab_');

    e.waitUntil(
        self.registration.showNotification(title, {
            body:               body + horaStr,
            icon:               './icon-192.png',
            badge:              './icon-192.png',
            vibrate:            [500, 200, 500, 200, 800],
            requireInteraction: true,
            tag:                'jch-push-' + evId + '-' + Date.now(),
            renotify:           true,
            silent:             false,
            data:               { url: './index.html', evId: evId },
            actions: [
                { action: 'open',    title: isHabit ? '✅ Marcar hecho' : '📋 Ver tarea' },
                { action: 'dismiss', title: '✕ Cerrar' }
            ]
        })
    );
});
