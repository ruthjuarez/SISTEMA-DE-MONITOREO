/**
 * ==========================================================================
 * SISTEMA DE MONITOREO DE CALIDAD DEL AGUA - CLIENTE PRINCIPAL
 * Telemetría IoT en Tiempo Real conectada a Firebase Realtime Database
 * Parámetros: pH, Turbidez (NTU), Temperatura (°C) y Estado de Conexión
 * ==========================================================================
 */

/* ==========================================================================
   >>> [SECCIÓN DE CONFIGURACIÓN DE FIREBASE REALTIME DATABASE] <<<
   Coloca aquí las credenciales de tu proyecto de Firebase Console:
   1. Ingresa a: https://console.firebase.google.com/
   2. Abre tu proyecto y dirígete a: "Configuración del proyecto" -> "Tus apps (Web </>)".
   3. Copia el objeto 'firebaseConfig' y reemplaza los valores a continuación:
   ========================================================================== */
const firebaseConfig = {
    apiKey: "TU_API_KEY_AQUI",
    authDomain: "TU_PROYECTO.firebaseapp.com",
    databaseURL: "https://TU_PROYECTO-default-rtdb.firebaseio.com",
    projectId: "TU_PROYECTO",
    storageBucket: "TU_PROYECTO.appspot.com",
    messagingSenderId: "TU_MESSAGING_SENDER_ID",
    appId: "TU_APP_ID"
};

/**
 * RUTA DEL NODO EN REALTIME DATABASE:
 * Define la ruta donde tu microcontrolador (ESP32 / Arduino / Gateway) publica sus lecturas.
 * Estructuras compatibles esperadas (las claves pueden ser en español o inglés):
 *   Ejemplo 1: { "ph": 7.35, "turbidez": 1.2, "temperatura": 24.5 }
 *   Ejemplo 2: { "pH": 7.35, "turbidity": 1.2, "temperature": 24.5, "timestamp": 1712800000 }
 */
const FIREBASE_DATA_PATH = "sensores/actual";

/* ==========================================================================
   ESTADO GLOBAL DE LA APLICACIÓN
   ========================================================================== */
const AppState = {
    firebaseInitialized: false,
    firebaseConnected: false,
    deviceConnected: false,
    lastPacketTime: null,
    packetCount: 0,
    heartbeatTimeoutSeconds: 30, // Tiempo límite sin lecturas para marcar dispositivo inactivo

    // Acumuladores de estadísticas de sesión
    stats: {
        ph: { min: null, max: null, sum: 0, count: 0 },
        turb: { min: null, max: null, sum: 0, count: 0 },
        temp: { min: null, max: null, sum: 0, count: 0 }
    },

    // Registro en memoria de lecturas reales para exportar a CSV
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

        // Sensor pH
        valPh: document.getElementById("val-ph"),
        gaugePhProgress: document.getElementById("gauge-ph-progress"),
        pillPh: document.getElementById("pill-ph"),
        feedbackPh: document.getElementById("feedback-ph"),
        minPh: document.getElementById("min-ph"),
        avgPh: document.getElementById("avg-ph"),
        maxPh: document.getElementById("max-ph"),

        // Sensor Turbidez
        valTurb: document.getElementById("val-turb"),
        barTurb: document.getElementById("bar-turb"),
        pillTurb: document.getElementById("pill-turb"),
        feedbackTurb: document.getElementById("feedback-turb"),
        minTurb: document.getElementById("min-turb"),
        avgTurb: document.getElementById("avg-turb"),
        maxTurb: document.getElementById("max-turb"),

        // Sensor Temperatura
        valTemp: document.getElementById("val-temp"),
        barTemp: document.getElementById("bar-temp"),
        pillTemp: document.getElementById("pill-temp"),
        feedbackTemp: document.getElementById("feedback-temp"),
        minTemp: document.getElementById("min-temp"),
        avgTemp: document.getElementById("avg-temp"),
        maxTemp: document.getElementById("max-temp"),

        // Barra de Telemetría
        lastUpdateTime: document.getElementById("last-update-time"),
        packetsCount: document.getElementById("packets-count"),
        firebasePathText: document.getElementById("firebase-path-text"),
        btnExportCsv: document.getElementById("btn-export-csv"),
        btnClearHistory: document.getElementById("btn-clear-history"),
        selectChartPoints: document.getElementById("select-chart-points"),

        // Bitácora
        systemLogs: document.getElementById("system-logs"),
        logsCount: document.getElementById("logs-count")
    };

    // 1. Inicializar iconos visuales y partículas de fondo
    if (window.lucide) lucide.createIcons();
    createSubtleParticles();

    // 2. Inicializar las tres gráficas históricas (vacías a la espera de datos reales)
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

    // 5. Verificar e inicializar conexión a Firebase Realtime Database
    initFirebase(ui);

    // 6. Monitoreo del estado del dispositivo (Heartbeat)
    setInterval(() => {
        checkDeviceHeartbeat(ui);
    }, 4000);

    // 7. Enlazar eventos de botones e interacción
    bindEventListeners(ui);
});

