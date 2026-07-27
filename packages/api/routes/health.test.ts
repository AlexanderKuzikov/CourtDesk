import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import type { Express } from 'express';

async function buildApp(): Promise<Express> {
  const { default: healthRouter } = await import('./health.js');
  const app = express();
  app.use(healthRouter);
  return app;
}

describe('GET /api/health', () => {
  let app: Express;

  afterEach(async () => {
    const { default: supertest } = await import('supertest');
    app = await buildApp();
  });

  it('возвращает ok и версию', async () => {
    app = await buildApp();
    const { default: supertest } = await import('supertest');
    const res = await (supertest(app) as any).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
  });
});
