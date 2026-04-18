// ═══════════════════════════════════════════════════════════
//  FIREBASE MESSAGING SERVICE WORKER
//  Archivo: firebase-messaging-sw.js
//  Debe estar en la RAÍZ del repositorio (mismo nivel que index.html)
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

// Manejar notificaciones cuando la app está en BACKGROUND o CERRADA
messaging.onBackgroundMessage(function(payload) {
    console.log('Notificación en background:', payload);

    const title = payload.notification?.title || payload.data?.title || 'Planificador JCH';
    const body  = payload.notification?.body  || payload.data?.body  || 'Tienes un recordatorio';

    return self.registration.showNotification(title, {
        body:   body,
        icon:   './icon-192.png',
        badge:  './icon-192.png',
        vibrate: [400, 100, 400, 100, 800],
        requireInteraction: true,
        tag: 'jch-fcm-' + Date.now(),
        data: { url: './index.html' }
    });
});

// Al hacer clic en la notificación → abrir la app
self.addEventListener('notificationclick', function(e) {
    e.notification.close();
    e.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(cs) {
            for (var c of cs) {
                if (c.url.includes('planificador') && 'focus' in c) return c.focus();
            }
            if (clients.openWindow) return clients.openWindow('./index.html');
        })
    );
});
