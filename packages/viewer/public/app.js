// CourtDesk — Shared utilities

// --- Theme ---
const THEME_KEY = 'courtdesk-theme';
const SKIN_KEY = 'courtdesk-skin';
const API_URL_KEY = 'courtdesk-api-url';
const DEFAULT_API_URL = '';

function getApiBase() {
  return localStorage.getItem(API_URL_KEY) || DEFAULT_API_URL;
}

function setApiBase(url) {
  const normalized = url.trim().replace(/\/+$/, '');
  localStorage.setItem(API_URL_KEY, normalized);
}

const SKINS = [
  { id: 'corporate', name: 'Стандарт',     desc: 'Slate · корпоративный',        swatch: 'linear-gradient(135deg,#0f172a 0 50%, #38bdf8 50% 100%)' },
  { id: 'legal',     name: 'Бумага',       desc: 'Paper · navy · деловой',         swatch: 'linear-gradient(135deg,#1a1f2a 0 50%, #6f9bd1 50% 100%)' },
  { id: 'compact',   name: 'Компактный',   desc: 'Carbon · терминальный',         swatch: 'linear-gradient(135deg,#0a0e14 0 50%, #2dd4bf 50% 100%)' },
];

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
  if (b) b.innerHTML = theme === 'dark' ? ic('sun') : ic('moon');
}

// --- Icons (inline SVG, stroke=currentColor — перекрашиваются темами) ---
const ICONS = {
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
  archive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
  printer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6"/><rect x="6" y="14" width="12" height="7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/></svg>',
  court: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M8 21h8"/><path d="M7 7L2 13a3 3 0 0 0 6 0L7 7z"/><path d="M17 7l-5 6a3 3 0 0 0 6 0l-1-6z"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>',
  clipboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>',
  brush: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M6.34 17.66l-1.41 1.41"/><path d="M19.07 4.93l-1.41 1.41"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>',
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M1 14h6"/><path d="M9 8h6"/><path d="M17 16h6"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
  fileText: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>',
  filePlus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15h6"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
};

function ic(name, size) {
  const svg = ICONS[name] || '';
  return svg.replace('<svg ', `<svg width="${size || 15}" height="${size || 15}" `);
}

function initIcons() {
  document.querySelectorAll('[data-icon]').forEach(el => {
    el.innerHTML = ic(el.dataset.icon, el.dataset.size || 15);
    el.style.verticalAlign = (el.dataset.size || 15) >= 20 ? '-5px' : '-3px';
  });
}

// --- Skin ---
function initSkin() {
  const saved = localStorage.getItem(SKIN_KEY);
  const skin = SKINS.some(s => s.id === saved) ? saved : 'corporate';
  document.documentElement.setAttribute('data-skin', skin);
  renderSkinMenu();
}

function setSkin(id) {
  if (!SKINS.some(s => s.id === id)) return;
  document.documentElement.setAttribute('data-skin', id);
  localStorage.setItem(SKIN_KEY, id);
  renderSkinMenu();
  closeSkinMenu();
}

function renderSkinMenu() {
  const m = document.getElementById('skinMenu');
  if (!m) return;
  const cur = document.documentElement.getAttribute('data-skin');
  m.innerHTML = SKINS.map(s => `
    <button type="button" class="skin-item ${s.id === cur ? 'selected' : ''}" data-skin="${s.id}" onclick="setSkin('${s.id}')">
      <span class="swatch" style="background:${s.swatch}"></span>
      <span class="name">${s.name}<span class="desc">${s.desc}</span></span>
      <span class="check">✓</span>
    </button>`).join('');
}

function toggleSkinMenu() {
  const m = document.getElementById('skinMenu');
  if (m) m.classList.toggle('open');
}

function closeSkinMenu() {
  const m = document.getElementById('skinMenu');
  if (m) m.classList.remove('open');
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

function apiUrl(path) {
  const base = getApiBase();
  return base + (path.startsWith('/') ? path : '/' + path);
}

// Esc to close any modal + skin menu
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.detail.open').forEach(m => m.classList.remove('open'));
    closeSkinMenu();
  }
});

// Click outside closes skin menu
document.addEventListener('click', e => {
  const m = document.getElementById('skinMenu');
  if (!m || !m.classList.contains('open')) return;
  const sw = e.target.closest('.skin-switcher');
  if (!sw) closeSkinMenu();
});

initTheme();
initSkin();
initIcons();