import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Express } from 'express';

const DEFAULTS = {
  scheduleFull: '03:00',
  retryIntervalHours: 3,
  retryStaleHours: 6,
  scheduleEnabled: true,
};

const storeMock = {
  getSettings: vi.fn(() => DEFAULTS),
  updateSettings: vi.fn((u: Record<string, unknown>) => ({ ...DEFAULTS, ...u })),
};

vi.mock('../../store/index.js', () => storeMock);

async function buildApp(): Promise<Express> {
  const { default: settingsRouter } = await import('./settings.js');
  const app = express();
  app.use(express.json());
  app.use(settingsRouter);
  return app;
}

describe('GET /api/settings', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it('возвращает настройки', async () => {
    const { default: supertest } = await import('supertest');
    const res = await (supertest(app) as any).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.data.scheduleFull).toBe('03:00');
    expect(res.body.data.scheduleEnabled).toBe(true);
  });
});

describe('PUT /api/settings', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it('обновляет разрешённые поля', async () => {
    const { default: supertest } = await import('supertest');
    const res = await (supertest(app) as any).put('/api/settings')
      .send({ scheduleFull: '06:00', retryIntervalHours: 6 })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body.data.scheduleFull).toBe('06:00');
    expect(res.body.data.retryIntervalHours).toBe(6);
    expect(storeMock.updateSettings).toHaveBeenCalledWith({ scheduleFull: '06:00', retryIntervalHours: 6 });
  });

  it('фильтрует неразрешённые поля', async () => {
    const { default: supertest } = await import('supertest');
    const res = await (supertest(app) as any).put('/api/settings')
      .send({ scheduleFull: '05:00', maliciousField: 'inject' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(200);
    expect(storeMock.updateSettings).toHaveBeenCalledWith({ scheduleFull: '05:00' });
    expect(storeMock.updateSettings.mock.calls[0][0]).not.toHaveProperty('maliciousField');
  });
});
