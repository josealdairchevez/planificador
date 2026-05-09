// ═══════════════════════════════════════════════════════════
//  FIREBASE MESSAGING SERVICE WORKER — con programación local
//  Archivo: firebase-messaging-sw.js
// ═══════════════════════════════════════════════════════════
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// ── Almacén de timers programados localmente ─────────────
var _scheduledTimers = {}; // evId → timerId

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

// ═══════════════════════════════════════════════════════════
// PROGRAMACIÓN LOCAL DE NOTIFICACIONES
// Recibe los recordatorios desde la app y los programa con
// setTimeout para que suenen aunque la app esté cerrada
// ═══════════════════════════════════════════════════════════
self.addEventListener('message', function(e) {
    if (!e.data || e.data.type !== 'SCHEDULE_REMINDERS') return;

    var reminders = e.data.reminders || [];
    var now = Date.now();

    console.log('[SW] SCHEDULE_REMINDERS recibido: ' + reminders.length + ' recordatorios');

    // Cancelar timers anteriores para evitar duplicados
    Object.keys(_scheduledTimers).forEach(function(key) {
        clearTimeout(_scheduledTimers[key]);
        delete _scheduledTimers[key];
    });

    // Programar cada recordatorio
    reminders.forEach(function(r) {
        if (!r.evId || !r.fireAt) return;

        var delay = r.fireAt - now;

        // Solo programar futuros (con tolerancia de 30 segundos hacia atrás)
        if (delay < -30000) {
            console.log('[SW] Ignorando recordatorio pasado: ' + r.evId + ' delay=' + delay);
            return;
        }

        // Si ya pasó pero hace menos de 30s, disparar en 1s
        if (delay < 0) delay = 1000;

        var title = r.title || 'Planificador JCH';
        var body  = r.body  || '¡Es hora de tu hábito diario!';
        var evId  = r.evId;

        console.log('[SW] Programando: ' + evId + ' en ' + Math.round(delay/1000) + 's → ' + new Date(r.fireAt).toLocaleTimeString());

        _scheduledTimers[evId] = setTimeout(function() {
            var tag = 'jch-' + evId + '-' + r.fireAt;
            self.registration.showNotification(title, {
                body:             body,
                icon:             './icon-192.png',
                badge:            './icon-192.png',
                vibrate:          [500, 200, 500, 200, 500, 200, 800],
                requireInteraction: true,
                tag:              tag,
                renotify:         true,
                silent:           false,
                timestamp:        Date.now(),
                data:             { url: './index.html', evId: evId, fireAt: r.fireAt },
                actions: [
                    { action: 'open',    title: '✅ Marcar hecho' },
                    { action: 'dismiss', title: '✕ Cerrar' }
                ]
            }).then(function() {
                console.log('[SW] Notificación mostrada: ' + evId);
                // Reprogramar para el día siguiente
                var tmr = _scheduledTimers[evId];
                _scheduledTimers[evId] = setTimeout(function() {
                    self.registration.showNotification(title, {
                        body: body, icon: './icon-192.png', badge: './icon-192.png',
                        vibrate: [500,200,500,200,800], requireInteraction: true,
                        tag: 'jch-'+evId+'-'+String(r.fireAt+86400000),
                        renotify: true, silent: false,
                        data: { url: './index.html', evId: evId }
                    });
                }, 86400000); // repetir cada 24h
            }).catch(function(err) {
                console.warn('[SW] Error mostrando notificación:', err);
            });

            delete _scheduledTimers[evId];
        }, delay);
    });
});

// ── Notificaciones en BACKGROUND o APP CERRADA ───────────
messaging.onBackgroundMessage(function(payload) {
    console.log('[SW] onBackgroundMessage recibido:', JSON.stringify(payload));

    var title  = (payload.data && payload.data.title) || 'Planificador JCH';
    var body   = (payload.data && payload.data.body)  || 'Tienes un recordatorio';
    var evId   = (payload.data && payload.data.evId)  || '';
    var fireAt = (payload.data && payload.data.fireAt)|| '';

    var isHabit     = evId.startsWith('hab_');
    var actionLabel = isHabit ? '✅ Marcar hecho' : '📋 Ver tarea';

    var tag = 'jch-' + evId + '-' + Date.now();

    return self.registration.showNotification(title, {
        body:             body,
        icon:             './icon-192.png',
        badge:            './icon-192.png',
        vibrate:          [500, 200, 500, 200, 500, 200, 800],
        requireInteraction: true,
        tag:              tag,
        renotify:         true,
        silent:           false,
        timestamp:        Date.now(),
        data:             { url: './index.html', evId: evId, fireAt: fireAt },
        actions: [
            { action: 'open',    title: actionLabel },
            { action: 'dismiss', title: '✕ Cerrar' }
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

// ── Push directo (fallback) ───────────────────────────────
self.addEventListener('push', function(e) {
    if (!e.data) return;
    var data = {};
    try { data = e.data.json(); } catch(err) { return; }

    if (data.notification) return;

    var d     = data.data || {};
    var title = d.title || 'Planificador JCH';
    var body  = d.body  || 'Tienes un recordatorio';
    var evId  = d.evId  || '';
    var isHabit = evId.startsWith('hab_');

    e.waitUntil(
        self.registration.showNotification(title, {
            body:             body,
            icon:             './icon-192.png',
            badge:            './icon-192.png',
            vibrate:          [500, 200, 500, 200, 800],
            requireInteraction: true,
            tag:              'jch-push-' + evId + '-' + Date.now(),
            renotify:         true,
            silent:           false,
            data:             { url: './index.html', evId: evId },
            actions: [
                { action: 'open',    title: isHabit ? '✅ Marcar hecho' : '📋 Ver tarea' },
                { action: 'dismiss', title: '✕ Cerrar' }
            ]
        })
    );
});
