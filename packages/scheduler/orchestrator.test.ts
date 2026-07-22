import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WatchedCase, CaseHistoryEvent, SearchResult } from '../core/types.js';

vi.mock('iconv-lite', () => ({ default: { decode: vi.fn((b: Buffer) => b.toString()) } }));

const storeMock = {
  listCases: vi.fn((): WatchedCase[] => []),
  updateCase: vi.fn((): WatchedCase | null => null),
  addEvent: vi.fn((): void => undefined),
  getCase: vi.fn((): WatchedCase | null => null),
  getEvents: vi.fn((): CaseHistoryEvent[] => []),
};
const searchAdapter = {
  searchByParty: vi.fn(async (): Promise<SearchResult[]> => []),
  searchByCaseNumber: vi.fn(async (): Promise<SearchResult[]> => []),
};

vi.mock('../store/index.js', () => storeMock);
vi.mock('../parse/index.js', () => ({ getParseAdapter: vi.fn() }));
vi.mock('../search/index.js', () => ({ getSearchAdapter: vi.fn(() => searchAdapter) }));

describe('makeEvent — создание событий истории (NEW-001)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('создаёт событие с корректными полями', async () => {
    const { makeEvent } = await import('./orchestrator.js');
    const ev = makeEvent('uid-1', 'decision', 'Вынесено решение: Удовлетворено');
    expect(ev.uid).toBeTruthy();
    expect(ev.caseUid).toBe('uid-1');
    expect(ev.type).toBe('decision');
    expect(ev.message).toBe('Вынесено решение: Удовлетворено');
    expect(ev.data).toEqual({});
    expect(ev.createdAt).toBeTruthy();
  });

  it('принимает и сохраняет data', async () => {
    const { makeEvent } = await import('./orchestrator.js');
    const ev = makeEvent('uid-2', 'enforced', 'Вступило', { legalForceDate: '2026-07-22' });
    expect(ev.data).toEqual({ legalForceDate: '2026-07-22' });
  });

  it('caseUid — строка, не пустая (регрессия NEW-001)', async () => {
    const { makeEvent } = await import('./orchestrator.js');
    const ev = makeEvent('uid-3', 'found', 'Найдено');
    expect(typeof ev.caseUid).toBe('string');
    expect(ev.caseUid.length).toBeGreaterThan(0);
  });
});
