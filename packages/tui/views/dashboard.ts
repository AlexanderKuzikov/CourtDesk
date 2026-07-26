import blessed from 'neo-blessed';

export function createDashboardView(parent: any): {
  element: any;
  refresh: () => Promise<void>;
} {
  const container = blessed.box({
    parent,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    style: { display: 'block' },
  });

  // Stats area
  const statsBox = blessed.box({
    parent: container,
    top: 0,
    left: 0,
    width: '100%',
    height: 7,
    tags: true,
    content: ' Загрузка...',
  });

  // Recent log area
  const logLabel = blessed.box({
    parent: container,
    top: 7,
    left: 1,
    width: '100%-2',
    height: 1,
    content: ' Последние логи:',
    style: { fg: 'cyan', bold: true },
  });

  const logContent = blessed.box({
    parent: container,
    top: 8,
    left: 1,
    width: '100%-2',
    height: '100%-9',
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: '│', style: { fg: 'blue' } },
    content: '',
  });

  let logLines: string[] = [];
  const MAX_LOG = 100;

  function addLog(msg: string): void {
    logLines.push(msg);
    if (logLines.length > MAX_LOG) logLines = logLines.slice(-MAX_LOG);
    logContent.setContent(logLines.join('\n'));
    logContent.setScrollPerc(100);
  }

  async function refresh(): Promise<void> {
    try {
      const [statusRes, casesRes, progressRes] = await Promise.all([
        fetch('http://127.0.0.1:8767/api/status').then(r => r.json()),
        fetch('http://127.0.0.1:8767/api/cases').then(r => r.json()),
        fetch('http://127.0.0.1:8767/api/parse/progress').then(r => r.json()),
      ]);

      const s = statusRes.data || {};
      const cases = casesRes.data || [];
      const prog = progressRes.data || {};

      const statuses: Record<string, number> = {};
      cases.forEach((c: any) => { statuses[c.status] = (statuses[c.status] || 0) + 1; });
      const errors = cases.filter((c: any) => c.status === 'error');
      const chronic = errors.filter((c: any) => (c.errorCount || 0) >= 3);

      let content = '';
      content += ` Мониторинг: ${s.monitoring ?? statuses['monitoring'] ?? 0}\n`;
      content += ` Ожидание:   ${s.waiting ?? statuses['waiting'] ?? 0}\n`;
      content += ` Решение:    ${s.decision ?? statuses['decision'] ?? 0}\n`;
      content += ` Вступило:   ${s.enforcedToday ?? 0}\n`;
      content += ` Ошибок:     ${errors.length} (хронических: ${chronic.length})\n`;

      if (prog.running) {
        content += `\n Прогресс: ${prog.processed}/${prog.total} (ошибок: ${prog.errors})`;
      }

      statsBox.setContent(content);

      // Log
      addLog(`[${new Date().toLocaleTimeString()}] Обновлено: ${cases.length} дел`);
      if (chronic.length > 0) {
        chronic.forEach((c: any) => {
          addLog(`{red-fg}⚠ ХРОНИЧЕСКАЯ ОШИБКА (${c.errorCount}x): ${c.number} — ${c.lastError}{/red-fg}`);
        });
      }
    } catch {
      statsBox.setContent(' Не удалось подключиться к серверу\n Убедитесь, что сервер запущен на http://127.0.0.1:8767');
      addLog('{red-fg}Ошибка соединения с API{/red-fg}');
    }
  }

  return { element: container, refresh };
}
