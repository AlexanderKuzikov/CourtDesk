import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import type { Express } from 'express';

// Мокаем весь store, чтобы не трогать файловую систему
const storeMock = {
  listCases: vi.fn(() => []),
  getCase: vi.fn(() => null),
  addCase: vi.fn(),
  updateCase: vi.fn(() => null),
  deleteCase: vi.fn(() => false),
  getStats: vi.fn(() => ({ monitoring: 0, waiting: 0, decision: 0, enforcedToday: 0 })),
};

const eventsMock = {
  addEvent: vi.fn(),
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
  if (body) r.send(body).set('Content-Type', 'application/json');
  return r;
}

describe('PATCH /api/cases/:uid — whitelist (BUG-004)', () => {
  let app: Express;

  beforeEach(async () => {
    vi.resetModules();
    Object.values(storeMock).forEach(fn => (fn as any).mockReset?.());
    storeMock.updateCase.mockReturnValue({ uid: 'u1', status: 'decision' });
    app = await buildApp();
  });

  it('пропускает разрешённое поле status', async () => {
    const res = await req(app, 'patch', '/api/cases/u1', { status: 'decision' });
    expect(res.status).toBe(200);
    expect(storeMock.updateCase).toHaveBeenCalledWith('u1', { status: 'decision' });
  });

  it('отфильтровывает uid из PATCH-тела', async () => {
    await req(app, 'patch', '/api/cases/u1', { uid: 'injected', status: 'enforced' });
    const [, updates] = storeMock.updateCase.mock.calls[0];
    expect(updates).not.toHaveProperty('uid');
    expect(updates).toHaveProperty('status', 'enforced');
  });

  it('отфильтровывает createdAt из PATCH-тела', async () => {
    await req(app, 'patch', '/api/cases/u1', { createdAt: '1970-01-01', status: 'monitoring' });
    const [, updates] = storeMock.updateCase.mock.calls[0];
    expect(updates).not.toHaveProperty('createdAt');
  });

  it('отфильтровывает courtType из PATCH-тела', async () => {
    await req(app, 'patch', '/api/cases/u1', { courtType: 'appeal', status: 'monitoring' });
    const [, updates] = storeMock.updateCase.mock.calls[0];
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
    vi.resetModules();
    Object.values(storeMock).forEach(fn => (fn as any).mockReset?.());
    app = await buildApp();
  });

  it('404 на удаление несуществующего', async () => {
    storeMock.deleteCase.mockReturnValue(false);
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
    vi.resetModules();
    Object.values(storeMock).forEach(fn => (fn as any).mockReset?.());
    app = await buildApp();
  });

  it('400 если нет party', async () => {
    const res = await req(app, 'post', '/api/cases/wait', { courtId: 'kirov--perm', courtType: 'district' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_REQUEST');
  });

  it('создаёт waiting-дело со всеми обязательными полями', async () => {
    const res = await req(app, 'post', '/api/cases/wait', {
      courtId: 'kirov--perm', courtType: 'district', party: 'Иванов Иван', filingDate: '2026-06-01',
    });
    expect(res.status).toBe(200);
    const [c] = storeMock.addCase.mock.calls[0];
    expect(c.status).toBe('waiting');
    expect(c.url).toBe('');
    expect(c.number).toBe('');
  });
});
