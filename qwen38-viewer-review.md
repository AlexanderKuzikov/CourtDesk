Ты работаешь в одиночном режиме глубокого анализа.
НЕ используй никакие инструменты, не звони функциям, не обращайся к сети.
Верни ОДИН финальный ответ. Требуемая глубина: 5 (1 — бегло, 10 — экстремально).

── КОНТЕКСТ ──
CourtDesk — CRM-мониторинг судебных дел РФ. Backend: Node.js 22 + Express 5 (API на 127.0.0.1:8767, 26 эндпоинтов). Фронтенд — vanilla JS, БЕЗ бандлера, БЕЗ фреймворков, БЕЗ npm-зависимостей: три страницы (dashboard=index.html, search.html, terminal.html), общий app.js, terminal.js, theme.css. Конвенции проекта: XSS-safe — весь user-контент только через esc() из app.js; event delegation через addEventListener на контейнере; data-* атрибуты для id; CSS variables для тем (data-theme, data-skin); никаких сторонних UI-библиотек; только system-ui. Экспорт CSV→XLSX (zero-dep: zip-store + inline strings). 213 тестов на бэкенде, UI-тестов НЕТ. Три скина × 5 тем (тёмные/светлые), terminal — Bloomberg-стиль с vim-клавишами. В production работает (Windows + Linux WebKit).

── ЗАДАЧА ──
Проведи полное ревью фронтенда (весь код ниже, ~2.4K строк): корректность, XSS, уязвимости, гонки/состояния, производительность (рендер больших таблиц дел — до 10K дел), доступность, адаптивность, консистентность тем. Особое внимание:
1. XSS: все ли места с user-контентом (имена сторон, номера дел, названия судов, ошибки с сервера, URL дел) проходят через esc()? Проверь каждый случай вставки innerHTML/template strings, включая атрибуты (href, title, data-*), ивент-обработчики, tooltips, lightbox/модалки. Найди все дыры с конкретными строками.
2. app.js: esc() корректность (экранирует ли кавычки для атрибутов?), ICONS/SVG, дебаунс (известен мёртвый debounce — WEBUI-O11), форматтеры дат/сумм, XLSX-экспорт (инъекция формул =CSV-инъекция из имён сторон?).
3. index.html (dashboard): 540 строк inline JS — какие проблемы (дублирование с app.js, глобальные переменные, гонки при параллельных запросах progress/refresh, ретраи, пагинация/виртуализация 10K строк?).
4. search.html: async-добавление дел, retry, обработка ошибок капчи, двойные сабмиты.
5. terminal.js: vim-навигация (коллизии клавиш с инпутами?), multi-sort, saved views, ховер-дедупликация.
6. theme.css: 3 скина × 5 тем — контраст, инверсия, missing vars, тёмная тема в WebKit Linux (emoji заменены на SVG — проверь остатки ⚠✓○✗★▸).
7. Сеть: fetch к API (пути, ошибки сети, таймауты, abort), обработка 4xx/5xx, retry-логика.
8. Главное: что сломается при 10K дел в store, при медленном API, при пустых данных, в IE/Edge legacy?

── КОД ──

