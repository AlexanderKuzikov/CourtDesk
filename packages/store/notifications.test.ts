import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStore: { data: any[] } = { data: [] };

vi.mock('./json-store.js', () => ({
  readJson: vi.fn((_file: string, fallback: any) => fallback ?? mockStore.data),
  writeJson: vi.fn((_file: string, d: any) => { mockStore.data = d; }),
}));

describe('notifications store', () => {
  beforeEach(() => {
    mockStore.data = [];
    vi.resetModules();
  });

  it('addNotification + listNotifications', async () => {
    const { addNotification, listNotifications } = await import('./notifications.js');
    addNotification({ uid: 'n1', caseUid: 'c1', type: 'decision', message: 'Решение', read: false, createdAt: 'now' });
    const list = listNotifications();
    expect(list).toHaveLength(1);
    expect(list[0].uid).toBe('n1');
  });

  it('markAsRead', async () => {
    const { addNotification, listNotifications, markAsRead } = await import('./notifications.js');
    addNotification({ uid: 'n2', caseUid: 'c2', type: 'enforced', message: 'Вступило', read: false, createdAt: 'now' });
    const ok = markAsRead('n2');
    expect(ok).toBe(true);
    const list = listNotifications();
    expect(list[0].read).toBe(true);
  });

  it('markAsRead — false для несуществующего uid', async () => {
    const { markAsRead } = await import('./notifications.js');
    expect(markAsRead('ghost')).toBe(false);
  });

  it('clearNotifications', async () => {
    const { addNotification, listNotifications, clearNotifications } = await import('./notifications.js');
    addNotification({ uid: 'n3', caseUid: 'c3', type: 'found', message: 'Найдено', read: false, createdAt: 'now' });
    clearNotifications();
    expect(listNotifications()).toHaveLength(0);
  });
});
