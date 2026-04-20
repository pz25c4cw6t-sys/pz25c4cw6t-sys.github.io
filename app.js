// ══════════════════════════════════════════════
//  Storage layer  (replaces Electron IPC + fs)
// ══════════════════════════════════════════════
const ESSAYS_KEY   = 'ege_essays';
const SUBJECTS_KEY = 'ege_subjects';

function loadData(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}
function saveData(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}
function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ══════════════════════════════════════════════
//  API  (mirrors original window.api)
// ══════════════════════════════════════════════
const api = {
    // Essays
    loadEssays: () => loadData(ESSAYS_KEY),

    addEssay(data) {
        const essays = loadData(ESSAYS_KEY);
        const essay  = { id: uid(), timestamp: new Date().toISOString(), ...data };
        essays.push(essay);
        saveData(ESSAYS_KEY, essays);
        return essay;
    },

    updateEssayContent(id, newContent) {
        const essays = loadData(ESSAYS_KEY);
        const idx    = essays.findIndex(e => e.id === id);
        if (idx > -1) { essays[idx].content = newContent; saveData(ESSAYS_KEY, essays); return { success: true }; }
        return { success: false };
    },

    deleteEssay(id) {
        saveData(ESSAYS_KEY, loadData(ESSAYS_KEY).filter(e => e.id !== id));
        return { success: true };
    },

    // Subjects / Mocks
    loadSubjects: () => loadData(SUBJECTS_KEY),

    addSubject(name) {
        const subjects = loadData(SUBJECTS_KEY);
        const subject  = { id: uid(), name, mocks: [] };
        subjects.push(subject);
        saveData(SUBJECTS_KEY, subjects);
        return subject;
    },

    addMock(subjectId, mockData) {
        const subjects = loadData(SUBJECTS_KEY);
        const idx      = subjects.findIndex(s => s.id === subjectId);
        if (idx > -1) {
            const mock = { id: uid(), timestamp: new Date().toISOString(), ...mockData };
            subjects[idx].mocks.push(mock);
            saveData(SUBJECTS_KEY, subjects);
            return mock;
        }
        return { error: 'not found' };
    }
};

// ══════════════════════════════════════════════
//  State
// ══════════════════════════════════════════════
let currentEssayId   = null;
let currentSubjectId = null;
let mocksChart       = null;

// ══════════════════════════════════════════════
//  Helpers
// ══════════════════════════════════════════════
function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function scoreClass(n) {
    if (isNaN(n)) return '';
    return n >= 20 ? 'score-high' : n >= 15 ? 'score-mid' : 'score-low';
}
function fmtDate(iso) {
    try { return new Date(iso).toLocaleDateString('ru-RU', { day:'numeric', month:'long', year:'numeric' }); }
    catch { return ''; }
}
function fmtShortDate(str) {
    try { return new Date(str).toLocaleDateString('ru-RU', { day:'numeric', month:'short' }); }
    catch { return str; }
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2200);
}

// ══════════════════════════════════════════════
//  Essays
// ══════════════════════════════════════════════
function renderEssays() {
    const list   = document.getElementById('essays-list');
    const essays = api.loadEssays();

    const scores = essays.map(e => parseInt(e.score)).filter(n => !isNaN(n));
    document.getElementById('total-count').textContent = essays.length || '0';
    document.getElementById('avg-score').textContent   = scores.length ? (scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1) : '—';
    document.getElementById('best-score').textContent  = scores.length ? Math.max(...scores) : '—';

    if (!essays.length) {
        list.innerHTML = '<div class="loading">Нет сочинений. Нажмите <strong>+</strong>, чтобы добавить.</div>';
        return;
    }

    list.innerHTML = '';
    [...essays].reverse().forEach((essay, i) => {
        const n   = parseInt(essay.score);
        const cls = scoreClass(n);
        const el  = document.createElement('div');
        el.className = 'essay-card';
        el.style.animationDelay = `${i * 0.05}s`;
        el.innerHTML = `
            <div class="card-score ${cls}">${isNaN(n) ? '?' : n}</div>
            <div class="card-body">
                <div class="essay-topic">${esc(essay.topic)}</div>
                <div class="card-date">${fmtDate(essay.timestamp)}</div>
            </div>
            <svg class="card-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        `;
        el.addEventListener('click', () => openEssay(essay));
        list.appendChild(el);
    });
}

function openEssay(essay) {
    currentEssayId = essay.id;
    const n = parseInt(essay.score);
    const badge = document.getElementById('view-score-display');
    badge.textContent = `${essay.score} б.`;
    badge.className   = 'essay-score-badge ' + scoreClass(n);
    document.getElementById('view-topic-display').textContent = essay.topic;
    document.getElementById('view-content-edit').value        = essay.content || '';
    openModal('view-modal');
}

// ══════════════════════════════════════════════
//  Subjects / Mocks
// ══════════════════════════════════════════════
const SUBJECT_ICONS = ['📚','📐','🔬','🧬','📜','🌍','💡','🎨','🎵','⚗️'];

