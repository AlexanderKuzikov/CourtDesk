/**
 * CourtDesk TUI — pure Node.js (readline + ANSI).
 * Без внешних зависимостей. Работает на Linux, macOS, Windows (ConPTY ≥ Win10 1903).
 * CR10-001: blessed удалён.
 */
import * as readline from 'readline';
import { tuiFetch } from './fetch.js';
import type { WatchedCase } from '../core/types.js';

// ──────────────────── ANSI helpers ────────────────────
const ESC = '\x1b';
const A = {
  reset:    `${ESC}[0m`,
  bold:     `${ESC}[1m`,
  rev:      `${ESC}[7m`,     // инверсия (выделенная строка)
  dim:      `${ESC}[2m`,
  cyan:     `${ESC}[36m`,
  yellow:   `${ESC}[33m`,
  red:      `${ESC}[31m`,
  green:    `${ESC}[32m`,
  bgBlue:   `${ESC}[44m`,
  fgWhite:  `${ESC}[97m`,
  hide:     `${ESC}[?25l`,   // спрятать курсор
  show:     `${ESC}[?25h`,   // показать курсор
  cls:      `${ESC}[2J`,
  home:     `${ESC}[H`,
  altOn:    `${ESC}[?1049h`, // альтернативный буфер
  altOff:   `${ESC}[?1049l`,
};
const w = (s: string) => process.stdout.write(s);
const col = (n: number) => `${ESC}[${n}G`;
const row = (r: number, c = 1) => `${ESC}[${r};${c}H`;
const clearLine = `${ESC}[2K`;

// ──────────────────── Состояние ────────────────────
let allCases: WatchedCase[] = [];
let cursor = 0;          // выделенная строка списка
let scrollTop = 0;       // верхняя видимая строка
let tab: 'cases' | 'run' = 'cases';
let mode: 'list' | 'detail' = 'list';
let detailScroll = 0;
let lastError = '';
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let destroyed = false;

// ──────────────────── Размеры терминала ────────────────────
function cols(): number { return process.stdout.columns || 120; }
function rows(): number { return process.stdout.rows    || 30;  }

// ──────────────────── Текстовые утилиты ────────────────────
function pad(s: string, w: number): string {
  const str = s ?? '—';
  if (str.length >= w) return str.slice(0, w - 1) + '…';
  return str + ' '.repeat(w - str.length);
}
function rpad(s: string, w: number): string {
  return (s ?? '').padStart(w);
}

// ──────────────────── Ширины колонок ────────────────────
function colWidths() {
  const total = cols();
  const num    = Math.min(22, Math.floor(total * 0.22));
  const status = Math.min(12, Math.floor(total * 0.12));
  const court  = Math.min(30, Math.floor(total * 0.28));
  const sep    = 9; // 3× " │ "
  const result = Math.max(10, total - num - status - court - sep);
  return { num, status, court, result };
}

// ──────────────────── Статус-краска ────────────────────
const STATUS_COLORS: Record<string, string> = {
  monitoring: A.cyan,
  waiting:    A.yellow,
  decision:   A.green,
  enforced:   A.green,
  error:      A.red,
  archived:   A.dim,
};
function statusColor(s: string): string {
  return (STATUS_COLORS[s] ?? '') + s + A.reset;
}

// ──────────────────── Рендер одной строки дела ────────────────────
function fmtCase(c: WatchedCase, selected: boolean): string {
  const cw = colWidths();
  const court = (c as any).courtName || c.courtId || '—';
  const num    = pad(c.number  || '—', cw.num);
  const status = pad(c.status  || '',   cw.status);
  const ct     = pad(court,             cw.court);
  const res    = pad(c.result  ?? '—',  cw.result);
  const line   = `${num} │ ${status} │ ${ct} │ ${res}`;
  if (selected) return A.rev + A.bold + line + A.reset;
  if (c.status === 'error') return A.red + line + A.reset;
  if (c.status === 'decision' || c.status === 'enforced') return A.green + line + A.reset;
  return line;
}

// ──────────────────── Головные строки ────────────────────
function drawHeader() {
  const errors  = allCases.filter(c => c.status === 'error').length;
  const total   = allCases.length;
  const tabCases = tab === 'cases' ? A.rev + ' ДЕЛА ' + A.reset : ' ДЕЛА ';
  const tabRun   = tab === 'run'   ? A.rev + ' ЗАПУСК ' + A.reset : ' ЗАПУСК ';
  w(row(1) + clearLine + A.bgBlue + A.fgWhite + A.bold);
  w(` CourtDesk v0.5.1 ${tabCases}${tabRun}  │  Дел: ${total}  Ош: ${errors}` + A.reset);
}

