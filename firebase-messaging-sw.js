importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

self.addEventListener('install',  function(e) { self.skipWaiting(); });
self.addEventListener('activate', function(e) { e.waitUntil(self.clients.claim()); });

var FIREBASE_CONFIG = {
    apiKey:            "AIzaSyAKsILLuBeu6AXGzMICQtfIULL6-tMs5IE",
    authDomain:        "mi-planificador-86095.firebaseapp.com",
    projectId:         "mi-planificador-86095",
    storageBucket:     "mi-planificador-86095.firebasestorage.app",
    messagingSenderId: "469097705640",
    appId:             "1:469097705640:web:7df14de48ff7d625dc529d"
};

firebase.initializeApp(FIREBASE_CONFIG);
var messaging = firebase.messaging();

/* ─────────────────────────────────────────────────────────────────
   HELPER: Formatear timestamp a "HH:MM"
───────────────────────────────────────────────────────────────── */
function fmtHora(fireAt) {
    if (!fireAt) return '';
    try {
        var d = new Date(parseInt(fireAt));
        return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
    } catch(e) { return ''; }
}

/* ─────────────────────────────────────────────────────────────────
   CORE: Reprogramar hábito diario en Firestore vía REST API
   
   Se llama justo después de mostrar cada notificación de hábito.
   Lee fcm_reminders del documento del usuario, actualiza el fireAt
   del hábito disparado sumándole 24h, y lo vuelve a escribir.
   Así la Cloud Function tiene siempre un fireAt futuro válido.

   Requiere que cada objeto de fcm_reminders tenga el campo "uid"
   (agregado en index.html → saveToFirestore → doSave).
───────────────────────────────────────────────────────────────── */
function rescheduleHabitInFirestore(evId, oldFireAt, uid) {
    if (!evId || !evId.startsWith('hab_')) return;
    if (!uid) {
        console.warn('[SW] rescheduleHabitInFirestore: uid no disponible para ' + evId);
        return;
    }

    var nextFireAt = parseInt(oldFireAt) + 86400000; // +24 horas exactas
    var projectId  = FIREBASE_CONFIG.projectId;

    // Ruta REST del documento del usuario
    var docUrl = 'https://firestore.googleapis.com/v1/projects/' + projectId
               + '/databases/(default)/documents/users/' + uid;

    console.log('[SW] Reprogramando ' + evId + ' para ' + new Date(nextFireAt).toLocaleString());

    // 1. Leer el documento actual
    fetch(docUrl)
        .then(function(r) {
            if (!r.ok) throw new Error('GET status ' + r.status);
            return r.json();
        })
        .then(function(doc) {
            var fields  = doc.fields || {};
            var remField = fields.fcm_reminders;

            // Firestore guarda los objetos como arrayValue de mapValue
            var reminders = [];
            if (remField && remField.arrayValue && remField.arrayValue.values) {
                reminders = remField.arrayValue.values.map(function(v) {
                    // Cada elemento puede ser mapValue (objeto nativo) o stringValue (JSON stringificado)
                    if (v.mapValue && v.mapValue.fields) {
                        return firestoreMapToObj(v.mapValue.fields);
                    }
                    if (v.stringValue) {
                        try { return JSON.parse(v.stringValue); } catch(e) { return null; }
                    }
                    return null;
                }).filter(Boolean);
            }

            if (!reminders.length) {
                console.warn('[SW] fcm_reminders vacío para uid=' + uid);
                return;
            }

            // 2. Actualizar solo el recordatorio que acaba de disparar
            var updated = reminders.map(function(r) {
                if (r.evId === evId) {
                    return Object.assign({}, r, { fireAt: nextFireAt });
                }
                return r;
            });

            // 3. Convertir de vuelta al formato nativo de Firestore
            var arrayValues = updated.map(function(r) {
                return { mapValue: { fields: objToFirestoreMap(r) } };
            });

            // 4. PATCH — solo actualizar el campo fcm_reminders
            var patchUrl = docUrl + '?updateMask.fieldPaths=fcm_reminders';
            return fetch(patchUrl, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fields: {
                        fcm_reminders: {
                            arrayValue: { values: arrayValues }
                        }
                    }
                })
            });
        })
        .then(function(res) {
            if (!res) return; // si el step anterior no retornó fetch
            if (res.ok) {
                console.log('[SW] ✅ ' + evId + ' reprogramado → ' + new Date(nextFireAt).toLocaleString());
            } else {
                res.text().then(function(t) {
                    console.warn('[SW] ❌ PATCH Firestore falló (' + res.status + '):', t);
                });
            }
        })
        .catch(function(err) {
            console.warn('[SW] rescheduleHabitInFirestore error:', err.message || err);
        });
}

