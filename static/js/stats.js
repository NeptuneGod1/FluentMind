// static/js/stats.js

// Global chart instances
let vocabularyChartInstance = null;
let cefrProgressChartInstance = null;
let learningCurveChartInstance = null;
let reviewsChartInstance = null;
let lessonsChartInstance = null;

// Colors for charts (consistent with previous CEFR bar colors and new ones)
const CHART_COLORS = {
    // CEFR Level colors (matching previous)
    'A1_LIGHT_BLUE': '#ADD8E6', // Light Blue
    'A2_SKY_BLUE': '#87CEEB',   // Sky Blue
    'B1_TEAL': '#008080',       // Teal
    'B2_GREEN': '#008000',      // Green
    'C1_ORANGE': '#FFA500',     // Orange
    'C2_RED': '#FF0000',        // Red

    // General status colors (from previous stats.html)
    'STATUS_UNKNOWN': '#a0d4ff', // Blue Highlight
    'STATUS_LEVEL_1': '#ffaaaa', // Red
    'STATUS_LEVEL_2': '#ffd966', // Orange
    'STATUS_LEVEL_3': '#ffff99', // Yellow
    'STATUS_LEVEL_4': '#c0f0c0', // Light Green
    'STATUS_LEVEL_5': '#98fb98', // Green
    'STATUS_KNOWN': '#6c757d',   // Darker Grey for Known
    'STATUS_IGNORED': '#adb5bd', // Grey

    // For line charts, etc.
    'PRIMARY': '#007bff',    // Bootstrap primary blue
    'SECONDARY': '#6c757d', // Bootstrap secondary grey
    'SUCCESS': '#28a745',    // Bootstrap success green
    'WARNING': '#ffc107',    // Bootstrap warning yellow
    'DANGER': '#dc3545',     // Bootstrap danger red
    'INFO': '#17a2b8',      // Bootstrap info cyan
};

// --- Utility Functions ---
// Utility to convert hex to rgba
function hexToRgba(hex, alpha) {
    let r = 0, g = 0, b = 0;
    // Handle "#rgb" format
    if (hex.length === 4) {
        r = parseInt(hex[1] + hex[1], 16);
        g = parseInt(hex[2] + hex[2], 16);
        b = parseInt(hex[3] + hex[3], 16);
    }
    // Handle "#rrggbb" format
    else if (hex.length === 7) {
        r = parseInt(hex.substring(1, 3), 16);
        g = parseInt(hex.substring(3, 5), 16);
        b = parseInt(hex.substring(5, 7), 16);
    }
    return `rgba(${r},${g},${b},${alpha})`;
}

function getStatusClass(status) {
    const statusMap = {
        0: CHART_COLORS.STATUS_UNKNOWN,
        1: CHART_COLORS.STATUS_LEVEL_1,
        2: CHART_COLORS.STATUS_LEVEL_2,
        3: CHART_COLORS.STATUS_LEVEL_3,
        4: CHART_COLORS.STATUS_LEVEL_4,
        5: CHART_COLORS.STATUS_LEVEL_5,
        6: CHART_COLORS.STATUS_KNOWN,
        7: CHART_COLORS.STATUS_IGNORED,
    };
    return statusMap[status] || '#ccc'; // Default to light grey
}

// Function to get CEFR level colors in order
function getCefrColors() {
    return [
        CHART_COLORS.A1_LIGHT_BLUE,
        CHART_COLORS.A2_SKY_BLUE,
        CHART_COLORS.B1_TEAL,
        CHART_COLORS.B2_GREEN,
        CHART_COLORS.C1_ORANGE,
        CHART_COLORS.C2_RED,
    ];
}

