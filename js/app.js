/**
 * ==========================================================================
 * SISTEMA MÓVIL DE MONITOREO DE CALIDAD DEL AGUA - CLIENTE PRINCIPAL
 * Telemetría IoT en Tiempo Real conectada a Firebase Realtime Database
 * Monitor Comparativo: Antes de la Filtración (Entrada) vs Después (Salida)
 * Parámetros: pH, Turbidez (NTU), Temperatura (°C) y Eficiencia de Filtración (%)
 * ==========================================================================
 */

/* ==========================================================================
   >>> [CONFIGURACIÓN DE FIREBASE REALTIME DATABASE] <<<
   ========================================================================== */
const firebaseConfig = {
  apiKey: "AIzaSyA--VUqSfCvZoEz56ZpibuWpUIYWGKgwJU",
  authDomain: "sistema-de-monitoreo-8b1d0.firebaseapp.com",
  databaseURL: "https://sistema-de-monitoreo-8b1d0-default-rtdb.firebaseio.com",
  projectId: "sistema-de-monitoreo-8b1d0",
  storageBucket: "sistema-de-monitoreo-8b1d0.firebasestorage.app",
  messagingSenderId: "663847653695",
  appId: "1:663847653695:web:98fd2f02ad83760d2d038a",
  measurementId: "G-WSK1HCT48G"
};

/**
 * RUTA DEL NODO EN REALTIME DATABASE:
 * Lee en tiempo real los valores de telemetría IoT de ambas etapas:
 * - sensores/antes/ph, turbidez, temperatura
 * - sensores/despues/ph, turbidez, temperatura
 * - sensores/online
 */
const FIREBASE_DATA_PATH = "sensores";

/* ==========================================================================
   ESTADO GLOBAL DE LA APLICACIÓN
   ========================================================================== */
const AppState = {
    firebaseInitialized: false,
    firebaseConnected: false,
    deviceConnected: false,
    explicitOnlineProvided: false,
    lastPacketTime: null,
    packetCount: 0,
    heartbeatTimeoutSeconds: 60,

    // Sistema de alarma acústica y notificaciones
    soundAlarmEnabled: localStorage.getItem('water_monitor_sound') !== 'false',
    lastAlarmTime: 0,
    alarmCooldownMs: 12000,
    lastNotifiedStates: {
        phCritical: false,
        turbCritical: false,
        tempCritical: false,
        filterSaturated: false,
        deviceConnectedState: null
    },

    // Últimos valores leídos de los sensores en ambas etapas
    currentData: {
        antes: { ph: null, turb: null, temp: null },
        despues: { ph: null, turb: null, temp: null },
        filter: { efficiencyPct: null, turbRemoved: null, phDelta: null, tempDelta: null },
        online: null
    },

    // Acumuladores de estadísticas de sesión
    stats: {
        phIn: { min: null, max: null, sum: 0, count: 0 },
        phOut: { min: null, max: null, sum: 0, count: 0 },
        turbIn: { min: null, max: null, sum: 0, count: 0 },
        turbOut: { min: null, max: null, sum: 0, count: 0 },
        tempIn: { min: null, max: null, sum: 0, count: 0 },
        tempOut: { min: null, max: null, sum: 0, count: 0 },
        efficiency: { min: null, max: null, sum: 0, count: 0 }
    },

    // Registro en memoria para exportar a CSV y PDF
    readingsLog: []
};

document.addEventListener("DOMContentLoaded", () => {
    // Referencias a elementos del DOM
    const ui = {
        // Cabecera y Estados
        clock: document.getElementById("live-clock"),
        deviceStatusBadge: document.getElementById("device-status-badge"),
        deviceStatusDot: document.getElementById("device-status-dot"),
        deviceStatusText: document.getElementById("device-status-text"),
        firebaseStatusBadge: document.getElementById("firebase-status-badge"),
        firebaseStatusText: document.getElementById("firebase-status-text"),
        setupNotice: document.getElementById("setup-notice-banner"),
        btnDismissNotice: document.getElementById("btn-dismiss-notice"),
        btnSoundToggle: document.getElementById("btn-sound-toggle"),
        soundIcon: document.getElementById("sound-icon"),
        soundStatusText: document.getElementById("sound-status-text"),

        // Banner Hero de Filtración
        valFilterEfficiency: document.getElementById("val-filter-efficiency"),
        barFilterEfficiency: document.getElementById("bar-filter-efficiency"),
        hintFilterEfficiency: document.getElementById("hint-filter-efficiency"),
        valTurbRemoved: document.getElementById("val-turb-removed"),
        hintTurbRemoved: document.getElementById("hint-turb-removed"),
        valPhDelta: document.getElementById("val-ph-delta"),
        hintPhDelta: document.getElementById("hint-ph-delta"),
        valTempDelta: document.getElementById("val-temp-delta"),
        hintTempDelta: document.getElementById("hint-temp-delta"),
        pillFilterStatus: document.getElementById("pill-filter-status"),

        // ETAPA 1: Antes de la Filtración (Entrada)
        valPhIn: document.getElementById("val-ph-in"),
        gaugePhInProgress: document.getElementById("gauge-ph-in-progress"),
        pillPhIn: document.getElementById("pill-ph-in"),
        feedbackPhIn: document.getElementById("feedback-ph-in"),
        minPhIn: document.getElementById("min-ph-in"),
        avgPhIn: document.getElementById("avg-ph-in"),
        maxPhIn: document.getElementById("max-ph-in"),

        valTurbIn: document.getElementById("val-turb-in"),
        barTurbIn: document.getElementById("bar-turb-in"),
        pillTurbIn: document.getElementById("pill-turb-in"),
        feedbackTurbIn: document.getElementById("feedback-turb-in"),
        minTurbIn: document.getElementById("min-turb-in"),
        avgTurbIn: document.getElementById("avg-turb-in"),
        maxTurbIn: document.getElementById("max-turb-in"),

        valTempIn: document.getElementById("val-temp-in"),
        barTempIn: document.getElementById("bar-temp-in"),
        pillTempIn: document.getElementById("pill-temp-in"),
        feedbackTempIn: document.getElementById("feedback-temp-in"),
        minTempIn: document.getElementById("min-temp-in"),
        avgTempIn: document.getElementById("avg-temp-in"),
        maxTempIn: document.getElementById("max-temp-in"),

        // ETAPA 2: Después de la Filtración (Salida)
        valPhOut: document.getElementById("val-ph-out"),
        gaugePhOutProgress: document.getElementById("gauge-ph-out-progress"),
        pillPhOut: document.getElementById("pill-ph-out"),
        feedbackPhOut: document.getElementById("feedback-ph-out"),
        minPhOut: document.getElementById("min-ph-out"),
        avgPhOut: document.getElementById("avg-ph-out"),
        maxPhOut: document.getElementById("max-ph-out"),

        valTurbOut: document.getElementById("val-turb-out"),
        barTurbOut: document.getElementById("bar-turb-out"),
        pillTurbOut: document.getElementById("pill-turb-out"),
        feedbackTurbOut: document.getElementById("feedback-turb-out"),
        minTurbOut: document.getElementById("min-turb-out"),
        avgTurbOut: document.getElementById("avg-turb-out"),
        maxTurbOut: document.getElementById("max-turb-out"),

        valTempOut: document.getElementById("val-temp-out"),
        barTempOut: document.getElementById("bar-temp-out"),
        pillTempOut: document.getElementById("pill-temp-out"),
        feedbackTempOut: document.getElementById("feedback-temp-out"),
        minTempOut: document.getElementById("min-temp-out"),
        avgTempOut: document.getElementById("avg-temp-out"),
        maxTempOut: document.getElementById("max-temp-out"),

        // Barra de Telemetría
        lastUpdateTime: document.getElementById("last-update-time"),
        packetsCount: document.getElementById("packets-count"),
        firebasePathText: document.getElementById("firebase-path-text"),
        btnExportPdf: document.getElementById("btn-export-pdf"),
        btnExportCsv: document.getElementById("btn-export-csv"),
        btnClearHistory: document.getElementById("btn-clear-history"),
        selectChartPoints: document.getElementById("select-chart-points"),

        // Bitácora y Notificaciones
        systemLogs: document.getElementById("system-logs"),
        logsCount: document.getElementById("logs-count"),
        toastContainer: document.getElementById("toast-container")
    };

    // 1. Inicializar iconos visuales y partículas de fondo
    if (window.lucide) lucide.createIcons();
    createSubtleParticles();

    // 2. Inicializar las tres gráficas históricas comparativas (Chart.js)
    if (typeof initializeCharts === 'function') {
        initializeCharts();
    }

    // 3. Iniciar reloj del sistema
    updateClock();
    setInterval(updateClock, 1000);

    // 4. Mostrar ruta configurada en la UI
    if (ui.firebasePathText) {
        ui.firebasePathText.textContent = FIREBASE_DATA_PATH;
    }

    // 5. Inicializar estado visual del botón de alarma acústica
    updateSoundButtonUI(ui);

    // 6. Conexión a Firebase Realtime Database
    initFirebase(ui);

    // 7. Monitoreo del estado del dispositivo (Heartbeat)
    setInterval(() => {
        checkDeviceHeartbeat(ui);
    }, 4000);

    // 8. Enlazar eventos de botones e interacción
    bindEventListeners(ui);
});

