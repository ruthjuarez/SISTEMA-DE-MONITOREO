/**
 * ==========================================================================
 * GRÁFICAS HISTÓRICAS EN TIEMPO REAL - CHART.JS
 * Monitoreo de Calidad del Agua: pH, Turbidez (NTU) y Temperatura (°C)
 * ==========================================================================
 */

let chartPh = null;
let chartTurb = null;
let chartTemp = null;

let maxChartPoints = 50;

// Colas de datos históricos en memoria
const historicalData = {
    timestamps: [],
    ph: [],
    turbidity: [],
    temperature: []
};

// Tema visual oscuro para Chart.js
const chartTheme = {
    gridColor: 'rgba(255, 255, 255, 0.04)',
    tickColor: '#8da2bb',
    fontFamily: "'Inter', sans-serif"
};

/**
 * Función auxiliar para crear gradientes lineales de fondo
 */
function createChartGradient(ctx, hexColor, alphaStart = 0.25, alphaEnd = 0.0) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 260);
    // Convertir hex básico a rgba
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

    // 1. Gráfica de pH
    chartPh = new Chart(ctxPh, {
        type: 'line',
        data: {
            labels: historicalData.timestamps,
            datasets: [{
                label: 'pH',
                data: historicalData.ph,
                borderColor: '#00f0ff',
                backgroundColor: createChartGradient(ctxPh, '#00f0ff'),
                borderWidth: 2,
                pointRadius: 2,
                pointHoverRadius: 5,
                pointBackgroundColor: '#00f0ff',
                pointBorderColor: '#ffffff',
                fill: true,
                tension: 0.35
            }]
        },
        options: getChartOptions('pH', 0, 14, (val) => `${val.toFixed(1)}`)
    });

    // 2. Gráfica de Turbidez
    chartTurb = new Chart(ctxTurb, {
        type: 'line',
        data: {
            labels: historicalData.timestamps,
            datasets: [{
                label: 'Turbidez (NTU)',
                data: historicalData.turbidity,
                borderColor: '#00e676',
                backgroundColor: createChartGradient(ctxTurb, '#00e676'),
                borderWidth: 2,
                pointRadius: 2,
                pointHoverRadius: 5,
                pointBackgroundColor: '#00e676',
                pointBorderColor: '#ffffff',
                fill: true,
                tension: 0.35
            }]
        },
        options: getChartOptions('NTU', 0, null, (val) => `${val.toFixed(1)} NTU`)
    });

    // 3. Gráfica de Temperatura
    chartTemp = new Chart(ctxTemp, {
        type: 'line',
        data: {
            labels: historicalData.timestamps,
            datasets: [{
                label: 'Temperatura (°C)',
                data: historicalData.temperature,
                borderColor: '#ffb300',
                backgroundColor: createChartGradient(ctxTemp, '#ffb300'),
                borderWidth: 2,
                pointRadius: 2,
                pointHoverRadius: 5,
                pointBackgroundColor: '#ffb300',
                pointBorderColor: '#ffffff',
                fill: true,
                tension: 0.35
            }]
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
            duration: 250 // Animación breve para actualización suave
        },
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                enabled: true,
                mode: 'index',
                intersect: false,
                backgroundColor: '#0a1324',
                titleColor: '#ffffff',
                bodyColor: '#a4cdff',
                borderColor: 'rgba(255, 255, 255, 0.12)',
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
 * Añadir una nueva lectura real a las tres gráficas históricas
 */
function addChartReading(timestampStr, phVal, turbVal, tempVal) {
    historicalData.timestamps.push(timestampStr);
    historicalData.ph.push(phVal);
    historicalData.turbidity.push(turbVal);
    historicalData.temperature.push(tempVal);

    // Mantener la ventana deslizante máxima configurada
    if (historicalData.timestamps.length > maxChartPoints) {
        historicalData.timestamps.shift();
        historicalData.ph.shift();
        historicalData.turbidity.shift();
        historicalData.temperature.shift();
    }

    // Actualizar gráficas en pantalla
    if (chartPh) {
        chartPh.data.labels = historicalData.timestamps;
        chartPh.data.datasets[0].data = historicalData.ph;
        chartPh.update('none');
    }

    if (chartTurb) {
        chartTurb.data.labels = historicalData.timestamps;
        chartTurb.data.datasets[0].data = historicalData.turbidity;
        chartTurb.update('none');
    }

    if (chartTemp) {
        chartTemp.data.labels = historicalData.timestamps;
        chartTemp.data.datasets[0].data = historicalData.temperature;
        chartTemp.update('none');
    }

    // Actualizar etiquetas en cabecera de las tarjetas de gráficas
    const badgePh = document.getElementById('chart-badge-ph');
    const badgeTurb = document.getElementById('chart-badge-turb');
    const badgeTemp = document.getElementById('chart-badge-temp');

    if (badgePh) badgePh.textContent = `${phVal.toFixed(2)} pH`;
    if (badgeTurb) badgeTurb.textContent = `${turbVal.toFixed(2)} NTU`;
    if (badgeTemp) badgeTemp.textContent = `${tempVal.toFixed(1)} °C`;
}

/**
 * Limpiar datos de las gráficas
 */
function clearChartData() {
    historicalData.timestamps = [];
    historicalData.ph = [];
    historicalData.turbidity = [];
    historicalData.temperature = [];

    if (chartPh) {
        chartPh.data.labels = [];
        chartPh.data.datasets[0].data = [];
        chartPh.update();
    }

    if (chartTurb) {
        chartTurb.data.labels = [];
        chartTurb.data.datasets[0].data = [];
        chartTurb.update();
    }

    if (chartTemp) {
        chartTemp.data.labels = [];
        chartTemp.data.datasets[0].data = [];
        chartTemp.update();
    }

    const badgePh = document.getElementById('chart-badge-ph');
    const badgeTurb = document.getElementById('chart-badge-turb');
    const badgeTemp = document.getElementById('chart-badge-temp');

    if (badgePh) badgePh.textContent = '-- pH';
    if (badgeTurb) badgeTurb.textContent = '-- NTU';
    if (badgeTemp) badgeTemp.textContent = '-- °C';
}

/**
 * Ajustar el número máximo de puntos visibles
 */
function setMaxChartPoints(num) {
    maxChartPoints = parseInt(num, 10) || 50;

    while (historicalData.timestamps.length > maxChartPoints) {
        historicalData.timestamps.shift();
        historicalData.ph.shift();
        historicalData.turbidity.shift();
        historicalData.temperature.shift();
    }

    if (chartPh) chartPh.update();
    if (chartTurb) chartTurb.update();
    if (chartTemp) chartTemp.update();
}
