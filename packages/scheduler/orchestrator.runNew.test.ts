import { describe, it, expect, vi, beforeEach } from 'vitest';

// Мокаем зависимости оркестратора до его импорта
const storeMock = {
  listCases: vi.fn(),
  updateCase: vi.fn(),
  addEvent: vi.fn(),
  getCase: vi.fn(() => null),
  getEvents: vi.fn(() => []),
};

const searchAdapter = {
  searchByParty: vi.fn(async () => []),
  searchByCaseNumber: vi.fn(async () => []),
};

vi.mock('../store/index.js', () => storeMock);
vi.mock('iconv-lite', () => ({ default: { decode: vi.fn((b: Buffer) => b.toString()) } }));
vi.mock('../parse/index.js', () => ({ getParseAdapter: vi.fn() }));
vi.mock('../search/index.js', () => ({ getSearchAdapter: vi.fn(() => searchAdapter) }));

import type { WatchedCase } from '../core/types.js';

function makeWaiting(overrides: Partial<WatchedCase> = {}): WatchedCase {
  return {
    uid: 'w1',
    url: '',
    courtId: 'kirov--perm',
    courtCode: 'kirov--perm',
    courtType: 'district',
    number: '',
    status: 'waiting',
    result: null,
    legalForceDate: null,
    legalForceNotified: false,
    userId: null,
    lastChecked: null,
    createdAt: '2026-07-21T10:00:00.000Z',
    updatedAt: '2026-07-21T10:00:00.000Z',
    ...overrides,
  };
}

describe('runNew — waiting-кейсы через searchByParty (BUG-002)', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(storeMock).forEach(fn => (fn as any).mockReset?.());
    searchAdapter.searchByParty.mockReset();
    storeMock.listCases.mockReturnValue([]);
    storeMock.getEvents.mockReturnValue([]);
  });

  it('если дел нет — ок=0, fail=0', async () => {
    storeMock.listCases.mockReturnValue([]);
    const { runNew } = await import('./orchestrator.js');
    const result = await runNew();
    expect(result).toEqual({ ok: 0, fail: 0 });
  });

  it('без waiting-события — не вызывает searchByParty', async () => {
    const c = makeWaiting();
    storeMock.listCases.mockImplementation((f: any) =>
      f?.status === 'waiting' ? [c] : []
    );
    storeMock.getEvents.mockReturnValue([]); // нет waiting-события
    const { runNew } = await import('./orchestrator.js');
    await runNew();
    expect(searchAdapter.searchByParty).not.toHaveBeenCalled();
  });

  it('нашёл дело — обновляет статус в monitoring и url', async () => {
    const c = makeWaiting({ uid: 'w2' });
    storeMock.listCases.mockImplementation((f: any) =>
      f?.status === 'waiting' ? [c] : []
    );
    storeMock.getEvents.mockReturnValue([
      {
        uid: 'e1', caseUid: 'w2', type: 'waiting',
        message: 'Ожидается',
        data: { party: 'Иванов Иван', filingDate: '2026-06-01' },
        createdAt: '2026-07-21T10:00:00.000Z',
      },
    ]);
    searchAdapter.searchByParty.mockResolvedValue([{
      caseNumber: '2-100/2026',
      caseUrl: 'https://kirov--perm.sudrf.ru/modules.php?name_op=case&case_id=1',
      uid: 'w2',
      judge: null, result: null, legalForceDate: null, filingDate: '2026-06-01',
      decisionDate: null, parties: [], courtId: 'kirov--perm', courtType: 'district',
    }]);

    const { runNew } = await import('./orchestrator.js');
    const result = await runNew();
    expect(result.ok).toBe(1);
    expect(storeMock.updateCase).toHaveBeenCalledWith('w2', expect.objectContaining({
      status: 'monitoring',
      url: 'https://kirov--perm.sudrf.ru/modules.php?name_op=case&case_id=1',
      number: '2-100/2026',
    }));
    expect(storeMock.addEvent).toHaveBeenCalledWith('w2', expect.objectContaining({ type: 'found' }));
  });

  it('ничего не нашло — обновляет lastChecked, ok=1', async () => {
    const c = makeWaiting({ uid: 'w3' });
    storeMock.listCases.mockImplementation((f: any) =>
      f?.status === 'waiting' ? [c] : []
    );
    storeMock.getEvents.mockReturnValue([
      {
        uid: 'e2', caseUid: 'w3', type: 'waiting',
        message: '',
        data: { party: 'Сидоров Семён' },
        createdAt: '2026-07-21T10:00:00.000Z',
      },
    ]);
    searchAdapter.searchByParty.mockResolvedValue([]);

    const { runNew } = await import('./orchestrator.js');
    const result = await runNew();
    expect(result.ok).toBe(1);
    expect(storeMock.updateCase).toHaveBeenCalledWith('w3', expect.objectContaining({ lastChecked: expect.any(String) }));
  });
});
