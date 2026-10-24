const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

// ── Se ejecuta cada minuto ──────────────────────────────────
exports.sendScheduledReminders = functions.pubsub
    .schedule('every 1 minutes')
    .onRun(async (context) => {

        const now = Date.now();
        // ── CORRECCIÓN 1: Ventana de tiempo estricta ──
        const windowEnd   = now + 15000;  // Solo 15 segundos hacia el futuro
        const windowStart = now - 60000;  // Hasta 60 segundos en el pasado

        console.log(`Revisando recordatorios entre ${new Date(windowStart).toISOString()} y ${new Date(windowEnd).toISOString()}`);

        try {
            const usersSnap = await db.collection('users').get();
            const promises  = [];

            usersSnap.forEach(userDoc => {
                const data      = userDoc.data();
                const reminders = data.fcm_reminders || [];
                
                let tokensToUse = [];
                if (Array.isArray(data.fcm_tokens) && data.fcm_tokens.length > 0) {
                    tokensToUse = data.fcm_tokens;
                } else if (data.fcm_token) {
                    tokensToUse = [data.fcm_token];
                }

                if (tokensToUse.length === 0 || !reminders.length) return;

                const toFire    = reminders.filter(r => r.fireAt >= windowStart && r.fireAt <= windowEnd);
                let   remaining = reminders.filter(r => r.fireAt > windowEnd);

                if (toFire.length === 0) return;

                console.log(`Usuario ${userDoc.id}: disparando ${toFire.length} recordatorio(s)`);

                toFire.forEach(r => {
                    const titleText = String(r.title || 'Recordatorio');
                    const bodyText  = String(r.body || 'Tienes un recordatorio');

                    tokensToUse.forEach(fcmToken => {
                        // ── CORRECCIÓN 2: Paquete "Data-Only" para evitar notificaciones dobles ──
                        const message = {
                            token: fcmToken,
                            data: {
                                title: titleText,
                                body:  bodyText,
                                evId:  String(r.evId || ''),
                                fireAt: String(r.fireAt || '')
                            },
                            android: { priority: 'high' },
                            webpush: { headers: { Urgency: 'high' } }
                        };

                        promises.push(
                            messaging.send(message).catch(err => {
                                console.error(`Error enviando a usuario ${userDoc.id}:`, err.message);
                                if (err.code === 'messaging/invalid-registration-token' ||
                                    err.code === 'messaging/registration-token-not-registered') {
                                    return db.collection('users').doc(userDoc.id)
                                        .update({ fcm_token: null, fcm_tokens: admin.firestore.FieldValue.arrayRemove(fcmToken) });
                                }
                            })
                        );
                    });

                    // ── Reprogramación de hábitos para el día siguiente ──
                    if (r.evId && String(r.evId).startsWith('hab_')) {
                        const nextFireAt = (r.fireAt || now) + 86400000; // +24h
                        remaining.push({
                            evId:   r.evId,
                            fireAt: nextFireAt,
                            title:  r.title,
                            body:   r.body
                        });
                        console.log(`Hábito reprogramado para ${new Date(nextFireAt).toISOString()}: ${r.title}`);

                    // ── Reprogramación de proyectos/tareas/eventos recurrentes ──
                    // (Diariamente / Semanalmente / Mensualmente / Anualmente).
                    // El cliente adjunta repeat/repeatEnd/offsetMs solo cuando el
                    // evento tiene una repetición distinta de "No repetir".
                    } else if (r.repeat && r.repeat !== 'none' && typeof r.offsetMs === 'number') {
                        const baseDate = new Date((r.fireAt || now) + r.offsetMs);
                        const originalDay = baseDate.getDate();
                        const every = r.repeatEvery || 1;
                        let next = new Date(baseDate.getTime());
                        if (r.repeat === 'daily') {
                            next.setDate(next.getDate() + every);
                        } else if (r.repeat === 'weekly') {
                            next.setDate(next.getDate() + 7 * every);
                        } else if (r.repeat === 'monthly') {
                            // Preservar el día original y saltar meses donde no exista (ej. 31 en febrero)
                            let totalMonths = next.getFullYear() * 12 + next.getMonth() + every;
                            let cand;
                            while (true) {
                                const my = Math.floor(totalMonths / 12), mm = totalMonths % 12;
                                cand = new Date(my, mm, originalDay, baseDate.getHours(), baseDate.getMinutes(), 0);
                                if (cand.getMonth() === mm) break;
                                totalMonths++;
                            }
                            next = cand;
                        } else if (r.repeat === 'yearly') {
                            // Preservar día/mes y saltar años sin ese día (ej. 29 feb en no bisiesto)
                            let yy = next.getFullYear();
                            let candY;
                            while (true) {
                                yy += every;
                                candY = new Date(yy, baseDate.getMonth(), originalDay, baseDate.getHours(), baseDate.getMinutes(), 0);
                                if (candY.getDate() === originalDay) break;
                            }
                            next = candY;
                        }

                        let stillValid = true;
                        if (r.repeatEnd && r.repeatEnd.until) {
                            const untilDate = new Date(r.repeatEnd.until + 'T23:59:59');
                            if (next > untilDate) stillValid = false;
                        }
                        const nextOccurrenceIndex = (r.occurrenceIndex || 0) + 1;
                        if (r.repeatEnd && r.repeatEnd.count && nextOccurrenceIndex >= r.repeatEnd.count) {
                            stillValid = false;
                        }

                        if (stillValid) {
                            const nextFireAt = next.getTime() - r.offsetMs;
                            remaining.push({
                                evId:      r.evId,
                                fireAt:    nextFireAt,
                                title:     r.title,
                                body:      r.body,
                                repeat:        r.repeat,
                                repeatEvery:   every,
                                repeatEnd:     r.repeatEnd || null,
                                offsetMs:      r.offsetMs,
                                occurrenceIndex: nextOccurrenceIndex
                            });
                            console.log(`Recurrente reprogramado (${r.repeat}) para ${new Date(nextFireAt).toISOString()}: ${r.title}`);
                        } else {
                            console.log(`Recurrencia finalizada para ${r.evId} (${r.title})`);
                        }
                    }
                });

                promises.push(
                    db.collection('users').doc(userDoc.id)
                        .update({ fcm_reminders: remaining })
                );
            });

            await Promise.all(promises);
            console.log('Ciclo completado.');

        } catch (err) {
            console.error('Error en sendScheduledReminders:', err);
        }

        return null;
    });