/* ─────────────────────────────────────────────────────────────────
   HELPERS de conversión Firestore REST ↔ JS objeto plano
───────────────────────────────────────────────────────────────── */
function firestoreMapToObj(fields) {
    var obj = {};
    Object.keys(fields).forEach(function(k) {
        var v = fields[k];
        if      (v.stringValue  !== undefined) obj[k] = v.stringValue;
        else if (v.integerValue !== undefined) obj[k] = parseInt(v.integerValue);
        else if (v.doubleValue  !== undefined) obj[k] = parseFloat(v.doubleValue);
        else if (v.booleanValue !== undefined) obj[k] = v.booleanValue;
        else if (v.nullValue    !== undefined) obj[k] = null;
        else if (v.mapValue)                   obj[k] = firestoreMapToObj(v.mapValue.fields || {});
        else if (v.arrayValue)                 obj[k] = (v.arrayValue.values || []).map(function(i){ return firestoreMapToObj(i.mapValue ? i.mapValue.fields : {}); });
    });
    return obj;
}

function objToFirestoreMap(obj) {
    var fields = {};
    Object.keys(obj).forEach(function(k) {
        var v = obj[k];
        if      (v === null || v === undefined)  fields[k] = { nullValue: null };
        else if (typeof v === 'boolean')          fields[k] = { booleanValue: v };
        else if (typeof v === 'number') {
            // fireAt y otros timestamps son enteros grandes → integerValue como string
            fields[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
        }
        else if (typeof v === 'string')           fields[k] = { stringValue: v };
        else if (Array.isArray(v))                fields[k] = { arrayValue: { values: v.map(function(i){ return { mapValue: { fields: objToFirestoreMap(i) } }; }) } };
        else if (typeof v === 'object')           fields[k] = { mapValue: { fields: objToFirestoreMap(v) } };
    });
    return fields;
}

/* ─────────────────────────────────────────────────────────────────
   HELPER: construir y mostrar la notificación
───────────────────────────────────────────────────────────────── */
function buildNotifOptions(evId, fireAt, title, body) {
    var isHabit = evId.startsWith('hab_');
    if (isHabit && fireAt && body.indexOf('⏰') === -1) {
        var hora = fmtHora(fireAt);
        if (hora) body = '⏰ ' + hora + ' · ' + body;
    }
    return {
        body:               body,
        icon:               './icon-192.png',
        badge:              './icon-192.png',
        vibrate:            [500, 200, 500, 200, 500, 200, 800],
        requireInteraction: true,
        tag:                'jch-notif-' + evId + '-' + fireAt,
        renotify:           false,
        silent:             false,
        timestamp:          Date.now(),
        data:               { url: './index.html', evId: evId, fireAt: fireAt },
        actions: [
            { action: 'open',    title: isHabit ? '✅ Marcar hecho' : '📋 Ver tarea' },
            { action: 'dismiss', title: '✕ Cerrar' }
        ]
    };
}

/* ─────────────────────────────────────────────────────────────────
   FCM BACKGROUND — Notificaciones con app cerrada / en background
───────────────────────────────────────────────────────────────── */
messaging.onBackgroundMessage(function(payload) {
    var d      = payload.data || {};
    var evId   = d.evId   || '';
    var fireAt = d.fireAt || '';
    var title  = d.title  || 'Planificador JCH';
    var body   = d.body   || 'Tienes un recordatorio';
    var uid    = d.uid    || '';   // ← viene del objeto recordatorio en Firestore

    console.log('[SW] onBackgroundMessage evId=' + evId + ' fireAt=' + fireAt + ' uid=' + uid);

    // ── Reprogramar para mañana (hábitos diarios) ──────────────
    if (evId.startsWith('hab_') && fireAt) {
        rescheduleHabitInFirestore(evId, fireAt, uid);
    }

    return self.registration.showNotification(title, buildNotifOptions(evId, fireAt, title, body));
});

/* ─────────────────────────────────────────────────────────────────
   PUSH raw — fallback por si la Cloud Function usa push directo
───────────────────────────────────────────────────────────────── */
self.addEventListener('push', function(e) {
    if (!e.data) return;
    var data = {};
    try { data = e.data.json(); } catch(err) { return; }
    if (data.notification) return; // ya lo maneja onBackgroundMessage

    var d      = data.data || {};
    var evId   = d.evId   || '';
    var fireAt = d.fireAt || '';
    var title  = d.title  || 'Planificador JCH';
    var body   = d.body   || 'Tienes un recordatorio';
    var uid    = d.uid    || '';

    var tag = fireAt
        ? ('jch-notif-' + evId + '-' + fireAt)
        : ('jch-push-'  + evId + '-' + Date.now());

    // ── Reprogramar para mañana ─────────────────────────────────
    if (evId.startsWith('hab_') && fireAt) {
        rescheduleHabitInFirestore(evId, fireAt, uid);
    }

    e.waitUntil(
        self.registration.showNotification(title, buildNotifOptions(evId, fireAt, title, body))
    );
});

/* ─────────────────────────────────────────────────────────────────
   CLICK en notificación
───────────────────────────────────────────────────────────────── */
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