// --- Main Initialization Logic ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("stats.js loaded");

    const languageSelect = document.getElementById('language-select');
    const timespanSelect = document.getElementById('timespan-select');
    const tabLinks = document.querySelectorAll('.tab-link');
    const tabContents = document.querySelectorAll('.tab-content');

    // --- Tab Switching Logic ---
    function openTab(tabName) {
        tabContents.forEach(content => {
            content.classList.remove('active');
        });
        tabLinks.forEach(link => {
            link.classList.remove('active');
        });

        document.getElementById(tabName).classList.add('active');
        document.querySelector(`.tab-link[data-tab="${tabName}"]`).classList.add('active');

        // Trigger chart rendering for the active tab
        renderActiveChart(tabName);
    }

    tabLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            openTab(event.target.dataset.tab);
        });
    });

    // Function to render the chart for the currently active tab
    function renderActiveChart(activeTabName) {
        const languageId = languageSelect.value;
        const timespan = timespanSelect.value;

        if (!languageId) {
            // Handle no language selected - clear cards/charts
            updateSummaryCards({});
            // Clear all charts (optional, could show a message)
            clearAllCharts();
            return;
        }

        // Fetch and update summary cards first
        fetchSummaryData(languageId, timespan);

        // Render chart based on active tab
        switch (activeTabName) {
            case 'vocabulary':
                fetchAndRenderVocabularyChart(languageId, timespan);
                break;
            case 'cefr-progress':
                fetchAndRenderCefrProgressChart(languageId, timespan);
                break;
            case 'learning-curve':
                fetchAndRenderLearningCurveChart(languageId, timespan);
                break;
            case 'reviews':
                fetchAndRenderReviewsChart(languageId, timespan);
                break;
            case 'lessons':
                fetchAndRenderLessonsChart(languageId, timespan);
                break;
        }
    }

    // --- Event Listeners for Dropdowns ---
    languageSelect.addEventListener('change', () => {
        renderActiveChart(document.querySelector('.tab-link.active').dataset.tab);
    });

    timespanSelect.addEventListener('change', () => {
        renderActiveChart(document.querySelector('.tab-link.active').dataset.tab);
    });

    // --- Placeholder Chart Rendering Functions (to be implemented) ---
    function clearAllCharts() {
        if (vocabularyChartInstance) vocabularyChartInstance.destroy();
        if (cefrProgressChartInstance) cefrProgressChartInstance.destroy();
        if (learningCurveChartInstance) learningCurveChartInstance.destroy();
        if (reviewsChartInstance) reviewsChartInstance.destroy();
        if (lessonsChartInstance) lessonsChartInstance.destroy();

        vocabularyChartInstance = null;
        cefrProgressChartInstance = null;
        learningCurveChartInstance = null;
        reviewsChartInstance = null;
        lessonsChartInstance = null;
    }

    // Initial load: Open the first tab and render its chart
    openTab('vocabulary');
});

// --- Functions for fetching and rendering specific chart data (to be filled) ---

async function fetchSummaryData(languageId, timespan) {
    console.log(`Fetching summary data for lang ${languageId}, timespan ${timespan}`);
    // TODO: Implement backend API for summary data
    // For now, update with dummy data or clear
    updateSummaryCards({
        total_vocab: 'Loading...',
        words_known: 'Loading...',
        current_cefr: 'Loading...',
        cefr_percentage: 'Loading...',
        study_streak: 'Loading...',
        streak_unit: ''
    });
    try {
        const response = await fetch(`/api/stats/summary/${languageId}?timespan=${timespan}`); // New API endpoint
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        updateSummaryCards(data);
    } catch (error) {
        console.error("Error fetching summary data:", error);
        updateSummaryCards({
            total_vocab: 'Error',
            words_known: 'Error',
            current_cefr: 'N/A',
            cefr_percentage: '',
            study_streak: 'N/A',
            streak_unit: ''
        });
    }
}

function updateSummaryCards(data) {
    document.getElementById('total-vocab-value').textContent = data.total_vocab || '--';
    const totalVocabChangeElement = document.getElementById('total-vocab-change');
    if (data.total_vocab_change !== undefined && data.total_vocab_change !== null) {
        totalVocabChangeElement.textContent = `${data.total_vocab_change >= 0 ? '+' : ''}${data.total_vocab_change} this period`;
        totalVocabChangeElement.className = `summary-card-change ${data.total_vocab_change >= 0 ? '' : 'negative'}`;
    } else {
        totalVocabChangeElement.textContent = '';
        totalVocabChangeElement.className = 'summary-card-change';
    }

    document.getElementById('words-known-value').textContent = data.words_known || '--';
    const wordsKnownChangeElement = document.getElementById('words-known-change');
    if (data.words_known_percent !== undefined && data.words_known_percent !== null) {
        wordsKnownChangeElement.textContent = `${data.words_known_percent}% of total`;
    } else {
        wordsKnownChangeElement.textContent = '';
    }

    document.getElementById('current-cefr-value').textContent = data.current_cefr || '--';
    document.getElementById('current-cefr-percentage').textContent = data.cefr_percentage ? `${data.cefr_percentage}% complete` : '';

    document.getElementById('study-streak-value').textContent = data.study_streak || '--';
    document.getElementById('study-streak-unit').textContent = data.study_streak_unit || '';
}

