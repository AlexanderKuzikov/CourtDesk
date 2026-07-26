import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WatchedCase, CaseHistoryEvent, SearchResult } from '../core/types.js';

const storeMock = {
  listCases: vi.fn((): WatchedCase[] => []),
  updateCase: vi.fn((): WatchedCase | null => null),
  addEvent: vi.fn((): void => undefined),
  getCase: vi.fn((): WatchedCase | null => null),
  getEvents: vi.fn((): CaseHistoryEvent[] => []),
  addNotification: vi.fn((): void => undefined),
  saveCard: vi.fn((): void => undefined),
};

const searchAdapter = {
  searchByParty: vi.fn(async (): Promise<SearchResult[]> => []),
  searchByCaseNumber: vi.fn(async (): Promise<SearchResult[]> => []),
};

vi.mock('../store/index.js', () => storeMock);
vi.mock('iconv-lite', () => ({ default: { decode: vi.fn((b: Buffer) => b.toString()) } }));
vi.mock('../parse/index.js', () => ({ getParseAdapter: vi.fn() }));
vi.mock('../search/index.js', () => ({ getSearchAdapter: vi.fn(() => searchAdapter) }));

function makeWaiting(overrides: Partial<WatchedCase> = {}): WatchedCase {
  return {
    uid: 'w1',
    url: '',
    courtId: 'kirov--perm',
    courtCode: 'kirov--perm',
    courtType: 'district',
    number: '',
    caseUid: null,
    enforcedAt: null,
    status: 'waiting',
    result: null,
    legalForceDate: null,
    legalForceNotified: false,
    userId: null,
    lastChecked: null,
    createdAt: '2026-07-21T10:00:00.000Z',
    updatedAt: '2026-07-21T10:00:00.000Z',
    errorCount: 0,
    lastError: null,
    ...overrides,
  };
}

function makeWaitEvent(caseUid: string, party: string, filingDate?: string): CaseHistoryEvent {
  return {
    uid: crypto.randomUUID(),
    caseUid,
    type: 'waiting',
    message: '',
    data: { party, ...(filingDate ? { filingDate } : {}) },
    createdAt: '2026-07-21T10:00:00.000Z',
  };
}

describe('runNew — waiting-кейсы через searchByParty (BUG-002)', () => {
  beforeEach(() => {
    vi.resetModules();
    storeMock.listCases.mockReturnValue([]);
    storeMock.getEvents.mockReturnValue([]);
    storeMock.updateCase.mockReturnValue(null);
    storeMock.addEvent.mockReturnValue(undefined);
    searchAdapter.searchByParty.mockReset();
    searchAdapter.searchByParty.mockResolvedValue([]);
  });

  it('если дел нет — ok=0, fail=0', async () => {
    const { runNew } = await import('./orchestrator.js');
    const result = await runNew();
    expect(result).toEqual({ ok: 0, fail: 0 });
  });

  it('без waiting-события — не вызывает searchByParty', async () => {
    const c = makeWaiting();
    storeMock.listCases.mockImplementation((f?: { status?: string }) =>
      f?.status === 'waiting' ? [c] : []
    );
    storeMock.getEvents.mockReturnValue([]); // нет waiting-события
    const { runNew } = await import('./orchestrator.js');
    await runNew();
    expect(searchAdapter.searchByParty).not.toHaveBeenCalled();
  });

  it('нашёл дело — обновляет статус в monitoring и url', async () => {
    const c = makeWaiting({ uid: 'w2' });
    storeMock.listCases.mockImplementation((f?: { status?: string }) =>
      f?.status === 'waiting' ? [c] : []
    );
    storeMock.getEvents.mockReturnValue([makeWaitEvent('w2', 'Иванов Иван', '2026-06-01')]);
    storeMock.updateCase.mockReturnValue({ ...c, status: 'monitoring', url: 'https://kirov--perm.sudrf.ru/modules.php?name_op=case&case_id=1' });

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

  it('ничего не нашло — обновляет lastChecked', async () => {
    const c = makeWaiting({ uid: 'w3' });
    storeMock.listCases.mockImplementation((f?: { status?: string }) =>
      f?.status === 'waiting' ? [c] : []
    );
    storeMock.getEvents.mockReturnValue([makeWaitEvent('w3', 'Сидоров Семён')]);
    searchAdapter.searchByParty.mockResolvedValue([]);

    const { runNew } = await import('./orchestrator.js');
    const result = await runNew();
    expect(result.ok).toBe(1);
    expect(storeMock.updateCase).toHaveBeenCalledWith('w3', expect.objectContaining({ lastChecked: expect.any(String) }));
  });
});
