'use strict';

// ── Storage helpers ──────────────────────────────────────────────
const STORAGE_KEY = 'lockedin_v1';

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return { habits: [] };
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ── Date helpers ─────────────────────────────────────────────────

// Returns ISO week number for a given Date
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// Monday of the ISO week that contains `date`
function getMondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - (day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

// Returns YYYY-MM-DD string
function toKey(date) {
  return date.toISOString().slice(0, 10);
}

// 7 Date objects for Mon–Sun of the week starting at monday
function weekDates(monday) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

// ── State ────────────────────────────────────────────────────────
const today = new Date();
today.setHours(0, 0, 0, 0);

const state = loadData();

// viewMonday: monday of currently viewed week
if (!state.viewMonday) {
  state.viewMonday = toKey(getMondayOfWeek(today));
}

// Ensure each habit has a `done` map (date string → bool) and a name
state.habits = (state.habits || []).map(h => ({
  name: h.name || 'Gewoonte',
  done: h.done || {}
}));

// ── DOM refs ─────────────────────────────────────────────────────
const habitsList   = document.getElementById('habits-list');
const daysRow      = document.getElementById('days-row');
const weekLabel    = document.getElementById('week-label');
const progressRing = document.getElementById('progress-ring');
const pctText      = document.getElementById('pct-text');
const streakWeek   = document.getElementById('streak-week');
const streakAll    = document.getElementById('streak-alltime');
const addBtn       = document.getElementById('add-btn');
const modal        = document.getElementById('modal-backdrop');
const habitInput   = document.getElementById('habit-input');
const btnConfirm   = document.getElementById('btn-confirm');
const btnCancel    = document.getElementById('btn-cancel');
const btnPrev      = document.getElementById('btn-prev');
const btnNext      = document.getElementById('btn-next');

const CIRC = 2 * Math.PI * 28; // circumference for r=28

// ── Render ───────────────────────────────────────────────────────
function render() {
  const monday = new Date(state.viewMonday);
  const dates  = weekDates(monday);
  const weekNum = getISOWeek(monday);
  const todayKey = toKey(today);
  const isCurrentWeek = dates.some(d => toKey(d) === todayKey);

  // Week label
  weekLabel.textContent = `Week ${weekNum}`;

  // Disable next button if already on current or future week
  const currentMonday = toKey(getMondayOfWeek(today));
  btnNext.disabled = state.viewMonday >= currentMonday;
  btnNext.style.opacity = btnNext.disabled ? '0.3' : '';

  // Day letters
  const DAY_LETTERS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
  daysRow.innerHTML = '';
  dates.forEach((d, i) => {
    const el = document.createElement('div');
    el.className = 'day-letter' + (toKey(d) === todayKey ? ' today' : '');
    el.textContent = DAY_LETTERS[i];
    daysRow.appendChild(el);
  });

  // Habits
  habitsList.innerHTML = '';
  let totalPossible = 0, totalDone = 0;

  state.habits.forEach((habit, hi) => {
    const streak = calcCurrentStreak(habit);
    const row = document.createElement('div');
    row.className = 'habit-row';

    const badge = streak > 0
      ? `<span class="streak-badge">🔥 ${streak}</span>`
      : `<span class="streak-badge zero">0</span>`;

    let boxes = '';
    dates.forEach(d => {
      const key = toKey(d);
      const isFuture = d > today;
      const isDone = !!habit.done[key];
      if (!isFuture) { totalPossible++; if (isDone) totalDone++; }
      boxes += `<div class="day-box${isDone ? ' done' : ''}${isFuture ? ' future' : ''}"
        data-habit="${hi}" data-key="${key}" role="checkbox" aria-checked="${isDone}"
        aria-label="${DAY_LETTERS[dates.indexOf(d)]}"
        tabindex="${isFuture ? -1 : 0}">
        ${isDone ? '✓' : ''}
      </div>`;
    });

    row.innerHTML = `
      <div class="habit-name">
        <span class="habit-name-text" title="${habit.name}">${habit.name}</span>
        ${badge}
      </div>
      ${boxes}
    `;
    habitsList.appendChild(row);
  });

  // Progress ring
  const pct = totalPossible > 0 ? Math.round((totalDone / totalPossible) * 100) : 0;
  pctText.textContent = pct + '%';
  progressRing.style.strokeDashoffset = CIRC * (1 - pct / 100);

  // Streak stats
  const { weekBest, allTimeBest } = calcStreakStats();
  streakWeek.textContent  = weekBest  > 0 ? weekBest  + 'd' : '—';
  streakAll.textContent   = allTimeBest > 0 ? allTimeBest + 'd' : '—';

  saveData();
}

// ── Streak calculation ────────────────────────────────────────────

// Current active streak for a habit (consecutive days up to and including today)
function calcCurrentStreak(habit) {
  let streak = 0;
  const d = new Date(today);
  while (true) {
    if (habit.done[toKey(d)]) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else break;
  }
  return streak;
}

// Longest streak ever for a single habit
function calcLongestStreak(habit) {
  const keys = Object.keys(habit.done).filter(k => habit.done[k]).sort();
  if (!keys.length) return 0;
  let best = 1, cur = 1;
  for (let i = 1; i < keys.length; i++) {
    const prev = new Date(keys[i - 1]);
    const curr = new Date(keys[i]);
    const diff = (curr - prev) / 86400000;
    if (diff === 1) { cur++; best = Math.max(best, cur); }
    else cur = 1;
  }
  return best;
}

// Best streak this week + all-time best across all habits
function calcStreakStats() {
  const monday = new Date(state.viewMonday);
  const dates  = weekDates(monday);
  const keys   = dates.filter(d => d <= today).map(toKey);

  let weekBest = 0, allTimeBest = 0;

  state.habits.forEach(habit => {
    // week best: longest consecutive run within this week's past days
    let cur = 0, best = 0;
    keys.forEach(k => {
      if (habit.done[k]) { cur++; best = Math.max(best, cur); }
      else cur = 0;
    });
    weekBest = Math.max(weekBest, best);
    allTimeBest = Math.max(allTimeBest, calcLongestStreak(habit));
  });

  return { weekBest, allTimeBest };
}

// ── Events ────────────────────────────────────────────────────────

// Toggle day box
habitsList.addEventListener('click', e => {
  const box = e.target.closest('.day-box:not(.future)');
  if (!box) return;
  const hi  = parseInt(box.dataset.habit, 10);
  const key = box.dataset.key;
  state.habits[hi].done[key] = !state.habits[hi].done[key];
  render();
});

habitsList.addEventListener('keydown', e => {
  if (e.key !== ' ' && e.key !== 'Enter') return;
  const box = e.target.closest('.day-box:not(.future)');
  if (!box) return;
  e.preventDefault();
  box.click();
});

// Week navigation
btnPrev.addEventListener('click', () => {
  const m = new Date(state.viewMonday);
  m.setDate(m.getDate() - 7);
  state.viewMonday = toKey(m);
  render();
});

btnNext.addEventListener('click', () => {
  const m = new Date(state.viewMonday);
  m.setDate(m.getDate() + 7);
  state.viewMonday = toKey(m);
  render();
});

// Add habit modal
addBtn.addEventListener('click', () => {
  habitInput.value = '';
  modal.removeAttribute('hidden');
  habitInput.focus();
});

btnCancel.addEventListener('click', () => modal.setAttribute('hidden', ''));

modal.addEventListener('click', e => {
  if (e.target === modal) modal.setAttribute('hidden', '');
});

function confirmAdd() {
  const name = habitInput.value.trim();
  if (!name) return;
  state.habits.push({ name, done: {} });
  modal.setAttribute('hidden', '');
  render();
}

btnConfirm.addEventListener('click', confirmAdd);
habitInput.addEventListener('keydown', e => { if (e.key === 'Enter') confirmAdd(); });

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') modal.setAttribute('hidden', '');
});

// ── Service Worker registration ───────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// ── Init ──────────────────────────────────────────────────────────
render();
