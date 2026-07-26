/**
 * CourtDesk TUI — pure Node.js readline+ANSI. 0 внешних зависимостей.
 */
import * as readline from 'readline';
import { tuiFetch } from './fetch.js';
import type { WatchedCase } from '../core/types.js';

// ─ ANSI ────────────────────────────────────────────────
const ESC = '\x1b';
const A = {
  reset:  `${ESC}[0m`,
  bold:   `${ESC}[1m`,
  rev:    `${ESC}[7m`,
  dim:    `${ESC}[2m`,
  cyan:   `${ESC}[36m`,
  yellow: `${ESC}[33m`,
  red:    `${ESC}[31m`,
  green:  `${ESC}[32m`,
  bg:     `${ESC}[44m`,   // bgBlue
  fg:     `${ESC}[97m`,   // bright white
  hide:   `${ESC}[?25l`,
  show:   `${ESC}[?25h`,
  cls:    `${ESC}[2J`,
  home:   `${ESC}[H`,
  alt1:   `${ESC}[?1049h`,
  alt0:   `${ESC}[?1049l`,
};
const wr  = (s: string) => process.stdout.write(s);
const at  = (r: number, c = 1) => `${ESC}[${r};${c}H`;
const eol = `${ESC}[2K`;
const gto = (col: number)     => `${ESC}[${col}G`;

// ─ Состояние ────────────────────────────────────────
let cases: WatchedCase[] = [];
let cur    = 0;
let vtop   = 0;
let tab: 'cases' | 'run' = 'cases';
let view: 'list' | 'detail' = 'list';
let dsc    = 0;
let runLog: string[] = [];
let runBusy = false;
let timer: ReturnType<typeof setInterval> | null = null;
let dead   = false;

// ─ Размеры ────────────────────────────────────────
const C = () => process.stdout.columns || 120;
const R = () => process.stdout.rows    || 30;