/**
 * Inicialización y escuchadores de Firebase Realtime Database
 */
function initFirebase(ui) {
    const isConfigPlaceholder = 
        !firebaseConfig.apiKey || 
        firebaseConfig.apiKey.includes("TU_API_KEY") ||
        firebaseConfig.databaseURL.includes("TU_PROYECTO");

    if (isConfigPlaceholder) {
        if (ui.setupNotice) ui.setupNotice.style.display = "flex";
        if (ui.firebaseStatusText) ui.firebaseStatusText.textContent = "Firebase: Configuración requerida";
        updateDeviceStatus(ui, 'disconnected', "SIN CONFIGURACIÓN DE FIREBASE");
        logMessage("Aviso: Configura tus credenciales de Firebase en 'js/app.js' para conectar el dispositivo.", "warning", ui);
        return;
    }

    if (ui.setupNotice) ui.setupNotice.style.display = "none";

    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        AppState.firebaseInitialized = true;
        logMessage("Firebase SDK inicializado correctamente.", "info", ui);

        const database = firebase.database();

        // Escuchar estado de conexión general (.info/connected)
        const connectedRef = database.ref(".info/connected");
        connectedRef.on("value", (snap) => {
            if (snap.val() === true) {
                AppState.firebaseConnected = true;
                if (ui.firebaseStatusText) ui.firebaseStatusText.textContent = "Firebase: Conectado";
                if (ui.firebaseStatusBadge) {
                    ui.firebaseStatusBadge.style.borderColor = "rgba(0, 230, 118, 0.3)";
                    ui.firebaseStatusBadge.style.color = "var(--accent-emerald)";
                }
                logMessage("Conexión establecida con Firebase Realtime Database.", "success", ui);
            } else {
                AppState.firebaseConnected = false;
                if (ui.firebaseStatusText) ui.firebaseStatusText.textContent = "Firebase: Desconectado";
                if (ui.firebaseStatusBadge) {
                    ui.firebaseStatusBadge.style.borderColor = "rgba(255, 61, 0, 0.3)";
                    ui.firebaseStatusBadge.style.color = "var(--accent-red)";
                }
                updateDeviceStatus(ui, 'disconnected', "SIN CONEXIÓN A INTERNET/BD");
            }
        });

        // Escuchar lecturas de sensores en tiempo real
        const sensorRef = database.ref(FIREBASE_DATA_PATH);
        sensorRef.on("value", (snapshot) => {
            const data = snapshot.val();
            if (data !== null && typeof data === 'object') {
                processIncomingReading(data, ui);
            } else if (data !== null) {
                logMessage(`Dato recibido con formato inesperado: ${JSON.stringify(data)}`, "warning", ui);
            } else {
                logMessage("Esperando que el dispositivo publique telemetría en 'sensores'...", "info", ui);
            }
        }, (error) => {
            console.error("Error de lectura en Firebase:", error);
            logMessage(`Error de lectura en Firebase: ${error.message}`, "alert", ui);
            updateDeviceStatus(ui, 'disconnected', "ERROR DE LECTURA BD");
        });

    } catch (err) {
        console.error("Error al inicializar Firebase:", err);
        logMessage(`Excepción al inicializar Firebase: ${err.message}`, "alert", ui);
        updateDeviceStatus(ui, 'disconnected', "ERROR AL INICIALIZAR");
    }
}

/**
 * Función auxiliar para extraer números de múltiples nombres de clave posibles
 */
function extractNumber(obj, ...keys) {
    if (!obj || typeof obj !== 'object') return null;
    for (const k of keys) {
        if (obj[k] !== undefined && obj[k] !== null) {
            const val = parseFloat(obj[k]);
            if (!isNaN(val)) return val;
        }
    }
    return null;
}

/**
 * Procesamiento de telemetría:
 * Soporta estructuras anidadas (sensores.antes, sensores.despues)
 * o estructuras planas (ph_antes, ph_despues, turb_in, turb_out, etc.)
 */
