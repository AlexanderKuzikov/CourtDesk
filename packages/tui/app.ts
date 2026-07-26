/**
 * CourtDesk TUI — pure Node.js (readline + ANSI).
 * Без внешних зависимостей. Linux / macOS / Windows ConPTY ≥ Win10 1903.
 */
import * as readline from 'readline';
import { tuiFetch } from './fetch.js';
import type { WatchedCase } from '../core/types.js';

// ──────────────────── ANSI ────────────────────
const ESC = '\x1b';
const A = {
  reset:   `${ESC}[0m`,
  bold:    `${ESC}[1m`,
  rev:     `${ESC}[7m`,
  dim:     `${ESC}[2m`,
  cyan:    `${ESC}[36m`,
  yellow:  `${ESC}[33m`,
  red:     `${ESC}[31m`,
  green:   `${ESC}[32m`,
  bgBlue:  `${ESC}[44m`,
  white:   `${ESC}[97m`,
  hide:    `${ESC}[?25l`,
  show:    `${ESC}[?25h`,
  cls:     `${ESC}[2J`,
  home:    `${ESC}[H`,
  altOn:   `${ESC}[?1049h`,
  altOff:  `${ESC}[?1049l`,
};
const w   = (s: string) => process.stdout.write(s);
const at  = (r: number, c = 1) => `${ESC}[${r};${c}H`;
const eol = `${ESC}[2K`;
const gto = (c: number) => `${ESC}[${c}G`;

// ──────────────────── Состояние ────────────────────
let cases: WatchedCase[] = [];
let cur   = 0;
let vtop  = 0;   // scroll offset списка
let tab: 'cases' | 'run' = 'cases';
let view: 'list' | 'detail' = 'list';
let dScroll = 0; // scroll offset карточки
let timer: ReturnType<typeof setInterval> | null = null;
let dead = false;

// ──────────────────── Размеры ────────────────────
const C = () => process.stdout.columns || 120;
const R = () => process.stdout.rows    || 30;

// ──────────────────── Текст ────────────────────
/** Обрезать/дополнить до w символов, без ANSI */
function pad(s: string, w: number): string {
  const t = s ?? '—';
  if (t.length > w) return t.slice(0, w - 1) + '…';
  return t + ' '.repeat(w - t.length);
}

/** Перенос строки по maxW символов, indent для всех кроме первой */
function wrap(s: string, maxW: number, indent: string): string[] {
  if (!s) return [''];
  const lines: string[] = [];
  let rem = s;
  while (rem.length > 0) {
    const chunk = rem.slice(0, maxW);
    lines.push(lines.length === 0 ? chunk : indent + chunk);
    rem = rem.slice(maxW);
  }
  return lines;
}

// ──────────────────── Ширины колонок ────────────────────
function cw() {
  const t = C();
  const num    = Math.min(24, Math.floor(t * 0.22));
  const status = Math.min(12, Math.floor(t * 0.12));
  const court  = Math.min(32, Math.floor(t * 0.28));
  const result = Math.max(10, t - num - status - court - 9);
  return { num, status, court, result };
}

// ──────────────────── Цвета статуса ────────────────────
const SC: Record<string, string> = {
  monitoring: A.cyan,
  waiting:    A.yellow,
  decision:   A.green,
  enforced:   A.green,
  error:      A.red,
  archived:   A.dim,
};
function sc(s: string): string { return (SC[s] ?? '') + s + A.reset; }

// ──────────────────── Строка списка ────────────────────
function fmtCase(c: WatchedCase, sel: boolean): string {
  const q  = cw();
  const co = (c as any).courtName || c.courtId || '—';
  const line = `${pad(c.number || '—', q.num)} │ ${pad(c.status || '', q.status)} │ ${pad(co, q.court)} │ ${pad(c.result ?? '—', q.result)}`;
  if (sel)                                          return A.rev + A.bold + line + A.reset;
  if (c.status === 'error')                          return A.red   + line + A.reset;
  if (c.status === 'decision' || c.status === 'enforced') return A.green + line + A.reset;
  return line;
}

// ──────────────────── Header ────────────────────
function drawHeader() {
  const err   = cases.filter(c => c.status === 'error').length;
  const tCases = tab === 'cases' ? A.rev + ' ДЕЛА '   + A.reset + A.bgBlue + A.white : ' ДЕЛА ';
  const tRun   = tab === 'run'   ? A.rev + ' ЗАПУСК ' + A.reset + A.bgBlue + A.white : ' ЗАПУСК ';
  w(at(1) + eol + A.bgBlue + A.white + A.bold +
    ` CourtDesk  ${tCases} ${tRun}   │  Дел: ${cases.length}  Ош: ${err}` + A.reset);
}