// ─ Формат даты ────────────────────────────────────
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  // если уже DD.MM.YYYY — вернуть как есть
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dd  = String(d.getDate()).padStart(2, '0');
  const mm  = String(d.getMonth() + 1).padStart(2, '0');
  const yy  = d.getFullYear();
  return `${dd}.${mm}.${yy}`;
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return 'не проверялось';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  // смещение UTC+5 (Асиа)
  const offset = 5 * 60;
  const local  = new Date(d.getTime() + offset * 60_000);
  const dd  = String(local.getUTCDate()).padStart(2, '0');
  const mm  = String(local.getUTCMonth() + 1).padStart(2, '0');
  const yy  = local.getUTCFullYear();
  const hh  = String(local.getUTCHours()).padStart(2, '0');
  const mi  = String(local.getUTCMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${yy} ${hh}:${mi}`;
}

// ─ Цвет статуса ──────────────────────────────────
const STATUS_RU: Record<string, string> = {
  waiting:    'Ожидание',
  monitoring: 'Мониторинг',
  decision:   'Решение вынесено',
  enforced:   'Вступило в силу',
  archived:   'Архив',
  error:      'Ошибка',
};
const STATUS_COLOR: Record<string, string> = {
  waiting:    A.yellow,
  monitoring: A.cyan,
  decision:   A.green,
  enforced:   A.green,
  archived:   A.dim,
  error:      A.red,
};
function statusLabel(s: string): string {
  return (STATUS_COLOR[s] ?? '') + (STATUS_RU[s] ?? s) + A.reset;
}

// ─ Текстовые утилиты ──────────────────────────────
function pad(s: string, w: number): string {
  const t = (s ?? '—');
  if (t.length > w) return t.slice(0, w - 1) + '…';
  return t + ' '.repeat(w - t.length);
}
// Очищенная видимая длина строки
function vlen(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}
// Перенос строки
function wrap(s: string, w: number, indent: string): string[] {
  if (!s) return ['—'];
  const out: string[] = [];
  let r = s;
  while (r.length) { out.push(out.length ? indent + r.slice(0, w) : r.slice(0, w)); r = r.slice(w); }
  return out;
}

// ─ Ширины колонок списка ──────────────────────────
function cw() {
  const t = C();
  const num    = Math.min(24, Math.floor(t * 0.22));
  const status = Math.min(20, Math.floor(t * 0.16));
  const court  = Math.min(32, Math.floor(t * 0.28));
  const result = Math.max(10, t - num - status - court - 9);
  return { num, status, court, result };
}

// ─ Строка списка ──────────────────────────────────
function fmtRow(c: WatchedCase, sel: boolean): string {
  const q   = cw();
  const co  = (c as any).courtName || c.courtId || '—';
  const sru = STATUS_RU[c.status] ?? c.status;
  const line = `${pad(c.number || '—', q.num)} │ ${pad(sru, q.status)} │ ${pad(co, q.court)} │ ${pad(c.result ?? '—', q.result)}`;
  if (sel)                                                    return A.rev + A.bold + line + A.reset;
  if (c.status === 'error')                                   return A.red   + line + A.reset;
  if (c.status === 'decision' || c.status === 'enforced')     return A.green + line + A.reset;
  return line;
}

// ─ Header / Footer ─────────────────────────────────
function drawHeader() {
  const err    = cases.filter(c => c.status === 'error').length;
  const tC = tab === 'cases' ? A.rev + ' ДЕЛА '   + A.reset + A.bg + A.fg : ' ДЕЛА ';
  const tR = tab === 'run'   ? A.rev + ' ЗАПУСК ' + A.reset + A.bg + A.fg : ' ЗАПУСК ';
  wr(at(1) + eol + A.bg + A.fg + A.bold +
    ` CourtDesk  ${tC} ${tR}   │  Дел: ${cases.length}  Ошибок: ${err}` + A.reset);
}

function drawThead() {
  const q = cw();
  wr(at(2) + eol + A.bg + A.fg + A.bold +
    ` ${pad('№ ДЕЛА', q.num)} │ ${pad('СТАТУС', q.status)} │ ${pad('СУД', q.court)} │ ${pad('РЕШЕНИЕ', q.result)}` + A.reset);
}

function drawFooter(hint: string) {
  const sp = ' '.repeat(Math.max(0, C() - vlen(hint) - 2));
  wr(at(R()) + eol + A.bg + A.fg + ` ${hint}${sp}` + A.reset);
}

// ─ Список ────────────────────────────────────────
function renderList() {
  const lh = R() - 3;
  if (cur < vtop)        vtop = cur;
  if (cur >= vtop + lh)  vtop = cur - lh + 1;

  for (let i = 0; i < lh; i++) {
    wr(at(3 + i) + eol);
    const idx = vtop + i;
    if (idx < cases.length) wr(' ' + fmtRow(cases[idx], idx === cur));
  }
  if (!cases.length)
    wr(at(4) + eol + A.dim + '  (Дел нет. Запустите API: npm start)' + A.reset);

  if (cases.length > lh) {
    const pct = vtop / (cases.length - lh);
    const tp  = Math.round(pct * (lh - 1));
    for (let i = 0; i < lh; i++)
      wr(at(3 + i) + gto(C()) + (i === tp ? A.rev + '█' + A.reset : A.dim + '│' + A.reset));
  }
}

// ─ Карточка дела ─────────────────────────────────
function buildDetail(c: WatchedCase): string[] {
  const W   = C();
  const co  = (c as any).courtName || c.courtId || '—';
  const LW  = 20;          // ширина метки
  const VW  = W - LW - 5;  // ширина значения
  const ind = ' '.repeat(LW + 5);

  // Пустая строка чистого текста для отрисовки
  const hr  = A.dim + '─'.repeat(W) + A.reset;

  // заголовок: длина считается без ANSI
  const hdr = `═ ${c.number || '—'} `;
  const fill = '═'.repeat(Math.max(2, W - hdr.length - 1));

  const lines: string[] = [
    A.cyan + A.bold + hdr + fill + A.reset,
    `  ${A.bold}${co}${A.reset}`,
    `  ${statusLabel(c.status || '')}`,
    hr,
  ];

  // функция field — значение plaintext, color опционально обворачивает значение
  function field(label: string, value: string, color?: string): void {
    const lbl   = ('  ' + label + ':').padEnd(LW + 3);
    const vlines = wrap(value, VW, ind);
    const first  = color ? `${color}${vlines[0]}${A.reset}` : vlines[0];
    lines.push(`${lbl} ${first}`);
    for (let i = 1; i < vlines.length; i++) lines.push(vlines[i]);
  }

  // — человеческая инфо — без UUID
  field('Результат',        c.result || '—');
  field('Вступило в силу', fmtDate(c.legalForceDate));
  field('Добавлено',       fmtDate(c.createdAt));
  field('Посл. проверка',  fmtDateTime(c.lastChecked));

  if (c.errorCount) {
    field('Ошибок подряд', String(c.errorCount), A.red);
  }
  if (c.lastError) {
    lines.push(hr);
    lines.push(`  ${A.red}${A.bold}Последняя ошибка:${A.reset}`);
    for (const l of wrap(c.lastError, W - 4, '    '))
      lines.push('  ' + A.red + l + A.reset);
  }

  if (c.url) {
    lines.push(hr);
    lines.push(`  ${A.dim}Карточка на сайте суда:${A.reset}`);
    for (const l of wrap(c.url, W - 4, '  '))
      lines.push('  ' + A.dim + l + A.reset);
  }

  return lines;
}

function renderDetail() {
  const c = cases[cur];
  if (!c) { view = 'list'; render(); return; }
  const dl  = buildDetail(c);
  const vis = R() - 2;
  const max = Math.max(0, dl.length - vis);
  if (dsc > max) dsc = max;

  drawHeader();
  for (let i = 0; i < vis; i++) {
    wr(at(2 + i) + eol);
    const li = dsc + i;
    if (li < dl.length) wr(dl[li]);
  }
  if (dl.length > vis) {
    const tp = Math.round((dsc / max) * (vis - 1));
    for (let i = 0; i < vis; i++)
      wr(at(2 + i) + gto(C()) + (i === tp ? A.rev + '█' + A.reset : A.dim + '│' + A.reset));
  }
  drawFooter(`↑↓:скролл  Esc/q:назад  [дело ${cur + 1} из ${cases.length}]`);
}

// ─ Вкладка ЗАПУСК ───────────────────────────────
function renderRun() {
  const br = 3;
  const busy = runBusy;
  wr(at(br)     + eol + A.bold + '  ЗАПУСК МОНИТОРИНГА' + A.reset
    + (busy ? `  ${A.yellow}⧗ выполняется...${A.reset}` : ''));
  wr(at(br + 1) + eol);
  wr(at(br + 2) + eol + `  ${busy ? A.dim : A.yellow}F4${A.reset}  — Полный прогон (все дела)`);
  wr(at(br + 3) + eol + `  ${busy ? A.dim : A.yellow}F5${A.reset}  — Retry (только ошибочные)`);
  wr(at(br + 4) + eol + `  ${busy ? A.dim : A.yellow}F6${A.reset}  — Новые дела (waiting)`);
  wr(at(br + 5) + eol);
  // лог запуска
  const logH = R() - br - 7;
  const visLog = runLog.slice(-logH);
  for (let i = 0; i < logH; i++) {
    wr(at(br + 6 + i) + eol);
    if (i < visLog.length) wr('  ' + A.dim + visLog[i] + A.reset);
  }
  wr(at(R() - 1) + eol); // чистим перед footer
}

// ─ Главный рендер ────────────────────────────────
function render() {
  if (dead) return;
  wr(A.hide);
  if (view === 'detail') { renderDetail(); wr(A.show); return; }
  drawHeader();
  if (tab === 'cases') {
    drawThead();
    renderList();
    drawFooter('↑↓:выбор  Enter:карточка  r:обн  2:запуск  q:вых');
  } else {
    renderRun();
    drawFooter(`F4:полный  F5:retry  F6:новые  1:дела  q:вых${runBusy ? '  [выполняется]' : ''}`);
  }
  wr(A.show);
}

// ─ API ─────────────────────────────────────────────
function refresh(): void {
  tuiFetch('http://127.0.0.1:8767/api/cases')
    .then(r => r.json())
    .then((j: { data?: WatchedCase[] }) => {
      if (dead) return;
      cases = j.data || [];
      if (cur >= cases.length) cur = Math.max(0, cases.length - 1);
      render();
    })
    .catch(() => { if (!dead) render(); });
}

function runMode(mode: string): void {
  if (runBusy) return;
  runBusy = true;
  const ts = fmtDateTime(new Date().toISOString());
  runLog.push(`${ts}  → запуск: ${mode}`);
  render();
  tuiFetch('http://127.0.0.1:8767/api/parse/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  })
    .then(async r => {
      const body = await r.json().catch(() => ({}));
      const ts2  = fmtDateTime(new Date().toISOString());
      if (r.ok) {
        runLog.push(`${ts2}  ✓ завершён`);
      } else {
        runLog.push(`${ts2}  ✗ HTTP ${r.status}: ${(body as any).error ?? ''}`);
      }
    })
    .catch((e: unknown) => {
      const ts2 = fmtDateTime(new Date().toISOString());
      runLog.push(`${ts2}  ✗ ${e instanceof Error ? e.message : 'ошибка'}`);
    })
    .finally(() => {
      runBusy = false;
      setTimeout(refresh, 1000);
      render();
    });
}

// ─ Клавиатура ──────────────────────────────────────
function onKey(str: string, k: readline.Key): void {
  const nm = k.name;
  if (k.ctrl && (nm === 'c' || nm === 'd')) { quit(); return; }

  if (view === 'detail') {
    const c   = cases[cur];
    const max = c ? Math.max(0, buildDetail(c).length - (R() - 2)) : 0;
    if (nm === 'up')       { dsc = Math.max(0, dsc - 1); render(); return; }
    if (nm === 'down')     { dsc = Math.min(max, dsc + 1); render(); return; }
    if (nm === 'pageup')   { dsc = Math.max(0, dsc - (R() - 4)); render(); return; }
    if (nm === 'pagedown') { dsc = Math.min(max, dsc + (R() - 4)); render(); return; }
    if (nm === 'escape' || nm === 'q' || str === 'q' || str === 'й') { view = 'list'; render(); return; }
    return;
  }

  if (nm === 'q' || str === 'q' || str === 'Q' || str === 'й' || str === 'Й') { quit(); return; }
  if (nm === 'up')       { cur = Math.max(0, cur - 1); render(); return; }
  if (nm === 'down')     { cur = Math.min(cases.length - 1, cur + 1); render(); return; }
  if (nm === 'pageup')   { cur = Math.max(0, cur - (R() - 4)); render(); return; }
  if (nm === 'pagedown') { cur = Math.min(cases.length - 1, cur + (R() - 4)); render(); return; }
  if (nm === 'home')     { cur = 0; vtop = 0; render(); return; }
  if (nm === 'end')      { cur = Math.max(0, cases.length - 1); render(); return; }
  if (nm === 'return' || nm === 'enter') {
    if (tab === 'cases' && cases.length > 0) { view = 'detail'; dsc = 0; render(); }
    return;
  }
  if (str === '1' || nm === 'left')  { tab = 'cases'; render(); return; }
  if (str === '2' || nm === 'right') { tab = 'run';   render(); return; }
  if (str === 'r') { refresh(); return; }
  if (nm === 'f4') { runMode('full');  return; }
  if (nm === 'f5') { runMode('retry'); return; }
  if (nm === 'f6') { runMode('new');   return; }
}

// ─ Инициализация ────────────────────────────────────
function quit(): void {
  if (dead) return;
  dead = true;
  if (timer) { clearInterval(timer); timer = null; }
  wr(A.show + A.alt0 + A.reset);
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.pause();
  process.exit(0);
}

process.on('SIGINT',  quit);
process.on('SIGTERM', quit);
process.on('exit', () => { try { wr(A.show + A.alt0); } catch {} });
process.stdout.on('resize', () => { wr(A.cls + A.home); render(); });

if (process.stdin.isTTY) process.stdin.setRawMode(true);
readline.emitKeypressEvents(process.stdin);
process.stdin.on('keypress', onKey);

wr(A.alt1 + A.cls + A.home);
render();
refresh();
timer = setInterval(refresh, 60_000);