async function fetchAndRenderVocabularyChart(languageId, timespan) {
    console.log(`Fetching vocabulary data for lang ${languageId}, timespan ${timespan}`);
    try {
        // timespan is not used by the backend vocabulary API, but kept for consistency
        const response = await fetch(`/api/stats/vocabulary/${languageId}?timespan=${timespan}`);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const chartData = await response.json();
        renderVocabularyChart(chartData);
    } catch (error) {
        console.error("Error fetching vocabulary chart data:", error);
        // Optionally, render an empty chart or an error message
        renderVocabularyChart([]); 
    }
}

function renderVocabularyChart(chartData) {
    const ctx = document.getElementById('vocabularyChart').getContext('2d');

    if (vocabularyChartInstance) {
        vocabularyChartInstance.destroy();
    }

    const labels = [
        'Unknown',
        'Learning (Level 1)',
        'Learning (Level 2)',
        'Learning (Level 3)',
        'Learning (Level 4)',
        'Learning (Level 5)',
        'Known',
        'Ignored'
    ];

    const backgroundColors = labels.map((_, index) => getStatusClass(index));

    vocabularyChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: chartData,
                backgroundColor: backgroundColors,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed !== null) {
                                label += context.parsed; // Show the count
                            }
                            return label;
                        }
                    }
                }
            },
            animation: {
                animateScale: true,
                animateRotate: true
            }
        }
    });
}

async function fetchAndRenderCefrProgressChart(languageId, timespan) {
    console.log(`Fetching CEFR progress data for lang ${languageId}, timespan ${timespan}`);
    // TODO: Implement backend API for CEFR progress
    try {
        // Reuse existing /api/cefr-progress/<language_id> endpoint for now, it should give percentages
        const response = await fetch(`/api/cefr-progress/${languageId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        console.log("Received CEFR data:", data);
        renderCefrProgressChart(data);
    } catch (error) {
        console.error("Error fetching CEFR data:", error);
        if (cefrProgressChartInstance) cefrProgressChartInstance.destroy();
        cefrProgressChartInstance = null;
    }
}

function renderCefrProgressChart(chartData) {
    const ctx = document.getElementById('cefrProgressChart').getContext('2d');
    const cefrLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    const percentages = cefrLevels.map(level => chartData.levels[level] ? chartData.levels[level].percent : 0);
    const backgroundColors = getCefrColors();

    if (cefrProgressChartInstance) {
        cefrProgressChartInstance.data.labels = cefrLevels;
        cefrProgressChartInstance.data.datasets[0].data = percentages;
        cefrProgressChartInstance.data.datasets[0].backgroundColor = backgroundColors;
        cefrProgressChartInstance.update();
    } else {
        cefrProgressChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: cefrLevels,
                datasets: [{
                    label: 'Progress',
                    data: percentages,
                    backgroundColor: backgroundColors,
                    borderColor: backgroundColors.map(color => hexToRgba(color, 0.8)),
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'x', // Make it a vertical bar chart
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        beginAtZero: true,
                        max: 100,
                        title: { display: true, text: 'CEFR Level' }
                    },
                    y: {
                        title: { display: true, text: 'Progress (%)' }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Progress: ${context.raw}%`;
                            }
                        }
                    },
                    datalabels: {
                        color: '#fff',
                        formatter: (value) => {
                            return value > 0 ? `${value.toFixed(0)}%` : '';
                        }
                    }
                }
            }
        });
    }
}

async function fetchAndRenderLearningCurveChart(languageId, timespan) {
    console.log(`Fetching learning curve data for lang ${languageId}, timespan ${timespan}`);
    try {
        const response = await fetch(`/api/stats/learning-curve/${languageId}?timespan=${timespan}`);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const chartData = await response.json();
        renderLearningCurveChart(chartData);
    } catch (error) {
        console.error("Error fetching learning curve chart data:", error);
        renderLearningCurveChart({ labels: [], newWords: [] }); // Render empty chart on error
    }
}

