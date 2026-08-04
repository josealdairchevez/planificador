// =====================================================================
// ⚙️ MOTOR MAESTRO DE TIEMPOS (Cálculo Delta) - Planificador JCH
// =====================================================================
const motoresTemporales = {};

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") salvarEstadoMasivo();
    else if (document.visibilityState === "visible") restaurarMatematicaMasiva();
});

window.addEventListener("beforeunload", salvarEstadoMasivo);
window.addEventListener('load', restaurarMatematicaMasiva);

function salvarEstadoMasivo() {
    const ahora = Date.now().toString();
    for (const id in motoresTemporales) {
        const motor = motoresTemporales[id];
        if (motor.estaCorriendo) {
            localStorage.setItem(`jch_vis_${id}`, ahora);
            localStorage.setItem(`jch_ac_${id}`, motor.acumulado.toString());
            localStorage.setItem(`jch_act_${id}`, 'true');
        }
    }
}

function restaurarMatematicaMasiva() {
    const ahora = Date.now();
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('jch_act_') && localStorage.getItem(key) === 'true') {
            const id = key.replace('jch_act_', '');
            const configJSON = localStorage.getItem(`jch_cfg_${id}`);
            if (!configJSON) continue;
            
            const config = JSON.parse(configJSON);
            const ultimoVistazo = parseInt(localStorage.getItem(`jch_vis_${id}`)) || ahora;
            const acumuladoMemoria = parseInt(localStorage.getItem(`jch_ac_${id}`)) || 0;
            const delta = ahora - ultimoVistazo;
            
            motoresTemporales[id] = {
                tipo: config.tipo,
                meta: config.meta,
                acumulado: acumuladoMemoria + delta,
                inicio: ahora,
                estaCorriendo: true,
                intervalo: null
            };
            
            ejecutarCicloVisual(id);
            arrancarIntervalo(id);
        }
    }
}

function iniciarReloj(id, tipo, minutosMeta = 0) {
    let motor = motoresTemporales[id];
    if (!motor) {
        const metaMilisegundos = minutosMeta * 60 * 1000;
        motor = { tipo: tipo, meta: metaMilisegundos, acumulado: parseInt(localStorage.getItem(`jch_ac_${id}`)) || 0, inicio: null, estaCorriendo: false, intervalo: null };
        motoresTemporales[id] = motor;
        localStorage.setItem(`jch_cfg_${id}`, JSON.stringify({ tipo: tipo, meta: metaMilisegundos }));
    }
    if (motor.estaCorriendo) return; 

    motor.estaCorriendo = true;
    motor.inicio = Date.now();
    localStorage.setItem(`jch_act_${id}`, 'true');
    arrancarIntervalo(id);
}

function pausarReloj(id) {
    const motor = motoresTemporales[id];
    if (!motor) return;
    motor.estaCorriendo = false;
    if (motor.intervalo) { clearInterval(motor.intervalo); motor.intervalo = null; }
    localStorage.setItem(`jch_act_${id}`, 'false');
    localStorage.setItem(`jch_ac_${id}`, motor.acumulado.toString());
}

function reiniciarReloj(id) {
    pausarReloj(id);
    const motor = motoresTemporales[id];
    if (!motor) return;
    motor.acumulado = 0;
    motor.inicio = null;
    localStorage.removeItem(`jch_vis_${id}`);
    localStorage.setItem(`jch_ac_${id}`, '0');
    ejecutarCicloVisual(id);
}

function arrancarIntervalo(id) {
    const motor = motoresTemporales[id];
    const velocidadRefresco = motor.tipo === 'cronometro-ms' ? 50 : 1000;
    if (!motor.intervalo) {
        motor.intervalo = setInterval(() => {
            const ahora = Date.now();
            motor.acumulado += (ahora - motor.inicio);
            motor.inicio = ahora;
            ejecutarCicloVisual(id);
        }, velocidadRefresco);
    }
}

function ejecutarCicloVisual(id) {
    const motor = motoresTemporales[id];
    const displayElement = document.getElementById(id);
    if (!displayElement) return; 

    let tiempoAProcesar = motor.acumulado;

    if (motor.tipo === 'temporizador') {
        tiempoAProcesar = motor.meta - motor.acumulado;
        if (tiempoAProcesar <= 0) {
            tiempoAProcesar = 0;
            pausarReloj(id);
            console.log(`¡Reloj ${id} finalizado!`);
        }
    }

    let segundosTotales = Math.floor(tiempoAProcesar / 1000);
    let minutos = Math.floor(segundosTotales / 60);
    let segundos = segundosTotales % 60;
    
    let textoMinutos = minutos.toString().padStart(2, '0');
    let textoSegundos = segundos.toString().padStart(2, '0');

    if (motor.tipo === 'cronometro-ms') {
        let decimas = Math.floor((tiempoAProcesar % 1000) / 100);
        displayElement.innerText = `${textoMinutos}:${textoSegundos}.${decimas}`;
    } else {
        displayElement.innerText = `${textoMinutos}:${textoSegundos}`;
    }
}
