import blessed from 'neo-blessed';
import { createDashboardView } from './views/dashboard.js';
import { createMonitorView } from './views/monitor.js';
import { createCasesView } from './views/cases.js';

let screen: any;
let tabButtons: any[];
let tabContents: any[];

export function createApp(): void {
  screen = blessed.screen({
    smartCSR: true,
    title: 'CourtDesk TUI',
    dockBorders: true,
    fullUnicode: true,
  });

  // Header
  const header = blessed.box({
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: ' CourtDesk TUI (F1-3: tabs  |  q: quit  |  r: refresh)',
    style: { fg: 'white', bg: 'blue' },
  });

  // Tab bar
  const tabNames = ['Дашборд', 'Мониторинг', 'Дела'];
  const tabBar = blessed.box({
    top: 1,
    left: 0,
    width: '100%',
    height: 1,
  });

  tabButtons = tabNames.map((name, i) => {
    const btn = blessed.box({
      parent: tabBar,
      top: 0,
      left: i * 20,
      width: 20,
      height: 1,
      content: ` ${i === 0 ? '●' : '○'} ${name} `,
      style: { fg: i === 0 ? 'white' : 'bright-black', bg: i === 0 ? 'blue' : 'default' },
    });
    return btn;
  });

  screen.title = 'CourtDesk TUI';

  // Tab content areas
  const contentArea = blessed.box({
    top: 2,
    left: 0,
    width: '100%',
    height: '100%-2',
  });

  // Create views
  const views = [
    createDashboardView(contentArea),
    createMonitorView(contentArea),
    createCasesView(contentArea),
  ];

  tabContents = views.map(v => v.element);

  // Show first tab
  let activeTab = 0;
  function showTab(index: number): void {
    tabContents.forEach((el, i) => el.style.display = i === index ? 'block' : 'none');
    tabButtons.forEach((btn, i) => {
      btn.setContent(` ${i === index ? '●' : '○'} ${['Дашборд', 'Мониторинг', 'Дела'][i]} `);
      btn.style.fg = i === index ? 'white' : 'bright-black';
      btn.style.bg = i === index ? 'blue' : 'default';
    });
    tabContents[index].focus();
    screen.render();
  }

  showTab(0);

  // Key bindings
  screen.key(['q', 'Q', 'C-c'], () => process.exit(0));
  screen.key(['f1', '1'], () => showTab(0));
  screen.key(['f2', '2'], () => showTab(1));
  screen.key(['f3', '3'], () => showTab(2));
  screen.key(['r'], () => {
    const idx = activeTab;
    if (typeof views[idx].refresh === 'function')
      (views[idx].refresh as () => Promise<void>)();
  });

  // Track active tab changes (already handled by f1/f2/f3 above)
  // Numeric keys
  screen.key(['1', '2', '3'], (ch: string) => {
    const idx = parseInt(ch) - 1;
    if (idx >= 0 && idx < views.length) {
      activeTab = idx;
      showTab(idx);
    }
  });

  // Resize
  screen.on('resize', () => {
    screen.render();
  });

  screen.render();

  // Initial refresh
  views.forEach(v => { if (typeof v.refresh === 'function') setTimeout(() => (v.refresh as () => Promise<void>)(), 500); });
  setInterval(() => { if (typeof views[0].refresh === 'function') (views[0].refresh as () => Promise<void>)(); }, 30000);
}