function renderLearningCurveChart(chartData) {
    const ctx = document.getElementById('learningCurveChart').getContext('2d');

    if (learningCurveChartInstance) {
        learningCurveChartInstance.data.labels = chartData.labels;
        learningCurveChartInstance.data.datasets[0].data = chartData.newWords;
        learningCurveChartInstance.update();
    } else {
        learningCurveChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartData.labels,
                datasets: [{
                    label: 'New Words Learned',
                    data: chartData.newWords,
                    borderColor: hexToRgba(CHART_COLORS.PRIMARY, 0.8),
                    backgroundColor: hexToRgba(CHART_COLORS.PRIMARY, 0.25), // 40% opacity
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        title: { display: true, text: 'Date' }
                    },
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Number of Words' }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                    }
                }
            }
        });
    }
}

async function fetchAndRenderReviewsChart(languageId, timespan) {
    console.log(`Fetching reviews data for lang ${languageId}, timespan ${timespan}`);
    try {
        const response = await fetch(`/api/stats/reviews/${languageId}?timespan=${timespan}`);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const chartData = await response.json();
        renderReviewsChart(chartData);
    } catch (error) {
        console.error("Error fetching reviews chart data:", error);
        renderReviewsChart({ labels: [], accuracy: [], retention: [] }); // Render empty chart on error
    }
}

function renderReviewsChart(chartData) {
    const ctx = document.getElementById('reviewsChart').getContext('2d');

    if (reviewsChartInstance) {
        reviewsChartInstance.data.labels = chartData.labels;
        reviewsChartInstance.data.datasets[0].data = chartData.accuracy;
        reviewsChartInstance.data.datasets[1].data = chartData.retention;
        reviewsChartInstance.update();
    } else {
        reviewsChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartData.labels,
                datasets: [
                    {
                        label: 'Review Accuracy',
                        data: chartData.accuracy,
                        borderColor: hexToRgba(CHART_COLORS.PRIMARY, 0.8),
                        backgroundColor: hexToRgba(CHART_COLORS.PRIMARY, 0.25),
                        fill: false,
                        tension: 0.3
                    },
                    {
                        label: 'Retention Rate',
                        data: chartData.retention,
                        borderColor: hexToRgba(CHART_COLORS.SECONDARY, 0.8),
                        backgroundColor: hexToRgba(CHART_COLORS.SECONDARY, 0.25),
                        fill: false,
                        tension: 0.3,
                        hidden: true // Start hidden, can be toggled
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        title: { display: true, text: 'Date' }
                    },
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: { display: true, text: 'Percentage' }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${context.parsed.y}%`;
                            }
                        }
                    }
                }
            }
        });
    }
}

async function fetchAndRenderLessonsChart(languageId, timespan) {
    console.log(`Fetching lessons data for lang ${languageId}, timespan ${timespan}`);
    try {
        const response = await fetch(`/api/stats/lessons/${languageId}?timespan=${timespan}`);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const chartData = await response.json();
        renderLessonsChart(chartData);
    } catch (error) {
        console.error("Error fetching lessons chart data:", error);
        renderLessonsChart({ labels: [], lessons: [], stories: [] }); // Render empty chart on error
    }
}

function renderLessonsChart(chartData) {
    const ctx = document.getElementById('lessonsChart').getContext('2d');

    if (lessonsChartInstance) {
        lessonsChartInstance.data.labels = chartData.labels;
        lessonsChartInstance.data.datasets[0].data = chartData.lessons;
        lessonsChartInstance.data.datasets[1].data = chartData.stories;
        lessonsChartInstance.update();
    } else {
        lessonsChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: chartData.labels,
                datasets: [
                    {
                        label: 'Lessons Completed',
                        data: chartData.lessons,
                        backgroundColor: hexToRgba(CHART_COLORS.PRIMARY, 0.8),
                        borderColor: hexToRgba(CHART_COLORS.PRIMARY, 1),
                        borderWidth: 1
                    },
                    {
                        label: 'Stories Completed',
                        data: chartData.stories,
                        backgroundColor: hexToRgba(CHART_COLORS.INFO, 0.8),
                        borderColor: hexToRgba(CHART_COLORS.INFO, 1),
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        stacked: true,
                        title: { display: true, text: 'Time Period' }
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        title: { display: true, text: 'Count' }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                    }
                }
            }
        });
    }
} 