function processIncomingReading(data, ui) {
    // 1. Evaluación de estado de conexión 'online'
    let onlineProp = data.online !== undefined ? data.online : (data.Online !== undefined ? data.Online : undefined);
    if (onlineProp !== undefined) {
        AppState.explicitOnlineProvided = true;
        let isOnline = false;
        if (typeof onlineProp === 'boolean') isOnline = onlineProp;
        else if (typeof onlineProp === 'number') isOnline = onlineProp === 1;
        else if (typeof onlineProp === 'string') {
            const lower = onlineProp.trim().toLowerCase();
            isOnline = (lower === 'true' || lower === '1' || lower === 'online' || lower === 'activo');
        }

        AppState.deviceConnected = isOnline;
        AppState.currentData.online = isOnline;
        updateDeviceStatus(ui, isOnline ? 'connected' : 'disconnected', isOnline ? "DISPOSITIVO EN LÍNEA" : "DISPOSITIVO DESCONECTADO");
    }

    // 2. Extracción de valores ANTES de la filtración (Entrada / Agua Cruda)
    let antesObj = data.antes || data.entrada || data.in || data.afluente || {};
    let phIn = extractNumber(antesObj, 'ph', 'pH', 'PH') ??
               extractNumber(data, 'ph_antes', 'ph_in', 'ph_entrada', 'ph_afluente');

    let turbIn = extractNumber(antesObj, 'turbidez', 'turbidity', 'turb', 'ntu') ??
                 extractNumber(data, 'turbidez_antes', 'turb_in', 'turbidez_entrada', 'turb_antes', 'ntu_antes');

    let tempIn = extractNumber(antesObj, 'temperatura', 'temperature', 'temp', 'tempC') ??
                 extractNumber(data, 'temperatura_antes', 'temp_in', 'temp_entrada', 'temperatura_entrada');

    // 3. Extracción de valores DESPUÉS de la filtración (Salida / Agua Filtrada)
    let despuesObj = data.despues || data.salida || data.out || data.efluente || {};
    let phOut = extractNumber(despuesObj, 'ph', 'pH', 'PH') ??
                extractNumber(data, 'ph_despues', 'ph_out', 'ph_salida', 'ph_efluente');

    let turbOut = extractNumber(despuesObj, 'turbidez', 'turbidity', 'turb', 'ntu') ??
                  extractNumber(data, 'turbidez_despues', 'turb_out', 'turbidez_salida', 'turb_despues', 'ntu_despues');

    let tempOut = extractNumber(despuesObj, 'temperatura', 'temperature', 'temp', 'tempC') ??
                  extractNumber(data, 'temperatura_despues', 'temp_out', 'temp_salida', 'temperatura_salida');

    // Validar disponibilidad de sensores de salida
    if (data.salida?.online === false) {
        phOut = null;
        turbOut = null;
        tempOut = null;
    } else if (data.salida?.turbidez_estado === "SENSOR DESCONECTADO") {
        turbOut = null;
    }
    if (!data.entrada && !data.salida) {
    // 4. Retrocompatibilidad: Si solo se enviaron claves raíz (ph, turbidez, temperatura)
    if (phOut === null && phIn === null && data.ph !== undefined) {
        phOut = parseFloat(data.ph);
    }
    if (turbOut === null && turbIn === null && (data.turbidez !== undefined || data.turb !== undefined)) {
        turbOut = parseFloat(data.turbidez ?? data.turb);
    }
    if (tempOut === null && tempIn === null && (data.temperatura !== undefined || data.temp !== undefined)) {
        tempOut = parseFloat(data.temperatura ?? data.temp);
    }

    }

    // Si aún no tenemos ambos valores, mantener el anterior en caché o reflejar
    if (phIn === null && AppState.currentData.antes.ph !== null) phIn = AppState.currentData.antes.ph;
    if (turbIn === null && AppState.currentData.antes.turb !== null) turbIn = AppState.currentData.antes.turb;
    if (tempIn === null && AppState.currentData.antes.temp !== null) tempIn = AppState.currentData.antes.temp;

    // Verificar si llegó al menos un dato numérico válido
    const hasAnyValidData = phIn !== null || phOut !== null || turbIn !== null || turbOut !== null || tempIn !== null || tempOut !== null;
    if (!hasAnyValidData) {
        return;
    }

    const now = new Date();
    AppState.lastPacketTime = now;
    AppState.packetCount++;

    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    if (!AppState.explicitOnlineProvided) {
        AppState.deviceConnected = true;
        updateDeviceStatus(ui, 'connected', "DISPOSITIVO EN LÍNEA");
    }

    // 5. Cálculos de Rendimiento del Filtro
    let turbRemoved = (turbIn !== null && turbOut !== null) ? Math.max(0, turbIn - turbOut) : null;
    let efficiencyPct = null;
    if (turbIn !== null && turbOut !== null && turbIn > 0 && data.salida?.online !== false && data.salida?.turbidez_estado !== "SENSOR DESCONECTADO" && data.turbidez_estado !== "SENSOR DESCONECTADO") {
        efficiencyPct = Math.max(0, Math.min(100, ((turbIn - turbOut) / turbIn) * 100));
    }
    let phDelta = (phIn !== null && phOut !== null) ? (phOut - phIn) : null;
    let tempDelta = (tempIn !== null && tempOut !== null) ? (tempOut - tempIn) : null;

    // Limpiar valores actuales de salida cuando no exista lectura valida
    AppState.currentData.despues.ph = phOut;
    AppState.currentData.despues.turb = turbOut;
    AppState.currentData.despues.temp = tempOut;

    // Actualizar caché de AppState
    if (phIn !== null) AppState.currentData.antes.ph = phIn;
    if (turbIn !== null) AppState.currentData.antes.turb = turbIn;
    if (tempIn !== null) AppState.currentData.antes.temp = tempIn;

    if (phOut !== null) AppState.currentData.despues.ph = phOut;
    if (turbOut !== null) AppState.currentData.despues.turb = turbOut;
    if (tempOut !== null) AppState.currentData.despues.temp = tempOut;

    AppState.currentData.filter = { efficiencyPct, turbRemoved, phDelta, tempDelta };

    // 6. Actualizar Banner Hero de Eficiencia del Filtro
    updateFilterHeroBanner(efficiencyPct, turbRemoved, phDelta, tempDelta, turbOut, ui);

    // 7. Actualizar Tarjetas Etapa 1: Antes de la Filtración
    if (phIn !== null) {
        updateStagePhCard(phIn, ui.valPhIn, ui.gaugePhInProgress, ui.pillPhIn, ui.feedbackPhIn, false);
        updateStat('phIn', phIn);
        renderStats('phIn', ui.minPhIn, ui.avgPhIn, ui.maxPhIn, 2);
    }
    if (turbIn !== null) {
        updateStageTurbCard(turbIn, ui.valTurbIn, ui.barTurbIn, ui.pillTurbIn, ui.feedbackTurbIn, false);
        updateStat('turbIn', turbIn);
        renderStats('turbIn', ui.minTurbIn, ui.avgTurbIn, ui.maxTurbIn, 2);
    }
    if (tempIn !== null) {
        updateStageTempCard(tempIn, ui.valTempIn, ui.barTempIn, ui.pillTempIn, ui.feedbackTempIn, false);
        updateStat('tempIn', tempIn);
        renderStats('tempIn', ui.minTempIn, ui.avgTempIn, ui.maxTempIn, 1);
    }

    // 8. Actualizar Tarjetas Etapa 2: Después de la Filtración
    if (phOut !== null) {
        updateStagePhCard(phOut, ui.valPhOut, ui.gaugePhOutProgress, ui.pillPhOut, ui.feedbackPhOut, true);
        updateStat('phOut', phOut);
        renderStats('phOut', ui.minPhOut, ui.avgPhOut, ui.maxPhOut, 2);
    }
    if (turbOut !== null) {
        updateStageTurbCard(turbOut, ui.valTurbOut, ui.barTurbOut, ui.pillTurbOut, ui.feedbackTurbOut, true);
        updateStat('turbOut', turbOut);
        renderStats('turbOut', ui.minTurbOut, ui.avgTurbOut, ui.maxTurbOut, 2);
    }
    if (tempOut !== null) {
        updateStageTempCard(tempOut, ui.valTempOut, ui.barTempOut, ui.pillTempOut, ui.feedbackTempOut, true);
        updateStat('tempOut', tempOut);
        renderStats('tempOut', ui.minTempOut, ui.avgTempOut, ui.maxTempOut, 1);
    }

    if (efficiencyPct !== null) {
        updateStat('efficiency', efficiencyPct);
    }

    // Limpiar indicadores actuales de salida sin borrar el historial
    function limpiarIndicadorSalida(valor, barra, estado, descripcion, mensaje) {
        if (valor) valor.textContent = "--";
        if (barra) {
            barra.style.width = "0%";
            barra.style.strokeDashoffset = "";
        }
        if (estado) {
            estado.className = "status-pill status-neutral";
            estado.textContent = mensaje;
        }
        if (descripcion) descripcion.textContent = "Sin medicion actual disponible";
    }

    if (phOut === null) {
        limpiarIndicadorSalida(ui.valPhOut, null, ui.pillPhOut, ui.feedbackPhOut, "SIN DATOS");
        if (ui.gaugePhOutProgress) {
            ui.gaugePhOutProgress.style.strokeDashoffset = "999";
        }
    }

    if (turbOut === null) {
        limpiarIndicadorSalida(
            ui.valTurbOut, ui.barTurbOut, ui.pillTurbOut,
            ui.feedbackTurbOut,
            data.salida?.turbidez_estado === "SENSOR DESCONECTADO"
                ? "SENSOR DESCONECTADO" : "SIN DATOS"
        );
    }

    if (tempOut === null) {
        limpiarIndicadorSalida(ui.valTempOut, ui.barTempOut, ui.pillTempOut, ui.feedbackTempOut, "SIN DATOS");
    }
    // 9. Actualizar Gráficas Comparativas (Línea Antes vs Línea Después)
    if (typeof addChartReading === 'function') {
        addChartReading(
            timeStr,
            phIn !== null ? phIn : null,
            phOut !== null ? phOut : null,
            turbIn !== null ? turbIn : null,
            turbOut !== null ? turbOut : null,
            tempIn !== null ? tempIn : null,
            tempOut !== null ? tempOut : null
        );
    }

    // 10. Registrar en la lista para exportar a CSV y PDF
    AppState.readingsLog.push({
        timestamp: now.toISOString(),
        hora: timeStr,
        ph_antes: phIn !== null ? phIn.toFixed(2) : '--',
        ph_despues: phOut !== null ? phOut.toFixed(2) : '--',
        delta_ph: phDelta !== null ? (phDelta >= 0 ? `+${phDelta.toFixed(2)}` : phDelta.toFixed(2)) : '--',
        turbidez_antes: turbIn !== null ? turbIn.toFixed(2) : '--',
        turbidez_despues: turbOut !== null ? turbOut.toFixed(2) : '--',
        turbidez_removida: turbRemoved !== null ? turbRemoved.toFixed(2) : '--',
        eficiencia_pct: efficiencyPct !== null ? efficiencyPct.toFixed(1) : '--',
        temp_antes: tempIn !== null ? tempIn.toFixed(1) : '--',
        temp_despues: tempOut !== null ? tempOut.toFixed(1) : '--',
        online: AppState.deviceConnected ? 'true' : 'false'
    });

    // 11. Actualizar barra de telemetría
    if (ui.lastUpdateTime) ui.lastUpdateTime.textContent = timeStr;
    if (ui.packetsCount) ui.packetsCount.textContent = `${AppState.packetCount} muestra${AppState.packetCount === 1 ? '' : 's'}`;

    // 12. Evaluación de alertas y disparo de alarmas acústicas/toasts
    evaluateDualStageAlerts(phIn, phOut, turbIn, turbOut, tempOut, efficiencyPct, ui);

    // Registro en la bitácora
    logMessage(`Telemetría recibida | Entrada: Turb ${turbIn !== null ? turbIn.toFixed(1) : '--'} NTU, pH ${phIn !== null ? phIn.toFixed(2) : '--'} -> Salida: Turb ${turbOut !== null ? turbOut.toFixed(2) : '--'} NTU (Eficiencia: ${efficiencyPct !== null ? efficiencyPct.toFixed(1) + '%' : '--'})`, "success", ui);
}

