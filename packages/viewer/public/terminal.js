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
          <div class="info-item"><div class="key">Тип</div><div class="val">${esc(card.courtType || ca.courtType || '—')}</div></div>
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