function drawThead() {
  const q = cw();
  w(at(2) + eol + A.bgBlue + A.white + A.bold +
    ` ${pad('№ / НОМЕР', q.num)} │ ${pad('СТАТуС', q.status)} │ ${pad('СУД', q.court)} │ ${pad('РЕШЕНИЕ', q.result)}` + A.reset);
}

function drawFooter(hint: string) {
  // длина hint без ANSI-кодов (они не занимают место)
  const bare = hint.replace(/\x1b\[[0-9;]*m/g, '');
  const pad2 = ' '.repeat(Math.max(0, C() - bare.length - 2));
  w(at(R()) + eol + A.bgBlue + A.white + ` ${hint}${pad2}` + A.reset);
}

// ──────────────────── Список ────────────────────
function renderList() {
  const lh = R() - 3;
  if (cur < vtop) vtop = cur;
  if (cur >= vtop + lh) vtop = cur - lh + 1;

  for (let i = 0; i < lh; i++) {
    const idx = vtop + i;
    w(at(3 + i) + eol);
    if (idx < cases.length) w(' ' + fmtCase(cases[idx], idx === cur));
  }
  if (cases.length === 0) {
    w(at(4) + eol + A.dim + '  (Дел нет. Запустите API: npm start)' + A.reset);
  }
  // скроллбар
  if (cases.length > lh) {
    const pct      = vtop / (cases.length - lh);
    const thumbPos = Math.round(pct * (lh - 1));
    for (let i = 0; i < lh; i++) {
      w(at(3 + i) + gto(C()) +
        (i === thumbPos ? A.rev + '█' + A.reset : A.dim + '│' + A.reset));
    }
  }
}

// ──────────────────── Карточка ────────────────────

/** Очищенная длина строки (без ANSI) */
function visLen(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}

function buildDetail(c: WatchedCase): string[] {
  const termW = C();
  const co    = (c as any).courtName || c.courtId || '—';

  // заголовок ─ ширина трактуется по содержимому, не по termW
  const title = `══ ДЕЛО: ${c.number || '—'} `;
  const fill  = '═'.repeat(Math.max(2, termW - title.length - 1));
  const lines: string[] = [
    A.cyan + A.bold + title + fill + A.reset,
    '',
  ];

  // метки — выровняны по левому полю (18 сим)
  const LW = 18; // ширина метки
  const VW = termW - LW - 4; // доступная ширина значения
  const indent = ' '.repeat(LW + 4);

  function field(label: string, value: string, color = ''): void {
    const lbl = ('  ' + label + ':').padEnd(LW + 3);
    const valLines = wrap(value || '—', VW, indent);
    lines.push(`${lbl} ${color}${valLines[0]}${color ? A.reset : ''}`);
    for (let i = 1; i < valLines.length; i++) lines.push(valLines[i]);
  }

  field('Суд',          co,                       A.cyan);
  field('Статус',       c.status || '—',          sc(c.status || ''));
  field('Результат',     c.result || '—');
  field('Вступление',   c.legalForceDate || '—');
  field('УИД',          c.caseUid || '—');
  field('Внутренний ID',  c.uid);
  field('Посл. проверка', c.lastChecked || 'не выполнялась');
  field('Добавлено',    c.createdAt?.slice(0, 10) || '—');
  field('Ошибок',      String(c.errorCount || 0));

  if (c.lastError) {
    lines.push('');
    field('Посл. ошибка',  c.lastError, A.red);
  }

  if (c.url) {
    lines.push('');
    // URL переносим по termW-4 символам (без ANSI в узлах)
    const urlLines = wrap(c.url, termW - 4, '    ');
    lines.push(A.dim + '  URL:');
    for (const ul of urlLines) lines.push('    ' + ul + A.reset);
  }

  return lines;
}

function renderDetail() {
  const c = cases[cur];
  if (!c) { view = 'list'; render(); return; }

  const dl  = buildDetail(c);
  const vis = R() - 2; // строк header + footer

  // коррекция смещения вниз если дошли до конца
  const maxScroll = Math.max(0, dl.length - vis);
  if (dScroll > maxScroll) dScroll = maxScroll;

  drawHeader();

  for (let i = 0; i < vis; i++) {
    const li = dScroll + i;
    w(at(2 + i) + eol);
    if (li < dl.length) w(dl[li]);
  }

  // скроллбар
  if (dl.length > vis) {
    const pct = dScroll / maxScroll;
    const tp  = Math.round(pct * (vis - 1));
    for (let i = 0; i < vis; i++) {
      w(at(2 + i) + gto(C()) +
        (i === tp ? A.rev + '█' + A.reset : A.dim + '│' + A.reset));
    }
  }

  drawFooter(`↑↓:скролл  Esc/q:назад  [дело ${cur + 1}/${cases.length}]`);
}

// ──────────────────── Вкладка ЗАПУСК ────────────────────
function renderRun() {
  const br = 3;
  w(at(br)     + eol + A.bold + '  ЗАПУСК МОНИТОРИНГА' + A.reset);
  w(at(br + 1) + eol);
  w(at(br + 2) + eol + `  ${A.yellow}F4${A.reset}  — Полный прогон (все дела)`);
  w(at(br + 3) + eol + `  ${A.yellow}F5${A.reset}  — Retry (только ошибочные)`);
  w(at(br + 4) + eol + `  ${A.yellow}F6${A.reset}  — Новые дела (waiting)`);
  for (let i = br + 5; i < R() - 1; i++) w(at(i) + eol);
}

// ──────────────────── Главный рендер ────────────────────
function render() {
  if (dead) return;
  w(A.hide);
  if (view === 'detail') { renderDetail(); w(A.show); return; }
  drawHeader();
  if (tab === 'cases') {
    drawThead();
    renderList();
    drawFooter('↑↓:выбор  Enter:карточка  r:обн  2:запуск  q:вых');
  } else {
    renderRun();
    drawFooter('F4:полный  F5:retry  F6:новые  1:дела  q:вых');
  }
  w(A.show);
}

// ──────────────────── API ────────────────────
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

function runMode(m: string): void {
  tuiFetch('http://127.0.0.1:8767/api/parse/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: m }),
  }).then(() => setTimeout(refresh, 1500)).catch(() => {});
}

