import blessed from 'blessed';
import { tuiFetch } from './fetch.js';

/* helpers */
function esc(s: string | null | undefined): string { return (s ?? '').replace(/\{/g, '\\{').replace(/\}/g, '\\}'); }
function pad(s: string, w: number): string { return s.padEnd(w, ' '); }
function clip(s: string, max: number): string { return s.length <= max ? s : s.slice(0, Math.max(0, max - 1)) + '›'; }
function sep(): string { return '│'; }

type Tab = 'dashboard' | 'monitor' | 'cases';

let tab: Tab = 'dashboard';
let allCases: any[] = [];
let allProgress: any = {};
let allSettings: any = {};
let destroyed = false;

const COL = { num: 16, status: 12, court: 30, result: 25, errors: 8 };

/* screen */
const screen = blessed.screen({ smartCSR: true, title: 'CourtDesk TUI', fullUnicode: true });

/* widgets */
const header = blessed.box({ parent: screen, top: 0, left: 0, width: '100%', height: 1, style: { bg: 'blue', fg: 'white' }, content: ' CourtDesk TUI' });
const listHeader = blessed.box({ parent: screen, top: 1, left: 0, width: '100%', height: 1, tags: true, style: { bg: 'blue', fg: 'white', bold: true } });
const casesList = blessed.list({ parent: screen, top: 2, left: 0, width: '100%', height: '100%-3', keys: true, vi: true, mouse: true, tags: true, scrollbar: { ch: ' ', track: { bg: 'grey' }, style: { inverse: true } }, style: { item: { fg: 'white', bg: 'black' }, selected: { bg: 'white', fg: 'black', bold: true } } });
const statusbar = blessed.box({ parent: screen, bottom: 0, left: 0, width: '100%', height: 1, tags: true, style: { bg: 'blue', fg: 'white' } });

/* detail modal */
const detailBox = blessed.box({ parent: screen, top: 'center', left: 'center', width: 62, height: 20, border: { type: 'line' }, padding: { top: 1, left: 1, right: 1, bottom: 1 }, scrollable: true, alwaysScroll: true, keys: true, vi: true, mouse: true, tags: true, style: { border: { fg: 'blue' }, bg: 'black', fg: 'white' }, scrollbar: { ch: ' ', track: { bg: 'grey' }, style: { inverse: true } } });
detailBox.hide();
[listHeader, casesList, statusbar].forEach(el => el.show());

/* render */
function renderHeaderLine(): string {
  return pad('Номер', COL.num) + sep() + pad('Статус', COL.status) + sep() + pad('Суд', COL.court) + sep() + pad('Результат', COL.result) + sep() + pad('Ошибки', COL.errors);
}
function renderCaseItem(c: any): string {
  if (!c || typeof c !== 'object') return '';
  const court = c.courtName || c.courtId || '—';
  const errInfo = c.errorCount > 0 ? `{red-fg}[${c.errorCount}x]{/red-fg}` : '';
  try {
    return pad(clip(c.number || '—', COL.num - 1), COL.num) + sep() + pad(clip(c.status || '', COL.status - 1), COL.status) + sep() + pad(clip(court, COL.court - 1), COL.court) + sep() + pad(clip(c.result || '—', COL.result - 1), COL.result) + sep() + pad(errInfo, COL.errors);
  } catch { return ''; }
}

function updateStatus(): void {
  const stats: Record<string, number> = {};
  allCases.forEach((c: any) => { stats[c.status] = (stats[c.status] || 0) + 1; });
  const errors = allCases.filter((c: any) => c.status === 'error');
  const chronic = errors.filter((c: any) => (c.errorCount || 0) >= 3);
  const hint = tab === 'monitor' ? 'F4 Full  F5 Retry  F6 New  1 Дэшборд  q Выход' : 'Enter Детали  r Обновить  q Выход';
  statusbar.setContent(` ${allCases.length} дел  |  oш:${errors.length} хр:${chronic.length}  |  ${hint}`);
}

function renderDashboard(): void {
  listHeader.setContent(renderHeaderLine());
  const display = allCases.slice().reverse();
  casesList.setItems(display.map((c: any) => renderCaseItem(c)));
  updateStatus();
}

function renderMonitor(): void {
  const p = allProgress;
  const s = allSettings;
  const lines: string[] = [];
  lines.push(`{bold}ПРОГРЕСС:{/bold}`);
  if (p?.running) {
    lines.push(`  {yellow-fg}⏳{/yellow-fg}  ${p.processed}/${p.total}  |  {red-fg}${p.errors}{/red-fg} ошибок`);
  } else if (p?.total > 0) {
    lines.push(`  {green-fg}✓{/green-fg}  ${p.processed} дел, {red-fg}${p.errors}{/red-fg} ошибок`);
  } else {
    lines.push(`  {gray-fg}нет активного прогона{/gray-fg}`);
  }
  lines.push('');
  lines.push(`{bold}РАСПИСАНИЕ:{/bold}`);
  lines.push(`  Полный прогон:  ${s?.scheduleFull || '03:00'}`);
  lines.push(`  Retry каждые:   ${s?.retryIntervalHours || 3} ч`);
  lines.push(`  Stale-дела:     >${s?.retryStaleHours || 6} ч`);
  lines.push(`  Автозапуск:     ${s?.scheduleEnabled ? '{green-fg}вкл{/green-fg}' : '{red-fg}выкл{/red-fg}'}`);
  lines.push('');
  lines.push(`{bold}УПРАВЛЕНИЕ:{/bold}`);
  lines.push(`  {green-fg}F4{/green-fg}  Полный прогон  |  {yellow-fg}F5{/yellow-fg}  Retry  |  {cyan-fg}F6{/cyan-fg}  Новые дела`);
  listHeader.setContent(`  ${'МОНИТОРИНГ'.padEnd(50)}`);
  casesList.setItems(lines);
  updateStatus();
}

