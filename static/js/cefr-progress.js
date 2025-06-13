class CEFRProgressBar {
    constructor(containerId, languageId) {
        this.container = document.getElementById(containerId);
        this.languageId = languageId;
        this.progressData = null;

        if (!this.container) {
            console.error(`CEFR progress bar container not found: ${containerId}`);
            return;
        }
        this.init();
    }

    async init() {
        await this.loadProgressData();
        this.renderSimpleBar();
    }

    async loadProgressData() {
        try {
            const response = await fetch(`/api/cefr-progress/${this.languageId}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            this.progressData = data;
        } catch (error) {
            console.error(`Failed to load CEFR data for lang ${this.languageId}:`, error);
            this.container.innerHTML = `<div style="font-size: 0.7rem; color: #dc3545; text-align: center;">Error</div>`;
        }
    }

    renderSimpleBar() {
        if (!this.progressData) {
            return; // Don't render if data is missing
        }

        // Example structure of this.progressData:
        // { levels: { A1: { percent: 100 }, A2: { percent: 80 }, ... }, current_level: 'B1', progress_percent: 45, total_known_lemmas: 3000 }
        const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
        // Define both dark (background) and bright (fill) colors for each level
        const colors = {
            A1: { bg: '#35729e', fill: '#ADD8E6' }, // Light Blue
            A2: { bg: '#2a5d77', fill: '#87CEEB' }, // Sky Blue
            B1: { bg: '#1b6e6b', fill: '#40E0D0' }, // Teal
            B2: { bg: '#205c3a', fill: '#3CB371' }, // Green
            C1: { bg: '#b36b00', fill: '#FFA500' }, // Orange
            C2: { bg: '#8b2500', fill: '#FF4500' }  // Red
        };
        this.container.innerHTML = '';
        const bar = document.createElement('div');
        bar.style.display = 'flex';
        bar.style.gap = '4px';
        bar.style.width = '100%';
        bar.style.height = '10px';
        bar.style.alignItems = 'center';
        bar.style.justifyContent = 'center';
        levels.forEach(level => {
            const seg = document.createElement('div');
            seg.className = `cefr-segment cefr-segment-${level.toLowerCase()}`;
            // Always show dark background
            seg.style.background = colors[level].bg;
            if (level === this.progressData.current_level) {
                seg.classList.add('cefr-segment-current');
                seg.style.setProperty('--cefr-glow', colors[level].fill);
                seg.style.width = '40px';
            } else {
                seg.style.width = '32px';
            }
            seg.style.height = '100%';
            seg.style.borderRadius = '4px';
            seg.style.transition = 'background 0.3s, opacity 0.3s';
            seg.style.opacity = 1;
            seg.style.position = 'relative';
            // Fill effect
            const fill = document.createElement('div');
            fill.style.background = colors[level].fill;
            fill.style.width = (this.progressData.levels && this.progressData.levels[level]) ? `${this.progressData.levels[level].percent}%` : '0%';
            fill.style.height = '100%';
            fill.style.borderRadius = '4px';
            fill.style.transition = 'width 0.4s cubic-bezier(.4,0,.2,1)';
            seg.appendChild(fill);
            // Tooltip
            seg.title = `${level}: ${(this.progressData.levels && this.progressData.levels[level]) ? this.progressData.levels[level].percent.toFixed(1) : 0}%`;
            bar.appendChild(seg);
        });
        this.container.appendChild(bar);
        // Label
        const labelEl = document.getElementById(`cefr-label-${this.languageId}`);
        if (labelEl) {
            const cur = this.progressData.current_level;
            const curPct = this.progressData.levels && this.progressData.levels[cur] ? this.progressData.levels[cur].percent : 0;
            labelEl.textContent = `${cur} (${curPct ? curPct.toFixed(1) : 0}%)`;
        }
    }
}

// Initialize all CEFR bars on page load
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.segmented-cefr-bar').forEach(bar => {
        const langId = bar.id.replace('cefr-bar-', '');
        if (langId) {
            new CEFRProgressBar(bar.id, langId);
        } else {
            console.warn('CEFR bar container is missing a valid language ID:', bar.id);
        }
    });
});