/**
 * Inicialización y escuchadores de eventos de Firebase
 */
function initFirebase(ui) {
    // Comprobar si las credenciales fueron reemplazadas o siguen con el placeholder
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

    try {
        // Inicializar Firebase App
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        AppState.firebaseInitialized = true;
        logMessage("Firebase SDK inicializado correctamente.", "info", ui);

        const database = firebase.database();

        // Escuchar el estado de conexión a la base de datos (.info/connected)
        const connectedRef = database.ref(".info/connected");
        connectedRef.on("value", (snap) => {
            if (snap.val() === true) {
                AppState.firebaseConnected = true;
                if (ui.firebaseStatusText) {
                    ui.firebaseStatusText.textContent = "Firebase: Conectado";
                }
                if (ui.firebaseStatusBadge) {
                    ui.firebaseStatusBadge.style.borderColor = "rgba(0, 230, 118, 0.3)";
                    ui.firebaseStatusBadge.style.color = "var(--accent-emerald)";
                }
                logMessage("Conexión establecida con Firebase Realtime Database.", "success", ui);
            } else {
                AppState.firebaseConnected = false;
                if (ui.firebaseStatusText) {
                    ui.firebaseStatusText.textContent = "Firebase: Desconectado";
                }
                if (ui.firebaseStatusBadge) {
                    ui.firebaseStatusBadge.style.borderColor = "rgba(255, 61, 0, 0.3)";
                    ui.firebaseStatusBadge.style.color = "var(--accent-red)";
                }
                updateDeviceStatus(ui, 'disconnected', "SIN CONEXIÓN A INTERNET/BD");
            }
        });

        // Escuchar lecturas del sensor en tiempo real desde la ruta configurada
        const sensorRef = database.ref(FIREBASE_DATA_PATH);
        sensorRef.on("value", (snapshot) => {
            const data = snapshot.val();
            if (data !== null && typeof data === 'object') {
                processIncomingReading(data, ui);
            } else if (data !== null) {
                logMessage(`Dato recibido pero con formato no esperado: ${JSON.stringify(data)}`, "warning", ui);
            }
        }, (error) => {
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
 * Procesamiento de una lectura real recibida desde Firebase
 */
function processIncomingReading(data, ui) {
    // Normalización flexible de claves (acepta nombres en español o inglés)
    let ph = null;
    let turb = null;
    let temp = null;

    if (data.ph !== undefined) ph = parseFloat(data.ph);
    else if (data.pH !== undefined) ph = parseFloat(data.pH);
    else if (data.PH !== undefined) ph = parseFloat(data.PH);

    if (data.turbidez !== undefined) turb = parseFloat(data.turbidez);
    else if (data.turbidity !== undefined) turb = parseFloat(data.turbidity);
    else if (data.turb !== undefined) turb = parseFloat(data.turb);
    else if (data.ntu !== undefined) turb = parseFloat(data.ntu);
    else if (data.NTU !== undefined) turb = parseFloat(data.NTU);

    if (data.temperatura !== undefined) temp = parseFloat(data.temperatura);
    else if (data.temperature !== undefined) temp = parseFloat(data.temperature);
    else if (data.temp !== undefined) temp = parseFloat(data.temp);
    else if (data.tempC !== undefined) temp = parseFloat(data.tempC);

    // Validar que al menos uno de los tres parámetros sea un número válido
    const hasValidPh = !isNaN(ph) && ph !== null;
    const hasValidTurb = !isNaN(turb) && turb !== null;
    const hasValidTemp = !isNaN(temp) && temp !== null;

    if (!hasValidPh && !hasValidTurb && !hasValidTemp) {
        return; // Paquete sin lecturas válidas
    }

    const now = new Date();
    AppState.lastPacketTime = now;
    AppState.packetCount++;

    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Actualizar estado del dispositivo a 'En línea'
    updateDeviceStatus(ui, 'connected', "DISPOSITIVO EN LÍNEA");

    // 1. Actualizar Tarjeta de pH
    if (hasValidPh) {
        updatePhCard(ph, ui);
        updateStat('ph', ph);
        renderStats('ph', ui.minPh, ui.avgPh, ui.maxPh, 2);
    }

    // 2. Actualizar Tarjeta de Turbidez
    if (hasValidTurb) {
        updateTurbidityCard(turb, ui);
        updateStat('turb', turb);
        renderStats('turb', ui.minTurb, ui.avgTurb, ui.maxTurb, 2);
    }

    // 3. Actualizar Tarjeta de Temperatura
    if (hasValidTemp) {
        updateTemperatureCard(temp, ui);
        updateStat('temp', temp);
        renderStats('temp', ui.minTemp, ui.avgTemp, ui.maxTemp, 1);
    }

    // 4. Agregar a las tres gráficas históricas independientes
    if (typeof addChartReading === 'function') {
        addChartReading(
            timeStr,
            hasValidPh ? ph : 0,
            hasValidTurb ? turb : 0,
            hasValidTemp ? temp : 0
        );
    }

    // 5. Registrar en la lista para exportar a CSV
    AppState.readingsLog.push({
        timestamp: now.toISOString(),
        hora: timeStr,
        ph: hasValidPh ? ph.toFixed(2) : '',
        turbidez_ntu: hasValidTurb ? turb.toFixed(2) : '',
        temperatura_c: hasValidTemp ? temp.toFixed(1) : ''
    });

    // 6. Actualizar barra de telemetría
    if (ui.lastUpdateTime) ui.lastUpdateTime.textContent = timeStr;
    if (ui.packetsCount) ui.packetsCount.textContent = `${AppState.packetCount} muestras`;

    // Registrar en la consola visual cada 10 paquetes para no saturar
    if (AppState.packetCount === 1 || AppState.packetCount % 10 === 0) {
        logMessage(`Lectura #${AppState.packetCount}: pH ${hasValidPh ? ph.toFixed(2) : '--'} | Turb ${hasValidTurb ? turb.toFixed(2) : '--'} NTU | Temp ${hasValidTemp ? temp.toFixed(1) : '--'} °C`, "info", ui);
    }
}

/**
 * Actualizar tarjeta de pH
 */
function updatePhCard(val, ui) {
    if (!ui.valPh) return;

    ui.valPh.textContent = val.toFixed(2);

    // Gauge circular (circunferencia = 2 * PI * 40 = 251.2)
    const maxOffset = 251.2;
    const clampedVal = Math.max(0, Math.min(14, val));
    const percent = clampedVal / 14.0;
    ui.gaugePhProgress.style.strokeDashoffset = maxOffset - (percent * maxOffset);

    // Evaluación normativa del agua (estándar OMS/EPA: 6.5 - 8.5 pH)
    ui.pillPh.className = "status-pill";
    if (val < 6.0) {
        ui.pillPh.classList.add("status-critical");
        ui.pillPh.textContent = "Ácido Peligroso";
        ui.feedbackPh.textContent = "pH muy bajo: agua corrosiva y ácida.";
        ui.gaugePhProgress.style.stroke = "var(--accent-red)";
    } else if (val < 6.5) {
        ui.pillPh.classList.add("status-warning");
        ui.pillPh.textContent = "Ligeramente Ácido";
        ui.feedbackPh.textContent = "Por debajo del rango recomendado (6.5 - 8.5).";
        ui.gaugePhProgress.style.stroke = "var(--accent-amber)";
    } else if (val > 9.0) {
        ui.pillPh.classList.add("status-critical");
        ui.pillPh.textContent = "Alcalino Peligroso";
        ui.feedbackPh.textContent = "pH muy alto: alcalinidad excesiva.";
        ui.gaugePhProgress.style.stroke = "var(--accent-red)";
    } else if (val > 8.5) {
        ui.pillPh.classList.add("status-warning");
        ui.pillPh.textContent = "Ligeramente Alcalino";
        ui.feedbackPh.textContent = "Por encima del rango recomendado (6.5 - 8.5).";
        ui.gaugePhProgress.style.stroke = "var(--accent-amber)";
    } else {
        ui.pillPh.classList.add("status-excellent");
        ui.pillPh.textContent = "Óptimo / Neutro";
        ui.feedbackPh.textContent = "Nivel de pH ideal para consumo humano.";
        ui.gaugePhProgress.style.stroke = "var(--accent-emerald)";
    }
}

/**
 * Actualizar tarjeta de Turbidez (NTU)
 */
function updateTurbidityCard(val, ui) {
    if (!ui.valTurb) return;

    ui.valTurb.textContent = val.toFixed(2);

    // Barra de turbidez (escala 0 a 20 NTU visual)
    const percent = Math.min(100, Math.max(0, (val / 20.0) * 100));
    if (ui.barTurb) ui.barTurb.style.width = `${percent}%`;

    ui.pillTurb.className = "status-pill";
    if (val <= 1.0) {
        ui.pillTurb.classList.add("status-excellent");
        ui.pillTurb.textContent = "Excelente (Cristalina)";
        ui.feedbackTurb.textContent = "Agua de máxima pureza (< 1.0 NTU).";
        if (ui.barTurb) ui.barTurb.style.background = "var(--grad-cyan)";
    } else if (val <= 5.0) {
        ui.pillTurb.classList.add("status-neutral");
        ui.pillTurb.textContent = "Aceptable";
        ui.feedbackTurb.textContent = "Dentro del límite admisible OMS (< 5.0 NTU).";
        if (ui.barTurb) ui.barTurb.style.background = "var(--grad-emerald)";
    } else if (val <= 10.0) {
        ui.pillTurb.classList.add("status-warning");
        ui.pillTurb.textContent = "Moderadamente Turbia";
        ui.feedbackTurb.textContent = "Excede el valor guía recomendado.";
        if (ui.barTurb) ui.barTurb.style.background = "var(--accent-amber)";
    } else {
        ui.pillTurb.classList.add("status-critical");
        ui.pillTurb.textContent = "Turbidez Elevada";
        ui.feedbackTurb.textContent = "Presencia sustancial de sólidos en suspensión.";
        if (ui.barTurb) ui.barTurb.style.background = "var(--grad-alert)";
    }
}

/**
 * Actualizar tarjeta de Temperatura (°C)
 */
function updateTemperatureCard(val, ui) {
    if (!ui.valTemp) return;

    ui.valTemp.textContent = val.toFixed(1);

    // Barra de temperatura (escala 0 a 50 °C visual)
    const percent = Math.min(100, Math.max(0, (val / 50.0) * 100));
    if (ui.barTemp) ui.barTemp.style.width = `${percent}%`;

    ui.pillTemp.className = "status-pill";
    if (val < 10.0) {
        ui.pillTemp.classList.add("status-neutral");
        ui.pillTemp.textContent = "Fría (< 10°C)";
        ui.feedbackTemp.textContent = "Baja temperatura.";
        if (ui.barTemp) ui.barTemp.style.background = "var(--accent-cyan)";
    } else if (val <= 25.0) {
        ui.pillTemp.classList.add("status-excellent");
        ui.pillTemp.textContent = "Normal / Óptima";
        ui.feedbackTemp.textContent = "Rango ideal para distribución de agua potable.";
        if (ui.barTemp) ui.barTemp.style.background = "var(--grad-emerald)";
    } else if (val <= 32.0) {
        ui.pillTemp.classList.add("status-warning");
        ui.pillTemp.textContent = "Templada";
        ui.feedbackTemp.textContent = "Temperatura moderadamente alta.";
        if (ui.barTemp) ui.barTemp.style.background = "var(--accent-amber)";
    } else {
        ui.pillTemp.classList.add("status-critical");
        ui.pillTemp.textContent = "Elevada (> 32°C)";
        ui.feedbackTemp.textContent = "Favorece proliferación bacteriana si no se trata.";
        if (ui.barTemp) ui.barTemp.style.background = "var(--grad-alert)";
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
    }
}

/**
 * Verificación periódica de inactividad del dispositivo (Heartbeat)
 */
function checkDeviceHeartbeat(ui) {
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

    // Auto-scroll al fondo
    ui.systemLogs.scrollTop = ui.systemLogs.scrollHeight;

    // Contador de eventos
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
 * Enlazar listeners de botones
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
                ph: { min: null, max: null, sum: 0, count: 0 },
                turb: { min: null, max: null, sum: 0, count: 0 },
                temp: { min: null, max: null, sum: 0, count: 0 }
            };
            if (ui.minPh) ui.minPh.textContent = '--';
            if (ui.avgPh) ui.avgPh.textContent = '--';
            if (ui.maxPh) ui.maxPh.textContent = '--';
            if (ui.minTurb) ui.minTurb.textContent = '--';
            if (ui.avgTurb) ui.avgTurb.textContent = '--';
            if (ui.maxTurb) ui.maxTurb.textContent = '--';
            if (ui.minTemp) ui.minTemp.textContent = '--';
            if (ui.avgTemp) ui.avgTemp.textContent = '--';
            if (ui.maxTemp) ui.maxTemp.textContent = '--';

            logMessage("Gráficas y estadísticas restablecidas.", "info", ui);
        });
    }

    // Botón Exportar CSV
    if (ui.btnExportCsv) {
        ui.btnExportCsv.addEventListener("click", () => {
            if (AppState.readingsLog.length === 0) {
                logMessage("No hay registros en memoria para exportar todavía.", "warning", ui);
                return;
            }

            const headers = "timestamp_iso,hora,ph,turbidez_ntu,temperatura_c\n";
            const rows = AppState.readingsLog.map(r => 
                `"${r.timestamp}","${r.hora}",${r.ph},${r.turbidez_ntu},${r.temperatura_c}`
            ).join("\n");

            const csvContent = headers + rows;
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `calidad_agua_${new Date().toISOString().slice(0, 10)}_${Date.now()}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            logMessage(`Descargado reporte CSV con ${AppState.readingsLog.length} registros.`, "success", ui);
        });
    }
}
