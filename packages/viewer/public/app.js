// CourtDesk — Shared utilities

// --- Theme ---
const THEME_KEY = 'courtdesk-theme';

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersLight = matchMedia('(prefers-color-scheme: light)').matches;
  const theme = saved || (prefersLight ? 'light' : 'dark');
  document.documentElement.setAttribute('data-theme', theme);
  updateToggle(theme);
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(THEME_KEY, next);
  updateToggle(next);
}

function updateToggle(theme) {
  const b = document.getElementById('themeToggle');
  if (b) b.textContent = theme === 'dark' ? '☀️' : '🌙';
}

// --- Utilities ---
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function safeUrl(u) {
  const s = String(u ?? '');
  return /^https?:\/\//i.test(s) ? s : '#';
}
function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
}
function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', { day:'numeric', month:'long', year:'numeric' });
}
function showToast(msg, type) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show ' + (type || 'success');
  setTimeout(() => t.classList.remove('show'), 3000);
}
function debounce(fn, ms) {
  let timer;
  return (...a) => { clearTimeout(timer); timer = setTimeout(() => fn(...a), ms); };
}

// Esc to close any modal
document.addEventListener('keydown', e => {
  if (e.key === 'Escape')
    document.querySelectorAll('.detail.open').forEach(m => m.classList.remove('open'));
});

initTheme();