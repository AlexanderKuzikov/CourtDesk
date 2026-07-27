import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Express } from 'express';

const classify = vi.fn((_input: string): Record<string, unknown> => ({ type: 'malformed', error: 'Не удалось классифицировать' }));

vi.mock('../../intake/index.js', () => ({ classify }));

async function buildApp(): Promise<Express> {
  const { default: intakeRouter } = await import('./intake.js');
  const app = express();
  app.use(express.json());
  app.use(intakeRouter);
  return app;
}

describe('POST /api/intake', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it('400 если input не передан', async () => {
    const { default: supertest } = await import('supertest');
    const res = await (supertest(app) as any).post('/api/intake').send({}).set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_REQUEST');
  });

  it('400 если input не строка', async () => {
    const { default: supertest } = await import('supertest');
    const res = await (supertest(app) as any).post('/api/intake').send({ input: 123 }).set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
  });

  it('200 классифицирует URL дела', async () => {
    classify.mockReturnValue({ type: 'case_card', url: 'https://...', courtType: 'district' });
    const { default: supertest } = await import('supertest');
    const res = await (supertest(app) as any).post('/api/intake')
      .send({ input: 'https://leninsky--perm.sudrf.ru/modules.php?name_op=case&case_id=123' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body.data.type).toBe('case_card');
  });

  it('200 классифицирует номер дела', async () => {
    classify.mockReturnValue({ type: 'search', caseNumber: '2-1234/2024', courtType: 'district' });
    const { default: supertest } = await import('supertest');
    const res = await (supertest(app) as any).post('/api/intake')
      .send({ input: '2-1234/2024' }).set('Content-Type', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body.data.type).toBe('search');
  });
});