function renderCases(): void {
  const errors = allCases.filter((c: any) => c.status === 'error');
  const chronic = errors.filter((c: any) => (c.errorCount || 0) >= 3);
  const display = chronic.length > 0 ? chronic : errors.length > 0 ? errors : allCases.filter((c: any) => c.status !== 'archived');
  listHeader.setContent(renderHeaderLine());
  casesList.setItems(display.map((c: any) => renderCaseItem(c)));
  updateStatus();
}

function showTab(t: Tab): void {
  if (detailBox.visible) detailBox.hide();
  tab = t;
  if (t === 'dashboard') { listHeader.show(); renderDashboard(); }
  else if (t === 'monitor') { renderMonitor(); listHeader.hide(); }
  casesList.focus();
  screen.render();
}

/* detail */
function showDetail(idx: number): void {
  const list = tab === 'dashboard' ? allCases : tab === 'cases' ? allCases.filter((c: any) => c.status === 'error') : allCases;
  const c = list[idx];
  if (!c) return;
  const events = (c.events || []).slice(-10).map((e: any) => `  ${(e.eventDate || '').slice(0, 10)}  ${esc(e.eventName || '')}  ${esc(e.result || '')}`).join('\n');
  detailBox.setContent([
    `{cyan-fg}{bold}№ ${esc(c.number || '—')}{/bold}{/cyan-fg}`,
    ``,
    `{bold}Статус:{/bold}   ${c.status}`,
    `{bold}Суд:{/bold}     ${esc(c.courtName || c.courtId || '')}`,
    `{bold}Результат:{/bold} ${esc(c.result || '—')}`,
    `{bold}Вступление:{/bold} ${c.legalForceDate || '—'}`,
    `{bold}Ошибок:{/bold}   ${c.errorCount || 0}`,
    c.lastError ? `{bold}Ошибка:{/bold}   ${esc(c.lastError.slice(0, 80))}` : '',
    ``,
    `{bold}События:{/bold}`,
    events || '  {gray-fg}нет{/gray-fg}',
  ].join('\n'));
  detailBox.setScroll(0);
  detailBox.show();
  detailBox.focus();
  screen.render();
}
function hideDetail(): void { detailBox.hide(); showTab(tab); }

/* keys */
function exitTui(): void { destroyed = true; try { screen.program.showCursor(); screen.destroy(); } catch {} process.exit(0); }

// Работает в любой раскладке — q, й, Ctrl+C, Ctrl+D
screen.key(['q', 'Q', 'C-c', 'C-d'], () => { if (detailBox.visible) { hideDetail(); return; } exitTui(); });
detailBox.key(['escape', 'enter', 'return', 'q', 'Q', 'C-c', 'C-d'], () => hideDetail());
screen.key(['escape'], () => { if (detailBox.visible) hideDetail(); });
screen.key(['enter', 'return'], () => { if (detailBox.visible) hideDetail(); });
screen.key(['1'], () => { if (!detailBox.visible) showTab('dashboard'); });
screen.key(['2'], () => { if (!detailBox.visible) showTab('monitor'); });
screen.key(['left'], () => { if (!detailBox.visible) showTab('dashboard'); });
screen.key(['right'], () => { if (!detailBox.visible) showTab('monitor'); });
screen.key(['r', 'R'], () => { if (!detailBox.visible) refresh(); });
screen.key(['f4'], () => { if (!detailBox.visible) runMode('full'); });
screen.key(['f5'], () => { if (!detailBox.visible) runMode('retry'); });
screen.key(['f6'], () => { if (!detailBox.visible) runMode('new'); });
casesList.on('select', (_item: any, idx: number) => {
  if (detailBox.visible || tab === 'monitor') return;
  showDetail(idx);
});
screen.on('resize', () => { if (!destroyed) screen.render(); });

/* data */
async function refresh(): Promise<void> {
  try {
    const [casesRes, progressRes, settingsRes] = await Promise.all([
      tuiFetch('http://127.0.0.1:8767/api/cases').then(r => r.json()),
      tuiFetch('http://127.0.0.1:8767/api/parse/progress').then(r => r.json()),
      tuiFetch('http://127.0.0.1:8767/api/settings').then(r => r.json()),
    ]);
    if (destroyed) return;
    allCases = casesRes.data || [];
    allProgress = progressRes.data || {};
    allSettings = settingsRes.data || {};
  } catch { /* ignore */ }
  if (!destroyed) showTab(tab);
}

async function runMode(mode: string): Promise<void> {
  try {
    await tuiFetch('http://127.0.0.1:8767/api/parse/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
  } catch {}
  setTimeout(refresh, 1500);
}

/* init */
process.stdout.write('\x1b[?25l'); // hide cursor
process.on('exit', () => { try { process.stdout.write('\x1b[?25h'); } catch {} });
process.on('SIGTERM', exitTui);
process.on('SIGINT', exitTui);
header.setContent(' CourtDesk TUI  |  1: дела 2: монитор  Ctrl+C: выход  r: обновить');
showTab('dashboard');
casesList.focus();
screen.render();
setTimeout(refresh, 300);
setInterval(refresh, 30000);