function drawThead() {
  const cw = colWidths();
  w(row(2) + clearLine + A.bgBlue + A.fgWhite + A.bold);
  w(` ${pad('ШИФР/НОМЕР', cw.num)} │ ${pad('СТАТУС', cw.status)} │ ${pad('СУД', cw.court)} │ ${pad('РЕШЕНИЕ', cw.result)}` + A.reset);
}

// ──────────────────── Главный рендер ────────────────────
function render() {
  if (destroyed) return;
  w(A.hide);

  if (mode === 'detail') {
    renderDetail();
    w(A.show);
    return;
  }

  drawHeader();

  if (tab === 'cases') {
    drawThead();
    renderList();
    drawFooter('\u2191\u2193:выбор  Enter:карточка  r:обн  2:запуск  q:выход');
  } else {
    renderRunTab();
    drawFooter('F4:полный  F5:retry  F6:новые  1:дела  q:выход');
  }

  w(A.show);
}

// ──────────────────── Список дел ────────────────────
function renderList() {
  const listRows = rows() - 3; // header + thead + footer
  // скроллинг
  if (cursor < scrollTop) scrollTop = cursor;
  if (cursor >= scrollTop + listRows) scrollTop = cursor - listRows + 1;

  for (let i = 0; i < listRows; i++) {
    const idx = scrollTop + i;
    w(row(3 + i) + clearLine);
    if (idx < allCases.length) {
      w(' ' + fmtCase(allCases[idx], idx === cursor));
    }
  }
  // строка статуса при пустом списке
  if (allCases.length === 0) {
    w(row(4) + clearLine + A.dim + '  (дел нет. Запустите API: npm start)' + A.reset);
  }
  // скроллбар
  if (allCases.length > listRows) {
    const pct = scrollTop / (allCases.length - listRows);
    const barH = listRows;
    const thumbPos = Math.round(pct * (barH - 1));
    for (let i = 0; i < barH; i++) {
      w(row(3 + i) + col(cols()) + (i === thumbPos ? A.rev + '█' + A.reset : A.dim + '│' + A.reset));
    }
  }
}

// ──────────────────── Карточка дела ────────────────────
function buildDetailLines(c: WatchedCase): string[] {
  const court = (c as any).courtName || c.courtId || '—';
  const lines: string[] = [
    A.cyan + A.bold + `══ ДЕЛО: ${c.number || '—'} ` + '═'.repeat(Math.max(0, cols() - 12 - (c.number?.length || 1))) + A.reset,
    '',
    `  Суд:          ${A.cyan}${court}${A.reset}`,
    `  Статус:        ${statusColor(c.status || '')}`,
    `  Результат:      ${c.result || '—'}`,
    `  Вступление:    ${c.legalForceDate || '—'}`,
    `  УИД:           ${c.caseUid || '—'}`,
    `  ID внутри:      ${c.uid}`,
    `  Последнее обн.: ${c.lastChecked || 'не проверялось'}`,
    `  Добавлено:      ${c.createdAt?.slice(0, 10) || '—'}`,
    `  Ошибок:       ${c.errorCount || 0}`,
  ];
  if (c.lastError) {
    lines.push('');
    lines.push(`  ${A.red}Последняя ошибка:${A.reset}`);
    // перенос длинных строк
    const maxW = cols() - 4;
    const err = c.lastError;
    for (let i = 0; i < err.length; i += maxW) {
      lines.push('    ' + err.slice(i, i + maxW));
    }
  }
  if (c.url) {
    lines.push('');
    lines.push(`  ${A.dim}URL: ${c.url}${A.reset}`);
  }
  return lines;
}

function renderDetail() {
  const c = allCases[cursor];
  if (!c) { mode = 'list'; render(); return; }

  const dLines = buildDetailLines(c);
  const visibleRows = rows() - 2; // header + footer

  drawHeader();

  // отображаем строки
  for (let i = 0; i < visibleRows; i++) {
    const li = detailScroll + i;
    w(row(2 + i) + clearLine);
    if (li < dLines.length) w(dLines[li]);
  }

  // скроллбар
  if (dLines.length > visibleRows) {
    const pct = detailScroll / (dLines.length - visibleRows);
    const barH = visibleRows;
    const thumbPos = Math.round(pct * (barH - 1));
    for (let i = 0; i < barH; i++) {
      w(row(2 + i) + col(cols()) + (i === thumbPos ? A.rev + '█' + A.reset : A.dim + '│' + A.reset));
    }
  }

  drawFooter(`↑↓:скролл  Esc/q:назад  [${cursor + 1}/${allCases.length}]`);
}