// ═══════════════════════════════════════════════════════════════
//  RELOJES (Fase 2) — aviso al terminar + "latido" cada minuto
//  La página guarda en users/{uid}:
//    fcm_timers       → [{ id, fireAt, phase, title, body }]   (relojes corriendo y su hora real de fin)
//    fcm_timers_until → mayor fireAt (0 si no hay ninguno)     (para consultar solo a quien tiene un reloj activo)
//  Cada minuto esta función:
//    · si un reloj termina en el próximo minuto: espera hasta su hora, lo "reclama" (lo quita de la lista en una
//      transacción, así se envía una sola vez) y manda un push data-only { type:'timer_end', ... }.
//    · si a un reloj aún le falta más de un minuto: manda un "latido" { type:'timer_tick' } que despierta el
//      service worker del teléfono y reactiva la cuenta regresiva de la notificación (la app puede estar cerrada).
//  El service worker valida contra su propio estado: si el reloj se pausó/detuvo/ya no existe en ese dispositivo, lo ignora.
// ═══════════════════════════════════════════════════════════════
function _timerTokens(data) {
    if (Array.isArray(data.fcm_tokens) && data.fcm_tokens.length > 0) return data.fcm_tokens;
    if (data.fcm_token) return [data.fcm_token];
    return [];
}

function _timerSend(uid, token, data, ttl) {
    return messaging.send({
        token: token,
        data: data,
        android: { priority: 'high' },
        webpush: { headers: { Urgency: 'high', TTL: String(ttl) } }
    }).catch(err => {
        console.error(`Error enviando reloj (${data && data.type}) a usuario ${uid} [${err.code}]:`, err.message);
        if (err.code === 'messaging/invalid-registration-token' ||
            err.code === 'messaging/registration-token-not-registered') {
            return db.collection('users').doc(uid)
                .update({ fcm_token: null, fcm_tokens: admin.firestore.FieldValue.arrayRemove(token) })
                .catch(() => {});
        }
    });
}

async function _timerEndAlert(uid, t, tokens) {
    const wait = t.fireAt - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, Math.min(wait, 70000)));

    // Reclamar el aviso (una sola vez aunque dos ejecuciones se solapen o el usuario lo haya pausado/detenido entre tanto)
    const ref = db.collection('users').doc(uid);
    const claimed = await db.runTransaction(async tx => {
        const d = await tx.get(ref);
        const arr = Array.isArray((d.data() || {}).fcm_timers) ? d.data().fcm_timers.slice() : [];
        const i = arr.findIndex(x => x && x.id === t.id && x.fireAt === t.fireAt);
        if (i < 0) return false;
        arr.splice(i, 1);
        const until = arr.reduce((m, x) => Math.max(m, (x && x.fireAt) || 0), 0);
        tx.update(ref, { fcm_timers: arr, fcm_timers_until: until });
        return true;
    });
    if (!claimed) { console.log(`Reloj ${t.id} de ${uid}: ya reclamado o cancelado`); return; }

    console.log(`Reloj ${t.id} de ${uid}: enviando aviso de fin`);
    const data = {
        type:  'timer_end',
        id:    String(t.id),
        base:  String(t.fireAt),
        phase: String(t.phase || ''),
        title: String(t.title || '⏰ Reloj terminado'),
        body:  String(t.body  || 'Tu reloj terminó.')
    };
    await Promise.all(tokens.map(tok => _timerSend(uid, tok, data, 300)));
}

