import blessed from 'neo-blessed';

export function createMonitorView(parent: any): {
  element: any;
  refresh: () => Promise<void>;
} {
  const container = blessed.box({
    parent,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    style: { display: 'none' },
  });

  // Controls
  const controls = blessed.box({
    parent: container,
    top: 0,
    left: 0,
    width: '100%',
    height: 3,
    tags: true,
    content: ' {green-fg}F4{/green-fg} — Полный прогон  {yellow-fg}F5{/yellow-fg} — Retry  {cyan-fg}F6{/cyan-fg} — Новые дела',
  });

  // Progress bar area
  const progressBox = blessed.box({
    parent: container,
    top: 3,
    left: 1,
    width: '100%-2',
    height: 2,
    tags: true,
    content: '',
  });

  // Live log
  const logBox = blessed.log({
    parent: container,
    top: 5,
    left: 1,
    width: '100%-2',
    height: '100%-6',
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: '│', style: { fg: 'blue' } },
  });

  let polling = false;

  async function startPoll(mode: string): Promise<void> {
    try {
      const res = await fetch('http://127.0.0.1:8767/api/parse/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const json = await res.json();
      if (res.status === 409) {
        logBox.log('{yellow-fg}⚠ Прогон уже выполняется{/yellow-fg}');
      } else if (!res.ok) {
        logBox.log(`{red-fg}❌ Ошибка: ${json.error}{/red-fg}`);
        return;
      } else {
        logBox.log(`{green-fg}▶ Запущен ${mode}-прогон{/green-fg}`);
      }
    } catch {
      logBox.log('{red-fg}❌ Ошибка соединения{/red-fg}');
      return;
    }

    if (polling) return;
    polling = true;

    const poll = setInterval(async () => {
      try {
        const res = await fetch('http://127.0.0.1:8767/api/parse/progress');
        const json = await res.json();
        const p = json.data || {};

        if (p.total > 0) {
          progressBox.setContent(` Прогресс: ${p.processed}/${p.total}  |  Ошибок: {red-fg}${p.errors}{/red-fg}`);
        }

        if (!p.running) {
          clearInterval(poll);
          polling = false;
          progressBox.setContent(` Прогресс: {green-fg}ЗАВЕРШЁН{/green-fg}  |  Обработано: ${p.processed}  |  Ошибок: {red-fg}${p.errors}{/red-fg}`);
          logBox.log('{green-fg}✓ Прогон завершён{/green-fg}');
        }
      } catch {
        // ignore
      }
    }, 2000);
  }

  async function refresh(): Promise<void> {
    // Just show current state
    try {
      const res = await fetch('http://127.0.0.1:8767/api/parse/progress');
      const json = await res.json();
      const p = json.data || {};
      if (p.running) {
        progressBox.setContent(` Прогресс: ${p.processed}/${p.total}  |  Ошибок: {red-fg}${p.errors}{/red-fg}`);
        if (!polling) {
          polling = true;
          const poll = setInterval(async () => {
            try {
              const r = await fetch('http://127.0.0.1:8767/api/parse/progress');
              const j = await r.json();
              const d = j.data || {};
              if (d.total > 0) progressBox.setContent(` Прогресс: ${d.processed}/${d.total}  |  Ошибок: {red-fg}${d.errors}{/red-fg}`);
              if (!d.running) { clearInterval(poll); polling = false; progressBox.setContent(' Прогресс: {green-fg}ЗАВЕРШЁН{/green-fg}'); }
            } catch {}
          }, 2000);
        }
      } else {
        progressBox.setContent(' Ожидание команд');
      }
    } catch {
      progressBox.setContent('{red-fg} Сервер недоступен{/red-fg}');
    }
  }

  // Bind keys to parent's screen (will be set from app)
  setTimeout(() => {
    const scr = container.screen;
    if (!scr) return;
    scr.key(['f4'], () => startPoll('full'));
    scr.key(['f5'], () => startPoll('retry'));
    scr.key(['f6'], () => startPoll('new'));
  }, 100);

  return { element: container, refresh };
}
