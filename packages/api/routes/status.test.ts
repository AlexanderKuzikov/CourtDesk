import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Express } from 'express';
import type { WatchedCase } from '../../core/types.js';

const storeMock = {
  getStats: vi.fn(() => ({ monitoring: 5, waiting: 2, decision: 1, enforcedToday: 0 })),
  listCases: vi.fn((f?: { status?: string }): WatchedCase[] => []),
};

vi.mock('../../store/index.js', () => storeMock);

async function buildStatusApp(): Promise<Express> {
  const { default: statusRouter } = await import('./status.js');
  const app = express();
  app.use(statusRouter);
  return app;
}

async function buildNotificationsApp(): Promise<Express> {
  const { default: notifRouter } = await import('./notifications.js');
  const app = express();
  app.use(notifRouter);
  return app;
}

describe('GET /api/status (NEW-003)', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    storeMock.getStats.mockReturnValue({ monitoring: 5, waiting: 2, decision: 1, enforcedToday: 0 });
    storeMock.listCases.mockReturnValue([]);
    app = await buildStatusApp();
  });

  it('возвращает все счётчики и health: ok', async () => {
    const { default: supertest } = await import('supertest');
    const res = await (supertest(app) as any).get('/api/status');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      monitoring: 5, waiting: 2, decision: 1, enforcedToday: 0, health: 'ok',
    });
  });

  it('возвращает health: error при ошибке хранилища', async () => {
    storeMock.getStats.mockImplementation(() => { throw new Error('store error'); });
    const { default: supertest } = await import('supertest');
    const res = await (supertest(app) as any).get('/api/status');
    expect(res.status).toBe(500);
    expect(res.body.data.health).toBe('error');
  });
});

describe('GET /api/notifications (NEW-003)', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    storeMock.getStats.mockReturnValue({ monitoring: 0, waiting: 0, decision: 0, enforcedToday: 0 });
    app = await buildNotificationsApp();
  });

  it('возвращает список уведомлений', async () => {
    const { default: supertest } = await import('supertest');
    const res = await (supertest(app) as any).get('/api/notifications');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
