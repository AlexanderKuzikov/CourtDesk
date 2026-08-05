import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Express } from 'express';
import type { SearchResult } from '../../core/types.js';

const searchAdapter = {
  searchByCaseNumber: vi.fn(async (): Promise<SearchResult[]> => []),
  searchByParty: vi.fn(async (): Promise<SearchResult[]> => []),
  searchByCaseUid: vi.fn(async (): Promise<SearchResult[]> => []),
  buildSearchUrl: vi.fn(),
};

const mockCore: Record<string, any> = {
  findCourtByCodeOrSubdomain: vi.fn(() => ({
    code: '59RS0007',
    name: 'Ленинский районный суд г. Перми',
    courtType: 'district',
    subdomain: 'leninsky--perm',
  })),
};

vi.mock('../../search/index.js', () => ({
  getSearchAdapter: vi.fn(() => searchAdapter),
}));

vi.mock('../../core/index.js', () => mockCore);

async function buildApp(): Promise<Express> {
  const { default: searchRouter } = await import('./search.js');
  const app = express();
  app.use(express.json());
  app.use(searchRouter);
  return app;
}

async function req(app: Express, body: unknown) {
  const { default: supertest } = await import('supertest');
  return (supertest(app) as any).post('/api/search/by-number').send(body).set('Content-Type', 'application/json');
}

describe('POST /api/search/by-number', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    searchAdapter.searchByCaseNumber.mockResolvedValue([]);
    app = await buildApp();
  });

  it('400 если нет courtId', async () => {
    const res = await req(app, { caseNumber: '2-100/2026' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_REQUEST');
  });

  it('400 если нет caseNumber', async () => {
    const res = await req(app, { courtId: 'leninsky--perm' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_REQUEST');
  });

  it('404 если суд не найден', async () => {
    mockCore.findCourtByCodeOrSubdomain.mockReturnValueOnce(null);
    const res = await req(app, { courtId: 'unknown', caseNumber: '2-100/2026' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('COURT_NOT_FOUND');
  });

  it('200 с результатами поиска', async () => {
    const results: SearchResult[] = [{
      caseNumber: '2-100/2026', caseUrl: 'https://leninsky--perm.sudrf.ru/...',
      caseUid: null, caseId: 'u1', judge: 'Иванов И.И.', result: 'Удовлетворено',
      legalForceDate: '2026-08-15', filingDate: '2026-03-01', decisionDate: null,
      parties: [], courtId: 'leninsky--perm', courtType: 'district',
    }];
    searchAdapter.searchByCaseNumber.mockResolvedValue(results);
    const res = await req(app, { courtId: 'leninsky--perm', caseNumber: '2-100/2026' });
    expect(res.status).toBe(200);
    expect(res.body.data.found).toBe(true);
    expect(res.body.data.results[0].caseNumber).toBe('2-100/2026');
    expect(res.body.data.court.code).toBe('59RS0007');
  });
});

describe('POST /api/search/by-party', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    searchAdapter.searchByParty.mockResolvedValue([]);
    app = await buildApp();
  });

  it('400 если нет ни defendant, ни plaintiff', async () => {
    const { default: supertest } = await import('supertest');
    const res = await (supertest(app) as any).post('/api/search/by-party')
      .send({ courtId: 'leninsky--perm' }).set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_REQUEST');
  });

  it('200 с результатами поиска по ответчику', async () => {
    const results: SearchResult[] = [{
      caseNumber: '2-101/2026', caseUrl: 'https://leninsky--perm.sudrf.ru/...',
      caseUid: null, caseId: 'u2', judge: null, result: null,
      legalForceDate: null, filingDate: '2026-03-15', decisionDate: null,
      parties: [{ role: 'Ответчик', name: 'Иванов Иван' }],
      courtId: 'leninsky--perm', courtType: 'district',
    }];
    searchAdapter.searchByParty.mockResolvedValue(results);
    const { default: supertest } = await import('supertest');
    const res = await (supertest(app) as any).post('/api/search/by-party')
      .send({ courtId: 'leninsky--perm', defendant: 'Иванов', from: '2026-03-01', to: '2026-03-31' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body.data.results).toHaveLength(1);
  });
});

describe('POST /api/search/by-case-uid', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    searchAdapter.searchByCaseUid.mockResolvedValue([]);
    app = await buildApp();
  });

  it('400 если нет caseUid', async () => {
    const { default: supertest } = await import('supertest');
    const res = await (supertest(app) as any).post('/api/search/by-case-uid')
      .send({ courtId: 'leninsky--perm' }).set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_REQUEST');
  });

  it('200 с результатами поиска по УИД', async () => {
    searchAdapter.searchByCaseUid.mockResolvedValue([{
      caseNumber: '2-100/2026', caseUrl: 'https://leninsky--perm.sudrf.ru/...',
      caseUid: null, caseId: 'u3', judge: null, result: null,
      legalForceDate: null, filingDate: null, decisionDate: null,
      parties: [], courtId: 'leninsky--perm', courtType: 'district',
    }]);
    const { default: supertest } = await import('supertest');
    const res = await (supertest(app) as any).post('/api/search/by-case-uid')
      .send({ courtId: 'leninsky--perm', caseUid: '26RS0023-01-2020-000159-48' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body.data.found).toBe(true);
  });
});