// "Latidos": en vez de uno por minuto, el servidor manda TICK_ROUNDS rondas por ejecución, separadas TICK_ROUND_MS (≈ cada 20 s).
// Cada latido hace que el service worker del teléfono vuelva a pintar la cuenta con la hora real aunque Android haya congelado
// la app o frenado los temporizadores (modo Doze). TTL largo: si el teléfono estaba dormido, el latido llega cuando despierte.
const TICK_ROUND_MS = Number(process.env.TIMER_TICK_MS) || 20000;
const TICK_ROUNDS   = Number(process.env.TIMER_TICK_ROUNDS) || 3;
const TICK_TTL      = 120;
const _sleep = ms => new Promise(r => setTimeout(r, ms));
// A qué dispositivos va cada reloj: si la página anotó el token de SU dispositivo (t.tok) y sigue vigente, solo a ese
// (así la tablet no parpadea con avisos de un reloj que corre en el celular); si no, a todos los del usuario.
function _targetsFor(t, tokens) {
    return (t && t.tok && tokens.indexOf(t.tok) >= 0) ? [t.tok] : tokens;
}
// Plan de latidos: token → [ids de relojes a los que aún les falta más de 1 minuto]
function _beatPlan(data, now) {
    const timers = Array.isArray(data.fcm_timers) ? data.fcm_timers : [];
    const tokens = _timerTokens(data);
    const plan = new Map();
    timers.forEach(t => {
        if (!t || !t.id || typeof t.fireAt !== 'number' || (t.fireAt - now) <= 60000) return;
        _targetsFor(t, tokens).forEach(tok => { if (!plan.has(tok)) plan.set(tok, []); plan.get(tok).push(String(t.id)); });
    });
    return plan;
}

exports.sendTimerAlerts = functions
    .runWith({ timeoutSeconds: 90, memory: '256MB' })
    .pubsub.schedule('every 1 minutes')
    .onRun(async (context) => {
        const now = Date.now();
        const startedAt = now;
        // ¿El planificador de Google la lanzó a tiempo? (si llega con minutos de retraso, ahí se ven los huecos de latidos)
        let lateSec = 0; try { lateSec = Math.round((now - Date.parse(context.timestamp)) / 1000); } catch (e) {}
        try {
            // Solo usuarios con algún reloj corriendo (o que terminó hace menos de un minuto)
            const snap = await db.collection('users').where('fcm_timers_until', '>', now - 60000).get();
            const jobs = [];
            const beatUsers = [];

            snap.forEach(userDoc => {
                const data   = userDoc.data();
                const tokens = _timerTokens(data);
                const timers = Array.isArray(data.fcm_timers) ? data.fcm_timers : [];
                if (!tokens.length || !timers.length) return;

                timers.forEach(t => {
                    if (!t || !t.id || typeof t.fireAt !== 'number') return;
                    const dt = t.fireAt - now;
                    if (dt <= 60000 && dt >= -60000) jobs.push(_timerEndAlert(userDoc.id, t, _targetsFor(t, tokens))); // termina en este minuto (o hace <1 min)
                    // dt > 60000: latido (más abajo) · más viejo que 1 min: se ignora (no avisar tarde)
                });

                const plan = _beatPlan(data, now);
                if (plan.size) {
                    plan.forEach((ids, tok) => jobs.push(_timerSend(userDoc.id, tok, { type: 'timer_tick', ids: ids.join(',') }, TICK_TTL)));
                    beatUsers.push(userDoc.id);
                }
            });

            // Rondas siguientes de latidos dentro de esta misma ejecución (relee al usuario: si pausó o detuvo el reloj, ya no se manda)
            if (beatUsers.length && TICK_ROUNDS > 1) {
                jobs.push((async () => {
                    for (let k = 1; k < TICK_ROUNDS; k++) {
                        const wait = startedAt + k * TICK_ROUND_MS - Date.now();
                        if (wait > 0) await _sleep(wait);
                        await Promise.all(beatUsers.map(async uid => {
                            try {
                                const d = await db.collection('users').doc(uid).get();
                                const data = (d && d.data && d.data()) || {};
                                const plan = _beatPlan(data, Date.now());
                                const sends = [];
                                plan.forEach((ids, tok) => sends.push(_timerSend(uid, tok, { type: 'timer_tick', ids: ids.join(',') }, TICK_TTL)));
                                await Promise.all(sends);
                            } catch (e) { console.error('Error en ronda de latidos:', e && e.message); }
                        }));
                    }
                })());
            }

            await Promise.all(jobs.map(p => p.catch(e => console.error('Error en reloj:', e && e.message))));
            console.log(`sendTimerAlerts: ${snap.size} usuario(s) con reloj, ${jobs.length} tarea(s), lanzada con ${lateSec} s de retraso, duró ${Math.round((Date.now() - startedAt) / 1000)} s`);
        } catch (err) {
            console.error('Error en sendTimerAlerts:', err);
        }
        return null;
    });
