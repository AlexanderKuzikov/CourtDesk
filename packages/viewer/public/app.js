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
  if (b) b.textContent = theme === 'dark' ? '☀' : '☾';
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