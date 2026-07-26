import blessed from 'blessed';
import { tuiFetch } from './fetch.js';

let allCases: any[] = [];
let destroyed = false;
let tab: 'cases' | 'run' = 'cases';

function pad(s: string, w: number): string { return (s ?? '—').padEnd(w).slice(0, w); }
function sep(): string { return ' │ '; }
function clip(s: string, max: number): string { return (s ?? '—').length <= max ? (s ?? '—').padEnd(max) : (s ?? '—').slice(0, max - 1) + '…'; }

function fmtCase(c: any): string {
  const court = c.courtName || c.courtId || '—';
  return `${pad(c.number || '—', 18)}${sep()}${pad(c.status || '', 12)}${sep()}${clip(court, 28)}${sep()}${clip(c.result, 24)}`;
}

const screen = blessed.screen({ smartCSR: true, title: 'CourtDesk', fullUnicode: true });
const header = blessed.box({ parent: screen, top: 0, left: 0, width: '100%', height: 1, tags: true, style: { bg: 'blue', fg: 'white' } });
const thead = blessed.box({ parent: screen, top: 1, left: 0, width: '100%', height: 1, tags: true, style: { bg: 'blue', fg: 'white', bold: true } });
const list = blessed.list({ parent: screen, top: 2, left: 0, width: '100%', height: '100%-3', keys: true, mouse: true, scrollbar: { ch: ' ', track: { bg: 'grey' }, style: { inverse: true } }, style: { item: { fg: 'white', bg: 'black' }, selected: { bg: 'white', fg: 'black', bold: true } } });
const detail = blessed.box({ parent: screen, top: 2, left: 2, width: '75%', height: '80%', border: { type: 'line' }, padding: { top: 1, left: 1 }, scrollable: true, alwaysScroll: true, keys: true, tags: true, style: { border: { fg: 'blue' }, fg: 'white' } });
detail.hide();

process.stdout.write('\x1b[?25l');
process.on('exit', () => { try { process.stdout.write('\x1b[?25h'); } catch {} });

function hideD(): void { detail.hide(); list.focus(); screen.render(); }

function showD(idx: number): void {
  const c = allCases[idx];
  if (!c) return;
  detail.setContent([
    `{cyan-fg}{bold}№ ${c.number}{/bold}{/cyan-fg}`,
    `Статус:     ${c.status}`,
    `Суд:        ${c.courtName || c.courtId}`,
    `Результат:  ${c.result || '—'}`,
    `Вступление: ${c.legalForceDate || '—'}`,
    `Ошибок:     ${c.errorCount || 0}`,
    c.lastError ? `Ошибка:     ${c.lastError.slice(0, 80)}` : '',
  ].join('\n'));
  detail.setScroll(0);
  detail.show(); detail.focus(); screen.render();
}

function render(): void {
  if (tab === 'cases') {
    thead.show();
    thead.setContent(` ${pad('Номер', 18)}${sep()}${pad('Статус', 12)}${sep()}${pad('Суд', 28)}${sep()}${pad('Результат', 24)}`);
    list.setItems(allCases.map(fmtCase));
    const e = allCases.filter((c: any) => c.status === 'error');
    const h = e.filter((c: any) => (c.errorCount || 0) >= 3);
    header.setContent(` CourtDesk  ${allCases.length} дел  ош:${e.length} хр:${h.length}  |  1:дела 2:запуск  Enter:детали  r:обн  q:вых`);
  } else {
    thead.hide();
    list.setItems([
      'ЗАПУСК',
      '  F4  Полный прогон',
      '  F5  Retry',
      '  F6  Новые дела',
    ]);
    header.setContent(' CourtDesk  F4:full  F5:retry  F6:new  1:дела  q:вых');
  }
  list.focus();
  screen.render();
}

function refresh(): void {
  tuiFetch('http://127.0.0.1:8767/api/cases').then(r => r.json()).then(j => {
    if (destroyed) return;
    allCases = j.data || [];
    render();
  }).catch(() => { if (!destroyed) { list.setItems(['{red-fg}Ошибка соединения{/red-fg}']); screen.render(); } });
}

function runMode(m: string): void {
  tuiFetch('http://127.0.0.1:8767/api/parse/run', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: m }),
  }).then(() => setTimeout(refresh, 1500)).catch(() => {});
}

// Keys — как в CourtFlow
screen.key(['q', 'Q', 'й', 'Й', 'C-c', 'C-d'], () => { destroyed = true; try { screen.program.showCursor(); screen.destroy(); } catch {} process.exit(0); });
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
screen.on('resize', () => screen.render());

list.focus();
screen.render();
refresh();
setInterval(refresh, 60000);
