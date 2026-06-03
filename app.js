'use strict';

// ── Storage ──────────────────────────────────────────────────────
const STORAGE_KEY = 'lockedin_v1';
function loadData() {
  try { const r = localStorage.getItem(STORAGE_KEY); if (r) return JSON.parse(r); } catch (_) {}
  return { habits: [], theme: 'dark', layout: 'below' };
}
function saveData() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

// ── Date helpers ─────────────────────────────────────────────────
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - y) / 86400000) + 1) / 7);
}
function getMondayOfWeek(date) {
  const d = new Date(date); const day = d.getDay() || 7;
  d.setDate(d.getDate() - (day - 1)); d.setHours(0,0,0,0); return d;
}
function toKey(date) { return date.toISOString().slice(0, 10); }
function weekDates(monday) {
  return Array.from({length: 7}, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i); return d;
  });
}

// ── State ────────────────────────────────────────────────────────
const today = new Date(); today.setHours(0,0,0,0);
const state = loadData();
if (!state.viewMonday) state.viewMonday = toKey(getMondayOfWeek(today));
if (!state.theme)  state.theme  = 'dark';
if (!state.layout) state.layout = 'below';
state.habits = (state.habits || []).map(h => ({ name: h.name || 'Gewoonte', done: h.done || {} }));

// Apply saved theme + layout immediately
document.documentElement.setAttribute('data-theme',  state.theme);
document.documentElement.setAttribute('data-layout', state.layout);

// ── DOM ───────────────────────────────────────────────────────────
const habitsList    = document.getElementById('habits-list');
const daysRow       = document.getElementById('days-row');
const weekLabel     = document.getElementById('week-label');
const streakWeek    = document.getElementById('streak-week');
const streakAll     = document.getElementById('streak-alltime');
const addBtn        = document.getElementById('add-btn');
const modal         = document.getElementById('modal-backdrop');
const habitInput    = document.getElementById('habit-input');
const btnConfirm    = document.getElementById('btn-confirm');
const btnCancel     = document.getElementById('btn-cancel');
const btnPrev       = document.getElementById('btn-prev');
const btnNext       = document.getElementById('btn-next');
const settingsBtn   = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsClose = document.getElementById('settings-close');
const themeGrid     = document.getElementById('theme-grid');

// ── Themes config ─────────────────────────────────────────────────
const THEMES = [
  { id: 'dark',   label: 'Dark',   colors: ['#0a0a0a','#1D9E75'] },
  { id: 'light',  label: 'Light',  colors: ['#f5f4f0','#1D9E75'] },
  { id: 'blue',   label: 'Blue',   colors: ['#080c14','#4a9eff'] },
  { id: 'purple', label: 'Purple', colors: ['#0c080f','#a855f7'] },
  { id: 'red',    label: 'Red',    colors: ['#0f0808','#ef4444'] },
];

// Build theme swatches
THEMES.forEach(t => {
  const sw = document.createElement('div');
  sw.className = 'theme-swatch' + (state.theme === t.id ? ' active' : '');
  sw.style.background = `linear-gradient(135deg, ${t.colors[0]} 55%, ${t.colors[1]} 100%)`;
  sw.dataset.theme = t.id;
  sw.title = t.label;
  sw.innerHTML = `<span>${t.label}</span>`;
  sw.addEventListener('click', () => {
    state.theme = t.id;
    document.documentElement.setAttribute('data-theme', t.id);
    document.querySelectorAll('.theme-swatch').forEach(s => s.classList.toggle('active', s.dataset.theme === t.id));
    saveData();
  });
  themeGrid.appendChild(sw);
});

// Layout options
document.querySelectorAll('.layout-option').forEach(opt => {
  if (opt.dataset.layout === state.layout) opt.classList.add('active');
  opt.addEventListener('click', () => {
    state.layout = opt.dataset.layout;
    document.documentElement.setAttribute('data-layout', state.layout);
    document.querySelectorAll('.layout-option').forEach(o => o.classList.toggle('active', o.dataset.layout === state.layout));
    saveData();
    updateRings();
  });
});

// ── Ring helpers ──────────────────────────────────────────────────
// Inline ring (layout=below): r=28, circ=175.93
// Side ring   (layout=right): r=44, circ=276.46
function updateRings(pct) {
  if (pct === undefined) return;
  document.querySelectorAll('.progress-ring').forEach(ring => {
    const r = parseFloat(ring.getAttribute('r'));
    const circ = 2 * Math.PI * r;
    ring.style.strokeDasharray  = circ;
    ring.style.strokeDashoffset = circ * (1 - pct / 100);
  });
  document.querySelectorAll('.pct-text').forEach(t => { t.textContent = pct + '%'; });
}

