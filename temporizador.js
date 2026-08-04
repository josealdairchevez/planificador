// =====================================================================
// ⚙️ MÓDULO DE TEMPORIZADOR ESTRICTO (Cálculo Delta) - Planificador JCH
// =====================================================================

// ── 1. ESTADO GLOBAL DEL CRONÓMETRO ──
let cronoIntervalo = null;
let tiempoInicioSesion = null;
let tiempoAcumuladoReal = 0; // Se mide estrictamente en milisegundos
let estaCorriendo = false;


// ── 2. CENTINELAS DE INTERRUPCIÓN (Page Visibility API) ──

// Vigila cuando la app pasa a segundo plano o regresa
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
        salvarEstadoDeEmergencia();
    } else if (document.visibilityState === "visible") {
        restaurarMatematicaDelta();
    }
});

// Vigila si el usuario recarga la página o Android la mata por completo
window.addEventListener("beforeunload", () => {
    salvarEstadoDeEmergencia();
});

// Arranque en frío: Cuando la app carga desde cero
window.addEventListener('load', () => {
    restaurarMatematicaDelta();
});

// Función estricta de guardado en memoria permanente
function salvarEstadoDeEmergencia() {
    if (estaCorriendo) {
        localStorage.setItem('jch_crono_ultimo_vistazo', Date.now().toString());
        localStorage.setItem('jch_crono_acumulado', tiempoAcumuladoReal.toString());
        localStorage.setItem('jch_crono_activo', 'true');
    }
}


// ── 3. EL CÁLCULO DELTA (Motor Matemático) ──
function restaurarMatematicaDelta() {
    const cronoEstabaActivo = localStorage.getItem('jch_crono_activo');
    
    if (cronoEstabaActivo === 'true') {
        const ultimoVistazo = parseInt(localStorage.getItem('jch_crono_ultimo_vistazo')) || Date.now();
        const acumuladoEnMemoria = parseInt(localStorage.getItem('jch_crono_acumulado')) || 0;
        
        const ahora = Date.now();
        
        // La matemática inquebrantable (Tiempo actual - Tiempo de guardado)
        const tiempoEnLasSombras = ahora - ultimoVistazo;
        
        tiempoAcumuladoReal = acumuladoEnMemoria + tiempoEnLasSombras;
        tiempoInicioSesion = ahora; 
        estaCorriendo = true;
        
        pintarInterfazCronometro();
        
        if (!cronoIntervalo) {
            cronoIntervalo = setInterval(() => {
                tiempoAcumuladoReal += (Date.now() - tiempoInicioSesion);
                tiempoInicioSesion = Date.now();
                pintarInterfazCronometro();
            }, 1000);
        }
    }
}


// ── 4. CONTROLADORES DEL USUARIO Y RENDERIZADO VISUAL ──

function iniciarCronometro() {
    if (estaCorriendo) return; // Evita que se creen bucles dobles si el usuario hace doble clic
    
    estaCorriendo = true;
    tiempoInicioSesion = Date.now();
    localStorage.setItem('jch_crono_activo', 'true');

    if (!cronoIntervalo) {
        cronoIntervalo = setInterval(() => {
            tiempoAcumuladoReal += (Date.now() - tiempoInicioSesion);
            tiempoInicioSesion = Date.now(); 
            pintarInterfazCronometro();
        }, 1000);
    }
}

function pausarCronometro() {
    estaCorriendo = false;
    
    if (cronoIntervalo) {
        clearInterval(cronoIntervalo);
        cronoIntervalo = null;
    }
    
    localStorage.setItem('jch_crono_activo', 'false');
    localStorage.setItem('jch_crono_acumulado', tiempoAcumuladoReal.toString());
}

function reiniciarCronometro() {
    pausarCronometro();
    
    // Destrucción total de los datos del cronómetro actual
    tiempoAcumuladoReal = 0;
    tiempoInicioSesion = null;
    localStorage.removeItem('jch_crono_ultimo_vistazo');
    localStorage.setItem('jch_crono_acumulado', '0');
    
    pintarInterfazCronometro();
}

// Única función con permisos para modificar el DOM (HTML)
function pintarInterfazCronometro() {
    let segundosTotales = Math.floor(tiempoAcumuladoReal / 1000);
    let minutos = Math.floor(segundosTotales / 60);
    let segundos = segundosTotales % 60;

    let textoMinutos = minutos.toString().padStart(2, '0');
    let textoSegundos = segundos.toString().padStart(2, '0');

    // ⚠️ ATENCIÓN: Reemplaza 'mi-cronometro' con el ID real que tenga tu etiqueta de texto en el HTML
    const displayElement = document.getElementById('mi-cronometro');
    
    // Salvaguarda técnica: Solo intenta pintar si el elemento HTML ya existe en la pantalla
    if (displayElement) {
        displayElement.innerText = `${textoMinutos}:${textoSegundos}`;
    }
}