/**
 * Actualización del Banner Hero de Eficiencia del Filtro
 */
function updateFilterHeroBanner(efficiencyPct, turbRemoved, phDelta, tempDelta, turbOut, ui) {
    if (ui.valFilterEfficiency) {
        ui.valFilterEfficiency.textContent = efficiencyPct !== null ? efficiencyPct.toFixed(1) : '--';
    }
    if (ui.barFilterEfficiency) {
        ui.barFilterEfficiency.style.width = efficiencyPct !== null ? `${Math.min(100, Math.max(0, efficiencyPct))}%` : '0%';
    }
    if (ui.valTurbRemoved) {
        ui.valTurbRemoved.textContent = turbRemoved !== null ? turbRemoved.toFixed(2) : '--';
    }
    if (ui.valPhDelta) {
        if (phDelta !== null) {
            ui.valPhDelta.textContent = (phDelta >= 0 ? `+${phDelta.toFixed(2)}` : phDelta.toFixed(2));
        } else {
            ui.valPhDelta.textContent = '--';
        }
    }
    if (ui.valTempDelta) {
        if (tempDelta !== null) {
            ui.valTempDelta.textContent = (tempDelta >= 0 ? `+${tempDelta.toFixed(1)}` : tempDelta.toFixed(1));
        } else {
            ui.valTempDelta.textContent = '--';
        }
    }

    // Píldora de estado general del filtro
    if (ui.pillFilterStatus) {
        ui.pillFilterStatus.className = "status-pill";
        if (efficiencyPct === null) {
            ui.pillFilterStatus.classList.add("status-waiting");
            ui.pillFilterStatus.textContent = "Sin datos de entrada/salida";
        } else if (turbOut !== null && turbOut > 10.0) {
            ui.pillFilterStatus.classList.add("status-critical");
            ui.pillFilterStatus.textContent = "Filtro Saturado / Lavado Requerido";
            if (ui.hintFilterEfficiency) ui.hintFilterEfficiency.textContent = "¡Urgente! El filtro no logra retener los sólidos suspendidos.";
        } else if (efficiencyPct >= 85.0 && (turbOut === null || turbOut <= 5.0)) {
            ui.pillFilterStatus.classList.add("status-excellent");
            ui.pillFilterStatus.textContent = "Filtro Óptimo (Alta Eficiencia)";
            if (ui.hintFilterEfficiency) ui.hintFilterEfficiency.textContent = "Excelente remoción de turbidez en el efluente.";
        } else if (efficiencyPct >= 65.0) {
            ui.pillFilterStatus.classList.add("status-neutral");
            ui.pillFilterStatus.textContent = "Eficiencia Aceptable";
            if (ui.hintFilterEfficiency) ui.hintFilterEfficiency.textContent = "Filtración en parámetros operativos normales.";
        } else {
            ui.pillFilterStatus.classList.add("status-warning");
            ui.pillFilterStatus.textContent = "Baja Remoción / Revisar Filtro";
            if (ui.hintFilterEfficiency) ui.hintFilterEfficiency.textContent = "La eficiencia ha caído por debajo del 65%.";
        }
    }
}