function renderSubjects() {
    const grid     = document.getElementById('subjects-list');
    const subjects = api.loadSubjects();

    grid.innerHTML = '';

    subjects.forEach((subj, i) => {
        const mocks     = subj.mocks || [];
        const scores    = mocks.map(m => m.tasks.reduce((s,t) => s + parseInt(t.score||0), 0));
        const best      = scores.length ? Math.max(...scores) : null;
        const icon      = SUBJECT_ICONS[i % SUBJECT_ICONS.length];
        const el        = document.createElement('div');
        el.className    = 'subject-card';
        el.style.animationDelay = `${i * 0.06}s`;
        el.innerHTML    = `
            <div class="subject-icon">${icon}</div>
            <div class="subject-name">${esc(subj.name)}</div>
            <div class="subject-meta">${mocks.length} пробник${mocks.length === 1 ? '' : mocks.length<5 ? 'а' : 'ов'}</div>
            ${best !== null ? `<div class="subject-best">${best} б.</div>` : ''}
        `;
        el.addEventListener('click', () => openSubject(subj));
        grid.appendChild(el);
    });

    // add-subject tile
    const addTile = document.createElement('div');
    addTile.className = 'subject-card subject-card-add';
    addTile.innerHTML = `<div style="font-size:1.8rem">+</div><div style="font-size:0.85rem;font-weight:600;">Добавить предмет</div>`;
    addTile.addEventListener('click', () => openModal('add-subject-modal'));
    grid.appendChild(addTile);
}

function openSubject(subj) {
    currentSubjectId = subj.id;
    document.getElementById('subject-title-display').textContent = subj.name;

    const mocks = (subj.mocks || []).slice().sort((a,b) => new Date(a.date) - new Date(b.date));
    const list  = document.getElementById('mocks-list');
    list.innerHTML = '';

    if (!mocks.length) {
        list.innerHTML = '<div class="loading" style="padding:20px;">Пробников пока нет.</div>';
    } else {
        mocks.forEach(mock => {
            const total = mock.tasks.reduce((s,t) => s + parseInt(t.score||0), 0);
            const el    = document.createElement('div');
            el.className = 'mock-item';
            el.innerHTML = `
                <div>
                    <div class="mock-date">${fmtShortDate(mock.date)}</div>
                    <div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">${mock.tasks.length} заданий</div>
                </div>
                <div class="mock-score">${total} б.</div>
            `;
            list.appendChild(el);
        });
    }

    updateChart(mocks.map(m => ({
        label: fmtShortDate(m.date),
        score: m.tasks.reduce((s,t) => s + parseInt(t.score||0), 0)
    })));

    openModal('subject-modal');
}

function updateChart(data) {
    const ctx = document.getElementById('mocks-chart').getContext('2d');
    if (mocksChart) { mocksChart.destroy(); }

    mocksChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => d.label),
            datasets: [{
                label: 'Балл',
                data:  data.map(d => d.score),
                borderColor: '#c9a96e',
                backgroundColor: 'rgba(201,169,110,0.12)',
                tension: 0.35,
                fill: true,
                pointBackgroundColor: '#c9a96e',
                pointRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { ticks: { color: '#7c7589', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { beginAtZero: true, ticks: { color: '#7c7589', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.05)' } }
            },
            plugins: {
                legend: { display: false },
                tooltip: { mode: 'index', intersect: false }
            }
        }
    });
}

// ══════════════════════════════════════════════
//  Mock task inputs
// ══════════════════════════════════════════════
function addTaskInput() {
    const container = document.getElementById('tasks-inputs');
    const n         = container.children.length + 1;
    const div       = document.createElement('div');
    div.className   = 'task-input-group';
    div.innerHTML   = `
        <label>Задание ${n}</label>
        <input type="number" min="0" value="0" style="flex:1;">
    `;
    div.querySelector('input').addEventListener('input', updateMockTotal);
    container.appendChild(div);
    updateMockTotal();
}

function updateMockTotal() {
    const inputs = document.querySelectorAll('#tasks-inputs input');
    const total  = Array.from(inputs).reduce((s,i) => s + parseInt(i.value||0), 0);
    document.getElementById('mock-total-display').textContent = total;
}

// ══════════════════════════════════════════════
//  Modal helpers
// ══════════════════════════════════════════════
function openModal(id)  { document.getElementById(id).style.display = 'flex'; document.body.style.overflow = 'hidden'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; document.body.style.overflow = ''; }

// ══════════════════════════════════════════════
//  Tab switching
// ══════════════════════════════════════════════
const essaysTab  = document.getElementById('essays-tab-btn');
const mocksTab   = document.getElementById('mocks-tab-btn');
const essaysSec  = document.getElementById('essays-section');
const mocksSec   = document.getElementById('mocks-section');
const appTitle   = document.getElementById('app-title');
const addBtn     = document.getElementById('add-btn');

