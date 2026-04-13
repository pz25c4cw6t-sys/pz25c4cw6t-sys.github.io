// ── Storage layer (replaces Electron IPC + fs) ──────────────────────
const DB_KEY = 'ege_essays';

function loadEssaysData() {
    try {
        return JSON.parse(localStorage.getItem(DB_KEY) || '[]');
    } catch { return []; }
}

function saveEssaysData(essays) {
    localStorage.setItem(DB_KEY, JSON.stringify(essays));
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ── API (mirrors original window.api) ────────────────────────────────
const api = {
    loadEssays: () => loadEssaysData(),

    addEssay: (data) => {
        const essays = loadEssaysData();
        const essay = { id: generateId(), timestamp: new Date().toISOString(), ...data };
        essays.push(essay);
        saveEssaysData(essays);
        return essay;
    },

    updateEssayContent: (id, newContent) => {
        const essays = loadEssaysData();
        const idx = essays.findIndex(e => e.id === id);
        if (idx > -1) { essays[idx].content = newContent; saveEssaysData(essays); return { success: true }; }
        return { success: false };
    },

    deleteEssay: (id) => {
        saveEssaysData(loadEssaysData().filter(e => e.id !== id));
        return { success: true };
    }
};

// ── State ─────────────────────────────────────────────────────────────
let currentEssayId = null;

// ── Toast ─────────────────────────────────────────────────────────────
function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2200);
}

// ── Score helpers ─────────────────────────────────────────────────────
function scoreClass(n) {
    if (isNaN(n)) return '';
    if (n >= 20) return 'score-high';
    if (n >= 15) return 'score-mid';
    return 'score-low';
}

function formatDate(iso) {
    try {
        return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return ''; }
}

// ── Render ─────────────────────────────────────────────────────────────
function renderEssays() {
    const list = document.getElementById('essays-list');
    const essays = api.loadEssays();

    // Stats
    const scores = essays.map(e => parseInt(e.score)).filter(n => !isNaN(n));
    document.getElementById('total-count').textContent = essays.length;
    document.getElementById('avg-score').textContent = scores.length ? (scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1) : '—';
    document.getElementById('best-score').textContent = scores.length ? Math.max(...scores) : '—';

    if (essays.length === 0) {
        list.innerHTML = '<div class="loading">Нет сочинений. Нажмите <strong>+</strong>, чтобы добавить первое.</div>';
        return;
    }

    list.innerHTML = '';
    [...essays].reverse().forEach((essay, i) => {
        const n = parseInt(essay.score);
        const cls = scoreClass(n);
        const card = document.createElement('div');
        card.className = 'essay-card';
        card.style.animationDelay = `${i * 0.06}s`;
        card.innerHTML = `
            <div class="card-score ${cls}">${isNaN(n) ? '?' : n}</div>
            <div class="card-body">
                <div class="essay-topic">${escHtml(essay.topic)}</div>
                <div class="card-date">${formatDate(essay.timestamp)}</div>
            </div>
            <svg class="card-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        `;
        card.addEventListener('click', () => openEssay(essay));
        list.appendChild(card);
    });
}

function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Modals ─────────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).style.display = 'flex'; document.body.style.overflow = 'hidden'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; document.body.style.overflow = ''; }

function openEssay(essay) {
    currentEssayId = essay.id;
    const n = parseInt(essay.score);
    const badge = document.getElementById('view-score-display');
    badge.textContent = `${essay.score} б.`;
    badge.className = 'essay-score-badge ' + scoreClass(n);
    document.getElementById('view-topic-display').textContent = essay.topic;
    document.getElementById('view-content-edit').value = essay.content || '';
    openModal('view-modal');
}

// ── Event listeners ────────────────────────────────────────────────────
document.getElementById('add-btn').addEventListener('click', () => openModal('add-modal'));

document.getElementById('close-modal').addEventListener('click', () => { closeModal('add-modal'); clearAddForm(); });
document.getElementById('cancel-add-btn').addEventListener('click', () => { closeModal('add-modal'); clearAddForm(); });
document.getElementById('add-overlay').addEventListener('click', () => { closeModal('add-modal'); clearAddForm(); });

document.getElementById('close-view-modal').addEventListener('click', () => { closeModal('view-modal'); currentEssayId = null; });
document.getElementById('view-overlay').addEventListener('click', () => { closeModal('view-modal'); currentEssayId = null; });

function clearAddForm() {
    document.getElementById('new-topic').value = '';
    document.getElementById('new-score').value = '';
    document.getElementById('new-content').value = '';
}

document.getElementById('save-btn').addEventListener('click', () => {
    const topic = document.getElementById('new-topic').value.trim();
    const score = document.getElementById('new-score').value.trim();
    const content = document.getElementById('new-content').value.trim();
    if (!topic || !score) { showToast('Заполните тему и балл'); return; }
    api.addEssay({ topic, score, content });
    closeModal('add-modal');
    clearAddForm();
    renderEssays();
    showToast('Сочинение сохранено ✓');
});

document.getElementById('update-btn').addEventListener('click', () => {
    if (!currentEssayId) return;
    const newContent = document.getElementById('view-content-edit').value;
    api.updateEssayContent(currentEssayId, newContent);
    closeModal('view-modal');
    currentEssayId = null;
    renderEssays();
    showToast('Изменения сохранены ✓');
});

document.getElementById('delete-btn').addEventListener('click', () => {
    if (!currentEssayId) return;
    if (!confirm('Удалить это сочинение?')) return;
    api.deleteEssay(currentEssayId);
    closeModal('view-modal');
    currentEssayId = null;
    renderEssays();
    showToast('Удалено');
});

// ── Init ───────────────────────────────────────────────────────────────
renderEssays();

// ── Service Worker registration ────────────────────────────────────────
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .catch(err => console.warn('SW registration failed:', err));
    });
}