// ── Render ────────────────────────────────────────────────────────
function render() {
  const monday   = new Date(state.viewMonday);
  const dates    = weekDates(monday);
  const todayKey = toKey(today);

  weekLabel.textContent = `Week ${getISOWeek(monday)}`;

  const currentMonday = toKey(getMondayOfWeek(today));
  btnNext.disabled = state.viewMonday >= currentMonday;
  btnNext.style.opacity = btnNext.disabled ? '0.3' : '';

  const DAY_LETTERS = ['Ma','Di','Wo','Do','Vr','Za','Zo'];
  daysRow.innerHTML = '';
  dates.forEach((d, i) => {
    const el = document.createElement('div');
    el.className = 'day-letter' + (toKey(d) === todayKey ? ' today' : '');
    el.textContent = DAY_LETTERS[i];
    daysRow.appendChild(el);
  });

  habitsList.innerHTML = '';
  let totalPossible = 0, totalDone = 0;

  state.habits.forEach((habit, hi) => {
    const streak = calcCurrentStreak(habit);
    let boxes = '';
    dates.forEach((d, di) => {
      const key = toKey(d);
      const isFuture = d > today;
      const isDone   = !!habit.done[key];
      if (!isFuture) { totalPossible++; if (isDone) totalDone++; }
      boxes += `<div class="day-box${isDone ? ' done' : ''}${isFuture ? ' future' : ''}"
        data-habit="${hi}" data-key="${key}" role="checkbox" aria-checked="${isDone}"
        aria-label="${DAY_LETTERS[di]}" tabindex="${isFuture ? -1 : 0}">${isDone ? '✓' : ''}</div>`;
    });

    const badge = streak > 0
      ? `<span class="streak-badge">🔥 ${streak}</span>`
      : `<span class="streak-badge zero">0</span>`;

    const row = document.createElement('div');
    row.className = 'habit-row';
    row.innerHTML = `<div class="habit-name"><span class="habit-name-text" title="${habit.name}">${habit.name}</span>${badge}</div>${boxes}`;
    habitsList.appendChild(row);
  });

  const pct = totalPossible > 0 ? Math.round((totalDone / totalPossible) * 100) : 0;
  updateRings(pct);

  const { weekBest, allTimeBest } = calcStreakStats();
  streakWeek.textContent = weekBest    > 0 ? weekBest    + 'd' : '—';
  streakAll.textContent  = allTimeBest > 0 ? allTimeBest + 'd' : '—';

  saveData();
}

// ── Streak helpers ────────────────────────────────────────────────
function calcCurrentStreak(habit) {
  let s = 0, d = new Date(today);
  while (habit.done[toKey(d)]) { s++; d.setDate(d.getDate() - 1); }
  return s;
}
function calcLongestStreak(habit) {
  const keys = Object.keys(habit.done).filter(k => habit.done[k]).sort();
  if (!keys.length) return 0;
  let best = 1, cur = 1;
  for (let i = 1; i < keys.length; i++) {
    const diff = (new Date(keys[i]) - new Date(keys[i-1])) / 86400000;
    diff === 1 ? (cur++, best = Math.max(best, cur)) : (cur = 1);
  }
  return best;
}
function calcStreakStats() {
  const dates = weekDates(new Date(state.viewMonday));
  const keys  = dates.filter(d => d <= today).map(toKey);
  let weekBest = 0, allTimeBest = 0;
  state.habits.forEach(habit => {
    let cur = 0, best = 0;
    keys.forEach(k => { habit.done[k] ? (cur++, best = Math.max(best, cur)) : (cur = 0); });
    weekBest     = Math.max(weekBest, best);
    allTimeBest  = Math.max(allTimeBest, calcLongestStreak(habit));
  });
  return { weekBest, allTimeBest };
}

// ── Events ────────────────────────────────────────────────────────
habitsList.addEventListener('click', e => {
  const box = e.target.closest('.day-box:not(.future)');
  if (!box) return;
  state.habits[+box.dataset.habit].done[box.dataset.key] ^= true;
  render();
});
habitsList.addEventListener('keydown', e => {
  if (e.key !== ' ' && e.key !== 'Enter') return;
  const box = e.target.closest('.day-box:not(.future)');
  if (box) { e.preventDefault(); box.click(); }
});

btnPrev.addEventListener('click', () => {
  const m = new Date(state.viewMonday); m.setDate(m.getDate() - 7);
  state.viewMonday = toKey(m); render();
});
btnNext.addEventListener('click', () => {
  const m = new Date(state.viewMonday); m.setDate(m.getDate() + 7);
  state.viewMonday = toKey(m); render();
});

addBtn.addEventListener('click', () => { habitInput.value = ''; modal.removeAttribute('hidden'); habitInput.focus(); });
btnCancel.addEventListener('click', () => modal.setAttribute('hidden', ''));
modal.addEventListener('click', e => { if (e.target === modal) modal.setAttribute('hidden', ''); });
function confirmAdd() {
  const name = habitInput.value.trim(); if (!name) return;
  state.habits.push({ name, done: {} });
  modal.setAttribute('hidden', ''); render();
}
btnConfirm.addEventListener('click', confirmAdd);
habitInput.addEventListener('keydown', e => { if (e.key === 'Enter') confirmAdd(); });

settingsBtn.addEventListener('click', () => settingsModal.removeAttribute('hidden'));
settingsClose.addEventListener('click', () => settingsModal.setAttribute('hidden', ''));
settingsModal.addEventListener('click', e => { if (e.target === settingsModal) settingsModal.setAttribute('hidden', ''); });

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { modal.setAttribute('hidden', ''); settingsModal.setAttribute('hidden', ''); }
});

// ── Service Worker ────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// ── Init ──────────────────────────────────────────────────────────
render();
