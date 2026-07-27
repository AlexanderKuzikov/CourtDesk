import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Express } from 'express';

const runFull = vi.fn(async () => ({ ok: 5, fail: 0 }));
const runRetry = vi.fn(async () => ({ ok: 2, fail: 1 }));
const runNew = vi.fn(async () => ({ ok: 3, fail: 0 }));

const progress = { running: false, total: 0, processed: 0, errors: 0 };

const mockCore = {
  findCourtByCodeOrSubdomain: vi.fn(() => null),
  getProgress: vi.fn(() => progress),
  setProgress: vi.fn(),
  resetProgress: vi.fn(),
};

vi.mock('../../scheduler/index.js', () => ({ runFull, runRetry, runNew }));
vi.mock('../../parse/index.js', () => ({ getParseAdapter: vi.fn() }));
vi.mock('../../core/index.js', () => mockCore);
vi.mock('../../captcha/session.js', () => ({ fetchWithCaptcha: vi.fn() }));
vi.mock('../../core/config.js', () => ({ getRuCaptchaKey: vi.fn(() => '') }));

async function buildApp(): Promise<Express> {
  const { default: parseRouter } = await import('./parse.js');
  const app = express();
  app.use(express.json());
  app.use(parseRouter);
  return app;
}

describe('GET /api/parse/progress', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    progress.running = false;
    progress.total = 0;
    progress.processed = 0;
    progress.errors = 0;
    app = await buildApp();
  });

  it('возвращает текущий прогресс', async () => {
    progress.running = true;
    progress.total = 10;
    progress.processed = 4;
    progress.errors = 1;
    const { default: supertest } = await import('supertest');
    const res = await (supertest(app) as any).get('/api/parse/progress');
    expect(res.status).toBe(200);
    expect(res.body.data.running).toBe(true);
    expect(res.body.data.processed).toBe(4);
    expect(res.body.data.errors).toBe(1);
  });

  it('возвращает idle состояние когда прогон не запущен', async () => {
    const { default: supertest } = await import('supertest');
    const res = await (supertest(app) as any).get('/api/parse/progress');
    expect(res.status).toBe(200);
    expect(res.body.data.running).toBe(false);
  });
});
