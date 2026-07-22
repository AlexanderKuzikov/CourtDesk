import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Express } from 'express';
import type { SearchRequest, SearchResult } from '../../core/types.js';

const searchAdapter = {
  buildSearchUrl: vi.fn((req: SearchRequest): string => {
    return `https://${req.courtId}.sudrf.ru/modules.php?name=sud_delo&name_op=r&delo_id=1540005&case_type=0&g1_case__CASE_NUMBERSS=${encodeURIComponent(req.caseNumber || '')}`;
  }),
  searchByCaseNumber: vi.fn(async (): Promise<SearchResult[]> => []),
  searchByParty: vi.fn(async (): Promise<SearchResult[]> => []),
};

vi.mock('../../search/index.js', () => ({
  getSearchAdapter: vi.fn(() => searchAdapter),
}));

async function buildApp(): Promise<Express> {
  const { default: resolveRouter } = await import('./resolve.js');
  const app = express();
  app.use(express.json());
  app.use(resolveRouter);
  return app;
}

describe('POST /api/resolve (API#8)', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it('строит URL для district суда', async () => {
    const { default: supertest } = await import('supertest');
    const res = await (supertest(app) as any)
      .post('/api/resolve')
      .send({ courtId: 'kirov--perm', courtType: 'district', caseNumber: '2-100/2026' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.url).toContain('kirov--perm.sudrf.ru');
    expect(res.body.data.url).toContain(encodeURIComponent('2-100/2026'));
  });

  it('400 при отсутствии обязательных полей', async () => {
    const { default: supertest } = await import('supertest');
    const res = await (supertest(app) as any)
      .post('/api/resolve')
      .send({ courtId: 'kirov--perm' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_REQUEST');
  });
});