/**
 * Actualizar tarjeta de pH (reutilizable para Entrada y Salida)
 */
function updateStagePhCard(val, valEl, gaugeEl, pillEl, feedbackEl, isOutputStage) {
    if (valEl) valEl.textContent = val.toFixed(2);

    if (gaugeEl) {
        const maxOffset = 251.2;
        const clampedVal = Math.max(0, Math.min(14, val));
        const percent = clampedVal / 14.0;
        gaugeEl.style.strokeDashoffset = maxOffset - (percent * maxOffset);
    }

    if (pillEl) {
        pillEl.className = "status-pill";
        if (val < 6.0) {
            pillEl.classList.add("status-critical");
            pillEl.textContent = "Ácido Peligroso";
            if (feedbackEl) feedbackEl.textContent = "pH muy bajo (ácido).";
        } else if (val < 6.5) {
            pillEl.classList.add("status-warning");
            pillEl.textContent = "Ligeramente Ácido";
            if (feedbackEl) feedbackEl.textContent = "Inferior a norma OMS (6.5 - 8.5).";
        } else if (val > 9.0) {
            pillEl.classList.add("status-critical");
            pillEl.textContent = "Alcalino Peligroso";
            if (feedbackEl) feedbackEl.textContent = "pH excesivamente alto.";
        } else if (val > 8.5) {
            pillEl.classList.add("status-warning");
            pillEl.textContent = "Ligeramente Alcalino";
            if (feedbackEl) feedbackEl.textContent = "Superior a norma OMS (6.5 - 8.5).";
        } else {
            pillEl.classList.add(isOutputStage ? "status-excellent" : "status-neutral");
            pillEl.textContent = isOutputStage ? "Óptimo Potable" : "Rango Neutro";
            if (feedbackEl) feedbackEl.textContent = isOutputStage ? "Cumple norma de potabilidad OMS." : "Condición afluente adecuada.";
        }
    }
}

/**
 * Actualizar tarjeta de Turbidez (reutilizable para Entrada y Salida)
 */
function updateStageTurbCard(val, valEl, barEl, pillEl, feedbackEl, isOutputStage) {
    if (valEl) valEl.textContent = val.toFixed(2);

    if (barEl) {
        const percent = Math.min(100, Math.max(0, (val / 30.0) * 100));
        barEl.style.width = `${percent}%`;
    }

    if (pillEl) {
        pillEl.className = "status-pill";
        if (val <= 1.0) {
            pillEl.classList.add("status-excellent");
            pillEl.textContent = "Cristalina (< 1 NTU)";
            if (feedbackEl) feedbackEl.textContent = "Máxima pureza óptica del agua.";
        } else if (val <= 5.0) {
            pillEl.classList.add(isOutputStage ? "status-excellent" : "status-neutral");
            pillEl.textContent = isOutputStage ? "Apta OMS (< 5 NTU)" : "Turbidez Baja";
            if (feedbackEl) feedbackEl.textContent = isOutputStage ? "Apta para consumo humano." : "Baja carga inicial de sólidos.";
        } else if (val <= 15.0) {
            pillEl.classList.add("status-warning");
            pillEl.textContent = "Turbidez Moderada";
            if (feedbackEl) feedbackEl.textContent = isOutputStage ? "Excede el límite guía de 5.0 NTU." : "Requiere proceso de filtración.";
        } else {
            pillEl.classList.add("status-critical");
            pillEl.textContent = isOutputStage ? "Turbidez Excesiva" : "Agua Muy Turbia";
            if (feedbackEl) feedbackEl.textContent = isOutputStage ? "El filtro no retiene los sólidos." : "Alta concentración de sedimentos.";
        }
    }
}

/**
 * Actualizar tarjeta de Temperatura (reutilizable para Entrada y Salida)
 */
function updateStageTempCard(val, valEl, barEl, pillEl, feedbackEl, isOutputStage) {
    if (valEl) valEl.textContent = val.toFixed(1);

    if (barEl) {
        const percent = Math.min(100, Math.max(0, (val / 50.0) * 100));
        barEl.style.width = `${percent}%`;
    }

    if (pillEl) {
        pillEl.className = "status-pill";
        if (val < 10.0) {
            pillEl.classList.add("status-neutral");
            pillEl.textContent = "Baja (< 10°C)";
            if (feedbackEl) feedbackEl.textContent = "Temperatura fría.";
        } else if (val <= 25.0) {
            pillEl.classList.add("status-excellent");
            pillEl.textContent = "Normal / Óptima";
            if (feedbackEl) feedbackEl.textContent = "Rango ideal para distribución.";
        } else if (val <= 32.0) {
            pillEl.classList.add("status-warning");
            pillEl.textContent = "Templada";
            if (feedbackEl) feedbackEl.textContent = "Temperatura moderada.";
        } else {
            pillEl.classList.add("status-critical");
            pillEl.textContent = "Elevada (> 32°C)";
            if (feedbackEl) feedbackEl.textContent = "Temperatura inusualmente alta.";
        }
    }
}

/**
 * Actualizar indicador visual de conexión del dispositivo
 */
function updateDeviceStatus(ui, state, text) {
    if (!ui.deviceStatusDot || !ui.deviceStatusText) return;

    ui.deviceStatusText.textContent = text;
    ui.deviceStatusDot.className = "status-dot";

    if (state === 'connected') {
        ui.deviceStatusDot.classList.add("green-pulse");
        ui.deviceStatusText.style.color = "var(--accent-emerald)";
        if (ui.deviceStatusBadge) {
            ui.deviceStatusBadge.style.borderColor = "rgba(0, 230, 118, 0.3)";
            ui.deviceStatusBadge.style.background = "rgba(0, 230, 118, 0.08)";
        }
        if (AppState.lastNotifiedStates.deviceConnectedState !== true) {
            AppState.lastNotifiedStates.deviceConnectedState = true;
            showToast("Dispositivo IoT Conectado", "Recibiendo telemetría en tiempo real desde el microcontrolador.", "success", 4000);
        }
    } else if (state === 'idle') {
        ui.deviceStatusDot.classList.add("amber-pulse");
        ui.deviceStatusText.style.color = "var(--accent-amber)";
        if (ui.deviceStatusBadge) {
            ui.deviceStatusBadge.style.borderColor = "rgba(255, 179, 0, 0.3)";
            ui.deviceStatusBadge.style.background = "rgba(255, 179, 0, 0.08)";
        }
    } else {
        ui.deviceStatusDot.classList.add("red-pulse");
        ui.deviceStatusText.style.color = "var(--accent-red)";
        if (ui.deviceStatusBadge) {
            ui.deviceStatusBadge.style.borderColor = "rgba(255, 61, 0, 0.3)";
            ui.deviceStatusBadge.style.background = "rgba(255, 61, 0, 0.08)";
        }
        if (AppState.lastNotifiedStates.deviceConnectedState === true) {
            AppState.lastNotifiedStates.deviceConnectedState = false;
            showToast("Dispositivo Desconectado", "Se interrumpió la señal del microcontrolador IoT.", "warning", 5000);
            playWarningAlarm();
        }
    }
}

