import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import type { Express } from 'express';
import type { WatchedCase, CaseHistoryEvent } from '../../core/types.js';

const baseCase: WatchedCase = {
  uid: 'u1',
  url: 'https://kirov--perm.sudrf.ru/modules.php?name_op=case&case_id=1',
  courtId: 'kirov--perm',
  courtCode: 'kirov--perm',
  courtType: 'district',
  number: '2-100/2026',
  status: 'monitoring',
  result: null,
  legalForceDate: null,
  legalForceNotified: false,
  userId: null,
  lastChecked: null,
  createdAt: '2026-07-21T10:00:00.000Z',
  updatedAt: '2026-07-21T10:00:00.000Z',
};

const storeMock = {
  listCases: vi.fn((f?: { status?: string; userId?: string; courtId?: string; q?: string }): WatchedCase[] => []),
  getCase: vi.fn((uid: string): WatchedCase | null => null),
  addCase: vi.fn((c: WatchedCase): void => undefined),
  updateCase: vi.fn((uid: string, updates: Partial<WatchedCase>): WatchedCase | null => null),
  deleteCase: vi.fn((uid: string): boolean => false),
  getStats: vi.fn(() => ({ monitoring: 0, waiting: 0, decision: 0, enforcedToday: 0 })),
};

const eventsMock = {
  addEvent: vi.fn((caseUid: string, event: CaseHistoryEvent): void => undefined),
};

vi.mock('../../store/index.js', () => storeMock);
vi.mock('../../store/events.js', () => eventsMock);

async function buildApp(): Promise<Express> {
  const { default: casesRouter } = await import('./cases.js');
  const app = express();
  app.use(express.json());
  app.use(casesRouter);
  return app;
}

async function req(app: Express, method: string, path: string, body?: unknown) {
  const { default: supertest } = await import('supertest');
  const r = (supertest(app) as any)[method](path);
  if (body !== undefined) r.send(body).set('Content-Type', 'application/json');
  return r;
}

describe('PATCH /api/cases/:uid — whitelist (BUG-004)', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    storeMock.listCases.mockReturnValue([]);
    storeMock.getCase.mockReturnValue(null);
    storeMock.updateCase.mockReturnValue({ ...baseCase, status: 'decision' });
    storeMock.deleteCase.mockReturnValue(false);
    app = await buildApp();
  });

  it('пропускает разрешённое поле status', async () => {
    const res = await req(app, 'patch', '/api/cases/u1', { status: 'decision' });
    expect(res.status).toBe(200);
    expect(storeMock.updateCase).toHaveBeenCalledWith('u1', { status: 'decision' });
  });

  it('отфильтровывает uid из PATCH-тела', async () => {
    await req(app, 'patch', '/api/cases/u1', { uid: 'injected', status: 'enforced' });
    const updates = storeMock.updateCase.mock.calls[0]?.[1];
    expect(updates).not.toHaveProperty('uid');
    expect(updates).toHaveProperty('status', 'enforced');
  });

  it('отфильтровывает createdAt из PATCH-тела', async () => {
    await req(app, 'patch', '/api/cases/u1', { createdAt: '1970-01-01', status: 'monitoring' });
    const updates = storeMock.updateCase.mock.calls[0]?.[1];
    expect(updates).not.toHaveProperty('createdAt');
  });

  it('отфильтровывает courtType из PATCH-тела', async () => {
    await req(app, 'patch', '/api/cases/u1', { courtType: 'appeal', status: 'monitoring' });
    const updates = storeMock.updateCase.mock.calls[0]?.[1];
    expect(updates).not.toHaveProperty('courtType');
  });

  it('404 если дело не найдено', async () => {
    storeMock.updateCase.mockReturnValue(null);
    const res = await req(app, 'patch', '/api/cases/ghost', { status: 'monitoring' });
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});

describe('DELETE /api/cases/:uid — не пишет если uid нет (BUG-006)', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    storeMock.deleteCase.mockReturnValue(false);
    app = await buildApp();
  });

  it('404 на удаление несуществующего', async () => {
    const res = await req(app, 'delete', '/api/cases/ghost');
    expect(res.status).toBe(404);
  });

  it('200 на удаление существующего', async () => {
    storeMock.deleteCase.mockReturnValue(true);
    const res = await req(app, 'delete', '/api/cases/real-uid');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /api/cases/wait — waiting-кейс', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    storeMock.addCase.mockImplementation(() => undefined);
    eventsMock.addEvent.mockImplementation(() => undefined);
    app = await buildApp();
  });

  it('400 если нет party', async () => {
    const res = await req(app, 'post', '/api/cases/wait', { courtId: 'kirov--perm', courtType: 'district' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_REQUEST');
  });

  it('создаёт waiting-дело со всеми обязательными полями', async () => {
    storeMock.updateCase.mockReturnValue(null);
    const res = await req(app, 'post', '/api/cases/wait', {
      courtId: 'kirov--perm', courtType: 'district', party: 'Иванов Иван', filingDate: '2026-06-01',
    });
    expect(res.status).toBe(200);
    const c = storeMock.addCase.mock.calls[0]?.[0] as WatchedCase;
    expect(c.status).toBe('waiting');
    expect(c.url).toBe('');
    expect(c.number).toBe('');
  });
});