=== index.html (44 KB) ===
<!DOCTYPE html>
<html lang="ru" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CourtDesk — Дашборд</title>
  <link rel="stylesheet" href="/theme.css">
  <script>function _t(){var s=localStorage.getItem('courtdesk-theme'),m=matchMedia('(prefers-color-scheme: light').matches;document.documentElement.setAttribute('data-theme',s||(m?'light':'dark'));var sk=localStorage.getItem('courtdesk-skin');if(sk==='legal'||sk==='compact')document.documentElement.setAttribute('data-skin',sk)}_t()</script>
  <style>
    .container { max-width: 1200px; margin: 0 auto; padding: 20px 24px; }
    .counters { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 20px; }
    .counter { background: var(--surface); border-radius: var(--skin-radius); padding: 14px; border: 1px solid var(--border); transition: background .2s; }
    .counter .num { font-size: 26px; font-weight: 700; line-height: 1; }
    .counter .label { font-size: 11px; color: var(--text-dim); margin-top: 4px; }
    .counter.monitoring .num { color: var(--primary); }
    .counter.waiting .num { color: var(--warning); }
    .counter.decision .num { color: var(--success); }
    .counter.enforced .num { color: var(--purple); }
    .toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
    .toolbar .actions { display: flex; gap: 8px; align-items: center; }
    .toolbar input[type="search"] { width: 220px; margin-bottom: 0; padding: 5px 10px; }
    #casesTable td:last-child, .action-btns { vertical-align: middle; }
    #casesTable tbody tr { cursor: pointer; transition: background .15s; }
    #casesTable tbody tr:hover { background: var(--surface-2); }
    .action-btns { white-space: nowrap; }
    .action-btns .icon-btn { display: inline-block; vertical-align: middle; }
    .icon-btn { padding: 3px 6px; border: none; border-radius: var(--skin-radius-sm); cursor: pointer; background: transparent; color: var(--text-dim); font-size: 14px; }
    .icon-btn:hover { background: var(--surface-2); color: var(--text); }
    .icon-btn.danger:hover { color: var(--danger); }
    .notifications { background: var(--surface); border-radius: var(--skin-radius); border: 1px solid var(--border); margin-top: 24px; transition: background .2s; }
    .notif-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid var(--border); }
    .notif-header h3 { font-size: 13px; color: var(--text-muted); }
    .notif-item { padding: 10px 16px; border-bottom: 1px solid var(--bg); display: flex; align-items: center; gap: 10px; }
    .notif-item:last-child { border-bottom: none; }
    .notif-item .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .notif-item .dot.found { background: var(--primary); }
    .notif-item .dot.decision { background: var(--success); }
    .notif-item .dot.enforced { background: var(--purple); }
    .notif-item .read { opacity: .5; }
    .notif-item .msg { flex: 1; font-size: 13px; }
    .notif-item .time { font-size: 11px; color: var(--text-dim); white-space: nowrap; }
    .detail-card .case-num { font-size: 12px; color: var(--text-dim); margin-bottom: 16px; word-break: break-all; }
    .detail-card .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; margin-bottom: 20px; }
    .detail-card .info-item .key { color: var(--text-muted); font-size: 11px; }
    .detail-card .info-item .val { color: var(--text); margin-top: 2px; }
    .detail-card .timeline { border-left: 2px solid var(--border); padding-left: 16px; }
    .detail-card .timeline-item { position: relative; padding: 8px 0; }
    .detail-card .timeline-item::before { content: ''; position: absolute; left: -21px; top: 14px; width: 9px; height: 9px; border-radius: 50%; background: var(--primary); }
    .detail-card .ev-type { font-size: 12px; font-weight: 600; color: var(--primary); }
    .detail-card .ev-msg { font-size: 13px; color: var(--text); margin-top: 2px; }
    .detail-card .ev-time { font-size: 11px; color: var(--text-dim); margin-top: 2px; }
    .scan-bar { display: none; align-items: center; gap: 10px; padding: 10px 16px; background: var(--primary-bg); border-radius: var(--skin-radius); margin-bottom: 16px; font-size: 13px; color: var(--primary); flex-wrap: wrap; }
    .scan-bar.show { display: flex; }
    .scan-bar .spinner { flex-shrink: 0; }
    /* WEBUI-O8: визуальный progress bar */
    .scan-track { flex: 1; min-width: 140px; height: 6px; background: var(--surface-2); border-radius: 3px; overflow: hidden; }
    .scan-fill { height: 100%; width: 0%; background: var(--primary); border-radius: 3px; transition: width .4s ease; }
    .scan-fill.indeterminate { width: 30%; animation: cd-indet 1.1s ease-in-out infinite; }
    @keyframes cd-indet { 0% { margin-left: -10%; } 100% { margin-left: 70%; } }
    /* WEBUI-O3: «требует внимания» */
    .attention-bar { display: none; align-items: center; gap: 10px; padding: 10px 16px; background: var(--warning-bg); border: 1px solid var(--warning); border-radius: var(--skin-radius); margin-bottom: 16px; font-size: 13px; flex-wrap: wrap; }
    .attention-bar.show { display: flex; }
    .attention-bar .ab-label { color: var(--warning); font-weight: 600; }
    /* WEBUI-O1: skeleton-загрузчики */
    .skeleton-row { height: 34px; margin-bottom: 8px; border-radius: var(--skin-radius-sm); background: linear-gradient(90deg, var(--surface) 25%, var(--surface-2) 50%, var(--surface) 75%); background-size: 200% 100%; animation: skel 1.2s linear infinite; }
    @keyframes skel { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    .scan-progress { width: 100%; display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .scan-item { font-size: 11px; padding: 3px 8px; border-radius: 4px; background: var(--surface); border: 1px solid var(--border); }
    .scan-item.done { border-color: var(--success); color: var(--success); }
    .scan-item.error { border-color: var(--danger); color: var(--danger); }
    .scan-item.current { border-color: var(--warning); color: var(--warning); background: var(--warning-bg); }
    @media (max-width: 640px) { .counters { grid-template-columns: repeat(2, 1fr); } .toolbar input[type="search"] { width: 100%; } }
  </style>
</head>
<body>
<header>
  <h1><span>CourtDesk</span> <span data-icon="court" data-size="22"></span></h1>
  <nav>
    <div class="skin-switcher">
      <button type="button" class="skin-btn" onclick="toggleSkinMenu()" title="Оформление" aria-haspopup="menu" aria-controls="skinMenu"><span data-icon="brush"></span></button>
      <div class="skin-menu" id="skinMenu" role="menu"></div>
    </div>
    <button id="themeToggle" class="theme-toggle" onclick="toggleTheme()"></button>
    <a href="/" style="color:var(--primary)"><span data-icon="chart"></span> Дашборд</a>
    <a href="/terminal.html">▶ Терминал</a>
    <a href="/search.html"><span data-icon="search"></span> Поиск</a>
  </nav>
</header>
<div class="container">
  <div class="counters" id="counters"></div>

  <div class="scan-bar" id="scanBar">
    <span class="spinner"></span>
    <span id="scanStatus">Мониторинг...</span>
    <div class="scan-track"><div class="scan-fill" id="scanFill"></div></div>
    <div class="scan-progress" id="scanProgress"></div>
  </div>

  <div class="attention-bar" id="attentionBar">
    <span class="ab-label">⚠ Требует внимания:</span>
    <span id="attentionContent"></span>
  </div>

  <div class="toolbar">
    <div class="filter-tabs" id="filterTabs">
      <span class="chip active" data-status="" onclick="setFilter('',this)">Все <span class="count" id="cnt-"></span></span>
      <span class="chip" data-status="monitoring" onclick="setFilter('monitoring',this)">Мониторинг <span class="count" id="cnt-monitoring"></span></span>
      <span class="chip" data-status="waiting" onclick="setFilter('waiting',this)">Ожидание <span class="count" id="cnt-waiting"></span></span>
      <span class="chip" data-status="decision" onclick="setFilter('decision',this)">Решение <span class="count" id="cnt-decision"></span></span>
      <span class="chip" data-status="enforced" onclick="setFilter('enforced',this)">Вступило <span class="count" id="cnt-enforced"></span></span>
      <span class="chip" data-status="error" onclick="setFilter('error',this)">Ошибка <span class="count" id="cnt-error"></span></span>
      <span class="chip" data-status="archived" onclick="setFilter('archived',this)">Архив <span class="count" id="cnt-archived"></span></span>
    </div>
    <div class="actions">
      <input type="search" id="caseSearch" placeholder="Поиск по номеру/суду..." oninput="onSearchInput(this.value)">
      <button class="btn btn-primary btn-sm" onclick="runMonitor()" id="runBtn">▶ Мониторинг</button>
      <a href="/search.html" class="btn btn-primary btn-sm">+ Дело</a>
      <button class="btn btn-secondary btn-sm" onclick="exportXls()" title="Экспорт в XLS (Excel)"><span data-icon="download"></span> XLS</button>
      <button class="btn btn-secondary btn-sm" onclick="loadDashboard()" title="Обновить"><span data-icon="refresh"></span></button>
      <button class="btn btn-secondary btn-sm" onclick="openSettings()" title="Настройки"><span data-icon="settings"></span></button>
    </div>
  </div>

  <div id="casesTable"><div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div></div>
  <div id="pagination"></div>

  <div class="notifications">
    <div class="notif-header">
      <h3><span data-icon="bell"></span> Уведомления</h3>
      <button class="btn btn-secondary btn-sm" onclick="markAllRead()" id="markReadBtn">✓ Прочитать все</button>
    </div>
    <div id="notifList"><div class="empty"><h3>Нет уведомлений</h3></div></div>
  </div>
</div>

<div class="detail" id="detailOverlay" onclick="if(event.target===this)closeDetail()">
  <div class="detail-card">
    <button class="close-btn" onclick="closeDetail()">&times;</button>
    <div id="detailContent"></div>
  </div>
</div>

<div class="toast" id="toast"></div>

<div class="detail" id="settingsOverlay" onclick="if(event.target===this)closeSettings()">
  <div class="detail-card" style="max-width:420px">
    <button class="close-btn" onclick="closeSettings()">&times;</button>
    <h2 style="margin-bottom:16px"><span data-icon="settings"></span> Настройки</h2>
    <div style="font-size:13px">
      <label style="display:block;margin-bottom:4px;color:var(--text-muted)">Сервер API</label>
      <input id="setApiUrl" type="url" placeholder="http://127.0.0.1:8767" style="width:100%;margin-bottom:4px;padding:6px 10px">
      <div style="font-size:11px;color:var(--text-dim);margin-bottom:16px">Перезагрузите страницу после изменения</div>

      <div style="border-top:1px solid var(--border);padding-top:16px;margin-bottom:16px">
        <div style="font-weight:600;margin-bottom:12px">Мониторинг</div>

      <label style="display:block;margin-bottom:4px;color:var(--text-muted)">Время полного прогона</label>
      <input id="setScheduleFull" type="time" style="width:100%;margin-bottom:12px;padding:6px 10px">

      <label style="display:block;margin-bottom:4px;color:var(--text-muted)">Retry каждые (часов)</label>
      <input id="setRetryInterval" type="number" min="1" max="24" style="width:100%;margin-bottom:12px;padding:6px 10px">

      <label style="display:block;margin-bottom:4px;color:var(--text-muted)">Stale-дела старше (часов)</label>
      <input id="setRetryStale" type="number" min="1" max="168" style="width:100%;margin-bottom:12px;padding:6px 10px">

      <label style="display:flex;align-items:center;gap:8px;margin-bottom:16px;cursor:pointer">
        <input id="setEnabled" type="checkbox"> Автоматический мониторинг
      </label>
      </div>

      <div style="display:flex;gap:8px">
        <button class="btn btn-primary btn-sm" onclick="saveSettings()" style="flex:1">Сохранить</button>
        <button class="btn btn-secondary btn-sm" onclick="closeSettings()">Отмена</button>
      </div>
    </div>
  </div>
</div>

<script src="/app.js"></script>
<script>
let allCases = [];
let currentFilter = '';
let searchQuery = '';
let currentPage = 1;
let sortCol = 'updatedAt';
let sortDir = 'desc';
const PAGE_SIZE = 20;
const STATUS_LABELS = { monitoring:'Мониторинг', waiting:'Ожидание', decision:'Решение', enforced:'Вступило', error:'Ошибка', archived:'Архив' };

function onSearchInput(val) { searchQuery = val.trim().toLowerCase(); currentPage = 1; renderTable(); }

// WEBUI-O8: текст + заполнение progress bar одним вызовом
function setScanProgress(d) {
  const fill = document.getElementById('scanFill');
  if (d.total > 0) {
    document.getElementById('scanStatus').textContent = `Мониторинг: ${d.processed}/${d.total} (ошибок: ${d.errors})`;
    fill.style.width = Math.min(100, Math.round(d.processed / d.total * 100)) + '%';
  } else {
    fill.style.width = '0%';
  }
}

// WEBUI-O3: дела, требующие внимания — ошибки и свежие решения
function updateAttentionBar() {
  const bar = document.getElementById('attentionBar');
  const errors = allCases.filter(c => c.status === 'error').length;
  const decisions = allCases.filter(c => c.status === 'decision').length;
  if (errors === 0 && decisions === 0) { bar.classList.remove('show'); return; }
  const parts = [];
  if (errors > 0) parts.push(`<a href="#" onclick="setFilter('error',document.querySelector('[data-status=error]'));return false" style="color:var(--danger)">${errors} с ошибками</a>`);
  if (decisions > 0) parts.push(`<a href="#" onclick="setFilter('decision',document.querySelector('[data-status=decision]'));return false" style="color:var(--success)">${decisions} с решением</a>`);
  document.getElementById('attentionContent').innerHTML = parts.join(' · ');
  bar.classList.add('show');
}

function setFilter(status, el) {
  currentFilter = status;
  currentPage = 1;
  document.querySelectorAll('.filter-tabs .chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderTable();
}

function toggleSort(col) {
  if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  else { sortCol = col; sortDir = 'asc'; }
  renderTable();
}

function getFilteredCases() {
  let cases = currentFilter ? allCases.filter(c => c.status === currentFilter) : [...allCases];
  if (searchQuery) {
    cases = cases.filter(c =>
      (c.number || '').toLowerCase().includes(searchQuery) ||
      (c.courtName || c.courtId || '').toLowerCase().includes(searchQuery)
    );
  }
  cases.sort((a, b) => {
    let av = a[sortCol] ?? '', bv = b[sortCol] ?? '';
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });
  return cases;
}

function updateCounts() {
  const counts = {};
  allCases.forEach(c => { counts[c.status] = (counts[c.status] || 0) + 1; });
  document.getElementById('cnt-').textContent = allCases.length;
  ['monitoring','waiting','decision','enforced','error','archived'].forEach(st =>
    document.getElementById('cnt-' + st).textContent = counts[st] || 0
  );
}

function renderTable() {
  const filtered = getFilteredCases();
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageCases = filtered.slice(start, start + PAGE_SIZE);

  if (total === 0) {
    document.getElementById('casesTable').innerHTML = '<div class="empty"><h3>Нет дел</h3><p>Добавьте первое дело через поиск</p></div>';
    document.getElementById('pagination').innerHTML = '';
    return;
  }

  const sortInd = (col) => sortCol === col ? `<span class="sort-ind">${sortDir === 'asc' ? '▲' : '▼'}</span>` : '';

  const rows = pageCases.map(c => `
    <tr onclick="if(event.target.tagName!=='SPAN')openDetail('${esc(c.uid)}')">
      <td><a href="#" onclick="openDetail('${esc(c.uid)}');return false" style="color:var(--primary);text-decoration:none;font-weight:600">${esc(c.number || '—')}</a></td>
      <td><span class="badge badge-${esc(c.status)}">${esc(STATUS_LABELS[c.status] || c.status)}</span></td>
      <td>${esc(c.courtName || c.courtId || '—')}</td>
      <td>${esc(c.result ? c.result.substring(0, 30) : '—')}</td>
      <td>${esc(c.legalForceDate || '—')}</td>
      <td style="font-size:11px;color:var(--text-dim)">${formatTime(c.updatedAt)}</td>
      <td class="action-btns">
        <span class="icon-btn" title="Перепарсить" onclick="reparseCase('${esc(c.uid)}', this)">${_reparsing.has(c.uid) ? '<span class="spinner"></span>' : ic('refresh')}</span>
        ${c.status !== 'archived'
          ? `<span class="icon-btn" title="Архивировать" onclick="archiveCase('${esc(c.uid)}')">${ic('archive')}</span>`
          : `<span class="icon-btn" title="Вернуть" onclick="unarchiveCase('${esc(c.uid)}')">${ic('undo')}</span>`}
        <span class="icon-btn danger" title="Удалить" onclick="deleteCase('${esc(c.uid)}')">${ic('trash')}</span>
      </td>
    </tr>`).join('');

  document.getElementById('casesTable').innerHTML = `
    <table>
      <thead><tr>
        <th class="sortable" onclick="toggleSort('number')">Номер ${sortInd('number')}</th>
        <th class="sortable" onclick="toggleSort('status')">Статус ${sortInd('status')}</th>
        <th class="sortable" onclick="toggleSort('courtId')">Суд ${sortInd('courtId')}</th>
        <th>Результат</th>
        <th>Вступление</th>
        <th class="sortable" onclick="toggleSort('updatedAt')">Обновлено ${sortInd('updatedAt')}</th>
        <th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  if (totalPages > 1) {
    const end = Math.min(start + PAGE_SIZE, total);
    document.getElementById('pagination').innerHTML = `
      <div class="pagination">
        <button class="btn btn-secondary btn-sm" onclick="goPage(${currentPage-1})" ${currentPage<=1?'disabled':''}>← Назад</button>
        <span class="page-info">${start+1}–${end} из ${total}</span>
        <button class="btn btn-secondary btn-sm" onclick="goPage(${currentPage+1})" ${currentPage>=totalPages?'disabled':''}>Вперёд →</button>
      </div>`;
  } else {
    document.getElementById('pagination').innerHTML = '';
  }
}

function goPage(p) { currentPage = p; renderTable(); }

// XLSX (Excel 2007+) без зависимостей: ZIP (store) + inline strings
function xlsXmlEscape(s) {
  return String(s ?? '').replace(/[<>&'"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','\'':'&apos;','"':'&quot;'}[c])).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}
function xlsColName(i) {
  let s = '';
  i++;
  while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; }
  return s;
}
const XLS_CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function xlsCrc32(u8) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = XLS_CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function xlsZipStore(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const nameU8 = enc.encode(f.name);
    const crc = xlsCrc32(f.data);
    const lh = new Uint8Array(30);
    const v = new DataView(lh.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true);
    v.setUint16(8, 0, true); v.setUint16(10, 0, true); v.setUint16(12, 0, true);
    v.setUint32(14, crc, true); v.setUint32(18, f.data.length, true); v.setUint32(22, f.data.length, true);
    v.setUint16(26, nameU8.length, true);
    chunks.push(lh, nameU8, f.data);
    central.push({ nameU8, crc, size: f.data.length, offset });
    offset += 30 + nameU8.length + f.data.length;
  }
  const cdStart = offset;
  const cd = [];
  for (const c of central) {
    const h = new Uint8Array(46);
    const v = new DataView(h.buffer);
    v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true); v.setUint16(8, 0x0800, true);
    v.setUint16(10, 0, true); v.setUint16(12, 0, true); v.setUint16(14, 0, true); v.setUint16(16, 0, true);
    v.setUint32(16, c.crc, true); v.setUint32(20, c.size, true); v.setUint32(24, c.size, true);
    v.setUint16(28, c.nameU8.length, true); v.setUint16(30, 0, true); v.setUint16(32, 0, true);
    v.setUint16(34, 0, true); v.setUint16(36, 0, true); v.setUint32(38, 0, true); v.setUint32(42, c.offset, true);
    cd.push(h, c.nameU8);
  }
  const cdSize = cd.reduce((a, c) => a + c.length, 0);
  const eocd = new Uint8Array(22);
  const e = new DataView(eocd.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(4, 0, true); e.setUint16(6, 0, true);
  e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true); e.setUint32(16, cdStart, true);
  const total = chunks.reduce((a, c) => a + c.length, 0) + cdSize + 22;
  const buf = new Uint8Array(total);
  let o = 0;
  for (const c of [...chunks, ...cd, eocd]) { buf.set(c, o); o += c.length; }
  return buf;
}
function exportXls() {
  const cases = getFilteredCases();
  if (!cases.length) { showToast('Нет дел для экспорта', 'error'); return; }
  const headers = ['Номер', 'Статус', 'Суд', 'Результат', 'Вступление в силу', 'Обновлено', 'URL'];
  const rows = cases.map(c => [c.number, STATUS_LABELS[c.status] || c.status, c.courtName || c.courtId, c.result, c.legalForceDate, c.updatedAt, c.url]);
  const sheetRows = [headers, ...rows].map((r, ri) =>
    `<row r="${ri + 1}">` + r.map((v, ci) => `<c r="${xlsColName(ci)}${ri + 1}" t="inlineStr"><is><t xml:space="preserve">${xlsXmlEscape(v)}</t></is></c>`).join('') + '</row>'
  ).join('');
  const enc = new TextEncoder();
  const zip = xlsZipStore([
    { name: '[Content_Types].xml', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>') },
    { name: '_rels/.rels', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
    { name: 'xl/workbook.xml', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Дела" sheetId="1" r:id="rId1"/></sheets></workbook>') },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>') },
    { name: 'xl/worksheets/sheet1.xml', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + sheetRows + '</sheetData></worksheet>') },
  ]);
  const blob = new Blob([zip], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'courtdesk-cases-' + new Date().toISOString().slice(0, 10) + '.xlsx';
  a.click();
  URL.revokeObjectURL(a.href);
  showToast(`Экспортировано дел: ${cases.length}`, 'success');
}

async function loadDashboard() {
  try {
    const [statusRes, casesRes, notifRes] = await Promise.all([
      fetch(apiUrl('/api/status')).then(r => r.json()),
      fetch(apiUrl('/api/cases')).then(r => r.json()),
      fetch(apiUrl('/api/notifications')).then(r => r.json()),
    ]);
    const s = statusRes.data || {};
    document.getElementById('counters').innerHTML = `
      <div class="counter monitoring"><div class="num">${s.monitoring ?? '?'}</div><div class="label">В мониторинге</div></div>
      <div class="counter waiting"><div class="num">${s.waiting ?? '?'}</div><div class="label">Ожидают появления</div></div>
      <div class="counter decision"><div class="num">${s.decision ?? '?'}</div><div class="label">Решение вынесено</div></div>
      <div class="counter enforced"><div class="num">${s.enforcedToday ?? '?'}</div><div class="label">Вступило сегодня</div></div>`;
    allCases = casesRes.data || [];
    renderTable();
    updateCounts();
    updateAttentionBar();
    const notifs = (notifRes.data || []).slice(-15).reverse();
    document.getElementById('notifList').innerHTML = notifs.length === 0
      ? '<div class="empty"><h3>Нет уведомлений</h3></div>'
      : notifs.map(n => `
        <div class="notif-item${n.read ? ' read' : ''}">
          <span class="dot ${n.type}"></span>
          <span class="msg">${esc(n.message)}</span>
          <span class="time">${formatTime(n.createdAt)}</span>
        </div>`).join('');
  } catch {
    // WEBUI-O11: retry прямо из состояния ошибки
    document.getElementById('casesTable').innerHTML = `<div class="empty"><h3>${ic('error')} Ошибка соединения</h3><p>Проверьте, что сервер запущен</p><p style="margin-top:12px"><button class="btn btn-primary btn-sm" onclick="loadDashboard()">${ic('refresh')} Повторить</button></p></div>`;
  }
}

async function openDetail(uid) {
  try {
    const [caseRes, eventsRes, cardRes, courtRes] = await Promise.all([
      fetch(apiUrl('/api/cases/' + encodeURIComponent(uid))).then(r => r.json()),
      fetch(apiUrl('/api/cases/' + encodeURIComponent(uid) + '/events')).then(r => r.json()),
      fetch(apiUrl('/api/cases/' + encodeURIComponent(uid) + '/card')).then(r => r.json()).catch(() => ({ data: null })),
      fetch(apiUrl('/api/courts/' + encodeURIComponent(document.querySelector('#detailOverlay')?.dataset?.courtId || ''))).then(r => r.json()).catch(() => ({ data: null })),
    ]);
    const c = caseRes.data || caseRes;
    const card = cardRes.data || null;
    const events = eventsRes.data || [];

    // Информация о суде из справочника
    let courtInfoHtml = '';
    if (card) {
      const courtName = c.courtName || card.court || c.courtId;
      courtInfoHtml = `
        <h3 style="font-size:13px;margin:16px 0 8px;color:var(--primary)">${ic('court')} Суд</h3>
        <div class="info-grid">
          <div class="info-item"><div class="key">Суд</div><div class="val">${esc(courtName)}</div></div>
          <div class="info-item"><div class="key">Тип суда</div><div class="val">${esc(courtTypeLabel(card.courtType || c.courtType))}</div></div>
          <div class="info-item"><div class="key">Тип дела</div><div class="val">${esc(card.type || '—')}</div></div>
          ${card.card ? `
          <div class="info-item"><div class="key">Категория</div><div class="val" style="font-size:11px">${esc((card.card.category||[]).join(' → ') || '—')}</div></div>
          <div class="info-item"><div class="key">Судья</div><div class="val">${esc(card.card.judge || '—')}</div></div>
          <div class="info-item"><div class="key">Дата поступления</div><div class="val">${esc(card.card.filingDate || '—')}</div></div>
          <div class="info-item"><div class="key">Дата слушания</div><div class="val">${esc(card.card.hearingDate || '—')}</div></div>
          <div class="info-item"><div class="key">Признак рассмотрения</div><div class="val">${esc(card.card.proceedingType || '—')}</div></div>
          <div class="info-item"><div class="key">Результат</div><div class="val"><strong>${esc(card.card.result || '—')}</strong></div></div>
          ${card.identifiers?.case_uid ? `<div class="info-item"><div class="key">УИД ГАС</div><div class="val" style="font-family:monospace;font-size:11px">${esc(card.identifiers.case_uid)}</div></div>` : ''}
          ${card.identifiers?.delo_id ? `<div class="info-item"><div class="key">Delo ID</div><div class="val" style="font-family:monospace;font-size:11px">${esc(card.identifiers.delo_id)}</div></div>` : ''}
          ${card.publishedAt ? `<div class="info-item"><div class="key">Опубликовано</div><div class="val" style="font-size:11px">${esc(card.publishedAt)}</div></div>` : ''}
          ${card.modifiedAt ? `<div class="info-item"><div class="key">Изменено</div><div class="val" style="font-size:11px">${esc(card.modifiedAt)}</div></div>` : ''}
          ` : ''}
        </div>`;
    }

    // Участники
    let partiesHtml = '';
    if (card && card.parties && card.parties.length > 0) {
      partiesHtml = `
        <h3 style="font-size:13px;margin:16px 0 8px;color:var(--primary)">${ic('users')} Участники (${card.parties.length})</h3>
        <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px;min-width:500px">
          <tr style="background:var(--surface-2)"><th style="text-align:left;padding:4px 6px">Роль</th><th style="text-align:left;padding:4px 6px">Наименование</th><th style="text-align:left;padding:4px 6px">ИНН</th><th style="text-align:left;padding:4px 6px">КПП</th><th style="text-align:left;padding:4px 6px">ОГРН</th><th style="text-align:left;padding:4px 6px">ОГРНИП</th></tr>
          ${card.parties.map(p => `<tr><td style="padding:4px 6px;border-bottom:1px solid var(--border);white-space:nowrap">${esc(p.role || '—')}</td><td style="padding:4px 6px;border-bottom:1px solid var(--border)">${esc(p.name || '—')}</td><td style="padding:4px 6px;border-bottom:1px solid var(--border);font-family:monospace;font-size:11px">${esc(p.inn || '')}</td><td style="padding:4px 6px;border-bottom:1px solid var(--border);font-family:monospace;font-size:11px">${esc(p.kpp || '')}</td><td style="padding:4px 6px;border-bottom:1px solid var(--border);font-family:monospace;font-size:11px">${esc(p.ogrn || '')}</td><td style="padding:4px 6px;border-bottom:1px solid var(--border);font-family:monospace;font-size:11px">${esc(p.ogrnip || '')}</td></tr>`).join('')}
        </table></div>`;
    }

    // События дела (из CaseCard)
    let cardEventsHtml = '';
    if (card && card.events && card.events.length > 0) {
      cardEventsHtml = `
        <h3 style="font-size:13px;margin:16px 0 8px;color:var(--primary)">${ic('calendar')} Движение дела (${card.events.length})</h3>
        <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px;min-width:600px">
          <tr style="background:var(--surface-2)"><th style="text-align:left;padding:4px 6px">Дата</th><th style="text-align:left;padding:4px 6px">Время</th><th style="text-align:left;padding:4px 6px">Событие</th><th style="text-align:left;padding:4px 6px">Результат</th><th style="text-align:left;padding:4px 6px">Судья</th><th style="text-align:left;padding:4px 6px">Место</th></tr>
          ${card.events.slice().reverse().map(e => `<tr><td style="padding:4px 6px;border-bottom:1px solid var(--border);white-space:nowrap">${esc(e.eventDate || '—')}</td><td style="padding:4px 6px;border-bottom:1px solid var(--border)">${esc(e.eventTime || '')}</td><td style="padding:4px 6px;border-bottom:1px solid var(--border)">${esc(e.eventName || '—')}</td><td style="padding:4px 6px;border-bottom:1px solid var(--border)">${esc(e.result || '—')}</td><td style="padding:4px 6px;border-bottom:1px solid var(--border);font-size:11px">${esc(e.judge || '')}</td><td style="padding:4px 6px;border-bottom:1px solid var(--border);font-size:11px">${esc(e.location || '')}</td></tr>`).join('')}
        </table></div>`;
    }

    // Timeline (история мониторинга)
    const timelineHtml = events.length > 0 ? events.slice().reverse().map(e => `
      <div class="timeline-item">
        <div class="ev-type">${esc(e.type)}</div>
        <div class="ev-msg">${esc(e.message)}</div>
        <div class="ev-time">${formatTime(e.createdAt)}</div>
      </div>`).join('') : '<div style="color:var(--text-dim);font-size:13px;padding:8px 0">Нет событий</div>';

    document.getElementById('detailContent').innerHTML = `
      <h2>${esc(c.number || 'Без номера')}</h2>
      <div class="case-num">${esc(c.url || '—')}</div>
      <div class="info-grid">
        <div class="info-item"><div class="key">Статус</div><div class="val"><span class="badge badge-${esc(c.status)}">${esc(STATUS_LABELS[c.status] || c.status)}</span></div></div>
        <div class="info-item"><div class="key">Вступление в силу</div><div class="val" style="color:var(--success);font-weight:600">${esc(c.legalForceDate || '—')}</div></div>
        <div class="info-item"><div class="key">Последняя проверка</div><div class="val">${formatTime(c.lastChecked)}</div></div>
        ${c.caseUid ? `<div class="info-item"><div class="key">УИД</div><div class="val" style="font-family:monospace;font-size:11px">${esc(c.caseUid)}</div></div>` : ''}
      </div>

      ${courtInfoHtml}
      ${partiesHtml}
      ${cardEventsHtml}

      <h3 style="font-size:13px;margin:16px 0 8px;color:var(--primary)">${ic('clipboard')} История мониторинга</h3>
      <div class="timeline">${timelineHtml}</div>

      <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary btn-sm" onclick="window.print()">${ic('printer')} Печать</button>
      </div>`;
    document.getElementById('detailOverlay').classList.add('open');
  } catch { showToast('Ошибка загрузки дела', 'error'); }
}
function closeDetail() { document.getElementById('detailOverlay').classList.remove('open'); }

async function archiveCase(uid) {
  try {
    const res = await fetch(apiUrl('/api/cases/' + encodeURIComponent(uid)), { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({status:'archived'}) });
    if (!res.ok) throw new Error();
    showToast('Дело заархивировано', 'success'); loadDashboard();
  } catch { showToast('Ошибка архивирования', 'error'); }
}
async function unarchiveCase(uid) {
  try {
    const res = await fetch(apiUrl('/api/cases/' + encodeURIComponent(uid)), { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({status:'monitoring'}) });
    if (!res.ok) throw new Error();
    showToast('Дело возвращено в мониторинг', 'success'); loadDashboard();
  } catch { showToast('Ошибка', 'error'); }
}
async function deleteCase(uid) {
  if (!confirm('Удалить дело безвозвратно?')) return;
  try {
    const res = await fetch(apiUrl('/api/cases/' + encodeURIComponent(uid)), { method: 'DELETE' });
    if (!res.ok) throw new Error();
    showToast('Дело удалено', 'success'); loadDashboard();
  } catch { showToast('Ошибка удаления', 'error'); }
}

const _reparsing = new Set();
async function reparseCase(uid, btn) {
  if (_reparsing.has(uid)) return;
  _reparsing.add(uid);
  const scanBar = document.getElementById('scanBar');
  const scanStatus = document.getElementById('scanStatus');
  const scanFill = document.getElementById('scanFill');
  const t0 = Date.now();
  if (btn) btn.innerHTML = '<span class="spinner"></span>';
  scanBar.classList.add('show');
  scanFill.classList.add('indeterminate');
  const tick = () => { scanStatus.textContent = `Перепарсинг: ${Math.round((Date.now() - t0) / 1000)} с…`; };
  tick();
  const timer = setInterval(tick, 1000);
  try {
    const res = await fetch(apiUrl('/api/cases/' + encodeURIComponent(uid) + '/parse'), { method: 'POST' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Ошибка парсинга');
    showToast('Дело перепарсено', 'success');
    _reparsing.delete(uid);
    const overlayOpen = document.getElementById('detailOverlay').classList.contains('open');
    await loadDashboard();
    if (overlayOpen) await openDetail(uid);
  } catch (e) { showToast(e.message, 'error'); }
  finally {
    clearInterval(timer);
    scanBar.classList.remove('show');
    scanFill.classList.remove('indeterminate');
    const wasActive = _reparsing.delete(uid);
    if (wasActive) {
      if (btn && btn.isConnected) btn.innerHTML = ic('refresh');
      else renderTable();
    }
  }
}

async function runMonitor() {
  const btn = document.getElementById('runBtn');
  const scanBar = document.getElementById('scanBar');
  const scanStatus = document.getElementById('scanStatus');
  const scanProgress = document.getElementById('scanProgress');
  const startTime = Date.now();
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Запущен...';
  try {
    const res = await fetch(apiUrl('/api/parse/run'), { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({mode:'full'}) });
    const json = await res.json();
    if (res.status === 409) {
      showToast('Прогон уже выполняется', 'error');
      scanBar.classList.add('show');
      document.getElementById('scanFill').style.width = '0%';
      scanStatus.textContent = 'Мониторинг уже выполняется...';
      // Пытаемся слушать прогресс текущего прогона
      const poll = setInterval(async () => {
        try {
          const p = await (await fetch(apiUrl('/api/parse/progress'))).json();
          const d = p.data || {};
          setScanProgress(d);
          updateScanProgress(startTime, scanProgress);
          if (!d.running) { clearInterval(poll); scanBar.classList.remove('show'); }
        } catch {}
      }, 5000);
      setTimeout(() => clearInterval(poll), 120000);
    } else if (!res.ok) {
      throw new Error(json.error || 'Ошибка');
    } else {
      showToast('Мониторинг запущен', 'success');
      scanBar.classList.add('show');
      document.getElementById('scanFill').style.width = '0%';
      scanStatus.textContent = 'Мониторинг...';
      let polls = 0;
      const poll = setInterval(async () => {
        await loadDashboard();
        updateScanProgress(startTime, scanProgress);
        // Обновляем прогресс
        try {
          const p = await (await fetch(apiUrl('/api/parse/progress'))).json();
          const d = p.data || {};
          setScanProgress(d);
          if (!d.running) {
            clearInterval(poll);
            scanBar.classList.remove('show');
            if (d.total > 0) showToast(`Мониторинг завершён: ${d.processed - d.errors} OK, ${d.errors} ошибок`, d.errors > 0 ? 'error' : 'success');
          }
        } catch {}
        if (++polls > 48) {
          clearInterval(poll);
          scanBar.classList.remove('show');
        }
      }, 5000);
    }
  } catch (err) {
    showToast(err.message, 'error');
    scanBar.classList.remove('show');
  }
  setTimeout(() => { btn.disabled = false; btn.innerHTML = '▶ Мониторинг'; }, 5000);
}

function updateScanProgress(startTime, container) {
  const items = allCases.slice(0, 20).map(c => {
    const updatedAt = new Date(c.updatedAt).getTime();
    let cls = '';
    let icon = '○';
    if (c.status === 'error') {
      cls = 'error';
      icon = '✗';
    } else if (updatedAt > startTime) {
      cls = 'done';
      icon = '✓';
    }
    return `<span class="scan-item ${cls}" title="${esc(c.number)}">${icon} ${esc(c.number.substring(0, 15))}</span>`;
  });
  container.innerHTML = items.join('');
}

async function markAllRead() {
  try {
    const notifs = await (await fetch(apiUrl('/api/notifications'))).json();
    const unread = (notifs.data || []).filter(n => !n.read);
    await Promise.all(unread.map(n =>
      fetch(apiUrl('/api/notifications/' + encodeURIComponent(n.uid) + '/read'), { method:'PATCH' })
    ));
    if (unread.length) showToast('Все уведомления отмечены', 'success');
    loadDashboard();
  } catch { showToast('Ошибка', 'error'); }
}

// --- Настройки ---
async function openSettings() {
  try {
    const r = await fetch(apiUrl('/api/settings'));
    const json = await r.json();
    const s = json.data || {};
    document.getElementById('setApiUrl').value = getApiBase();
    document.getElementById('setScheduleFull').value = s.scheduleFull || '03:00';
    document.getElementById('setRetryInterval').value = s.retryIntervalHours ?? 3;
    document.getElementById('setRetryStale').value = s.retryStaleHours ?? 6;
    document.getElementById('setEnabled').checked = s.scheduleEnabled !== false;
    document.getElementById('settingsOverlay').classList.add('open');
  } catch { showToast('Ошибка загрузки настроек', 'error'); }
}
function closeSettings() { document.getElementById('settingsOverlay').classList.remove('open'); }
async function saveSettings() {
  try {
    const newApiUrl = document.getElementById('setApiUrl').value.trim();
    if (newApiUrl && newApiUrl !== getApiBase()) {
      setApiBase(newApiUrl);
    }
    const body = {
      scheduleFull: document.getElementById('setScheduleFull').value,
      retryIntervalHours: parseInt(document.getElementById('setRetryInterval').value) || 3,
      retryStaleHours: parseInt(document.getElementById('setRetryStale').value) || 6,
      scheduleEnabled: document.getElementById('setEnabled').checked,
    };
    const r = await fetch(apiUrl('/api/settings'), { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
    if (!r.ok) throw new Error();
    showToast('Настройки сохранены', 'success');
    closeSettings();
    if (newApiUrl && newApiUrl !== getApiBase()) {
      setTimeout(() => location.reload(), 1000);
    }
  } catch { showToast('Ошибка сохранения', 'error'); }
}

loadDashboard();
let _autoRefresh = setInterval(loadDashboard, 30000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearInterval(_autoRefresh); _autoRefresh = 0; }
  else if (!_autoRefresh) _autoRefresh = setInterval(loadDashboard, 30000);
});
</script>
</body>
</html>

=== app.js (10.5 KB) ===
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

// --- Labels ---
const COURT_TYPE_LABELS = {
  district: 'Районный суд',
  appeal: 'Апелляционный суд',
  cassation: 'Кассационный суд',
  magistrate: 'Мировой суд',
};
function courtTypeLabel(t) {
  return COURT_TYPE_LABELS[t] || t || '?';
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
=== theme.css (18.8 KB) ===
/* CourtDesk — Shared theme + base components */
/* =========================================================================
   Оси темы:
     data-theme="dark|light"  — палитра (зачаток был ранее, оставлен как есть)
     data-skin="corporate|legal|compact" — характер оформления
   Skin задаёт font-family, border-radius, плотность, а также палитру-override
   (legal: parchment/sepia; compact: carbon/teal).
   ========================================================================= */

/* -------- Skin defaults (corporate — текущий slate стиль) -------- */
:root {
  --skin-font: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  --skin-head-font: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  --skin-tabular: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;

  --skin-radius: 10px;
  --skin-radius-sm: 6px;
  --skin-radius-lg: 12px;
  --skin-radius-chip: 16px;

  --skin-pad: 8px 12px;        /* table td */
  --skin-pad-th: 10px 12px;
  --skin-pad-btn: 7px 14px;
  --skin-pad-btn-sm: 4px 10px;
  --skin-shadow-btn: none;
  --skin-shadow-card: var(--shadow);
  --skin-border-w: 1px;
}

/* -------- Color palette: corporate dark (default) -------- */
:root, [data-theme="dark"] {
  --bg: #0f172a;
  --surface: #1e293b;
  --surface-hover: #0f172a;
  --surface-2: #334155;
  --border: #334155;
  --text: #e2e8f0;
  --text-muted: #94a3b8;
  --text-dim: #64748b;
  --primary: #38bdf8;
  --primary-2: #6366f1;
  --primary-bg: #1e3a5f;
  --success: #4ade80;
  --success-bg: #1a3a1a;
  --warning: #fbbf24;
  --warning-bg: #3a2a1a;
  --danger: #f87171;
  --danger-bg: #3a1a1a;
  --purple: #a78bfa;
  --purple-bg: #2a1a3a;
  --input-bg: #0f172a;
  --overlay: rgba(0,0,0,.6);
  --shadow: 0 20px 60px rgba(0,0,0,.5);

  --b-mon-bg:#1e3a5f; --b-mon-fg:#60a5fa;
  --b-dec-bg:#1a3a1a; --b-dec-fg:#4ade80;
  --b-enf-bg:#2a1a3a; --b-enf-fg:#c084fc;
  --b-wai-bg:#3a2a1a; --b-wai-fg:#fbbf24;
  --b-err-bg:#3a1a1a; --b-err-fg:#f87171;
  --b-arc-bg:#1e293b; --b-arc-fg:#64748b;
  --b-dis-bg:#1e3a5f; --b-dis-fg:#60a5fa;
  --b-app-bg:#1a3a1a; --b-app-fg:#4ade80;
  --b-cas-bg:#3a2a1a; --b-cas-fg:#fbbf24;
  --b-mag-bg:#2a1a3a; --b-mag-fg:#c084fc;
}
/* -------- Color palette: corporate light -------- */
[data-theme="light"] {
  --bg: #f1f5f9;
  --surface: #ffffff;
  --surface-hover: #f8fafc;
  --surface-2: #e2e8f0;
  --border: #e2e8f0;
  --text: #0f172a;
  --text-muted: #475569;
  --text-dim: #94a3b8;
  --primary: #0284c7;
  --primary-2: #4f46e5;
  --primary-bg: #e0f2fe;
  --success: #16a34a;
  --success-bg: #dcfce7;
  --warning: #d97706;
  --warning-bg: #fef3c7;
  --danger: #dc2626;
  --danger-bg: #fee2e2;
  --purple: #7c3aed;
  --purple-bg: #f3e8ff;
  --input-bg: #f8fafc;
  --overlay: rgba(0,0,0,.3);
  --shadow: 0 20px 60px rgba(0,0,0,.15);

  --b-mon-bg:#e0f2fe; --b-mon-fg:#0284c7;
  --b-dec-bg:#dcfce7; --b-dec-fg:#16a34a;
  --b-enf-bg:#f3e8ff; --b-enf-fg:#7c3aed;
  --b-wai-bg:#fef3c7; --b-wai-fg:#d97706;
  --b-err-bg:#fee2e2; --b-err-fg:#dc2626;
  --b-arc-bg:#f1f5f9; --b-arc-fg:#64748b;
  --b-dis-bg:#e0f2fe; --b-dis-fg:#0284c7;
  --b-app-bg:#dcfce7; --b-app-fg:#16a34a;
  --b-cas-bg:#fef3c7; --b-cas-fg:#d97706;
  --b-mag-bg:#f3e8ff; --b-mag-fg:#7c3aed;
}

/* =========================================================================
   SKIN: legal — «Бумага» (paper · navy · flat, без serif, tabular nums)
   ========================================================================= */
[data-skin="legal"]:root,
[data-skin="legal"][data-theme="dark"] {
  --bg: #1a1f2a;
  --surface: #232938;
  --surface-hover: #1f2431;
  --surface-2: #2d344a;
  --border: #3a4255;
  --text: #e6eaf0;
  --text-muted: #aab2c2;
  --text-dim: #6f7889;
  --primary: #6f9bd1;
  --primary-2: #5586c5;
  --primary-bg: #2a3550;
  --success: #6fb591;
  --success-bg: #1e2f28;
  --warning: #d6b35e;
  --warning-bg: #2e2d1c;
  --danger: #d77e7e;
  --danger-bg: #2c1d22;
  --purple: #b591cc;
  --purple-bg: #2a2230;
  --input-bg: #161b25;
  --overlay: rgba(8,12,18,.55);
  --shadow: 0 10px 30px rgba(0,0,0,.4);

  --skin-radius: 4px;
  --skin-radius-sm: 3px;
  --skin-radius-lg: 6px;
  --skin-radius-chip: 4px;
  --skin-shadow-card: 0 1px 0 var(--border);
  --skin-border-w: 1px;

  --b-mon-bg:#2a3550; --b-mon-fg:#6f9bd1;
  --b-dec-bg:#1e2f28; --b-dec-fg:#6fb591;
  --b-enf-bg:#2a2230; --b-enf-fg:#b591cc;
  --b-wai-bg:#2e2d1c; --b-wai-fg:#d6b35e;
  --b-err-bg:#2c1d22; --b-err-fg:#d77e7e;
  --b-arc-bg:#2d344a; --b-arc-fg:#6f7889;
  --b-dis-bg:#2a3550; --b-dis-fg:#6f9bd1;
  --b-app-bg:#1e2f28; --b-app-fg:#6fb591;
  --b-cas-bg:#2e2d1c; --b-cas-fg:#d6b35e;
  --b-mag-bg:#2a2230; --b-mag-fg:#b591cc;
}
[data-skin="legal"][data-theme="light"] {
  --bg: #eef1f6;
  --surface: #ffffff;
  --surface-hover: #f2f5fa;
  --surface-2: #e1e6ef;
  --border: #d4dae5;
  --text: #1c2436;
  --text-muted: #4f5872;
  --text-dim: #8a92a6;
  --primary: #244e8c;
  --primary-2: #1a3a6e;
  --primary-bg: #e4ecf7;
  --success: #2f7849;
  --success-bg: #e2efdf;
  --warning: #946811;
  --warning-bg: #f5edd5;
  --danger: #a82828;
  --danger-bg: #f5ddd9;
  --purple: #6e3b8c;
  --purple-bg: #ebe0f2;
  --input-bg: #ffffff;
  --overlay: rgba(20,30,50,.25);
  --shadow: 0 10px 30px rgba(40,60,100,.15);

  --b-mon-bg:#e4ecf7; --b-mon-fg:#244e8c;
  --b-dec-bg:#e2efdf; --b-dec-fg:#2f7849;
  --b-enf-bg:#ebe0f2; --b-enf-fg:#6e3b8c;
  --b-wai-bg:#f5edd5; --b-wai-fg:#946811;
  --b-err-bg:#f5ddd9; --b-err-fg:#a82828;
  --b-arc-bg:#e1e6ef; --b-arc-fg:#8a92a6;
  --b-dis-bg:#e4ecf7; --b-dis-fg:#244e8c;
  --b-app-bg:#e2efdf; --b-app-fg:#2f7849;
  --b-cas-bg:#f5edd5; --b-cas-fg:#946811;
  --b-mag-bg:#ebe0f2; --b-mag-fg:#6e3b8c;
}
/* legal: flat без gradient, чуть тяжелее заголовки, тонкая граница */
[data-skin="legal"] header h1 span { background: none; -webkit-text-fill-color: var(--primary); color: var(--primary); }
[data-skin="legal"] .btn-primary { background: var(--primary); color: #fff; }
[data-skin="legal"][data-theme="light"] .btn-primary { color: #fff; }
[data-skin="legal"] header { background: var(--surface); border-bottom-width: 2px; }
[data-skin="legal"] h1, [data-skin="legal"] h2, [data-skin="legal"] h3,
[data-skin="legal"] th, [data-skin="legal"] .counter .num { font-weight: 700; }
[data-skin="legal"] table { box-shadow: var(--skin-shadow-card); }

/* =========================================================================
   SKIN: compact — «Компактный» (carbon / teal, плотный, технический)
   ========================================================================= */
[data-skin="compact"]:root,
[data-skin="compact"][data-theme="dark"] {
  --bg: #0a0e14;
  --surface: #11161e;
  --surface-hover: #161c26;
  --surface-2: #1b222d;
  --border: #232b38;
  --text: #c5cdd8;
  --text-muted: #8a93a1;
  --text-dim: #5a6675;
  --primary: #2dd4bf;
  --primary-2: #22bfa8;
  --primary-bg: #0f2a28;
  --success: #4ade80;
  --success-bg: #122b1d;
  --warning: #facc15;
  --warning-bg: #2d2810;
  --danger: #f87171;
  --danger-bg: #2d1416;
  --purple: #a78bfa;
  --purple-bg: #1f1828;
  --input-bg: #0a0e14;
  --overlay: rgba(0,0,0,.7);
  --shadow: 0 8px 24px rgba(0,0,0,.55);

  --skin-radius: 3px;
  --skin-radius-sm: 3px;
  --skin-radius-lg: 4px;
  --skin-radius-chip: 3px;
  --skin-pad: 5px 8px;
  --skin-pad-th: 6px 8px;
  --skin-pad-btn: 4px 10px;
  --skin-pad-btn-sm: 3px 8px;
  --skin-shadow-card: 0 1px 0 var(--border);

  --b-mon-bg:#0f2a28; --b-mon-fg:#2dd4bf;
  --b-dec-bg:#122b1d; --b-dec-fg:#4ade80;
  --b-enf-bg:#1f1828; --b-enf-fg:#a78bfa;
  --b-wai-bg:#2d2810; --b-wai-fg:#facc15;
  --b-err-bg:#2d1416; --b-err-fg:#f87171;
  --b-arc-bg:#1b222d; --b-arc-fg:#5a6675;
  --b-dis-bg:#0f2a28; --b-dis-fg:#2dd4bf;
  --b-app-bg:#122b1d; --b-app-fg:#4ade80;
  --b-cas-bg:#2d2810; --b-cas-fg:#facc15;
  --b-mag-bg:#1f1828; --b-mag-fg:#a78bfa;
}
[data-skin="compact"][data-theme="light"] {
  --bg: #f4f6f9;
  --surface: #ffffff;
  --surface-hover: #eef1f5;
  --surface-2: #e4e8ed;
  --border: #d4dae0;
  --text: #1c2430;
  --text-muted: #4a5563;
  --text-dim: #8a93a1;
  --primary: #0d9488;
  --primary-2: #0b8074;
  --primary-bg: #d3f6f1;
  --success: #15803d;
  --success-bg: #dcfce7;
  --warning: #b45309;
  --warning-bg: #fef3c7;
  --danger: #b91c1c;
  --danger-bg: #fee2e2;
  --purple: #6d28d9;
  --purple-bg: #ede9fe;
  --input-bg: #ffffff;
  --overlay: rgba(10,15,20,.4);
  --shadow: 0 8px 24px rgba(15,30,50,.12);

  --b-mon-bg:#d3f6f1; --b-mon-fg:#0d9488;
  --b-dec-bg:#dcfce7; --b-dec-fg:#15803d;
  --b-enf-bg:#ede9fe; --b-enf-fg:#6d28d9;
  --b-wai-bg:#fef3c7; --b-wai-fg:#b45309;
  --b-err-bg:#fee2e2; --b-err-fg:#b91c1c;
  --b-arc-bg:#e4e8ed; --b-arc-fg:#8a93a1;
  --b-dis-bg:#d3f6f1; --b-dis-fg:#0d9488;
  --b-app-bg:#dcfce7; --b-app-fg:#15803d;
  --b-cas-bg:#fef3c7; --b-cas-fg:#b45309;
  --b-mag-bg:#ede9fe; --b-mag-fg:#6d28d9;
}
/* compact: body меньше, кнопки/таблицы плотнее, без градиента в логотипе */
[data-skin="compact"] body { font-size: 13px; }
[data-skin="compact"] header h1 { font-size: 17px; }
[data-skin="compact"] header h1 span { background: none; -webkit-text-fill-color: var(--primary); color: var(--primary); }
[data-skin="compact"] .btn-primary { background: var(--primary); color: var(--bg); }
[data-skin="compact"] .btn { font-weight: 600; }
[data-skin="compact"] .counter .num { font-size: 22px; }
[data-skin="compact"] .counter { padding: 10px; }
[data-skin="compact"] .badge { padding: 1px 6px; font-size: 10px; }
[data-skin="compact"] .filter-tabs .chip { padding: 3px 9px; font-size: 11px; }
[data-skin="compact"] table { font-size: 12px; }
[data-skin="compact"] input, [data-skin="compact"] select { padding: 5px 8px; font-size: 12px; }
[data-skin="compact"] .detail-card { padding: 16px; }
[data-skin="compact"] .toast { padding: 8px 12px; font-size: 12px; }
[data-skin="compact"] header { padding: 10px 18px; }
[data-skin="compact"] .container { padding: 14px 18px; }

/* =========================================================================
   Base
   ========================================================================= */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--skin-font); font-size: 14px; background: var(--bg); color: var(--text); min-height: 100vh; transition: background .2s, color .2s, font-size .2s; font-variant-numeric: tabular-nums lining-nums; }

/* Header */
header { background: linear-gradient(135deg, var(--surface) 0%, var(--bg) 100%); border-bottom: 2px solid var(--border); padding: 14px 24px; display: flex; align-items: center; gap: 14px; transition: background .2s; }
header h1 { font-size: 20px; font-weight: 700; font-family: var(--skin-head-font); }
header h1 span { background: linear-gradient(90deg, var(--primary), var(--primary-2)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
header nav { margin-left: auto; display: flex; align-items: center; gap: 8px; }
header nav a { color: var(--text-muted); text-decoration: none; font-size: 13px; padding: 4px 10px; border-radius: var(--skin-radius-sm); transition: background .15s, color .15s; }
header nav a:hover { background: var(--surface-2); color: var(--text); }
.theme-toggle { background: none; border: 1px solid var(--border); border-radius: var(--skin-radius-sm); width: 34px; height: 34px; font-size: 16px; cursor: pointer; transition: background .15s, border-color .15s; color: var(--text); }
.theme-toggle:hover { background: var(--surface-2); border-color: var(--text-dim); }

/* Skin switcher — dropdown */
.skin-switcher { position: relative; }
.skin-switcher .skin-btn { background: none; border: 1px solid var(--border); border-radius: var(--skin-radius-sm); width: 34px; height: 34px; font-size: 16px; cursor: pointer; transition: background .15s, border-color .15s; color: var(--text); line-height: 1; }
.skin-switcher .skin-btn:hover { background: var(--surface-2); border-color: var(--text-dim); }
.skin-switcher .skin-btn.active { border-color: var(--primary); color: var(--primary); }
.skin-menu { position: absolute; top: calc(100% + 6px); right: 0; min-width: 200px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--skin-radius); box-shadow: var(--shadow); padding: 6px; display: none; z-index: 50; }
.skin-menu.open { display: block; }
.skin-menu .skin-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; background: none; border: none; border-radius: var(--skin-radius-sm); cursor: pointer; color: var(--text); font-size: 13px; text-align: left; font-family: var(--skin-font); transition: background .15s; }
.skin-menu .skin-item:hover { background: var(--surface-2); }
.skin-menu .skin-item .swatch { width: 18px; height: 18px; border-radius: var(--skin-radius-sm); border: 1px solid var(--border); flex-shrink: 0; }
.skin-menu .skin-item .name { flex: 1; }
.skin-menu .skin-item .desc { font-size: 10px; color: var(--text-dim); display: block; }
.skin-menu .skin-item .check { color: var(--primary); font-weight: 700; opacity: 0; }
.skin-menu .skin-item.selected .check { opacity: 1; }
.skin-menu .skin-divider { height: 1px; background: var(--border); margin: 6px 0; }

/* Buttons */
.btn { padding: var(--skin-pad-btn); border: none; border-radius: var(--skin-radius-sm); font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 5px; transition: opacity .15s, background .15s; font-family: var(--skin-font); }
.btn-primary { background: linear-gradient(135deg, var(--primary), var(--primary-2)); color: #fff; }
.btn-primary:hover { opacity: .88; }
.btn-secondary { background: var(--surface-2); color: var(--text); }
.btn-secondary:hover { opacity: .85; }
.btn-danger { background: var(--danger-bg); color: var(--danger); }
.btn-danger:hover { opacity: .85; }
.btn-sm { padding: var(--skin-pad-btn-sm); font-size: 12px; }
.btn:disabled { opacity: .45; cursor: default; }

/* Badges */
.badge { display: inline-block; padding: 2px 8px; border-radius: var(--skin-radius-sm); font-size: 11px; font-weight: 600; }
.badge-monitoring { background: var(--b-mon-bg); color: var(--b-mon-fg); }
.badge-decision { background: var(--b-dec-bg); color: var(--b-dec-fg); }
.badge-enforced { background: var(--b-enf-bg); color: var(--b-enf-fg); }
.badge-waiting { background: var(--b-wai-bg); color: var(--b-wai-fg); }
.badge-error { background: var(--b-err-bg); color: var(--b-err-fg); }
.badge-archived { background: var(--b-arc-bg); color: var(--b-arc-fg); }
.badge-district { background: var(--b-dis-bg); color: var(--b-dis-fg); }
.badge-appeal { background: var(--b-app-bg); color: var(--b-app-fg); }
.badge-cassation { background: var(--b-cas-bg); color: var(--b-cas-fg); }
.badge-magistrate { background: var(--b-mag-bg); color: var(--b-mag-fg); }

/* Tables */
table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--surface); border-radius: var(--skin-radius); overflow: hidden; transition: background .2s; }
th { text-align: left; padding: var(--skin-pad-th); background: var(--bg); color: var(--text-muted); font-weight: 600; font-size: 11px; border-bottom: 2px solid var(--border); white-space: nowrap; }
td { padding: var(--skin-pad); border-bottom: 1px solid var(--border); }
tr:hover td { background: var(--surface-hover); }
th.sortable { cursor: pointer; user-select: none; }
th.sortable:hover { color: var(--primary); }
.sort-ind { font-size: 10px; opacity: .7; }

/* Inputs */
input, select { width: 100%; padding: 7px 10px; background: var(--input-bg); border: 1px solid var(--border); border-radius: var(--skin-radius-sm); color: var(--text); font-size: 13px; margin-bottom: 8px; transition: border-color .15s; font-family: var(--skin-font); }
input:focus, select:focus { outline: none; border-color: var(--primary); }
input[type="date"] { color-scheme: dark; }
[data-theme="light"] input[type="date"] { color-scheme: light; }

/* Filter chips */
.filter-tabs { display: flex; gap: 4px; margin-bottom: 16px; flex-wrap: wrap; }
.filter-tabs .chip { padding: 5px 12px; border-radius: var(--skin-radius-chip); font-size: 12px; background: var(--surface); border: 1px solid var(--border); cursor: pointer; color: var(--text-muted); transition: all .15s; }
.filter-tabs .chip.active { background: var(--primary-bg); border-color: var(--primary); color: var(--primary); }
.filter-tabs .chip .count { font-size: 10px; opacity: .6; margin-left: 2px; }

/* Modal */
.detail { display: none; position: fixed; inset: 0; background: var(--overlay); z-index: 100; align-items: center; justify-content: center; }
.detail.open { display: flex; }
.detail-card { background: var(--surface); border-radius: var(--skin-radius-lg); width: 680px; max-width: 90vw; max-height: 85vh; overflow-y: auto; padding: 24px; box-shadow: var(--skin-shadow-card); transition: background .2s; }
.detail-card h2 { font-size: 16px; margin-bottom: 4px; color: var(--primary); font-family: var(--skin-head-font); }
.detail-card .close-btn { float: right; background: none; border: none; color: var(--text-dim); font-size: 20px; cursor: pointer; }
.detail-card .close-btn:hover { color: var(--text); }

/* Toast */
.toast { position: fixed; bottom: 20px; right: 20px; padding: 12px 18px; border-radius: var(--skin-radius-sm); font-size: 13px; font-weight: 600; z-index: 200; opacity: 0; transition: opacity .3s; pointer-events: none; }
.toast.show { opacity: 1; }
.toast.success { background: var(--success-bg); color: var(--success); border: 1px solid var(--success); }
.toast.error { background: var(--danger-bg); color: var(--danger); border: 1px solid var(--danger); }

/* Spinner */
.spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid var(--primary); border-top-color: transparent; border-radius: 50%; animation: spin .6s linear infinite; vertical-align: middle; }
@keyframes spin { to { transform: rotate(360deg); } }

/* Skeleton */
.skeleton { background: linear-gradient(90deg, var(--surface) 25%, var(--surface-hover) 50%, var(--surface) 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; border-radius: var(--skin-radius-sm); }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

/* Empty state */
.empty { text-align: center; padding: 40px 20px; color: var(--text-dim); }
.empty h3 { font-size: 16px; margin-bottom: 4px; }

/* Pagination */
.pagination { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 12px; }
.pagination .page-info { font-size: 12px; color: var(--text-dim); }

/* Print */
@media print {
  header, .toolbar, .filter-tabs, .action-btns, .notifications, .counters, .pagination, .skin-switcher { display: none !important; }
  .detail.open { position: static; background: none; display: block; }
  .detail-card { width: 100%; max-width: 100%; box-shadow: none; border: 1px solid #ccc; }
  .close-btn, .detail-card .btn { display: none !important; }
  body { background: white; color: black; }
}
=== search.html (25.5 KB) ===
<!DOCTYPE html>
<html lang="ru" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CourtDesk — Поиск дел</title>
  <link rel="stylesheet" href="/theme.css">
  <script>function _t(){var s=localStorage.getItem('courtdesk-theme'),m=matchMedia('(prefers-color-scheme: light)').matches;document.documentElement.setAttribute('data-theme',s||(m?'light':'dark'));var sk=localStorage.getItem('courtdesk-skin');if(sk==='legal'||sk==='compact')document.documentElement.setAttribute('data-skin',sk)}_t()</script>
  <style>
    .app { display: grid; grid-template-columns: 300px 1fr; gap: 0; height: calc(100vh - 60px); }
    @media (max-width: 800px) { .app { grid-template-columns: 1fr; height: auto; } }
    .sidebar { background: var(--surface); padding: 16px; overflow-y: auto; border-right: 1px solid var(--border); transition: background .2s; }
    .sidebar h2 { font-size: 11px; color: var(--text-dim); margin: 16px 0 8px; }
    .sidebar h2:first-child { margin-top: 0; }
    .sidebar label { display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 3px; }
    .sidebar .btn { width: 100%; padding: 8px; margin-bottom: 8px; }
    .court-search { position: relative; }
    .court-results { position: absolute; z-index: 10; background: var(--surface); border: 1px solid var(--border); border-radius: var(--skin-radius-sm); max-height: 200px; overflow-y: auto; width: 100%; display: none; }
    .court-results div { padding: 6px 10px; font-size: 12px; cursor: pointer; }
    .court-results div:hover { background: var(--surface-2); }
    .court-results .code { color: var(--primary); font-family: monospace; margin-right: 6px; }
    .court-info { font-size: 11px; color: var(--text-dim); margin: -4px 0 8px; min-height: 14px; }
    .main { padding: 16px; overflow-y: auto; }
    .main h2 { font-size: 14px; font-weight: 600; margin-bottom: 10px; }
    .result-count { font-size: 12px; color: var(--text-dim); margin-bottom: 10px; }
    .tabs { display: flex; gap: 0; margin-bottom: 8px; background: var(--surface); border-radius: var(--skin-radius); overflow: hidden; border: 1px solid var(--border); }
    .tabs button { flex: 1; padding: 7px; border: none; background: transparent; color: var(--text-dim); font-size: 12px; cursor: pointer; border-right: 1px solid var(--border); transition: background .15s, color .15s; }
    .tabs button:last-child { border-right: none; }
    .tabs button.active { background: var(--surface-2); color: var(--text); font-weight: 600; }
    .monitor-btn { padding: 3px 10px; font-size: 11px; border: none; border-radius: var(--skin-radius-sm); cursor: pointer; background: var(--primary-bg); color: var(--primary); font-weight: 600; }
    .monitor-btn:hover { opacity: .8; }
    .monitor-btn.added { background: var(--success-bg); color: var(--success); cursor: default; }
    .scan-bar { display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: var(--primary-bg); border-radius: var(--skin-radius); margin-bottom: 16px; font-size: 13px; color: var(--primary); }
    .scan-bar .spinner { flex-shrink: 0; }
    .detail-card .case-num { font-size: 12px; color: var(--text-dim); margin-bottom: 16px; word-break: break-all; }
  </style>
</head>
<body>
<header>
  <h1><span>CourtDesk</span> <span data-icon="court" data-size="22"></span></h1>
  <nav>
    <div class="skin-switcher">
      <button type="button" class="skin-btn" onclick="toggleSkinMenu()" title="Оформление" aria-haspopup="menu" aria-controls="skinMenu"><span data-icon="brush"></span></button>
      <div class="skin-menu" id="skinMenu" role="menu"></div>
    </div>
    <button id="themeToggle" class="theme-toggle" onclick="toggleTheme()"></button>
    <a href="/"><span data-icon="chart"></span> Дашборд</a>
    <a href="/terminal.html">▶ Терминал</a>
    <a href="/search.html" style="color:var(--primary)"><span data-icon="search"></span> Поиск</a>
  </nav>
</header>
<div class="app">
  <div class="sidebar">
    <h2><span data-icon="court"></span> Суд</h2>
    <div class="court-search">
      <label>Поиск по названию</label>
      <input id="courtSearch" placeholder="Например: индустриальный" oninput="searchCourts(this.value)" autocomplete="off">
      <div class="court-results" id="courtResults"></div>
    </div>
    <label>Код суда</label>
    <div style="display:flex;gap:6px;align-items:center">
      <input id="courtCode" placeholder="59RS0007" onchange="selectCourt(this.value)" style="flex:1">
      <span id="courtDisplay" style="font-size:12px;color:var(--text-dim);flex:1"></span>
    </div>

    <h2><span data-icon="search"></span> Режим</h2>
    <div class="tabs" id="modeTabs">
      <button class="active" data-mode="party" onclick="switchMode('party',this)">По участникам</button>
      <button data-mode="case" onclick="switchMode('case',this)">По номеру</button>
      <button data-mode="uid" onclick="switchMode('uid',this)">По УИД</button>
    </div>

    <div id="caseFields" style="display:none">
      <label>Номер дела</label>
      <input id="caseNumber" placeholder="2-1234/2026">
    </div>
    <div id="partyFields">
      <label>ФИО ответчика / название</label>
      <input id="defendant" placeholder="Фамилия или название организации">
      <label>Дата поступления с</label>
      <input type="date" id="dateFrom">
      <label>по</label>
      <input type="date" id="dateTo">
    </div>
    <div id="uidFields" style="display:none">
      <label>УИД (уникальный идентификатор дела)</label>
      <input id="caseUid" placeholder="26RS0023-01-2020-000159-48">
      <div style="font-size:11px;color:var(--text-dim);margin-top:-4px">Формат: XXWWXXXX-XX-XXXX-XXXXXX-XX</div>
    </div>

    <button class="btn btn-primary" onclick="doSearch()" id="searchBtn"><span data-icon="search"></span> Найти</button>

    <h2><span data-icon="clock"></span> Отслеживание появления</h2>
    <label>Сторона (ФИО/название)</label>
    <input id="waitParty" placeholder="Фамилия истца/ответчика">
    <label>Дата подачи (приблизительно)</label>
    <input type="date" id="waitDate">
    <button class="btn btn-secondary" onclick="addWait()" id="waitBtn"><span data-icon="clock"></span> Следить за появлением</button>
  </div>

  <div class="main">
    <div id="resultInfo" class="result-count"></div>
    <div class="scan-bar" id="scanBar" style="display:none">
      <span class="spinner"></span>
      <span id="scanStatus">Поиск...</span>
    </div>
    <div class="results" id="resultsTable"></div>
    <div class="empty" id="emptyState">
      <h3><span data-icon="search"></span> Поиск судебных дел</h3>
      <p>Выберите суд и режим в боковой панели, затем нажмите «Найти»</p>
    </div>
  </div>
</div>

<div class="detail" id="detailOverlay" onclick="if(event.target===this)closeDetail()">
  <div class="detail-card">
    <button class="close-btn" onclick="closeDetail()">&times;</button>
    <div id="detailContent"></div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script src="/app.js"></script>
<script>
let allResults = [];

function searchCourts(q) {
  clearTimeout(searchCourts._t);
  const el = document.getElementById('courtResults');
  if (q.length < 2) { el.style.display = 'none'; return; }
  searchCourts._t = setTimeout(async () => {
    const r = await fetch(apiUrl('/api/courts?q=' + encodeURIComponent(q)));
    const data = await r.json();
    const list = data.data || data || [];
    el.innerHTML = list.map(c => `<div data-code="${esc(c.code)}"><span class="code">${esc(c.code)}</span> ${esc(c.name)}</div>`).join('');
    el.style.display = list.length ? 'block' : 'none';
  }, 300);
}
document.getElementById('courtSearch').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const first = document.querySelector('#courtResults [data-code]');
    if (first) { selectCourt(first.dataset.code); document.getElementById('courtResults').style.display = 'none'; }
  }
});
document.getElementById('courtSearch').addEventListener('blur', () => {
  setTimeout(() => document.getElementById('courtResults').style.display = 'none', 200);
});
document.getElementById('courtResults').addEventListener('click', e => {
  const item = e.target.closest('[data-code]');
  if (!item) return;
  document.getElementById('courtResults').style.display = 'none';
  selectCourt(item.dataset.code);
});
async function selectCourt(id) {
  document.getElementById('courtCode').value = id;
  const el = document.getElementById('courtDisplay');
  try {
    const r = await fetch(apiUrl('/api/courts/' + encodeURIComponent(id)));
    const data = await r.json();
    const c = data.data || data;
    if (!c || !c.name) { el.textContent = id; return; }
    // Заполняем поисковое поле названием суда
    document.getElementById('courtSearch').value = c.name;
    el.innerHTML = `${esc(c.name)} <span style="font-size:11px;color:var(--text-dim)">${esc(c.code)}</span>`;
  } catch { el.textContent = id; }
}

function switchMode(mode, btn) {
  document.querySelectorAll('#modeTabs button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('caseFields').style.display = mode === 'case' ? 'block' : 'none';
  document.getElementById('partyFields').style.display = mode === 'party' ? 'block' : 'none';
  document.getElementById('uidFields').style.display = mode === 'uid' ? 'block' : 'none';
}

async function doSearch() {
  const mode = document.querySelector('#modeTabs button.active').dataset.mode;
  const courtCode = document.getElementById('courtCode').value.trim();
  if (!courtCode) { showToast('Укажите код суда', 'error'); return; }

  const btn = document.getElementById('searchBtn');
  const scanBar = document.getElementById('scanBar');
  const scanStatus = document.getElementById('scanStatus');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Поиск…';
  document.getElementById('emptyState').style.display = 'none';
  scanBar.style.display = 'flex';
  scanStatus.textContent = 'Поиск...';

  try {
    let body, url;
    if (mode === 'case') {
      const num = document.getElementById('caseNumber').value.trim();
      if (!num) { showToast('Введите номер дела', 'error'); scanBar.style.display = 'none'; btn.disabled = false; btn.innerHTML = `${ic('search')} Найти`; return; }
      body = { courtId: courtCode, caseNumber: num };
      url = '/api/search/by-number';
    } else if (mode === 'uid') {
      const uidVal = document.getElementById('caseUid').value.trim();
      if (!uidVal) { showToast('Введите УИД', 'error'); scanBar.style.display = 'none'; btn.disabled = false; btn.innerHTML = `${ic('search')} Найти`; return; }
      body = { courtId: courtCode, caseUid: uidVal };
      url = '/api/search/by-case-uid';
    } else {
      const def = document.getElementById('defendant').value.trim();
      if (!def) { showToast('Введите ФИО или название', 'error'); scanBar.style.display = 'none'; btn.disabled = false; btn.innerHTML = `${ic('search')} Найти`; return; }
      const from = document.getElementById('dateFrom').value;
      const to = document.getElementById('dateTo').value;
      body = { courtId: courtCode, defendant: def, from: from || undefined, to: to || undefined };
      url = '/api/search/by-party';
    }

    const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
    const json = await r.json();
    if (!r.ok) throw new Error(json.error || 'Ошибка поиска');
    const results = json.data?.results || [];
    showResults(results, json.data?.count ?? results.length, json.data?.court);
  } catch (err) {
    // WEBUI-O11: сообщение + retry
    document.getElementById('resultsTable').innerHTML = `<div class="empty"><h3>${ic('error')} Ошибка</h3><p>${esc(err.message)}</p><p style="margin-top:12px"><button class="btn btn-primary btn-sm" onclick="doSearch()">${ic('refresh')} Повторить</button></p></div>`;
  }
  scanBar.style.display = 'none';
  btn.disabled = false;
  btn.innerHTML = `${ic('search')} Найти`;
}

function showResults(results, count, court) {
  allResults = results;
  const courtLabel = court ? ` в ${esc(court.name)} (${esc(court.code)})` : '';
  if (results.length === 0) {
    document.getElementById('resultsTable').innerHTML = '<div class="empty"><h3>Нет результатов</h3><p>Попробуйте изменить параметры поиска</p></div>';
    document.getElementById('resultInfo').textContent = '';
    return;
  }
  renderResults();
}

function renderResults() {
  if (!allResults.length) return;
  const tbody = allResults.map((r, i) => `
    <tr data-idx="${i}" style="cursor:pointer">
      <td><b>${esc(r.caseNumber)}</b></td>
      <td><span class="badge badge-${esc(r.courtType)}">${esc(courtTypeLabel(r.courtType))}</span></td>
      <td>${esc(r.judge || '—')}</td>
      <td>${esc((r.result || '—').substring(0, 35))}</td>
      <td>${esc(r.legalForceDate || '—')}</td>
      <td style="white-space:nowrap">
        <button class="monitor-btn" data-idx="${i}" onclick="addToMonitor(${i});event.stopPropagation()">${ic('filePlus')}</button>
      </td>
    </tr>`).join('');

  document.getElementById('resultsTable').innerHTML = `
    <table>
      <thead><tr><th>Номер</th><th>Тип</th><th>Судья</th><th>Результат</th><th>Вступление</th><th>Действия</th></tr></thead>
      <tbody>${tbody}</tbody>
    </table>`;
  document.getElementById('resultInfo').textContent = `Найдено ${allResults.length} дел`;
}

document.getElementById('resultsTable').addEventListener('click', e => {
  const tr = e.target.closest('tr[data-idx]');
  if (tr && !e.target.closest('.monitor-btn')) openDetail(parseInt(tr.dataset.idx));
});

async function addToMonitor(idx) {
  const r = allResults[idx];
  if (!r) return;
  const btn = document.querySelector(`.monitor-btn[data-idx="${idx}"]`);
  if (btn && btn.classList.contains('added')) return;
  try {
    // CR11-011: parse=async — не держим соединение, карточка догружается в фоне
    const res = await fetch(apiUrl('/api/cases?parse=async'), {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ url:r.caseUrl, courtId:r.courtId, courtCode:r.courtCode||r.courtId, courtType:r.courtType, caseNumber:r.caseNumber, caseUid:r.caseUid || undefined }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Ошибка');
    showToast(`Дело ${r.caseNumber} добавлено в мониторинг`, 'success');
    if (btn) { btn.innerHTML = '<span class="spinner"></span>'; btn.classList.add('added'); }
    const uid = json.data?.uid;
    if (uid) pollCardUntilReady(uid, btn);
  } catch (err) { showToast(err.message, 'error'); }
}

// Поллинг карточки после async-парсинга (до 2 минут)
function pollCardUntilReady(uid, btn) {
  let tries = 0;
  const timer = setInterval(async () => {
    try {
      const res = await fetch(apiUrl('/api/cases/' + encodeURIComponent(uid) + '/card'));
      if (res.ok) {
        clearInterval(timer);
        if (btn) btn.textContent = '✓';
        showToast('Карточка дела загружена', 'success');
        return;
      }
    } catch { /* сервер недоступен — пробуем дальше */ }
    if (++tries >= 24) { clearInterval(timer); if (btn) btn.textContent = '✓'; }
  }, 5000);
}

async function addWait() {
  const courtCode = document.getElementById('courtCode').value.trim();
  const party = document.getElementById('waitParty').value.trim();
  const date = document.getElementById('waitDate').value;
  if (!courtCode) { showToast('Укажите код суда', 'error'); return; }
  if (!party) { showToast('Введите сторону для отслеживания', 'error'); return; }
  const btn = document.getElementById('waitBtn');
  btn.disabled = true;
  try {
    let courtType = 'district';
    try { const info = await (await fetch(apiUrl('/api/courts/' + encodeURIComponent(courtCode))).json()); const c = info.data||info; if (c?.courtType) courtType = c.courtType; } catch {}
    const res = await fetch(apiUrl('/api/cases/wait'), { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ courtId:courtCode, courtType, party, filingDate:date }) });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Ошибка');
    showToast('Отслеживание появления дела добавлено', 'success');
    document.getElementById('waitParty').value = '';
    document.getElementById('waitDate').value = '';
  } catch (err) { showToast(err.message, 'error'); }
  btn.disabled = false;
}

async function openDetail(idx) {
  const r = allResults[idx];
  if (!r) return;

  // Пробуем загрузить полную карточку через парсинг URL
  let cardHtml = '';
  try {
    const parseRes = await fetch(apiUrl('/api/parse/url'), {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ url: r.caseUrl, courtId: r.courtId, courtType: r.courtType }),
    });
    if (parseRes.ok) {
      const json = await parseRes.json();
      const card = json.data;
      if (card) {
        // Информация о деле
        cardHtml = `
          <h3 style="font-size:13px;margin:16px 0 8px;color:var(--primary)">${ic('court')} Дело</h3>
          <div class="info-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px">
            <div class="info-item"><div class="key" style="color:var(--text-muted);font-size:11px">Тип</div><div class="val" style="margin-top:2px">${esc(card.type || '—')}</div></div>
            ${card.card ? `
              <div class="info-item"><div class="key" style="color:var(--text-muted);font-size:11px">Судья</div><div class="val" style="margin-top:2px">${esc(card.card.judge || '—')}</div></div>
              <div class="info-item"><div class="key" style="color:var(--text-muted);font-size:11px">Категория</div><div class="val" style="margin-top:2px;font-size:11px">${esc((card.card.category||[]).join(' → ') || '—')}</div></div>
              <div class="info-item"><div class="key" style="color:var(--text-muted);font-size:11px">Дата поступления</div><div class="val" style="margin-top:2px">${esc(card.card.filingDate || '—')}</div></div>
              <div class="info-item"><div class="key" style="color:var(--text-muted);font-size:11px">Дата слушания</div><div class="val" style="margin-top:2px">${esc(card.card.hearingDate || '—')}</div></div>
              <div class="info-item"><div class="key" style="color:var(--text-muted);font-size:11px">Признак рассмотрения</div><div class="val" style="margin-top:2px">${esc(card.card.proceedingType || '—')}</div></div>
              <div class="info-item"><div class="key" style="color:var(--text-muted);font-size:11px">Результат</div><div class="val" style="margin-top:2px"><strong>${esc(card.card.result || '—')}</strong></div></div>
            ` : ''}
            ${card.identifiers?.case_uid ? `<div class="info-item"><div class="key" style="color:var(--text-muted);font-size:11px">УИД ГАС</div><div class="val" style="margin-top:2px;font-family:monospace;font-size:11px">${esc(card.identifiers.case_uid)}</div></div>` : ''}
            ${card.publishedAt ? `<div class="info-item"><div class="key" style="color:var(--text-muted);font-size:11px">Опубликовано</div><div class="val" style="margin-top:2px;font-size:11px">${esc(card.publishedAt)}</div></div>` : ''}
            ${card.modifiedAt ? `<div class="info-item"><div class="key" style="color:var(--text-muted);font-size:11px">Изменено</div><div class="val" style="margin-top:2px;font-size:11px">${esc(card.modifiedAt)}</div></div>` : ''}
          </div>`;

        // Участники
        if (card.parties && card.parties.length > 0) {
          cardHtml += `
            <h3 style="font-size:13px;margin:16px 0 8px;color:var(--primary)">${ic('users')} Участники (${card.parties.length})</h3>
            <div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px;min-width:500px">
              <tr style="background:var(--surface-2)"><th style="text-align:left;padding:4px 6px">Роль</th><th style="text-align:left;padding:4px 6px">Наименование</th><th style="text-align:left;padding:4px 6px">ИНН</th><th style="text-align:left;padding:4px 6px">КПП</th><th style="text-align:left;padding:4px 6px">ОГРН</th></tr>
              ${card.parties.map(p => `<tr><td style="padding:4px 6px;border-bottom:1px solid var(--border);white-space:nowrap">${esc(p.role || '—')}</td><td style="padding:4px 6px;border-bottom:1px solid var(--border)">${esc(p.name || '—')}</td><td style="padding:4px 6px;border-bottom:1px solid var(--border);font-family:monospace;font-size:11px">${esc(p.inn || '')}</td><td style="padding:4px 6px;border-bottom:1px solid var(--border);font-family:monospace;font-size:11px">${esc(p.kpp || '')}</td><td style="padding:4px 6px;border-bottom:1px solid var(--border);font-family:monospace;font-size:11px">${esc(p.ogrn || '')}</td></tr>`).join('')}
            </table></div>`;
        }

        // События
        if (card.events && card.events.length > 0) {
          cardHtml += `
            <h3 style="font-size:13px;margin:16px 0 8px;color:var(--primary)">${ic('calendar')} Движение дела (${card.events.length})</h3>
            <div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px;min-width:600px">
              <tr style="background:var(--surface-2)"><th style="text-align:left;padding:4px 6px">Дата</th><th style="text-align:left;padding:4px 6px">Событие</th><th style="text-align:left;padding:4px 6px">Результат</th></tr>
              ${card.events.slice().reverse().map(e => `<tr><td style="padding:4px 6px;border-bottom:1px solid var(--border);white-space:nowrap">${esc(e.eventDate || '—')}</td><td style="padding:4px 6px;border-bottom:1px solid var(--border)">${esc(e.eventName || '—')}</td><td style="padding:4px 6px;border-bottom:1px solid var(--border)">${esc(e.result || '—')}</td></tr>`).join('')}
            </table></div>`;
        }
      }
    }
  } catch {}

  const url = safeUrl(r.caseUrl);
  document.getElementById('detailContent').innerHTML = `
    <h2>${esc(r.caseNumber)}</h2>
    <div class="case-num"><a href="${esc(url)}" target="_blank" rel="noopener noreferrer" style="color:var(--primary)">${esc(url)}</a></div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr><td style="color:var(--text-muted);width:40%;padding:4px 8px;border-bottom:1px solid var(--border)">Тип суда</td><td style="padding:4px 8px;border-bottom:1px solid var(--border)"><span class="badge badge-${esc(r.courtType)}">${esc(courtTypeLabel(r.courtType))}</span></td></tr>
      <tr><td style="color:var(--text-muted);padding:4px 8px;border-bottom:1px solid var(--border)">Судья</td><td style="padding:4px 8px;border-bottom:1px solid var(--border)">${esc(r.judge || '—')}</td></tr>
      <tr><td style="color:var(--text-muted);padding:4px 8px;border-bottom:1px solid var(--border)">Дата поступления</td><td style="padding:4px 8px;border-bottom:1px solid var(--border)">${esc(r.filingDate || '—')}</td></tr>
      <tr><td style="color:var(--text-muted);padding:4px 8px;border-bottom:1px solid var(--border)">Дата решения</td><td style="padding:4px 8px;border-bottom:1px solid var(--border)">${esc(r.decisionDate || '—')}</td></tr>
      <tr><td style="color:var(--text-muted);padding:4px 8px;border-bottom:1px solid var(--border)">Результат</td><td style="padding:4px 8px;border-bottom:1px solid var(--border)"><strong>${esc(r.result || '—')}</strong></td></tr>
      <tr><td style="color:var(--success);font-weight:600;padding:4px 8px">Вступление в силу</td><td style="color:var(--success);font-weight:600;padding:4px 8px">${esc(r.legalForceDate || '—')}</td></tr>
      ${r.caseUid ? `<tr><td style="color:var(--text-muted);padding:4px 8px;border-bottom:1px solid var(--border)">УИД</td><td style="padding:4px 8px;border-bottom:1px solid var(--border);font-family:monospace;font-size:11px">${esc(r.caseUid)}</td></tr>` : ''}
    </table>

    ${cardHtml}

    <div style="margin-top:16px">
      <button class="btn btn-primary" style="width:auto;padding:8px 16px" onclick="addToMonitor(${idx});closeDetail()">${ic('fileText')} В мониторинг</button>
    </div>`;
  document.getElementById('detailOverlay').classList.add('open');
}
function closeDetail() { document.getElementById('detailOverlay').classList.remove('open'); }
</script>
</body>
</html>

=== terminal.html (14.2 KB) ===
<!DOCTYPE html>
<html lang="ru" data-theme="dark" data-skin="corporate">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CourtDesk — Терминал</title>
  <link rel="stylesheet" href="/theme.css">
  <script>function _t(){var s=localStorage.getItem('courtdesk-theme'),m=matchMedia('(prefers-color-scheme: light)').matches;document.documentElement.setAttribute('data-theme',s||(m?'light':'dark'));var sk=localStorage.getItem('courtdesk-skin');if(sk==='legal'||sk==='compact')document.documentElement.setAttribute('data-skin',sk)}_t()</script>
  <style>
    body { font-family: var(--skin-tabular); }
    .t-app { display: flex; flex-direction: column; height: calc(100vh - 60px); }
    .t-cmd { display: flex; align-items: center; gap: 8px; padding: 6px 14px; background: var(--surface); border-bottom: 1px solid var(--border); color: var(--text-muted); font-family: var(--skin-tabular); font-size: 12px; flex-shrink: 0; }
    .t-cmd .prompt { color: var(--primary); font-weight: 700; }
    .t-cmd .mode { color: var(--success); font-weight: 700; min-width: 76px; }
    .t-cmd .mode.search { color: var(--primary); }
    .t-cmd .mode.cmd { color: var(--warning); }
    .t-cmd input { flex: 1; background: transparent; border: none; color: var(--text); font-family: var(--skin-tabular); font-size: 12px; padding: 0; margin: 0; }
    .t-cmd input:focus { outline: none; }
    .t-cmd .count { color: var(--text-dim); white-space: nowrap; }
    .t-cmd .hint { color: var(--text-dim); white-space: nowrap; font-size: 11px; }

    .t-filters { display: flex; gap: 4px; padding: 5px 14px; background: var(--bg); border-bottom: 1px solid var(--border); flex-wrap: wrap; flex-shrink: 0; }
    .t-filters .pill { padding: 2px 8px; border-radius: var(--skin-radius-sm); font-size: 11px; background: transparent; border: 1px solid var(--border); color: var(--text-muted); cursor: pointer; font-family: var(--skin-tabular); line-height: 1.4; }
    .t-filters .pill:hover { color: var(--text); border-color: var(--text-dim); }
    .t-filters .pill.active { background: var(--primary-bg); border-color: var(--primary); color: var(--primary); }
    .t-filters .pill .n { opacity: .7; margin-left: 4px; font-weight: 700; }
    .t-filters .pill .k { opacity: .5; margin-left: 5px; font-size: 10px; }

    .t-grid { flex: 1; display: grid; grid-template-columns: 1fr 280px; min-height: 0; }
    .t-grid.log-hidden { grid-template-columns: 1fr; }
    .t-grid.log-hidden .t-log { display: none; }
    .t-table { overflow: auto; background: var(--bg); position: relative; }
    .t-table table { width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed; background: var(--surface); }
    .t-table thead { position: sticky; top: 0; z-index: 2; }
    .t-table th { padding: 6px 10px; background: var(--surface); color: var(--text-muted); font-weight: 600; font-size: 11px; border-bottom: 1px solid var(--border); user-select: none; cursor: pointer; font-family: var(--skin-tabular); text-align: left; white-space: nowrap; transition: color .12s; }
    .t-table th:hover { color: var(--primary); }
    .t-table th.sort { color: var(--primary); }
    .t-table td { padding: 4px 10px; border-bottom: 1px solid var(--border); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .t-table tbody tr { cursor: pointer; transition: background .08s; }
    .t-table tbody tr:hover td { background: var(--surface-hover); }
    .t-table tbody tr.sel td { background: var(--primary-bg); }
    .t-table tbody tr.sel td:first-child { box-shadow: inset 2px 0 0 var(--primary); }
    .t-table td.idx { color: var(--text-dim); font-family: var(--skin-tabular); text-align: right; width: 38px; }
    .t-table th.idx { cursor: default; text-align: right; }
    .t-table td.num, .t-table td.mono { font-family: var(--skin-tabular); }
    .t-table td.ev { font-family: var(--skin-tabular); font-size: 11px; color: var(--text-dim); }
    .t-table .tag { display: inline-block; padding: 1px 5px; border-radius: var(--skin-radius-sm); font-size: 10px; font-weight: 700; font-family: var(--skin-tabular); }
    .sort-1::after { content: " ▼"; opacity: .8; }
    .sort-1.asc::after { content: " ▲"; }
    .sort-2::after { content: " ▷"; opacity: .6; }
    .sort-2.asc::after { content: " ◁"; }
    .sort-3::after { content: " ▹"; opacity: .5; }
    .sort-3.asc::after { content: " ◃"; }

    .t-log { padding: 8px 10px; overflow-y: auto; border-left: 1px solid var(--border); background: var(--surface); font-family: var(--skin-tabular); font-size: 11px; }
    .t-log > header { display: flex; align-items: center; justify-content: space-between; padding: 0 0 8px; margin-bottom: 6px; border-bottom: 1px solid var(--border); background: none; border-left: none; border-right: none; border-top: none; padding-left: 0; padding-right: 0; }
    .t-log > header h3 { font-family: var(--skin-tabular); font-size: 12px; color: var(--text-muted); font-weight: 600; }
    .t-log > header span { color: var(--text-dim); font-size: 10px; }
    .t-log .le { padding: 4px 0; border-bottom: 1px dashed var(--border); display: grid; grid-template-columns: 56px 1fr; gap: 6px; align-items: start; }
    .t-log .le:last-child { border: none; }
    .t-log .le .t { color: var(--text-dim); white-space: nowrap; font-size: 10px; padding-top: 1px; }
    .t-log .le .m { color: var(--text); font-size: 11px; }
    .t-log .le.read .m { opacity: .5; }
    .t-log .le.found .m::before { content: '+ '; color: var(--primary); font-weight: 700; }
    .t-log .le.decision .m::before { content: '★ '; color: var(--success); }
    .t-log .le.enforced .m::before { content: '◎ '; color: var(--purple); }
    .t-log .le.error .m::before { content: '✗ '; color: var(--danger); }
    .t-log .le.waiting .m::before { content: '○ '; color: var(--warning); }

    .t-status { padding: 4px 14px; background: var(--surface); border-top: 1px solid var(--border); color: var(--text-muted); font-family: var(--skin-tabular); font-size: 11px; display: flex; gap: 14px; align-items: center; flex-shrink: 0; overflow-x: auto; }
    .t-status .mode { color: var(--success); font-weight: 700; padding-right: 10px; border-right: 1px solid var(--border); white-space: nowrap; }
    .t-status .seg { white-space: nowrap; }
    .t-status .seg .k { color: var(--text-dim); margin-right: 4px; }
    .t-status .seg .v { color: var(--text); }
    .t-status .seg.scanrun .v { color: var(--warning); }
    .t-status .right { margin-left: auto; color: var(--text-dim); white-space: nowrap; }

    .empty-pad { padding: 40px 24px; text-align: center; color: var(--text-dim); font-family: var(--skin-tabular); font-size: 13px; }
    .scan-bar { display: none; padding: 4px 14px; background: var(--warning-bg); color: var(--warning); font-family: var(--skin-tabular); font-size: 11px; border-bottom: 1px solid var(--border); align-items: center; gap: 10px; flex-shrink: 0; }
    .scan-bar.show { display: flex; }

    .detail-card .case-num, .detail-card .info-item .key, .detail-card .ev-type, .detail-card .ev-time { font-family: var(--skin-tabular); font-size: 11px; }
    .detail-card .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; margin-bottom: 20px; }
    .detail-card .info-item .key { color: var(--text-muted); }
    .detail-card .info-item .val { color: var(--text); margin-top: 2px; font-size: 13px; }
    .detail-card .timeline { border-left: 2px solid var(--border); padding-left: 16px; }
    .detail-card .timeline-item { position: relative; padding: 8px 0; }
    .detail-card .timeline-item::before { content: ''; position: absolute; left: -21px; top: 14px; width: 9px; height: 9px; border-radius: 50%; background: var(--primary); }
    .detail-card .ev-msg { font-size: 13px; color: var(--text); margin-top: 2px; }
    .detail-card .sub { font-family: var(--skin-tabular); font-size: 11px; color: var(--text-muted); margin: 16px 0 6px; font-weight: 600; }
    .detail-card .sub .n { color: var(--primary); }

    .help-card { background: var(--surface); border-radius: var(--skin-radius-lg); width: 560px; max-width: 90vw; max-height: 85vh; overflow-y: auto; padding: 24px; box-shadow: var(--skin-shadow-card); }
    .help-card h2 { font-size: 16px; margin-bottom: 14px; color: var(--primary); font-family: var(--skin-head-font); }
    .help-card .keys { display: grid; grid-template-columns: auto 1fr; gap: 6px 18px; font-family: var(--skin-tabular); font-size: 13px; }
    .help-card .keys kbd { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--skin-radius-sm); padding: 2px 8px; font-family: var(--skin-tabular); font-size: 12px; color: var(--text); font-weight: 600; }
    .help-card .keys .desc { color: var(--text-muted); align-self: center; }
    .help-card .group { font-size: 11px; color: var(--text-dim); margin-top: 18px; padding-bottom: 4px; border-bottom: 1px solid var(--border); font-weight: 600; grid-column: 1 / -1; }
    .help-card .group:first-of-type { margin-top: 0; }

    @media (max-width: 900px) {
      .t-grid { grid-template-columns: 1fr; }
      .t-log { display: none; }
      .t-grid.log-hidden .t-log { display: none; }
    }
    @media (max-width: 640px) {
      .t-cmd .hint, .t-status .seg.scanrun, .t-status .seg.retry, .t-status .seg.cron { display: none; }
      .t-filters .pill .k { display: none; }
    }
  </style>
</head>
<body>
<header>
  <h1><span>CourtDesk</span> <span data-icon="court" data-size="22"></span></h1>
  <nav>
    <div class="skin-switcher">
      <button type="button" class="skin-btn" onclick="toggleSkinMenu()" title="Оформление" aria-haspopup="menu" aria-controls="skinMenu"><span data-icon="brush"></span></button>
      <div class="skin-menu" id="skinMenu" role="menu"></div>
    </div>
    <button id="themeToggle" class="theme-toggle" onclick="toggleTheme()"></button>
    <a href="/"><span data-icon="chart"></span> Дашборд</a>
    <a href="/terminal.html" style="color:var(--primary)">▶ Терминал</a>
    <a href="/search.html"><span data-icon="search"></span> Поиск</a>
  </nav>
</header>

<main class="t-app">
  <div class="scan-bar" id="scanBar">
    <span class="spinner"></span>
    <span id="scanStatus">Мониторинг...</span>
  </div>
  <div class="t-cmd">
    <span class="prompt">▸</span>
    <span class="mode" id="tMode">Обычный</span>
    <input id="cmdInput" placeholder="/текст — фильтр по таблице  ·  :команда — сохранённые виды, прогон" autocomplete="off" spellcheck="false">
    <span class="count" id="tCount">0/0</span>
    <span class="hint">` log · ? help</span>
  </div>
  <div class="t-filters" id="tFilters"></div>
  <div class="t-grid" id="tGrid">
    <div class="t-table" id="tTableWrap">
      <table>
        <thead><tr id="tHead"></tr></thead>
        <tbody id="tBody"></tbody>
      </table>
      <div id="tEmpty" class="empty-pad" style="display:none"></div>
    </div>
    <aside class="t-log" id="tLog">
      <header>
        <h3>Уведомления</h3>
        <span>` свернуть · m прочитать</span>
      </header>
      <div id="tLogList"></div>
    </aside>
  </div>
  <div class="t-status" id="tStatus"></div>
</main>

<div class="detail" id="detailOverlay" onclick="if(event.target===this)closeDetail()">
  <div class="detail-card">
    <button class="close-btn" onclick="closeDetail()">&times;</button>
    <div id="detailContent"></div>
  </div>
</div>

<div class="detail" id="helpOverlay" onclick="if(event.target===this)closeHelp()">
  <div class="help-card">
    <button class="close-btn" onclick="closeHelp()">&times;</button>
    <h2>Горячие клавиши — Терминал</h2>
    <div class="keys">
      <div class="group">Навигация</div>
      <kbd>j</kbd><span class="desc">вниз по списку</span>
      <kbd>k</kbd><span class="desc">вверх по списку</span>
      <kbd>g g</kbd><span class="desc">в начало</span>
      <kbd>G</kbd><span class="desc">в конец</span>
      <kbd>Ctrl+D</kbd><span class="desc">на полстраницы вниз</span>
      <kbd>Ctrl+U</kbd><span class="desc">на полстраницы вверх</span>
      <kbd>Enter</kbd><span class="desc">открыть детальную карточку</span>
      <kbd>q</kbd><span class="desc">закрыть карточку</kbd>
      <div class="group">Действия</div>
      <kbd>a</kbd><span class="desc">архивировать выбранное / вернуть из архива</span>
      <kbd>d</kbd><span class="desc">удалить (с подтверждением)</span>
      <kbd>r</kbd><span class="desc">обновить данные</span>
      <kbd>m</kbd><span class="desc">запустить прогон мониторинга</span>
      <kbd>n</kbd><span class="desc">перейти к поиску новых дел</span>
      <div class="group">Фильтры</div>
      <kbd>1</kbd>–<kbd>7</kbd><span class="desc">фильтр по статусу (7 = все)</span>
      <kbd>/</kbd><span class="desc">режим поиска по таблице</span>
      <kbd>:</kbd><span class="desc">командный режим</span>
      <kbd>Esc</kbd><span class="desc">очистить режим / закрыть окно</span>
      <div class="group">Прочее</div>
      <kbd>`` ` ``</kbd><span class="desc">свернуть/развернуть боковую панель уведомлений</span>
      <kbd>?</kbd><span class="desc">эта справка</span>
      <div class="group">Команды (после <kbd>:</kbd>)</div>
      <kbd>:сохр ИМЯ</kbd><span class="desc">сохранить вид (фильтр + сортировка + поиск)</span>
      <kbd>:прим ИМЯ</kbd><span class="desc">применить сохранённый вид</span>
      <kbd>:сп</kbd><span class="desc">список видов</span>
      <kbd>:удал ИМЯ</kbd><span class="desc">удалить вид</span>
      <kbd>:прогон</kbd><span class="desc">прогон мониторинга (= m)</span>
      <kbd>:обновить</kbd><span class="desc">обновить данные (= r)</span>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script src="/app.js"></script>
<script src="/terminal.js"></script>
</body>
</html>
=== terminal.js (31.4 KB) ===
// CourtDesk — Terminal view (Bloomberg-style, zero-dependency)
'use strict';

// ---------- State ----------
const STATUS_ORDER = ['', 'monitoring', 'waiting', 'decision', 'enforced', 'error', 'archived'];
const STATUS_KEYS = ['', '1', '2', '3', '4', '5', '6'];
const STATUS_LABELS = { monitoring: 'Мониторинг', waiting: 'Ожидание', decision: 'Решение', enforced: 'Вступило', error: 'Ошибка', archived: 'Архив' };
const STATUS_SHORT = { monitoring: 'Мон', waiting: 'Ож', decision: 'Реш', enforced: 'Вст', error: 'Ош', archived: 'Арх' };
const MODE_LABEL = { NORMAL: 'Обычный', SEARCH: 'Поиск', CMD: 'Команда' };
const PAGE_SIZE_VIEW = 0; // no paging — full scroll

const VIEWS_KEY = 'courtdesk-views';

const COLUMNS = [
  { key: 'idx',      label: '№',         width: '38px',   idx: true,  align: 'right', mono: true, nosort: true },
  { key: 'number',   label: 'Номер',     width: '130px',  mono: true },
  { key: 'status',   label: 'Статус',    width: '74px',   tag: true },
  { key: 'courtId',  label: 'Суд',       width: '180px' },
  { key: 'judge',    label: 'Судья',     width: '120px' },
  { key: 'result',   label: 'Результат', width: '200px' },
  { key: 'legalForceDate', label: 'Вступл.', width: '88px', mono: true },
  { key: 'updatedAt',label: 'Обновлено',width: '120px', mono: true, ev: true },
];
const COL_LABEL = Object.fromEntries(COLUMNS.map(c => [c.key, c.label]));

let allCases = [];
let allNotifs = [];
let statusData = {};
let scanRunning = false;

let tFilter = '';          // status filter ('' = all)
let tSearch = '';          // search query
let tSorts = [{ col: 'updatedAt', dir: 'desc' }]; // multi-sort
let selectedUid = null;

let mode = 'NORMAL';        // NORMAL | SEARCH | CMD
let logOpen = true;
let pollTimer = 0;
let scanPollTimer = 0;
let _ggPending = false;
let _hoverUid = null;       // CR12-S04: последний hover-uid, чтобы не дёргать selectRow

// ---------- API ----------
async function loadData() {
  const [s, c, n] = await Promise.all([
    fetch(apiUrl('/api/status')).then(r => r.json()),
    fetch(apiUrl('/api/cases')).then(r => r.json()),
    fetch(apiUrl('/api/notifications')).then(r => r.json()),
  ]);
  statusData = s.data || {};
  allCases = c.data || [];
  allNotifs = (n.data || []).slice().reverse();
  // try keep selection
  if (!allCases.some(x => x.uid === selectedUid)) selectedUid = null;
  if (!selectedUid && allCases.length) selectedUid = filtered()[0]?.uid || null;
}

async function patchCase(uid, body) {
  return fetch(apiUrl('/api/cases/' + encodeURIComponent(uid)), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
async function deleteCaseApi(uid) {
  return fetch(apiUrl('/api/cases/' + encodeURIComponent(uid)), { method: 'DELETE' });
}

// ---------- Filtering + multsort ----------
function filtered() {
  let rows = allCases;
  if (tFilter) rows = rows.filter(c => c.status === tFilter);
  if (tSearch) {
    const q = tSearch.toLowerCase();
    rows = rows.filter(c => (c.number || '').toLowerCase().includes(q) || (c.courtName || c.courtId || '').toLowerCase().includes(q));
  }
  // collect card data if needed (judge/result) — they're in c only if cached; fetch lazily per card if not.
  // Note: dashboard data has no judge/result; rendered only from card endpoint at detail time. Patch: show '—'.
  return rows.slice().sort((a, b) => {
    for (let i = 0; i < tSorts.length; i++) {
      const { col, dir } = tSorts[i];
      let av = a[col] ?? '', bv = b[col] ?? '';
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av < bv) return dir === 'asc' ? -1 : 1;
      if (av > bv) return dir === 'asc' ? 1 : -1;
    }
    return 0;
  });
}

function countsByStatus() {
  const m = {};
  allCases.forEach(c => m[c.status] = (m[c.status] || 0) + 1);
  return m;
}

// ---------- Rendering: filters pills ----------
function renderFilters() {
  const el = document.getElementById('tFilters');
  const counts = countsByStatus();
  const items = STATUS_ORDER.map((st, i) => ({
    st,
    label: st === '' ? 'Все' : STATUS_SHORT[st] || st,
    full: st === '' ? 'Все дела' : STATUS_LABELS[st],
    count: st === '' ? allCases.length : counts[st] || 0,
    key: STATUS_KEYS[i],
    active: tFilter === st,
  }));
  el.innerHTML = items.map(it => `
    <span class="pill ${it.active ? 'active' : ''}" data-st="${esc(it.st)}" title="${esc(it.full)}" onclick="setFilter('${esc(it.st)}')">
      ${esc(it.label)}<span class="n">${it.count}</span><span class="k">${it.key || ''}</span>
    </span>`).join('');
}

function setFilter(st) {
  tFilter = st;
  currentPageReset();
  renderFilters();
  renderTable();
  renderStatus();
}

function currentPageReset() {
  const fr = filtered();
  if (!fr.some(c => c.uid === selectedUid)) selectedUid = fr[0]?.uid || null;
}

// ---------- Rendering: table ----------
function renderHead() {
  const tr = document.getElementById('tHead');
  tr.innerHTML = COLUMNS.map((col, i) => {
    const sortIdx = tSorts.findIndex(s => s.col === col.key);
    const sortClass = sortIdx >= 0 ? `sort sort-${sortIdx + 1}${tSorts[sortIdx].dir === 'asc' ? ' asc' : ''}` : '';
    const stickyAttrs = col.idx ? 'class="idx"' : '';
    const cursor = col.nosort ? '' : `onclick="toggleSort('${col.key}', event)"`;
    return `<th ${stickyAttrs} ${cursor} style="width:${col.width};text-align:${col.align || 'left'}" ${sortClass ? `class="${sortClass}"` : ''}>${esc(col.label)}</th>`;
  }).join('');
}

function renderTable() {
  const rows = filtered();
  const tbody = document.getElementById('tBody');
  const empty = document.getElementById('tEmpty');
  document.getElementById('tCount').textContent = `${rows.length}/${allCases.length}`;
  if (rows.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    empty.textContent = tSearch ? `Нет совпадений по запросу «${tSearch}»` : (tFilter ? 'Нет дел со статусом ' + (STATUS_LABELS[tFilter] || tFilter) : 'Нет дел. Добавьте через поиск →');
    return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = rows.map((c, i) => {
    const sel = c.uid === selectedUid ? 'sel' : '';
    const short = STATUS_SHORT[c.status] || c.status || '—';
    return `<tr class="${sel}" data-uid="${esc(c.uid)}" onclick="selectRow('${esc(c.uid)}')" ondblclick="selectRow('${esc(c.uid)}');openDetail()">
      <td class="idx">${i + 1}</td>
      <td class="num"><a href="#" onclick="selectRow('${esc(c.uid)}');openDetail();return false" style="color:var(--primary);text-decoration:none">${esc(c.number || '—')}</a></td>
      <td><span class="tag badge badge-${esc(c.status)}">${esc(short)}</span></td>
      <td title="${esc(c.courtName || '')}">${esc(truncate(c.courtName || c.courtId || '—', 28))}</td>
      <td class="mono">${esc(c.judge || '—')}</td>
      <td>${esc(truncate(c.result || '—', 32))}</td>
      <td class="mono">${esc(c.legalForceDate || '—')}</td>
      <td class="ev">${formatTime(c.updatedAt)}</td>
    </tr>`;
  }).join('');
  _hoverUid = null; // CR12-S04: строки пересозданы — hover-селекция нужна заново
  ensureVisible();
}

function truncate(s, n) {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function ensureVisible() {
  const tr = document.querySelector('#tBody tr.sel');
  if (!tr) return;
  const wrap = document.getElementById('tTableWrap');
  const wr = wrap.getBoundingClientRect();
  const rr = tr.getBoundingClientRect();
  if (rr.top < wr.top + 40) tr.scrollIntoView({ block: 'nearest' });
  else if (rr.bottom > wr.bottom - 4) tr.scrollIntoView({ block: 'nearest' });
}

// ---------- Rendering: statusline ----------
function renderStatus() {
  const el = document.getElementById('tStatus');
  const rows = filtered();
  const sel = allCases.find(c => c.uid === selectedUid);
  const sortDesc = tSorts.map(s => (COL_LABEL[s.col] || s.col) + (s.dir === 'asc' ? '↑' : '↓')).join(' ');
  const filterDesc = tFilter ? (STATUS_SHORT[tFilter] || tFilter) : 'все';
  const retry = statusData.retryStaleHours || '?';
  const cron = statusData.scheduleFull || '?';
  const now = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  el.innerHTML = `
    <span class="mode">${esc(MODE_LABEL[mode] || mode)}</span>
    <span class="seg"><span class="k">дела:</span><span class="v">${rows.length}/${allCases.length}</span></span>
    <span class="seg"><span class="k">фильтр:</span><span class="v">${esc(filterDesc)}</span></span>
    <span class="seg" title="${esc(sortDesc)}"><span class="k">сорт:</span><span class="v">${esc(tSorts.length > 1 ? sortDesc : (tSorts[0] ? (COL_LABEL[tSorts[0].col] || tSorts[0].col) + (tSorts[0].dir === 'asc' ? '↑' : '↓') : '—'))}</span></span>
    <span class="seg retry"><span class="k">повтор:</span><span class="v">${esc(retry)}ч</span></span>
    <span class="seg cron"><span class="k">расп:</span><span class="v">${esc(cron)}</span></span>
    <span class="seg scanrun ${scanRunning ? '' : 'hidden'}"><span class="k">прогон:</span><span class="v">${scanRunning ? 'идёт' : '—'}</span></span>
    ${sel ? `<span class="seg"><span class="k">выбор:</span><span class="v" title="${esc(sel.number || '')}">${esc(truncate(sel.number || sel.uid, 22))}</span></span>` : ''}
    <span class="right">${esc(now)}</span>
  `;
}

// ---------- Rendering: notifications stream ----------
function renderNotifs() {
  const el = document.getElementById('tLogList');
  if (allNotifs.length === 0) {
    el.innerHTML = '<div style="color:var(--text-dim);font-size:11px;padding:8px 0">Нет уведомлений</div>';
    return;
  }
  el.innerHTML = allNotifs.slice(0, 60).map(n => `
    <div class="le ${n.read ? 'read' : ''} ${esc(n.type || '')}" title="${esc(n.message)}">
      <span class="t">${formatTime(n.createdAt).replace(',', '')}</span>
      <span class="m">${esc(n.message)}</span>
    </div>`).join('');
}

function fullRender() {
  renderFilters();
  renderHead();
  renderTable();
  renderNotifs();
  renderStatus();
}

// ---------- Multi-sort ----------
function toggleSort(col, ev) {
  if (col === 'idx') return;
  const shift = ev.shiftKey;
  const i = tSorts.findIndex(s => s.col === col);
  if (shift) {
    if (i >= 0) {
      tSorts[i].dir = tSorts[i].dir === 'asc' ? 'desc' : 'asc';
    } else {
      if (tSorts.length >= 3) tSorts.length = 2;
      tSorts.push({ col, dir: 'asc' });
    }
  } else {
    if (i >= 0) tSorts[i].dir = tSorts[i].dir === 'asc' ? 'desc' : 'asc';
    else tSorts = [{ col, dir: 'asc' }];
  }
  renderHead();
  renderTable();
  renderStatus();
}

// ---------- Selection ----------
function selectRow(uid) {
  selectedUid = uid;
  document.querySelectorAll('#tBody tr').forEach(tr => tr.classList.toggle('sel', tr.dataset.uid === uid));
  renderStatus();
}

function moveSel(delta) {
  const rows = filtered();
  if (!rows.length) return;
  const i = rows.findIndex(c => c.uid === selectedUid);
  let next = i + delta;
  if (next < 0) next = 0;
  if (next >= rows.length) next = rows.length - 1;
  selectedUid = rows[next].uid;
  document.querySelectorAll('#tBody tr').forEach(tr => tr.classList.toggle('sel', tr.dataset.uid === selectedUid));
  ensureVisible();
  renderStatus();
}

function goTop() {
  const rows = filtered();
  if (!rows.length) return;
  selectedUid = rows[0].uid;
  document.querySelectorAll('#tBody tr').forEach(tr => tr.classList.toggle('sel', tr.dataset.uid === selectedUid));
  document.getElementById('tTableWrap').scrollTo({ top: 0, behavior: 'auto' });
  renderStatus();
}
function goBottom() {
  const rows = filtered();
  if (!rows.length) return;
  selectedUid = rows[rows.length - 1].uid;
  document.querySelectorAll('#tBody tr').forEach(tr => tr.classList.toggle('sel', tr.dataset.uid === selectedUid));
  document.getElementById('tTableWrap').scrollTo({ top: 999999, behavior: 'auto' });
  renderStatus();
}
function pageByHalf(half) {
  const wrap = document.getElementById('tTableWrap');
  wrap.scrollBy({ top: half * wrap.clientHeight * 0.5, behavior: 'auto' });
  // не двигать selectedRow принудительно; но если selectedRow вне видимости — приблизим
  ensureVisible();
}

// ---------- Modes ----------
function enterMode(name) {
  mode = name;
  const classList = document.getElementById('tMode').classList;
  classList.remove('search', 'cmd');
  if (name === 'SEARCH') classList.add('search');
  if (name === 'CMD') classList.add('cmd');
  const modeEl = document.getElementById('tMode');
  modeEl.textContent = MODE_LABEL[name] || name;

  const input = document.getElementById('cmdInput');
  input.disabled = false;
  if (name === 'NORMAL') {
    input.value = '';
    input.disabled = true;
    input.blur();
  } else {
    input.focus();
    if (name === 'SEARCH' && !input.value.startsWith('/')) input.value = '/' + (tSearch || '');
    if (name === 'CMD' && !input.value.startsWith(':')) input.value = ':' + input.value.replace(/^[/]/, '');
    // place cursor at end after init
    setTimeout(() => { input.focus(); const v = input.value; input.setSelectionRange(v.length, v.length); }, 0);
  }
  renderStatus();
}

function clearMode() {
  tSearch = '';
  enterMode('NORMAL');
  renderTable();
}

// ---------- Search input ----------
function onCmdInput(e) {
  const v = e.target.value;
  if (mode === 'SEARCH' || v.startsWith('/')) {
    if (mode !== 'SEARCH') enterMode('SEARCH');
    tSearch = v.replace(/^[/]/, '');
    renderTable();
  } else if (mode === 'CMD' || v.startsWith(':')) {
    if (mode !== 'CMD') enterMode('CMD');
  } else {
    enterMode('NORMAL');
  }
  renderStatus();
}

function onCmdKeydown(e) {
  if (e.key === 'Escape') { e.preventDefault(); clearMode(); return; }
  if (e.key === 'Enter') {
    e.preventDefault();
    const v = e.target.value;
    if (v.startsWith(':')) {
      const cmd = v.slice(1).trim();
      enterMode('NORMAL');
      runCommand(cmd);
    } else if (v.startsWith('/')) {
      // stay in SEARCH with current query
      tSearch = v.slice(1);
      renderTable();
      e.target.blur();
    } else {
      enterMode('NORMAL');
    }
  }
}

// ---------- Saved views API ----------
function loadViews() {
  try { return JSON.parse(localStorage.getItem(VIEWS_KEY) || '{}'); } catch { return {}; }
}
function saveViews(v) { localStorage.setItem(VIEWS_KEY, JSON.stringify(v)); }

function captureView() {
  return { filter: tFilter, sorts: tSorts.slice(), search: tSearch };
}
function applyView(view) {
  tFilter = view.filter || '';
  tSorts = (view.sorts && view.sorts.length) ? view.sorts.slice() : [{ col: 'updatedAt', dir: 'desc' }];
  tSearch = view.search || '';
  fullRender();
}

function cmdSaveView(name) {
  if (!name) return showToast('Укажите имя: :сохр ИМЯ', 'error');
  const v = loadViews();
  v[name] = captureView();
  saveViews(v);
  showToast(`Вид «${name}» сохранён`, 'success');
}
function cmdUseView(name) {
  const v = loadViews();
  if (!v[name]) return showToast(`Вид «${name}» не найден`, 'error');
  applyView(v[name]);
  showToast(`Вид «${name}» применён`, 'success');
}
function cmdListViews() {
  const v = loadViews();
  const names = Object.keys(v);
  if (!names.length) return showToast('Сохранённых видов нет', 'error');
  showToast('Виды: ' + names.join(', '), 'success');
}
function cmdRemoveView(name) {
  const v = loadViews();
  if (!v[name]) return showToast(`Вид «${name}» не найден`, 'error');
  delete v[name];
  saveViews(v);
  showToast(`Вид «${name}» удалён`, 'success');
}

function runCommand(cmd) {
  const parts = cmd.split(/\s+/);
  const op = (parts[0] || '').toLowerCase();
  const arg = parts.slice(1).join(' ');
  switch (op) {
    case 'сохр': case 'с': case 'sv': case 'save':  return cmdSaveView(arg);
    case 'прим': case 'п': case 'uv': case 'use':   return cmdUseView(arg);
    case 'сп': case 'lv': case 'list':              return cmdListViews();
    case 'удал': case 'у': case 'rv': case 'rm':    return cmdRemoveView(arg);
    case 'прогон': case 'scan':                     return runMonitor();
    case 'обновить': case 'обн': case 'refresh': case 'r': return refreshData();
    case '?': case 'help': case 'справка':          return openHelp();
    case '': return;
    default: return showToast(`Неизвестная команда: ${op} (см. ?)`, 'error');
  }
}

// ---------- Actions via hotkeys ----------
async function archiveSelected() {
  const c = currentCase();
  if (!c) return;
  const target = c.status === 'archived' ? 'monitoring' : 'archived';
  try {
    const r = await patchCase(c.uid, { status: target });
    if (!r.ok) throw new Error();
    showToast(target === 'archived' ? `«${c.number || c.uid}» в архив` : `«${c.number || c.uid}» возвращён`, 'success');
    await refreshData();
  } catch { showToast('Ошибка архивирования', 'error'); }
}

async function deleteSelected() {
  const c = currentCase();
  if (!c) return;
  if (!confirm(`Удалить дело «${c.number || c.uid}» безвозвратно?`)) return;
  try {
    const r = await deleteCaseApi(c.uid);
    if (!r.ok) throw new Error();
    showToast(`Дело «${c.number || c.uid}» удалено`, 'success');
    selectedUid = null;
    await refreshData();
  } catch { showToast('Ошибка удаления', 'error'); }
}

async function refreshData() {
  try {
    await loadData();
    fullRender();
  } catch { showToast('Ошибка загрузки данных', 'error'); }
}

function currentCase() {
  return allCases.find(c => c.uid === selectedUid) || filtered()[0] || null;
}

// ---------- Monitor run ----------
async function runMonitor() {
  const bar = document.getElementById('scanBar');
  const stat = document.getElementById('scanStatus');
  try {
    const res = await fetch(apiUrl('/api/parse/run'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'full' }) });
    if (res.status === 409) { showToast('Прогон уже выполняется', 'error'); }
    else if (!res.ok) { throw new Error((await res.json().catch(() => ({}))).error || 'Ошибка'); }
    else { showToast('Мониторинг запущен', 'success'); }
    scanRunning = true;
    bar.classList.add('show');
    stat.textContent = 'Прогон мониторинга…';
    pollMonitor();
    renderStatus();
  } catch (e) { showToast(e.message || 'Ошибка', 'error'); }
}

function pollMonitor() {
  if (scanPollTimer) clearInterval(scanPollTimer);
  scanPollTimer = setInterval(async () => {
    try {
      const p = await (await fetch(apiUrl('/api/parse/progress'))).json();
      const d = p.data || {};
      const stat = document.getElementById('scanStatus');
      if (d.total > 0) stat.textContent = `Прогон: ${d.processed}/${d.total} (ошибок: ${d.errors})`;
      if (!d.running) {
        clearInterval(scanPollTimer); scanPollTimer = 0;
        scanRunning = false;
        document.getElementById('scanBar').classList.remove('show');
        if (d.total > 0) showToast(`Прогон завершён: ${d.processed - d.errors} OK, ${d.errors} ошибок`, d.errors > 0 ? 'error' : 'success');
        renderStatus();
        await refreshData();
      }
    } catch {}
  }, 5000);
  setTimeout(() => { if (scanPollTimer) { clearInterval(scanPollTimer); scanPollTimer = 0; scanRunning = false; renderStatus(); } }, 240_000);
}

// ---------- Mark all read ----------
async function markAllRead() {
  try {
    const unread = allNotifs.filter(n => !n.read);
    if (!unread.length) { showToast('Нет непрочитанных', 'error'); return; }
    await Promise.all(unread.map(n => fetch(apiUrl('/api/notifications/' + encodeURIComponent(n.uid) + '/read'), { method: 'PATCH' })));
    showToast(`${unread.length} прочитано`, 'success');
    await refreshData();
  } catch { showToast('Ошибка', 'error'); }
}

// ---------- Detail modal ----------
async function openDetail() {
  const c = currentCase();
  if (!c) return;
  try {
    const [caseRes, eventsRes, cardRes] = await Promise.all([
      fetch(apiUrl('/api/cases/' + encodeURIComponent(c.uid))).then(r => r.json()),
      fetch(apiUrl('/api/cases/' + encodeURIComponent(c.uid) + '/events')).then(r => r.json()),
      fetch(apiUrl('/api/cases/' + encodeURIComponent(c.uid) + '/card')).then(r => r.json()).catch(() => ({ data: null })),
    ]);
    const ca = caseRes.data || caseRes;
    const card = cardRes.data || null;
    const events = eventsRes.data || [];
    const STATUS_L = { monitoring: 'Мониторинг', waiting: 'Ожидание', decision: 'Решение', enforced: 'Вступило', error: 'Ошибка', archived: 'Архив' };

    let courtInfo = '';
    if (card) {
      const courtName = ca.courtName || card.court || ca.courtId;
      courtInfo = `
        <div class="sub">${ic('court')} Суд <span class="n"></span></div>
        <div class="info-grid">
          <div class="info-item"><div class="key">Суд</div><div class="val">${esc(courtName)}</div></div>
          <div class="info-item"><div class="key">Тип</div><div class="val">${esc(courtTypeLabel(card.courtType || ca.courtType || '—'))}</div></div>
          <div class="info-item"><div class="key">Тип дела</div><div class="val">${esc(card.type || '—')}</div></div>
          ${card.card ? `
            <div class="info-item"><div class="key">Категория</div><div class="val" style="font-size:11px">${esc((card.card.category || []).join(' → ') || '—')}</div></div>
            <div class="info-item"><div class="key">Судья</div><div class="val">${esc(card.card.judge || '—')}</div></div>
            <div class="info-item"><div class="key">Поступило</div><div class="val">${esc(card.card.filingDate || '—')}</div></div>
            <div class="info-item"><div class="key">Слушание</div><div class="val">${esc(card.card.hearingDate || '—')}</div></div>
            <div class="info-item"><div class="key">Результат</div><div class="val"><strong>${esc(card.card.result || '—')}</strong></div></div>
          ` : ''}
        </div>`;
    }

    let partiesHtml = '';
    if (card && card.parties && card.parties.length) {
      partiesHtml = `
        <div class="sub">${ic('users')} Участники <span class="n">${card.parties.length}</span></div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px;min-width:500px">
            <tr style="background:var(--surface-2)"><th style="text-align:left;padding:4px 6px">Роль</th><th style="text-align:left;padding:4px 6px">Наименование</th><th style="text-align:left;padding:4px 6px">ИНН</th><th style="text-align:left;padding:4px 6px">КПП</th><th style="text-align:left;padding:4px 6px">ОГРН</th></tr>
            ${card.parties.map(p => `<tr><td style="padding:4px 6px;border-bottom:1px solid var(--border);white-space:nowrap">${esc(p.role || '—')}</td><td style="padding:4px 6px;border-bottom:1px solid var(--border)">${esc(p.name || '—')}</td><td style="padding:4px 6px;border-bottom:1px solid var(--border);font-family:var(--skin-tabular);font-size:11px">${esc(p.inn || '')}</td><td style="padding:4px 6px;border-bottom:1px solid var(--border);font-family:var(--skin-tabular);font-size:11px">${esc(p.kpp || '')}</td><td style="padding:4px 6px;border-bottom:1px solid var(--border);font-family:var(--skin-tabular);font-size:11px">${esc(p.ogrn || '')}</td></tr>`).join('')}
          </table>
        </div>`;
    }

    let cardEventsHtml = '';
    if (card && card.events && card.events.length) {
      cardEventsHtml = `
        <div class="sub">${ic('calendar')} Движение дела <span class="n">${card.events.length}</span></div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px;min-width:600px">
            <tr style="background:var(--surface-2)"><th style="text-align:left;padding:4px 6px">Дата</th><th style="text-align:left;padding:4px 6px">Событие</th><th style="text-align:left;padding:4px 6px">Результат</th></tr>
            ${card.events.slice().reverse().map(e => `<tr><td style="padding:4px 6px;border-bottom:1px solid var(--border);white-space:nowrap;font-family:var(--skin-tabular)">${esc(e.eventDate || '—')}</td><td style="padding:4px 6px;border-bottom:1px solid var(--border)">${esc(e.eventName || '—')}</td><td style="padding:4px 6px;border-bottom:1px solid var(--border)">${esc(e.result || '—')}</td></tr>`).join('')}
          </table>
        </div>`;
    }

    const timelineHtml = events.length
      ? events.slice().reverse().map(e => `<div class="timeline-item"><div class="ev-type">${esc(e.type)}</div><div class="ev-msg">${esc(e.message)}</div><div class="ev-time">${formatTime(e.createdAt)}</div></div>`).join('')
      : '<div style="color:var(--text-dim);font-size:13px;padding:8px 0">Нет событий</div>';

    document.getElementById('detailContent').innerHTML = `
      <h2>${esc(ca.number || 'Без номера')}</h2>
      <div class="case-num">${esc(ca.url || '—')}</div>
      <div class="info-grid">
        <div class="info-item"><div class="key">Статус</div><div class="val"><span class="badge badge-${esc(ca.status)}">${esc(STATUS_L[ca.status] || ca.status)}</span></div></div>
        <div class="info-item"><div class="key">Сила</div><div class="val" style="color:var(--success);font-weight:600">${esc(ca.legalForceDate || '—')}</div></div>
        <div class="info-item"><div class="key">Проверка</div><div class="val">${formatTime(ca.lastChecked)}</div></div>
        ${ca.caseUid ? `<div class="info-item"><div class="key">УИД</div><div class="val" style="font-family:var(--skin-tabular);font-size:11px">${esc(ca.caseUid)}</div></div>` : ''}
      </div>
      ${courtInfo}
      ${partiesHtml}
      ${cardEventsHtml}
      <div class="sub">${ic('clipboard')} История мониторинга</div>
      <div class="timeline">${timelineHtml}</div>
      <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary btn-sm" onclick="window.print()">${ic('printer')} Печать</button>
        <button class="btn btn-secondary btn-sm" onclick="closeDetail()">Закрыть (q)</button>
      </div>`;
    document.getElementById('detailOverlay').classList.add('open');
  } catch { showToast('Ошибка загрузки карточки', 'error'); }
}
function closeDetail() { document.getElementById('detailOverlay').classList.remove('open'); }

function openHelp() { document.getElementById('helpOverlay').classList.add('open'); }
function closeHelp() { document.getElementById('helpOverlay').classList.remove('open'); }

function toggleLog() {
  logOpen = !logOpen;
  document.getElementById('tGrid').classList.toggle('log-hidden', !logOpen);
}

// ---------- Global key handler ----------
document.addEventListener('keydown', (e) => {
  const input = document.getElementById('cmdInput');
  const inInput = document.activeElement === input;
  const modalOpen = document.querySelector('.detail.open');
  const helpOpen = document.querySelector('#helpOverlay.open');

  // global keys (when modal closed)
  if (modalOpen || helpOpen) {
    if (e.key === 'Escape') { closeDetail(); closeHelp(); }
    if (modalOpen && (e.key === 'q' || e.key === 'Q' || e.key === 'я' || e.key === 'Я')) closeDetail();
    return;
  }

  if (inInput) return; // input handles its own keys

  // digits — filter quick switch (1=ALL, 2-7 status)
  if (/^[1-7]$/.test(e.key)) {
    const idx = parseInt(e.key, 10);
    setFilter(STATUS_ORDER[idx] || '');
    return;
  }

  switch (e.key) {
    case 'j': case 'ArrowDown': e.preventDefault(); moveSel(+1); return;
    case 'k': case 'ArrowUp':   e.preventDefault(); moveSel(-1); return;
    case 'G':                   goBottom(); return;
    case 'g': case 'п':
      e.preventDefault();
      if (_ggPending) { goTop(); _ggPending = false; }
      else { _ggPending = true; setTimeout(() => _ggPending = false, 1500); }
      return;
    case 'Enter':               openDetail(); return;
    case 'a': case 'ф':         archiveSelected(); return;
    case 'd': case 'в':         deleteSelected(); return;
    case 'r': case 'к':         refreshData(); return;
    case 'm': case 'ь':         runMonitor(); return;
    case 'n': case 'т':         location.href = '/search.html'; return;
    case '/':                   e.preventDefault(); enterMode('SEARCH'); return;
    case ':':                   e.preventDefault(); enterMode('CMD'); return;
    case '`': case 'ё':         toggleLog(); return;
    case '?':                   openHelp(); return;
    case 'Escape':              clearMode(); return;
    case '?'.toUpperCase():     return;
  }

  // holding 'g' then 'g' — handled via case above (state machine)

  if (e.ctrlKey && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); pageByHalf(+1); return; }
  if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) { e.preventDefault(); pageByHalf(-1); return; }
});

// ---------- Bind UI ----------
document.getElementById('cmdInput').addEventListener('input', onCmdInput);
document.getElementById('cmdInput').addEventListener('keydown', onCmdKeydown);
document.getElementById('cmdInput').disabled = true;

// CR12-S04 FIXED: selectRow только при смене строки, не на каждый mouseover
document.getElementById('tBody').addEventListener('mouseover', (e) => {
  const tr = e.target.closest('tr[data-uid]');
  if (!tr) return;
  if (tr.dataset.uid === _hoverUid) return;
  _hoverUid = tr.dataset.uid;
  // pre-set selectedUid for preview when hovering (light mode; disable on focus loss)
  if (mode === 'NORMAL') selectRow(tr.dataset.uid);
});

document.getElementById('detailOverlay').addEventListener('keydown', e => { if (e.key === 'Escape') closeDetail(); });

// Close help on click outside handled by overlay onclick — already in template

// ---------- Auto-refresh ----------
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(refreshData, 30_000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (pollTimer) { clearInterval(pollTimer); pollTimer = 0; } }
    else if (!pollTimer) { pollTimer = setInterval(refreshData, 30_000); }
  });
}