// ──────────────────── Вкладка ЗАПУСК ────────────────────
function renderRunTab() {
  const baseRow = 3;
  w(row(baseRow)     + clearLine + A.bold + '  ЗАПУСК МОНИТОРИНГА' + A.reset);
  w(row(baseRow + 1) + clearLine);
  w(row(baseRow + 2) + clearLine + `  ${A.yellow}F4${A.reset}  — Полный прогон (все дела)`);
  w(row(baseRow + 3) + clearLine + `  ${A.yellow}F5${A.reset}  — Retry (только ошибочные)`);
  w(row(baseRow + 4) + clearLine + `  ${A.yellow}F6${A.reset}  — Новые дела (waiting)`);
  w(row(baseRow + 5) + clearLine);
  // чистим остаток экрана
  for (let i = baseRow + 6; i < rows() - 1; i++) w(row(i) + clearLine);
}

// ──────────────────── Footer ────────────────────
function drawFooter(hint: string) {
  w(row(rows()) + clearLine + A.bgBlue + A.fgWhite);
  w(` ${hint}` + ' '.repeat(Math.max(0, cols() - hint.length - 2)) + A.reset);
}

// ──────────────────── API refresh ────────────────────
function refresh(): void {
  tuiFetch('http://127.0.0.1:8767/api/cases')
    .then(r => r.json())
    .then((j: { data?: WatchedCase[] }) => {
      if (destroyed) return;
      allCases = j.data || [];
      if (cursor >= allCases.length) cursor = Math.max(0, allCases.length - 1);
      lastError = '';
      render();
    })
    .catch((e: unknown) => {
      if (destroyed) return;
      lastError = e instanceof Error ? e.message : 'API недоступен';
      render();
    });
}

function runMode(m: string): void {
  tuiFetch('http://127.0.0.1:8767/api/parse/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: m }),
  })
    .then(() => {
      setTimeout(refresh, 1500);
    })
    .catch(() => {});
}

// ──────────────────── Клавиатура ────────────────────
function handleKey(str: string, key: readline.Key): void {
  const k = key.name;
  const ctrl = key.ctrl;

  // выход — всегда
  if (ctrl && (k === 'c' || k === 'd')) { exit(); return; }
  if (mode === 'list') {
    if (k === 'q' || str === 'q' || str === 'й' || str === 'Й' || str === 'Q') { exit(); return; }
  }

  if (mode === 'detail') {
    // скроллинг карточки
    if (k === 'up')   { detailScroll = Math.max(0, detailScroll - 1); render(); return; }
    if (k === 'down') {
      const c = allCases[cursor];
      if (c) {
        const max = Math.max(0, buildDetailLines(c).length - (rows() - 2));
        detailScroll = Math.min(max, detailScroll + 1);
      }
      render(); return;
    }
    // закрыть карточку
    if (k === 'escape' || k === 'q' || str === 'q' || str === 'й') {
      mode = 'list'; render(); return;
    }
    return;
  }

  // —— режим list ——
  if (k === 'up')    { cursor = Math.max(0, cursor - 1); render(); return; }
  if (k === 'down')  { cursor = Math.min(allCases.length - 1, cursor + 1); render(); return; }
  if (k === 'pageup')   { cursor = Math.max(0, cursor - (rows() - 4)); render(); return; }
  if (k === 'pagedown') { cursor = Math.min(allCases.length - 1, cursor + (rows() - 4)); render(); return; }
  if (k === 'home') { cursor = 0; scrollTop = 0; render(); return; }
  if (k === 'end')  { cursor = Math.max(0, allCases.length - 1); render(); return; }

  // открыть карточку
  if (k === 'return' || k === 'enter') {
    if (tab === 'cases' && allCases.length > 0) {
      mode = 'detail'; detailScroll = 0; render();
    }
    return;
  }

  // вкладки
  if (str === '1' || k === 'left')  { tab = 'cases'; render(); return; }
  if (str === '2' || k === 'right') { tab = 'run';   render(); return; }

  // обновить
  if (str === 'r') { refresh(); return; }

  // F-клавиши
  if (k === 'f4') { runMode('full');  return; }
  if (k === 'f5') { runMode('retry'); return; }
  if (k === 'f6') { runMode('new');   return; }
}

// ──────────────────── Инициализация / выход ────────────────────
function exit(): void {
  if (destroyed) return;
  destroyed = true;
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  w(A.show + A.altOff + A.reset);
  process.stdin.setRawMode(false);
  process.stdin.pause();
  process.exit(0);
}

process.on('SIGINT',  exit);
process.on('SIGTERM', exit);
process.on('exit', () => { w(A.show + A.altOff); });

// обработка изменения размеров терминала
process.stdout.on('resize', () => {
  w(A.cls + A.home);
  render();
});

// включаем raw-режим и альтернативный буфер
if (process.stdin.isTTY) process.stdin.setRawMode(true);
readline.emitKeypressEvents(process.stdin);
process.stdin.on('keypress', handleKey);

w(A.altOn + A.cls + A.home + A.hide);
render();
refresh();
refreshTimer = setInterval(refresh, 60_000);
