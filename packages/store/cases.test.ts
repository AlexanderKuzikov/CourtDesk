import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---- Мок файловой системы --- 
// запускаем до импорта модульа, чтобы перехватить чтение файлов
vi.mock('./json-store.js', () => ({
  readJson: vi.fn(() => ({})),
  writeJson: vi.fn(),
}));

import { readJson, writeJson } from './json-store.js';

// Перезагружаем модуль через dynamic import после vi.mock
async function importFresh() {
  const mod = await import('./cases.js?t=' + Date.now());
  return mod;
}

import type { WatchedCase } from '../core/types.js';

function makeCase(overrides: Partial<WatchedCase> = {}): WatchedCase {
  return {
    uid: 'test-uid-1',
    url: 'https://kirov--perm.sudrf.ru/modules.php?name_op=case&case_id=1',
    courtId: 'kirov--perm',
    courtCode: 'kirov--perm',
    courtType: 'district',
    number: '2-100/2026',
    caseUid: null,
    enforcedAt: null,
    status: 'monitoring',
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

describe('store/cases — in-memory cache (BUG-009)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(readJson).mockReturnValue({});
    vi.mocked(writeJson).mockClear();
  });

  it('читает readJson ровно один раз при нескольких вызовах', async () => {
    const { listCases, addCase, getCase } = await import('./cases.js');
    const c = makeCase();
    addCase(c);
    getCase(c.uid);
    listCases();
    // readJson должен быть вызван ровно 1 раз (при первом load)
    expect(vi.mocked(readJson).mock.calls.length).toBe(1);
  });

  it('записывает writeJson при addCase', async () => {
    const { addCase } = await import('./cases.js');
    addCase(makeCase());
    expect(vi.mocked(writeJson)).toHaveBeenCalledTimes(1);
  });

  it('getCase возвращает null для несуществующего uid', async () => {
    const { getCase } = await import('./cases.js');
    expect(getCase('no-such-uid')).toBeNull();
  });
});

describe('store/cases — deleteCase без лишней I/O (BUG-006)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(readJson).mockReturnValue({});
    vi.mocked(writeJson).mockClear();
  });

  it('не записывает файл если uid не существует', async () => {
    const { deleteCase } = await import('./cases.js');
    const result = deleteCase('ghost-uid');
    expect(result).toBe(false);
    expect(vi.mocked(writeJson)).not.toHaveBeenCalled();
  });

  it('удаляет существующую запись и пишет файл', async () => {
    const { addCase, deleteCase } = await import('./cases.js');
    const c = makeCase({ uid: 'del-me' });
    addCase(c);
    vi.mocked(writeJson).mockClear();
    const result = deleteCase('del-me');
    expect(result).toBe(true);
    expect(vi.mocked(writeJson)).toHaveBeenCalledTimes(1);
  });
});

describe('store/cases — updateCase', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(readJson).mockReturnValue({});
    vi.mocked(writeJson).mockClear();
  });

  it('возвращает null если uid не найден', async () => {
    const { updateCase } = await import('./cases.js');
    expect(updateCase('no-uid', { status: 'enforced' })).toBeNull();
  });

  it('обновляет статус и выставляет updatedAt', async () => {
    const { addCase, updateCase, getCase } = await import('./cases.js');
    const c = makeCase({ uid: 'upd-me' });
    addCase(c);
    const updated = updateCase('upd-me', { status: 'decision' });
    expect(updated?.status).toBe('decision');
    expect(updated?.updatedAt).not.toBe(c.updatedAt);
    expect(getCase('upd-me')?.status).toBe('decision');
  });
});

describe('store/cases — getStats', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(readJson).mockReturnValue({});
    vi.mocked(writeJson).mockClear();
  });

  it('возвращает правильные счётчики из одного load()', async () => {
    const { addCase, getStats } = await import('./cases.js');
    addCase(makeCase({ uid: 'a', status: 'monitoring' }));
    addCase(makeCase({ uid: 'b', status: 'waiting' }));
    addCase(makeCase({ uid: 'c', status: 'decision' }));
    const today = new Date().toISOString().slice(0, 10);
    addCase(makeCase({ uid: 'd', status: 'enforced', legalForceDate: today }));

    const writeCallsBefore = vi.mocked(readJson).mock.calls.length;
    const stats = getStats();
    // не должно было дополнительных readJson после первого load благодаря кэшу
    expect(vi.mocked(readJson).mock.calls.length).toBe(writeCallsBefore);
    expect(stats.monitoring).toBe(1);
    expect(stats.waiting).toBe(1);
    expect(stats.decision).toBe(1);
    expect(stats.enforcedToday).toBe(1);
  });
});
