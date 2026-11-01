/**
 * ==========================================================================
 * GRÁFICAS HISTÓRICAS EN TIEMPO REAL - CHART.JS
 * Monitoreo de Calidad del Agua: Comparativa Entrada (Antes) vs Salida (Después)
 * Parámetros: pH, Turbidez (NTU) y Temperatura (°C)
 * ==========================================================================
 */

let chartPh = null;
let chartTurb = null;
let chartTemp = null;

let maxChartPoints = 50;

// Colas de datos históricos en memoria (Antes vs Después)
const historicalData = {
    timestamps: [],
    phIn: [],
    phOut: [],
    turbIn: [],
    turbOut: [],
    tempIn: [],
    tempOut: []
};

// Tema visual oscuro para Chart.js
const chartTheme = {
    gridColor: 'rgba(255, 255, 255, 0.05)',
    tickColor: '#8da2bb',
    fontFamily: "'Inter', sans-serif"
};

/**
 * Función auxiliar para crear gradientes lineales de fondo
 */
function createChartGradient(ctx, hexColor, alphaStart = 0.22, alphaEnd = 0.0) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 260);
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alphaStart})`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${alphaEnd})`);
    return gradient;
}

/**
 * Inicialización de las tres gráficas históricas independientes
 */
function initializeCharts() {
    const canvasPh = document.getElementById('chart-ph');
    const canvasTurb = document.getElementById('chart-turb');
    const canvasTemp = document.getElementById('chart-temp');

    if (!canvasPh || !canvasTurb || !canvasTemp) {
        console.warn('Canvas para gráficas no encontrados en el DOM.');
        return;
    }

    const ctxPh = canvasPh.getContext('2d');
    const ctxTurb = canvasTurb.getContext('2d');
    const ctxTemp = canvasTemp.getContext('2d');

    // Destruir instancias previas si existen
    if (chartPh) chartPh.destroy();
    if (chartTurb) chartTurb.destroy();
    if (chartTemp) chartTemp.destroy();

    // 1. Gráfica de pH (Antes vs Después)
    chartPh = new Chart(ctxPh, {
        type: 'line',
        data: {
            labels: historicalData.timestamps,
            datasets: [
                {
                    label: 'pH (Antes / Entrada)',
                    data: historicalData.phIn,
                    borderColor: '#ffb300',
                    backgroundColor: createChartGradient(ctxPh, '#ffb300', 0.12),
                    borderWidth: 2,
                    borderDash: [5, 4],
                    pointRadius: 2,
                    pointHoverRadius: 5,
                    pointBackgroundColor: '#ffb300',
                    pointBorderColor: '#ffffff',
                    fill: false,
                    tension: 0.35
                },
                {
                    label: 'pH (Después / Salida)',
                    data: historicalData.phOut,
                    borderColor: '#00f0ff',
                    backgroundColor: createChartGradient(ctxPh, '#00f0ff', 0.22),
                    borderWidth: 2.2,
                    pointRadius: 2,
                    pointHoverRadius: 5,
                    pointBackgroundColor: '#00f0ff',
                    pointBorderColor: '#ffffff',
                    fill: true,
                    tension: 0.35
                }
            ]
        },
        options: getChartOptions('pH', 0, 14, (val) => `${val.toFixed(2)}`)
    });

    // 2. Gráfica de Turbidez (Antes vs Después)
    chartTurb = new Chart(ctxTurb, {
        type: 'line',
        data: {
            labels: historicalData.timestamps,
            datasets: [
                {
                    label: 'Turbidez Antes (Cruda)',
                    data: historicalData.turbIn,
                    borderColor: '#ff7043',
                    backgroundColor: createChartGradient(ctxTurb, '#ff7043', 0.12),
                    borderWidth: 2,
                    borderDash: [5, 4],
                    pointRadius: 2,
                    pointHoverRadius: 5,
                    pointBackgroundColor: '#ff7043',
                    pointBorderColor: '#ffffff',
                    fill: false,
                    tension: 0.35
                },
                {
                    label: 'Turbidez Después (Filtrada)',
                    data: historicalData.turbOut,
                    borderColor: '#00e676',
                    backgroundColor: createChartGradient(ctxTurb, '#00e676', 0.22),
                    borderWidth: 2.2,
                    pointRadius: 2,
                    pointHoverRadius: 5,
                    pointBackgroundColor: '#00e676',
                    pointBorderColor: '#ffffff',
                    fill: true,
                    tension: 0.35
                }
            ]
        },
        options: getChartOptions('NTU', 0, null, (val) => `${val.toFixed(2)} NTU`)
    });

    // 3. Gráfica de Temperatura (Antes vs Después)
    chartTemp = new Chart(ctxTemp, {
        type: 'line',
        data: {
            labels: historicalData.timestamps,
            datasets: [
                {
                    label: 'Temperatura Entrada',
                    data: historicalData.tempIn,
                    borderColor: '#ffa726',
                    backgroundColor: createChartGradient(ctxTemp, '#ffa726', 0.12),
                    borderWidth: 2,
                    borderDash: [5, 4],
                    pointRadius: 2,
                    pointHoverRadius: 5,
                    pointBackgroundColor: '#ffa726',
                    pointBorderColor: '#ffffff',
                    fill: false,
                    tension: 0.35
                },
                {
                    label: 'Temperatura Salida',
                    data: historicalData.tempOut,
                    borderColor: '#00b0ff',
                    backgroundColor: createChartGradient(ctxTemp, '#00b0ff', 0.22),
                    borderWidth: 2.2,
                    pointRadius: 2,
                    pointHoverRadius: 5,
                    pointBackgroundColor: '#00b0ff',
                    pointBorderColor: '#ffffff',
                    fill: true,
                    tension: 0.35
                }
            ]
        },
        options: getChartOptions('°C', 0, 50, (val) => `${val.toFixed(1)} °C`)
    });
}