// ──────────────────── Клавиатура ────────────────────
function key(str: string, k: readline.Key): void {
  const ctrl = k.ctrl;
  const nm   = k.name;

  if (ctrl && (nm === 'c' || nm === 'd')) { quit(); return; }

  if (view === 'detail') {
    if (nm === 'up')     { dScroll = Math.max(0, dScroll - 1); render(); return; }
    if (nm === 'down') {
      const c = cases[cur];
      if (c) {
        const max = Math.max(0, buildDetail(c).length - (R() - 2));
        dScroll   = Math.min(max, dScroll + 1);
      }
      render(); return;
    }
    if (nm === 'pageup')   { dScroll = Math.max(0, dScroll - (R() - 4)); render(); return; }
    if (nm === 'pagedown') {
      const c = cases[cur];
      const max = c ? Math.max(0, buildDetail(c).length - (R() - 2)) : 0;
      dScroll = Math.min(max, dScroll + (R() - 4));
      render(); return;
    }
    if (nm === 'escape' || nm === 'q' || str === 'q' || str === 'й') {
      view = 'list'; render(); return;
    }
    return;
  }

  // ─ list mode ─
  if (nm === 'q' || str === 'q' || str === 'Q' || str === 'й' || str === 'Й') { quit(); return; }
  if (nm === 'up')       { cur = Math.max(0, cur - 1); render(); return; }
  if (nm === 'down')     { cur = Math.min(cases.length - 1, cur + 1); render(); return; }
  if (nm === 'pageup')   { cur = Math.max(0, cur - (R() - 4)); render(); return; }
  if (nm === 'pagedown') { cur = Math.min(cases.length - 1, cur + (R() - 4)); render(); return; }
  if (nm === 'home')     { cur = 0; vtop = 0; render(); return; }
  if (nm === 'end')      { cur = Math.max(0, cases.length - 1); render(); return; }
  if (nm === 'return' || nm === 'enter') {
    if (tab === 'cases' && cases.length > 0) { view = 'detail'; dScroll = 0; render(); }
    return;
  }
  if (str === '1' || nm === 'left')  { tab = 'cases'; render(); return; }
  if (str === '2' || nm === 'right') { tab = 'run';   render(); return; }
  if (str === 'r')  { refresh(); return; }
  if (nm === 'f4')  { runMode('full');  return; }
  if (nm === 'f5')  { runMode('retry'); return; }
  if (nm === 'f6')  { runMode('new');   return; }
}

// ──────────────────── Инициализация ────────────────────
function quit(): void {
  if (dead) return;
  dead = true;
  if (timer) { clearInterval(timer); timer = null; }
  w(A.show + A.altOff + A.reset);
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.pause();
  process.exit(0);
}

process.on('SIGINT',  quit);
process.on('SIGTERM', quit);
process.on('exit', () => { try { w(A.show + A.altOff); } catch {} });
process.stdout.on('resize', () => { w(A.cls + A.home); render(); });

if (process.stdin.isTTY) process.stdin.setRawMode(true);
readline.emitKeypressEvents(process.stdin);
process.stdin.on('keypress', key);

w(A.altOn + A.cls + A.home);
render();
refresh();
timer = setInterval(refresh, 60_000);
