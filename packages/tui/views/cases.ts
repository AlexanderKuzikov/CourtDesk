import blessed from 'neo-blessed';

export function createCasesView(parent: any): {
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

  const help = blessed.box({
    parent: container,
    top: 0,
    left: 0,
    width: '100%',
    height: 2,
    tags: true,
    content: ' {green-fg}F7{/green-fg} — Retry выбранных  {yellow-fg}F8{/yellow-fg} — Архив выбранных  {cyan-fg}r{/cyan-fg} — Обновить  {red-fg}Del{/red-fg} — Удалить',
  });

  // Filter help
  const filterBox = blessed.box({
    parent: container,
    top: 2,
    left: 1,
    width: '100%-2',
    height: 1,
    tags: true,
    content: ' Фильтр: {white-fg}[ВСЕ]{/white-fg}  {yellow-fg}[Только ошибки]{/yellow-fg}  {red-fg}[Хронические (≥3)]{/red-fg}',
  });

  // Case list
  const caseList = blessed.list({
    parent: container,
    top: 3,
    left: 1,
    width: '100%-2',
    height: '100%-5',
    tags: true,
    keys: true,
    vi: true,
    mouse: true,
    scrollbar: { ch: '│', style: { fg: 'blue' } },
    items: [],
    style: {
      item: { fg: 'white' },
      selected: { fg: 'white', bg: 'blue' },
    },
  });

  let allCases: any[] = [];
  let filterMode = 0; // 0: all, 1: errors, 2: chronic

  async function refresh(): Promise<void> {
    try {
      const res = await fetch('http://127.0.0.1:8767/api/cases');
      const json = await res.json();
      allCases = json.data || [];

      applyFilter();
    } catch {
      caseList.setItems(['{red-fg}Не удалось подключиться к серверу{/red-fg}']);
    }
  }

  function applyFilter(): void {
    let filtered = [...allCases];
    if (filterMode === 1) filtered = filtered.filter((c: any) => c.status === 'error');
    if (filterMode === 2) filtered = filtered.filter((c: any) => (c.errorCount || 0) >= 3);

    if (filtered.length === 0) {
      caseList.setItems(['{dim}Нет дел{/dim}']);
      return;
    }

    const items = filtered.map((c: any) => {
      const errInfo = c.errorCount > 0 ? ` {red-fg}[${c.errorCount}x]{/red-fg}` : '';
      const errMsg = c.lastError ? ` {yellow-fg}${c.lastError.slice(0, 60)}{/yellow-fg}` : '';
      let statusIcon = '{green-fg}●{/green-fg}';
      if (c.status === 'error') statusIcon = '{red-fg}●{/red-fg}';
      else if (c.status === 'archived') statusIcon = '{dim}○{/dim}';
      else if (c.status === 'waiting') statusIcon = '{yellow-fg}○{/yellow-fg}';
      return `${statusIcon} ${c.number || '—'} ${c.courtName || c.courtId || ''}${errInfo}${errMsg}`;
    });

    caseList.setItems(items);
  }

  // Keyboard
  setTimeout(() => {
    const scr = container.screen;
    if (!scr) return;
    scr.key(['f7'], async () => {
      const selected = caseList.selected;
      if (selected < 0) return;
      // Retry selected: find the case and run parse/run for it
      // For simplicity, run full retry
      try {
        await fetch('http://127.0.0.1:8767/api/parse/run', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'retry' }),
        });
      } catch {}
      await refresh();
    });
    scr.key(['f8'], async () => {
      const selected = caseList.selected;
      if (selected < 0) return;
      let filtered = getFiltered();
      const c = filtered[selected];
      if (!c) return;
      try {
        await fetch(`http://127.0.0.1:8767/api/cases/${encodeURIComponent(c.uid)}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'archived' }),
        });
      } catch {}
      await refresh();
    });
    scr.key(['delete'], async () => {
      const selected = caseList.selected;
      if (selected < 0) return;
      let filtered = getFiltered();
      const c = filtered[selected];
      if (!c) return;
      try {
        await fetch(`http://127.0.0.1:8767/api/cases/${encodeURIComponent(c.uid)}`, {
          method: 'DELETE',
        });
      } catch {}
      await refresh();
    });
    scr.key(['1'], () => { filterMode = 0; applyFilter(); });
    scr.key(['2'], () => { filterMode = 1; applyFilter(); });
    scr.key(['3'], () => { filterMode = 2; applyFilter(); });
  }, 100);

  function getFiltered(): any[] {
    let filtered = [...allCases];
    if (filterMode === 1) filtered = filtered.filter((c: any) => c.status === 'error');
    if (filterMode === 2) filtered = filtered.filter((c: any) => (c.errorCount || 0) >= 3);
    return filtered;
  }

  return { element: container, refresh };
}