/**
 * Generador de opciones de configuración de Chart.js
 */
function getChartOptions(unit, yMin = null, yMax = null, tooltipFormatter = null) {
    const scalesY = {
        grid: {
            color: chartTheme.gridColor,
            borderColor: 'transparent'
        },
        ticks: {
            color: chartTheme.tickColor,
            font: { family: chartTheme.fontFamily, size: 10 }
        }
    };

    if (yMin !== null) scalesY.min = yMin;
    if (yMax !== null) scalesY.max = yMax;

    return {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
            duration: 250 // Actualización suave
        },
        plugins: {
            legend: {
                display: true,
                position: 'top',
                align: 'end',
                labels: {
                    color: '#8da2bb',
                    boxWidth: 14,
                    boxHeight: 4,
                    usePointStyle: false,
                    font: { family: chartTheme.fontFamily, size: 10.5, weight: '500' }
                }
            },
            tooltip: {
                enabled: true,
                mode: 'index',
                intersect: false,
                backgroundColor: '#0a1324',
                titleColor: '#ffffff',
                bodyColor: '#a4cdff',
                borderColor: 'rgba(255, 255, 255, 0.15)',
                borderWidth: 1,
                padding: 10,
                titleFont: { family: chartTheme.fontFamily, weight: '600' },
                bodyFont: { family: chartTheme.fontFamily },
                callbacks: {
                    label: function (context) {
                        const val = context.parsed.y;
                        if (tooltipFormatter) {
                            return ` ${context.dataset.label}: ${tooltipFormatter(val)}`;
                        }
                        return ` ${context.dataset.label}: ${val} ${unit}`;
                    }
                }
            }
        },
        scales: {
            x: {
                grid: {
                    color: chartTheme.gridColor,
                    borderColor: 'transparent'
                },
                ticks: {
                    color: chartTheme.tickColor,
                    font: { family: chartTheme.fontFamily, size: 9 },
                    maxTicksLimit: 7,
                    maxRotation: 0
                }
            },
            y: scalesY
        }
    };
}

/**
 * Añadir una nueva lectura real a las tres gráficas históricas comparativas
 */