essaysTab.addEventListener('click', () => {
    essaysTab.classList.add('active');
    mocksTab.classList.remove('active');
    essaysSec.style.display = 'block';
    mocksSec.style.display  = 'none';
    addBtn.style.display    = 'flex';
    appTitle.textContent    = 'Мои Сочинения';
    renderEssays();
});

mocksTab.addEventListener('click', () => {
    mocksTab.classList.add('active');
    essaysTab.classList.remove('active');
    essaysSec.style.display = 'none';
    mocksSec.style.display  = 'block';
    addBtn.style.display    = 'none';
    appTitle.textContent    = 'Мои Пробники';
    renderSubjects();
});

// ══════════════════════════════════════════════
//  Event listeners — Essays
// ══════════════════════════════════════════════
addBtn.addEventListener('click', () => openModal('add-modal'));

document.getElementById('close-modal').addEventListener('click',   () => { closeModal('add-modal'); clearAddForm(); });
document.getElementById('cancel-add-btn').addEventListener('click', () => { closeModal('add-modal'); clearAddForm(); });
document.getElementById('add-overlay').addEventListener('click',    () => { closeModal('add-modal'); clearAddForm(); });

function clearAddForm() {
    ['new-topic','new-score','new-content'].forEach(id => document.getElementById(id).value = '');
}

document.getElementById('save-btn').addEventListener('click', () => {
    const topic   = document.getElementById('new-topic').value.trim();
    const score   = document.getElementById('new-score').value.trim();
    const content = document.getElementById('new-content').value.trim();
    if (!topic || !score) { showToast('Заполните тему и балл'); return; }
    if (parseInt(score) > 22) { showToast('Максимальный балл — 22'); return; }
    api.addEssay({ topic, score, content });
    closeModal('add-modal');
    clearAddForm();
    renderEssays();
    showToast('Сочинение сохранено ✓');
});

document.getElementById('close-view-modal').addEventListener('click', () => { closeModal('view-modal'); currentEssayId = null; });
document.getElementById('view-overlay').addEventListener('click',     () => { closeModal('view-modal'); currentEssayId = null; });

document.getElementById('update-btn').addEventListener('click', () => {
    if (!currentEssayId) return;
    api.updateEssayContent(currentEssayId, document.getElementById('view-content-edit').value);
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

// ══════════════════════════════════════════════
//  Event listeners — Subjects
// ══════════════════════════════════════════════
document.getElementById('close-add-subject-modal').addEventListener('click', () => closeModal('add-subject-modal'));
document.getElementById('cancel-subject-btn').addEventListener('click',      () => closeModal('add-subject-modal'));
document.getElementById('add-subject-overlay').addEventListener('click',     () => closeModal('add-subject-modal'));

document.getElementById('save-subject-btn').addEventListener('click', () => {
    const name = document.getElementById('new-subject-name').value.trim();
    if (!name) { showToast('Введите название предмета'); return; }
    api.addSubject(name);
    document.getElementById('new-subject-name').value = '';
    closeModal('add-subject-modal');
    renderSubjects();
    showToast('Предмет добавлен ✓');
});

// ══════════════════════════════════════════════
//  Event listeners — Subject detail & mocks
// ══════════════════════════════════════════════
document.getElementById('close-subject-modal').addEventListener('click', () => { closeModal('subject-modal'); currentSubjectId = null; });
document.getElementById('subject-overlay').addEventListener('click',     () => { closeModal('subject-modal'); currentSubjectId = null; });

document.getElementById('add-mock-btn').addEventListener('click', () => {
    if (!currentSubjectId) return;
    document.getElementById('mock-date').valueAsDate = new Date();
    document.getElementById('tasks-inputs').innerHTML = '';
    addTaskInput();
    openModal('add-mock-modal');
});

document.getElementById('add-task-input-btn').addEventListener('click', addTaskInput);

document.getElementById('close-add-mock-modal').addEventListener('click', () => closeModal('add-mock-modal'));
document.getElementById('cancel-mock-btn').addEventListener('click',      () => closeModal('add-mock-modal'));
document.getElementById('add-mock-overlay').addEventListener('click',     () => closeModal('add-mock-modal'));

document.getElementById('save-mock-btn').addEventListener('click', () => {
    const date   = document.getElementById('mock-date').value;
    const inputs = document.querySelectorAll('#tasks-inputs input');
    if (!date || !inputs.length) { showToast('Заполните дату и задания'); return; }
    const tasks = Array.from(inputs).map((inp, i) => ({ id: i+1, score: parseInt(inp.value||0) }));
    api.addMock(currentSubjectId, { date, tasks });

    // Reload subject detail
    const subjects     = api.loadSubjects();
    const updatedSubj  = subjects.find(s => s.id === currentSubjectId);
    closeModal('add-mock-modal');
    if (updatedSubj) openSubject(updatedSubj);
    showToast('Пробник сохранён ✓');
});

// ══════════════════════════════════════════════
//  Init
// ══════════════════════════════════════════════
renderEssays();

// Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