// ---------- Boot ----------
(async function boot() {
  await refreshData();
  startPolling();
  // Pокер initial filter from URL? `?filter=monitoring` etc.
  const u = new URL(location.href);
  const f = u.searchParams.get('filter');
  if (f && STATUS_ORDER.includes(f)) setFilter(f);
  const sv = u.searchParams.get('view');
  if (sv) applyView(loadViews()[sv] || captureView());
  enterMode('NORMAL');
})();


── ФОРМАТ ОТВЕТА (строго) ──
1) XSS-ДЫРЫ — таблица: # | файл:строка | инъекция (какой контент) | эксплойт | фикс (кодом)
2) КРИТИЧНЫЕ БАГИ — таблица: # | файл:строка | проблема | последствие | фикс
3) СРЕДНИЕ/НИЗКИЕ — таблица по той же схеме
4) ПРОИЗВОДИТЕЛЬНОСТЬ — рендер 10K строк, что ускорить
5) ТЕМЫ/ДОСТУПНОСТЬ — контраст, остатки emoji, aria
6) ТЕСТЫ — какие UI-тесты добавить (5-10, сценарии)
РЕКОМЕНДАЦИЯ: <с чего начать, 1-2 строки>
ОТКРЫТЫЕ ВОПРОСЫ: <что уточнить>
Ничего, кроме этого формата.

── СОХРАНЕНИЕ РЕЗУЛЬТАТА (обязательный последний раздел ответа) ──
Заверши ответ разделом «СОХРАНЕНИЕ РЕЗУЛЬТАТА» в строгом формате:

1) ФАЙЛЫ — таблица, по строке на каждый результат, который пользователь должен забрать:
   | Имя файла (латиница, с расширением) | Куда положить (путь относительно корня проекта из ТЗ, напр. articles/, site/, docs/) | Что вставить (какой раздел ответа) |
   Все файлы — UTF-8. Если в ТЗ задана папка (напр. «файл будет лежать в папке рядом с img/») — укажи её.

2) ОТЧЁТ — 3-5 строк: что сделано, главные решения, на что обратить внимание при проверке.

3) ПРОВЕРКА — конкретные шаги: как пользователь проверит результат (команды, браузер, что смотреть).