function addChartReading(timestampStr, phIn, phOut, turbIn, turbOut, tempIn, tempOut) {
    historicalData.timestamps.push(timestampStr);
    historicalData.phIn.push(phIn);
    historicalData.phOut.push(phOut);
    historicalData.turbIn.push(turbIn);
    historicalData.turbOut.push(turbOut);
    historicalData.tempIn.push(tempIn);
    historicalData.tempOut.push(tempOut);

    // Mantener la ventana deslizante máxima configurada
    if (historicalData.timestamps.length > maxChartPoints) {
        historicalData.timestamps.shift();
        historicalData.phIn.shift();
        historicalData.phOut.shift();
        historicalData.turbIn.shift();
        historicalData.turbOut.shift();
        historicalData.tempIn.shift();
        historicalData.tempOut.shift();
    }

    // Actualizar gráfica de pH
    if (chartPh) {
        chartPh.data.labels = historicalData.timestamps;
        chartPh.data.datasets[0].data = historicalData.phIn;
        chartPh.data.datasets[1].data = historicalData.phOut;
        chartPh.update('none');
    }

    // Actualizar gráfica de Turbidez
    if (chartTurb) {
        chartTurb.data.labels = historicalData.timestamps;
        chartTurb.data.datasets[0].data = historicalData.turbIn;
        chartTurb.data.datasets[1].data = historicalData.turbOut;
        chartTurb.update('none');
    }

    // Actualizar gráfica de Temperatura
    if (chartTemp) {
        chartTemp.data.labels = historicalData.timestamps;
        chartTemp.data.datasets[0].data = historicalData.tempIn;
        chartTemp.data.datasets[1].data = historicalData.tempOut;
        chartTemp.update('none');
    }

    // Actualizar etiquetas duales en cabecera de las tarjetas de gráficas
    const badgePhIn = document.getElementById('chart-badge-ph-in');
    const badgePhOut = document.getElementById('chart-badge-ph-out');
    const badgeTurbIn = document.getElementById('chart-badge-turb-in');
    const badgeTurbOut = document.getElementById('chart-badge-turb-out');
    const badgeTempIn = document.getElementById('chart-badge-temp-in');
    const badgeTempOut = document.getElementById('chart-badge-temp-out');

    if (badgePhIn) badgePhIn.textContent = `Antes: ${phIn.toFixed(2)} pH`;
    if (badgePhOut) badgePhOut.textContent = `Después: ${phOut.toFixed(2)} pH`;
    if (badgeTurbIn) badgeTurbIn.textContent = `Antes: ${turbIn.toFixed(1)} NTU`;
    if (badgeTurbOut) badgeTurbOut.textContent = `Después: ${turbOut.toFixed(2)} NTU`;
    if (badgeTempIn) badgeTempIn.textContent = `Antes: ${tempIn.toFixed(1)} °C`;
    if (badgeTempOut) badgeTempOut.textContent = `Después: ${tempOut.toFixed(1)} °C`;
}

/**
 * Limpiar datos de las gráficas
 */
function clearChartData() {
    historicalData.timestamps = [];
    historicalData.phIn = [];
    historicalData.phOut = [];
    historicalData.turbIn = [];
    historicalData.turbOut = [];
    historicalData.tempIn = [];
    historicalData.tempOut = [];

    if (chartPh) {
        chartPh.data.labels = [];
        chartPh.data.datasets[0].data = [];
        chartPh.data.datasets[1].data = [];
        chartPh.update();
    }

    if (chartTurb) {
        chartTurb.data.labels = [];
        chartTurb.data.datasets[0].data = [];
        chartTurb.data.datasets[1].data = [];
        chartTurb.update();
    }

    if (chartTemp) {
        chartTemp.data.labels = [];
        chartTemp.data.datasets[0].data = [];
        chartTemp.data.datasets[1].data = [];
        chartTemp.update();
    }

    const badgePhIn = document.getElementById('chart-badge-ph-in');
    const badgePhOut = document.getElementById('chart-badge-ph-out');
    const badgeTurbIn = document.getElementById('chart-badge-turb-in');
    const badgeTurbOut = document.getElementById('chart-badge-turb-out');
    const badgeTempIn = document.getElementById('chart-badge-temp-in');
    const badgeTempOut = document.getElementById('chart-badge-temp-out');

    if (badgePhIn) badgePhIn.textContent = 'Antes: -- pH';
    if (badgePhOut) badgePhOut.textContent = 'Después: -- pH';
    if (badgeTurbIn) badgeTurbIn.textContent = 'Antes: -- NTU';
    if (badgeTurbOut) badgeTurbOut.textContent = 'Después: -- NTU';
    if (badgeTempIn) badgeTempIn.textContent = 'Antes: -- °C';
    if (badgeTempOut) badgeTempOut.textContent = 'Después: -- °C';
}

/**
 * Ajustar el número máximo de puntos visibles
 */
function setMaxChartPoints(num) {
    maxChartPoints = parseInt(num, 10) || 50;

    while (historicalData.timestamps.length > maxChartPoints) {
        historicalData.timestamps.shift();
        historicalData.phIn.shift();
        historicalData.phOut.shift();
        historicalData.turbIn.shift();
        historicalData.turbOut.shift();
        historicalData.tempIn.shift();
        historicalData.tempOut.shift();
    }

    if (chartPh) chartPh.update();
    if (chartTurb) chartTurb.update();
    if (chartTemp) chartTemp.update();
}
