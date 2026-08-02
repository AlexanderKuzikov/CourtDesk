import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Express } from 'express';

// Мокаем всё, что может обращаться наружу
const runFull = vi.fn(async () => ({ ok: 5, fail: 0 }));
const runRetry = vi.fn(async () => ({ ok: 2, fail: 1 }));
const runNew = vi.fn(async () => ({ ok: 3, fail: 0 }));

vi.mock('../../scheduler/index.js', () => ({ runFull, runRetry, runNew, getRunningMode: vi.fn(() => null) }));
vi.mock('../../parse/index.js', () => ({ getParseAdapter: vi.fn() }));
vi.mock('../../core/index.js', () => ({ findCourtByCodeOrSubdomain: vi.fn(() => null), getProgress: vi.fn(() => ({ running: false, total: 0, processed: 0, errors: 0 })), setProgress: vi.fn(), resetProgress: vi.fn() }));
vi.mock('../../captcha/session.js', () => ({ fetchMagistrateHtml: vi.fn() }));
vi.mock('../../core/config.js', () => ({ getRuCaptchaKey: vi.fn(() => '') }));

async function buildApp(): Promise<Express> {
  const { default: parseRouter } = await import('./parse.js');
  const app = express();
  app.use(express.json());
  app.use(parseRouter);
  return app;
}

describe('POST /api/parse/run — 202 Accepted без виса (BUG-008)', () => {
  let app: Express;

  beforeEach(async () => {
    vi.resetModules();
    runFull.mockClear();
    runRetry.mockClear();
    runNew.mockClear();
    app = await buildApp();
  });

  it('возвращает 202 для mode=full', async () => {
    const { default: supertest } = await import('supertest');
    const res = await (supertest(app) as any).post('/api/parse/run').send({ mode: 'full' }).set('Content-Type', 'application/json');
    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('started');
  });

  it('возвращает 202 для mode=new', async () => {
    const { default: supertest } = await import('supertest');
    const res = await (supertest(app) as any).post('/api/parse/run').send({ mode: 'new' }).set('Content-Type', 'application/json');
    expect(res.status).toBe(202);
    expect(res.body.data.mode).toBe('new');
  });

  it('раннер запускается в фоне (ответ приходит до его завершения)', async () => {
    let resolveRunner!: () => void;
    runFull.mockImplementation(() => new Promise<{ ok: number; fail: number }>(res => {
      resolveRunner = () => res({ ok: 1, fail: 0 });
    }));
    const { default: supertest } = await import('supertest');
    const res = await (supertest(app) as any).post('/api/parse/run').send({ mode: 'full' }).set('Content-Type', 'application/json');
    // ответ уже пришёл, раннер ещё висит
    expect(res.status).toBe(202);
    resolveRunner();
  });
});