/**
 * Verificación periódica de inactividad del dispositivo (Heartbeat)
 */
function checkDeviceHeartbeat(ui) {
    if (AppState.explicitOnlineProvided) return;
    if (!AppState.lastPacketTime) return;

    const secondsSinceLastPacket = (Date.now() - AppState.lastPacketTime.getTime()) / 1000;
    if (secondsSinceLastPacket > AppState.heartbeatTimeoutSeconds) {
        if (AppState.deviceConnected) {
            AppState.deviceConnected = false;
            logMessage(`Dispositivo inactivo: no se reciben lecturas desde hace ${Math.round(secondsSinceLastPacket)}s.`, "warning", ui);
        }
        updateDeviceStatus(ui, 'idle', "DISPOSITIVO INACTIVO (SIN SEÑAL RECIENTE)");
    } else {
        AppState.deviceConnected = true;
    }
}

/**
 * Acumulador de estadísticas en sesión (Min, Promedio, Max)
 */
function updateStat(key, val) {
    const s = AppState.stats[key];
    if (!s) return;
    if (s.min === null || val < s.min) s.min = val;
    if (s.max === null || val > s.max) s.max = val;
    s.sum += val;
    s.count++;
}

function renderStats(key, minEl, avgEl, maxEl, decimals = 2) {
    const s = AppState.stats[key];
    if (!s || s.count === 0) return;
    if (minEl) minEl.textContent = s.min.toFixed(decimals);
    if (avgEl) avgEl.textContent = (s.sum / s.count).toFixed(decimals);
    if (maxEl) maxEl.textContent = s.max.toFixed(decimals);
}

/**
 * Sistema de Bitácora y Registro de Eventos
 */
function logMessage(message, type = 'info', ui) {
    if (!ui || !ui.systemLogs) return;

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const logEntry = document.createElement("div");
    logEntry.className = "log-entry";

    let typeClass = "log-info";
    let prefix = "ℹ ";
    if (type === 'success') { typeClass = "log-success"; prefix = "✔ "; }
    else if (type === 'warning') { typeClass = "log-warning"; prefix = "▲ "; }
    else if (type === 'alert') { typeClass = "log-alert"; prefix = "✘ "; }

    logEntry.innerHTML = `<span class="log-time">[${time}]</span><span class="${typeClass}">${prefix}${message}</span>`;
    ui.systemLogs.appendChild(logEntry);

    ui.systemLogs.scrollTop = ui.systemLogs.scrollHeight;

    if (ui.logsCount) {
        ui.logsCount.textContent = `${ui.systemLogs.children.length} eventos`;
    }
}

/**
 * Reloj en tiempo real en la cabecera
 */
