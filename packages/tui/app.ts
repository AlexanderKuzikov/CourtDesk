import blessed from 'blessed';
import { tuiFetch } from './fetch.js';

let allCases: any[] = [];
let destroyed = false;
let tab = 0; // 0=дела, 1=монитор, 2=ошибки

function pad(s: string, w: number): string { return (s ?? '—').padEnd(w).slice(0, w); }
function sep(): string { return ' ' + '\u2502' + ' '; }

function fmtCase(c: any): string {
  const icon = c.status === 'error' ? '{red-fg}●{/red-fg}' : c.status === 'enforced' ? '{magenta-fg}●{/magenta-fg}' : c.status === 'waiting' ? '{yellow-fg}○{/yellow-fg}' : '{green-fg}●{/green-fg}';
  return `${icon} ${pad(c.number, 18)}${sep()}${pad(c.status, 12)}${sep()}${pad(c.courtName || c.courtId, 28)}${sep()}${pad(c.result, 24)}`;
}

const screen = blessed.screen({ smartCSR: true, title: 'CourtDesk', fullUnicode: true });
const header = blessed.box({ parent: screen, top: 0, left: 0, width: '100%', height: 1, style: { bg: 'blue', fg: 'white' }, tags: true });
const thead = blessed.box({ parent: screen, top: 1, left: 0, width: '100%', height: 1, tags: true, style: { bg: 'blue', fg: 'white', bold: true } });
const list = blessed.list({ parent: screen, top: 2, left: 0, width: '100%', height: '100%-3', keys: true, vi: true, mouse: true, tags: true, scrollbar: { ch: ' ', style: { inverse: true } }, style: { item: { fg: 'white' }, selected: { fg: 'black', bg: 'white' } } });
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

function renderTab(): void {
  const stats: Record<string, number> = {};
  allCases.forEach((c: any) => { stats[c.status] = (stats[c.status] || 0) + 1; });
  const errs = allCases.filter((c: any) => c.status === 'error');
  const chr = errs.filter((c: any) => (c.errorCount || 0) >= 3);

  if (tab === 0) {
    thead.show();
    thead.setContent(` {bold}${pad('Номер', 18)}${sep()}${pad('Статус', 12)}${sep()}${pad('Суд', 28)}${sep()}${pad('Результат', 24)}{/bold}`);
    list.setItems(allCases.map(fmtCase));
    header.setContent(` 1:Дела 2:Монитор  ${colorStatus(stats)} | Enter:детали r:обн q:вых`);
  } else if (tab === 1) {
    thead.hide();
    header.setContent(` 1:Дела 2:Монитор  F4:full F5:retry F6:new  r:обн q:вых`);
    list.setItems([
      `{bold}МОНИТОРИНГ{/bold}`,
      ``,
      `  ${stats['monitoring'] ?? 0} дел в мониторинге`,
      `  ${stats['waiting'] ?? 0} ожидают появления`,
      `  ${stats['decision'] ?? 0} решений вынесено`,
      `  {red-fg}${errs.length}{/red-fg} ошибок (${chr.length} хронических)`,
    ]);
  }
  screen.render();
}

function colorStatus(stats: Record<string, number>): string {
  return `M:${stats['monitoring'] ?? 0} W:${stats['waiting'] ?? 0} D:${stats['decision'] ?? 0} E:${stats['enforced'] ?? 0}`;
}

function loadAndRender(): void {
  tuiFetch('http://127.0.0.1:8767/api/cases').then(r => r.json()).then(j => {
    if (destroyed) return;
    allCases = j.data || [];
    renderTab();
  }).catch(() => { if (!destroyed) { list.setItems(['{red-fg}Ошибка соединения{/red-fg}']); screen.render(); } });
}

function runMode(m: string): void {
  tuiFetch('http://127.0.0.1:8767/api/parse/run', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: m }),
  }).then(() => setTimeout(loadAndRender, 1500)).catch(() => {});
}

detail.key(['escape', 'enter', 'return'], () => hideD());

screen.on('keypress', (_ch: string, key: any) => {
  if (!key) return;
  // Выход: q в любой раскладке или Ctrl+C
  if (key.name === 'q' || key.sequence === '\x03' || key.full === 'C-d') {
    destroyed = true; try { screen.program.showCursor(); screen.destroy(); } catch {} process.exit(0);
  }
  // Esc без карточки игнорируется, с карточкой — закрыть
  if (key.name === 'escape') { if (detail.visible) hideD(); return; }
  // Enter: закрыть карточку / открыть дело
  if (key.name === 'enter') {
    if (detail.visible) { hideD(); return; }
    if (tab === 0) showD((list as any).selected); // list.selected — индекс из blessed
    return;
  }
  if (key.name === 'r') loadAndRender();
  if (key.name === '1') { tab = 0; renderTab(); }
  if (key.name === '2') { tab = 1; renderTab(); }
  if (key.name === 'left') { tab = Math.max(0, tab - 1); renderTab(); }
  if (key.name === 'right') { tab = Math.min(1, tab + 1); renderTab(); }
  if (key.name === 'f4') runMode('full');
  if (key.name === 'f5') runMode('retry');
  if (key.name === 'f6') runMode('new');
});
screen.on('resize', () => screen.render());
screen.key(['left'], () => { tab = Math.max(0, tab - 1); renderTab(); });
screen.key(['right'], () => { tab = Math.min(1, tab + 1); renderTab(); });

list.focus();
screen.render();
renderTab();
loadAndRender();
setInterval(loadAndRender, 60000);
