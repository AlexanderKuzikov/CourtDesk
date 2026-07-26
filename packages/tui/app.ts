import blessed from 'blessed';
import { tuiFetch } from './fetch.js';
import type { WatchedCase } from '../core/types.js'; // CR10-008: typed instead of any[]

let allCases: WatchedCase[] = [];
let destroyed = false;
let tab: 'cases' | 'run' = 'cases';
let isDetailOpen = false; // CR10-003: track detail visibility
let refreshTimer: ReturnType<typeof setInterval> | null = null; // CR10-007: cleanup ref

function pad(s: string, w: number): string { return (s ?? '—').padEnd(w).slice(0, w); }
function sep(): string { return ' │ '; }
function clip(s: string, max: number): string {
  return (s ?? '—').length <= max ? (s ?? '—').padEnd(max) : (s ?? '—').slice(0, max - 1) + '…';
}

function fmtCase(c: WatchedCase, colWidths: { num: number; status: number; court: number; result: number }): string {
  const court = c.courtName || c.courtId || '—'; // CR10-008: WatchedCase typed
  return `${pad(c.number || '—', colWidths.num)}${sep()}${pad(c.status || '', colWidths.status)}${sep()}${clip(court, colWidths.court)}${sep()}${clip(c.result ?? '—', colWidths.result)}`;
}

function getColWidths(screenWidth: number): { num: number; status: number; court: number; result: number } {
  // CR10-005: adaptive column widths based on screen.width
  const usable = Math.max(60, screenWidth - 10);
  const num = Math.min(20, Math.floor(usable * 0.20));
  const status = Math.min(14, Math.floor(usable * 0.14));
  const court = Math.min(32, Math.floor(usable * 0.32));
  const result = usable - num - status - court - 9; // separators
  return { num, status, court, result: Math.max(10, result) };
}

const screen = blessed.screen({ smartCSR: true, title: 'CourtDesk', fullUnicode: true });

const header = blessed.box({
  parent: screen, top: 0, left: 0, width: '100%', height: 1,
  tags: true, style: { bg: 'blue', fg: 'white' }
});
const thead = blessed.box({
  parent: screen, top: 1, left: 0, width: '100%', height: 1,
  tags: true, style: { bg: 'blue', fg: 'white', bold: true }
});
const list = blessed.list({
  parent: screen, top: 2, left: 0, width: '100%', height: '100%-3',
  keys: true, mouse: true,
  scrollbar: { ch: ' ', track: { bg: 'grey' }, style: { inverse: true } },
  style: { item: { fg: 'white', bg: 'black' }, selected: { bg: 'white', fg: 'black', bold: true } }
});
const detail = blessed.box({
  parent: screen, top: 2, left: 2, width: '75%', height: '80%',
  border: { type: 'line' }, padding: { top: 1, left: 1 },
  scrollable: true, alwaysScroll: true, keys: true, tags: true,
  style: { border: { fg: 'blue' }, fg: 'white' }
});
detail.hide();

// CR10-006: use blessed API instead of raw ANSI escape to avoid race with screen.program
screen.program.hideCursor();
process.on('exit', () => {
  try { screen.program.showCursor(); } catch {}
});

function hideD(): void {
  isDetailOpen = false; // CR10-003
  detail.hide();
  list.focus();
  screen.render();
}

function showD(idx: number): void {
  const c = allCases[idx];
  if (!c) return;
  isDetailOpen = true; // CR10-003
  detail.setContent([
    `{cyan-fg}{bold}№ ${c.number}{/bold}{/cyan-fg}`,
    `Статус: ${c.status}`,
    `Суд: ${(c as any).courtName || c.courtId}`,
    `Результат: ${c.result || '—'}`,
    `Вступление: ${c.legalForceDate || '—'}`,
    `Ошибок: ${c.errorCount || 0}`,
    c.lastError ? `Ошибка: ${c.lastError.slice(0, 80)}` : '',
  ].join('\n'));
  detail.setScroll(0);
  detail.show();
  detail.focus();
  screen.render();
}

function render(): void {
  const cols = getColWidths(screen.width as number); // CR10-005
  if (tab === 'cases') {
    thead.show();
    thead.setContent(` ${pad('Номер', cols.num)}${sep()}${pad('Статус', cols.status)}${sep()}${pad('Суд', cols.court)}${sep()}${pad('Результат', cols.result)}`);
    // CR10-003: если detail открыт — не перерисовываем list (пользователь читает карточку)
    if (!isDetailOpen) {
      list.setItems(allCases.map(c => fmtCase(c, cols)));
    }
    const e = allCases.filter((c) => c.status === 'error');
    const h = e.filter((c) => (c.errorCount || 0) >= 3);
    header.setContent(` CourtDesk ${allCases.length} дел ош:${e.length} хр:${h.length} | 1:дела 2:запуск Enter:детали r:обн q:вых`);
  } else {
    thead.hide();
    list.setItems([
      'ЗАПУСК',
      ' F4 Полный прогон',
      ' F5 Retry',
      ' F6 Новые дела',
    ]);
    header.setContent(' CourtDesk F4:full F5:retry F6:new 1:дела q:вых');
  }
  list.focus();
  screen.render();
}

function refresh(): void {
  tuiFetch('http://127.0.0.1:8767/api/cases').then(r => r.json()).then((j: { data?: WatchedCase[] }) => {
    if (destroyed) return;
    allCases = j.data || [];
    render();
  }).catch(() => {
    if (!destroyed) {
      // CR10-002: no tags in setItems — blessed.list upstream bug #400
      list.setItems(['!! Ошибка соединения с API']);
      screen.render();
    }
  });
}

function runMode(m: string): void {
  tuiFetch('http://127.0.0.1:8767/api/parse/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: m }),
  }).then(() => setTimeout(refresh, 1500)).catch(() => {});
}

screen.key(['q', 'Q', 'й', 'Й', 'C-c', 'C-d'], () => {
  destroyed = true;
  // CR10-007: cleanup interval before exit
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  try { screen.program.showCursor(); screen.destroy(); } catch {}
  process.exit(0);
});

screen.key(['1'], () => { tab = 'cases'; render(); refresh(); });
screen.key(['2'], () => { tab = 'run'; render(); });
screen.key(['left'], () => { tab = 'cases'; render(); });
screen.key(['right'], () => { tab = 'run'; render(); });
screen.key(['r'], () => refresh());
screen.key(['f4'], () => runMode('full'));
screen.key(['f5'], () => runMode('retry'));
screen.key(['f6'], () => runMode('new'));

detail.key(['escape', 'enter', 'return'], () => hideD());
list.on('select', (_item: any, idx: number) => { if (tab === 'cases') showD(idx); });

// CR10-005: re-render on resize with recalculated column widths
screen.on('resize', () => render());

list.focus();
screen.render();
refresh();

// CR10-007: store interval ref for cleanup on exit
refreshTimer = setInterval(refresh, 60000);