function updateClock() {
    const clockEl = document.getElementById("live-clock");
    if (clockEl) {
        clockEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
}

/**
 * Creación de partículas sutiles de fondo
 */
function createSubtleParticles() {
    const container = document.getElementById("particle-container");
    if (!container) return;
    container.innerHTML = "";
    for (let i = 0; i < 24; i++) {
        const bubble = document.createElement("div");
        bubble.className = "bubble";
        bubble.style.left = `${Math.random() * 100}vw`;
        bubble.style.width = `${Math.random() * 6 + 3}px`;
        bubble.style.height = bubble.style.width;
        bubble.style.animationDuration = `${Math.random() * 14 + 8}s`;
        bubble.style.animationDelay = `${Math.random() * 10}s`;
        bubble.style.opacity = `${Math.random() * 0.12 + 0.04}`;
        container.appendChild(bubble);
    }
}

/**
 * Enlazar listeners de botones e interacción
 */
function bindEventListeners(ui) {
    // Descartar banner de aviso de configuración
    if (ui.btnDismissNotice && ui.setupNotice) {
        ui.btnDismissNotice.addEventListener("click", () => {
            ui.setupNotice.style.display = "none";
        });
    }

    // Selector de muestras en gráficas
    if (ui.selectChartPoints) {
        ui.selectChartPoints.addEventListener("change", (e) => {
            if (typeof setMaxChartPoints === 'function') {
                setMaxChartPoints(e.target.value);
                logMessage(`Resolución histórica ajustada a las últimas ${e.target.value} lecturas.`, "info", ui);
            }
        });
    }

    // Botón Limpiar Gráficas y Estadísticas
    if (ui.btnClearHistory) {
        ui.btnClearHistory.addEventListener("click", () => {
            if (typeof clearChartData === 'function') {
                clearChartData();
            }
            AppState.stats = {
                phIn: { min: null, max: null, sum: 0, count: 0 },
                phOut: { min: null, max: null, sum: 0, count: 0 },
                turbIn: { min: null, max: null, sum: 0, count: 0 },
                turbOut: { min: null, max: null, sum: 0, count: 0 },
                tempIn: { min: null, max: null, sum: 0, count: 0 },
                tempOut: { min: null, max: null, sum: 0, count: 0 },
                efficiency: { min: null, max: null, sum: 0, count: 0 }
            };

            const resetEls = [
                ui.minPhIn, ui.avgPhIn, ui.maxPhIn, ui.minTurbIn, ui.avgTurbIn, ui.maxTurbIn, ui.minTempIn, ui.avgTempIn, ui.maxTempIn,
                ui.minPhOut, ui.avgPhOut, ui.maxPhOut, ui.minTurbOut, ui.avgTurbOut, ui.maxTurbOut, ui.minTempOut, ui.avgTempOut, ui.maxTempOut
            ];
            resetEls.forEach(el => { if (el) el.textContent = '--'; });

            logMessage("Historial de gráficas y estadísticas restablecido.", "info", ui);
        });
    }

    // Botón Alternar Alarma Sonora
    if (ui.btnSoundToggle) {
        ui.btnSoundToggle.addEventListener("click", () => {
            getAudioContext();
            AppState.soundAlarmEnabled = !AppState.soundAlarmEnabled;
            localStorage.setItem('water_monitor_sound', AppState.soundAlarmEnabled ? 'true' : 'false');
            updateSoundButtonUI(ui);

            if (AppState.soundAlarmEnabled) {
                showToast("Alarma Sonora Activada", "Se emitirá un aviso acústico al detectar lecturas fuera de norma.", "info", 3500);
                playWarningAlarm();
                logMessage("Alarma acústica habilitada por el usuario.", "info", ui);
            } else {
                showToast("Alarma Sonora Silenciada", "Los avisos acústicos han sido desactivados.", "info", 3500);
                logMessage("Alarma acústica silenciada por el usuario.", "warning", ui);
            }
        });
    }

    // Botón Exportar PDF
    if (ui.btnExportPdf) {
        ui.btnExportPdf.addEventListener("click", () => {
            exportPdfReport(ui);
        });
    }

    // Botón Exportar CSV
    if (ui.btnExportCsv) {
        ui.btnExportCsv.addEventListener("click", () => {
            if (AppState.readingsLog.length === 0) {
                showToast("Sin lecturas", "No hay registros en memoria para exportar a CSV todavía.", "warning", 3500);
                logMessage("No hay registros en memoria para exportar todavía.", "warning", ui);
                return;
            }

            const headers = "timestamp_iso,hora,ph_antes,ph_despues,delta_ph,turbidez_antes_ntu,turbidez_despues_ntu,turbidez_removida_ntu,eficiencia_pct,temp_antes_c,temp_despues_c,online\n";
            const rows = AppState.readingsLog.map(r => 
                `"${r.timestamp}","${r.hora}",${r.ph_antes},${r.ph_despues},${r.delta_ph},${r.turbidez_antes},${r.turbidez_despues},${r.turbidez_removida},${r.eficiencia_pct},${r.temp_antes},${r.temp_despues},${r.online}`
            ).join("\n");

            const csvContent = headers + rows;
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `monitoreo_filtracion_${new Date().toISOString().slice(0, 10)}_${Date.now()}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showToast("Reporte CSV Descargado", `${AppState.readingsLog.length} registros comparativos exportados.`, "success", 3500);
            logMessage(`Descargado reporte CSV con ${AppState.readingsLog.length} registros comparativos.`, "success", ui);
        });
    }
}

/**
 * =============================================================================
 * SISTEMA DE ALARMAS ACÚSTICAS Y NOTIFICACIONES
 * =============================================================================
 */

let audioCtx = null;

function getAudioContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

function updateSoundButtonUI(ui) {
    if (!ui.btnSoundToggle) return;
    if (AppState.soundAlarmEnabled) {
        ui.btnSoundToggle.classList.remove("sound-muted");
        if (ui.soundStatusText) ui.soundStatusText.textContent = "Alarma: On";
        if (ui.soundIcon) ui.soundIcon.setAttribute("data-lucide", "volume-2");
    } else {
        ui.btnSoundToggle.classList.add("sound-muted");
        if (ui.soundStatusText) ui.soundStatusText.textContent = "Alarma: Mute";
        if (ui.soundIcon) ui.soundIcon.setAttribute("data-lucide", "volume-x");
    }
    if (window.lucide) lucide.createIcons();
}

function playWarningAlarm() {
    if (!AppState.soundAlarmEnabled) return;
    const now = Date.now();
    if (now - AppState.lastAlarmTime < AppState.alarmCooldownMs) return;
    AppState.lastAlarmTime = now;

    try {
        const ctx = getAudioContext();
        if (!ctx) return;

        const playBeep = (freq, startTime, duration) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, startTime);

            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.18, startTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(startTime);
            osc.stop(startTime + duration);
        };

        const t = ctx.currentTime;
        playBeep(760, t, 0.16);
        playBeep(940, t + 0.20, 0.22);
    } catch (e) {
        console.warn("No fue posible reproducir la alarma de audio:", e);
    }
}

function showToast(title, message, type = 'info', durationMs = 5000) {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    let iconName = 'info';
    if (type === 'critical') iconName = 'alert-triangle';
    else if (type === 'warning') iconName = 'alert-circle';
    else if (type === 'success') iconName = 'check-circle';

    toast.innerHTML = `
        <i data-lucide="${iconName}" class="toast-icon"></i>
        <div class="toast-content">
            <span class="toast-title">${title}</span>
            <span class="toast-message">${message}</span>
        </div>
        <button class="toast-close" title="Cerrar">&times;</button>
    `;

    container.appendChild(toast);
    if (window.lucide) lucide.createIcons();

    const closeBtn = toast.querySelector(".toast-close");
    let autoCloseTimer = null;

    const removeToast = () => {
        if (autoCloseTimer) clearTimeout(autoCloseTimer);
        toast.classList.add("toast-hiding");
        setTimeout(() => {
            if (toast.parentNode === container) {
                container.removeChild(toast);
            }
        }, 300);
    };

    if (closeBtn) closeBtn.addEventListener("click", removeToast);
    autoCloseTimer = setTimeout(removeToast, durationMs);
}

/**
 * Evaluación de umbrales críticos en el agua de salida y estado del filtro
 */
function evaluateDualStageAlerts(phIn, phOut, turbIn, turbOut, tempOut, efficiencyPct, ui) {
    // 1. Alerta crítica de salida: Turbidez no potable (> 5.0 NTU límite OMS)
    if (turbOut !== null) {
        if (turbOut > 10.0) {
            if (!AppState.lastNotifiedStates.turbCritical) {
                AppState.lastNotifiedStates.turbCritical = true;
                showToast("¡Alerta Crítica: Efluente Turbio!", `Turbidez de salida en ${turbOut.toFixed(2)} NTU. El filtro está saturado.`, "critical", 7000);
                playWarningAlarm();
            }
        } else {
            AppState.lastNotifiedStates.turbCritical = false;
        }
    }

    // 2. Alerta crítica de pH en agua filtrada
    if (phOut !== null) {
        if (phOut < 6.0 || phOut > 9.0) {
            if (!AppState.lastNotifiedStates.phCritical) {
                AppState.lastNotifiedStates.phCritical = true;
                const desc = phOut < 6.0 ? `pH ácido (${phOut.toFixed(2)})` : `pH alcalino (${phOut.toFixed(2)})`;
                showToast("¡Alerta Crítica: pH de Salida!", `${desc}. El agua purificada está fuera de la norma sanitaria.`, "critical", 7000);
                playWarningAlarm();
            }
        } else {
            AppState.lastNotifiedStates.phCritical = false;
        }
    }

    // 3. Alerta de pérdida de eficiencia de filtración
    if (efficiencyPct !== null && turbIn !== null && turbIn > 8.0) {
        if (efficiencyPct < 60.0) {
            if (!AppState.lastNotifiedStates.filterSaturated) {
                AppState.lastNotifiedStates.filterSaturated = true;
                showToast("Baja Eficiencia del Filtro", `La remoción de turbidez cayó al ${efficiencyPct.toFixed(1)}%. Se recomienda mantenimiento o contralavado.`, "warning", 7000);
                playWarningAlarm();
            }
        } else {
            AppState.lastNotifiedStates.filterSaturated = false;
        }
    }
}

/**
 * =============================================================================
 * GENERACIÓN DE REPORTES EJECUTIVOS EN PDF (CON JSPDF + AUTOTABLE)
 * =============================================================================
 */
function exportPdfReport(ui) {
    if (AppState.readingsLog.length === 0) {
        showToast("Sin lecturas", "No hay muestras en memoria para generar el reporte en PDF todavía.", "warning", 4000);
        logMessage("Aviso: Registra al menos una muestra antes de generar el reporte PDF.", "warning", ui);
        return;
    }

    try {
        const { jsPDF } = window.jspdf || {};
        if (!jsPDF) {
            alert("La librería jsPDF no está disponible en este momento.");
            return;
        }

        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const now = new Date();
        const fechaReporte = now.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
        const horaReporte = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        // Encabezado decorativo (barra azul marino)
        doc.setFillColor(11, 20, 36);
        doc.rect(0, 0, 210, 28, 'F');

        // Línea de acento cian
        doc.setFillColor(0, 240, 255);
        doc.rect(0, 28, 210, 1.5, 'F');

        // Título del reporte
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("SISTEMA MÓVIL DE MONITOREO DE CALIDAD DEL AGUA", 14, 13);

        doc.setFontSize(8.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(164, 205, 255);
        doc.text("Reporte Ejecutivo de Rendimiento de Filtración (Antes vs Después)", 14, 20);

        // Metadatos
        doc.setFontSize(8);
        doc.setTextColor(220, 230, 242);
        doc.text(`Fecha: ${fechaReporte}  |  Hora: ${horaReporte}`, 196, 13, { align: 'right' });
        doc.text(`Total Muestras: ${AppState.readingsLog.length} paquetes`, 196, 20, { align: 'right' });

        // Bloque 1: Diagnóstico de Rendimiento del Filtro
        let currentY = 38;
        doc.setTextColor(20, 30, 50);
        doc.setFontSize(10.5);
        doc.setFont("helvetica", "bold");
        doc.text("1. Diagnóstico de Eficiencia y Remoción del Filtro", 14, currentY);

        currentY += 4;

        const effStats = AppState.stats.efficiency;
        const turbInStats = AppState.stats.turbIn;
        const turbOutStats = AppState.stats.turbOut;
        const phInStats = AppState.stats.phIn;
        const phOutStats = AppState.stats.phOut;

        const avgEff = effStats.count > 0 ? (effStats.sum / effStats.count) : null;
        const avgTurbIn = turbInStats.count > 0 ? (turbInStats.sum / turbInStats.count) : null;
        const avgTurbOut = turbOutStats.count > 0 ? (turbOutStats.sum / turbOutStats.count) : null;
        const avgPhIn = phInStats.count > 0 ? (phInStats.sum / phInStats.count) : null;
        const avgPhOut = phOutStats.count > 0 ? (phOutStats.sum / phOutStats.count) : null;

        // Tabla comparativa de parámetros
        const summaryRows = [
            [
                "Turbidez (NTU)",
                avgTurbIn !== null ? `${avgTurbIn.toFixed(2)} NTU` : '--',
                avgTurbOut !== null ? `${avgTurbOut.toFixed(2)} NTU` : '--',
                avgEff !== null ? `${avgEff.toFixed(1)}% remoción` : '--',
                "< 5.00 NTU (Norma OMS)",
                (avgTurbOut !== null && avgTurbOut <= 5.0) ? "CUMPLE (Potable)" : "FUERA DE NORMA"
            ],
            [
                "Potencial de Hidrógeno (pH)",
                avgPhIn !== null ? avgPhIn.toFixed(2) : '--',
                avgPhOut !== null ? avgPhOut.toFixed(2) : '--',
                (avgPhIn !== null && avgPhOut !== null) ? `${(avgPhOut - avgPhIn >= 0 ? '+' : '')}${(avgPhOut - avgPhIn).toFixed(2)} pH` : '--',
                "6.50 - 8.50 pH (Norma OMS)",
                (avgPhOut !== null && avgPhOut >= 6.5 && avgPhOut <= 8.5) ? "CUMPLE (Neutro)" : "FUERA DE NORMA"
            ],
            [
                "Temperatura (°C)",
                AppState.stats.tempIn.count > 0 ? `${(AppState.stats.tempIn.sum / AppState.stats.tempIn.count).toFixed(1)} °C` : '--',
                AppState.stats.tempOut.count > 0 ? `${(AppState.stats.tempOut.sum / AppState.stats.tempOut.count).toFixed(1)} °C` : '--',
                "--",
                "15.0 - 25.0 °C (Óptima)",
                "NORMAL"
            ]
        ];

        doc.autoTable({
            startY: currentY,
            head: [["Parámetro", "Antes (Entrada)", "Después (Salida)", "Variación / Eficiencia", "Norma de Referencia", "Diagnóstico Salida"]],
            body: summaryRows,
            theme: 'grid',
            headStyles: {
                fillColor: [15, 30, 55],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 8,
                halign: 'center'
            },
            bodyStyles: {
                fontSize: 7.5,
                textColor: [30, 40, 55]
            },
            columnStyles: {
                0: { fontStyle: 'bold', width: 40 },
                1: { halign: 'center', width: 26 },
                2: { halign: 'center', width: 26 },
                3: { halign: 'center', width: 34 },
                4: { halign: 'center', width: 36 },
                5: { halign: 'center', fontStyle: 'bold', width: 30 }
            },
            didParseCell: function(data) {
                if (data.section === 'body' && data.column.index === 5) {
                    if (data.cell.raw.includes("CUMPLE") || data.cell.raw === "NORMAL") {
                        data.cell.styles.textColor = [0, 130, 60];
                    } else {
                        data.cell.styles.textColor = [200, 20, 0];
                    }
                }
            }
        });

        // Bloque 2: Registro Cronológico de Muestras
        const lastAutoTableY = doc.lastAutoTable.finalY || 80;
        let detailsY = lastAutoTableY + 12;

        doc.setFontSize(10.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(20, 30, 50);
        doc.text("2. Registro Cronológico Comparativo (Últimas Muestras)", 14, detailsY);

        const recentReadings = AppState.readingsLog.slice(-45).reverse();
        const detailRows = recentReadings.map((r, idx) => [
            recentReadings.length - idx,
            r.hora,
            `${r.ph_antes} / ${r.ph_despues}`,
            `${r.turbidez_antes} / ${r.turbidez_despues}`,
            r.eficiencia_pct !== '--' ? `${r.eficiencia_pct}%` : '--',
            `${r.temp_antes} / ${r.temp_despues} °C`,
            r.online === 'true' ? 'En Línea' : 'Desconectado'
        ]);

        doc.autoTable({
            startY: detailsY + 4,
            head: [["#", "Hora", "pH (In / Out)", "Turbidez NTU (In / Out)", "Eficiencia", "Temp °C (In / Out)", "IoT"]],
            body: detailRows,
            theme: 'striped',
            headStyles: {
                fillColor: [30, 50, 80],
                textColor: [255, 255, 255],
                fontSize: 7.5,
                halign: 'center'
            },
            bodyStyles: {
                fontSize: 7,
                halign: 'center',
                textColor: [40, 50, 60]
            },
            alternateRowStyles: {
                fillColor: [245, 248, 252]
            },
            margin: { bottom: 20 },
            didDrawPage: function(data) {
                const pageCount = doc.internal.getNumberOfPages();
                doc.setFontSize(7.5);
                doc.setTextColor(120, 130, 145);
                doc.text(
                    `Reporte generado por Sistema Móvil de Monitoreo de Agua - Proyecto Firebase: ${firebaseConfig.projectId}`,
                    14,
                    290
                );
                doc.text(`Página ${data.pageNumber} de ${pageCount}`, 196, 290, { align: 'right' });
            }
        });

        const fileName = `Reporte_Filtracion_Agua_${now.toISOString().slice(0, 10)}_${Date.now()}.pdf`;
        doc.save(fileName);

        showToast("Reporte PDF Descargado", `Archivo generado: ${fileName}`, "success", 4000);
        logMessage(`Reporte formal en PDF exportado con éxito (${recentReadings.length} lecturas comparativas).`, "success", ui);

    } catch (err) {
        console.error("Error al exportar PDF:", err);
        showToast("Error en PDF", err.message, "critical", 5000);
        logMessage(`Error al generar reporte PDF: ${err.message}`, "alert", ui);
    }
}
