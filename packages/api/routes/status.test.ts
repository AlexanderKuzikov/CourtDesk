import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Express } from 'express';
import type { WatchedCase, Notification } from '../../core/types.js';

const storeMock = {
  getStats: vi.fn(() => ({ monitoring: 5, waiting: 2, decision: 1, enforcedToday: 0 })),
  listCases: vi.fn((f?: { status?: string }): WatchedCase[] => []),
  listNotifications: vi.fn((): Notification[] => []),
  markAsRead: vi.fn((uid: string): boolean => true),
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
    storeMock.listNotifications.mockReturnValue([]);
    storeMock.markAsRead.mockReturnValue(true);
    app = await buildNotificationsApp();
  });

  it('возвращает список уведомлений из persistent-хранилища', async () => {
    storeMock.listNotifications.mockReturnValue([
      { uid: 'n1', caseUid: 'c1', type: 'decision', message: 'Решение', read: false, createdAt: '2026-07-22T10:00:00.000Z' },
    ]);
    const { default: supertest } = await import('supertest');
    const res = await (supertest(app) as any).get('/api/notifications');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].type).toBe('decision');
  });

  it('PATCH /api/notifications/:uid/read помечает прочитанным', async () => {
    storeMock.markAsRead.mockReturnValue(true);
    const { default: supertest } = await import('supertest');
    const res = await (supertest(app) as any).patch('/api/notifications/n1/read');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('PATCH 404 если уведомление не найдено', async () => {
    storeMock.markAsRead.mockReturnValue(false);
    const { default: supertest } = await import('supertest');
    const res = await (supertest(app) as any).patch('/api/notifications/ghost/read');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});
