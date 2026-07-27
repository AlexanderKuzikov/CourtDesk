import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Express } from 'express';

const mockCore: Record<string, any> = {
  findCourtsByName: vi.fn(() => []),
  findCourtByCodeOrSubdomain: vi.fn(() => null),
  getAllCourts: vi.fn(() => []),
};

vi.mock('../../core/index.js', () => mockCore);

async function buildApp(): Promise<Express> {
  const { default: courtsRouter } = await import('./courts.js');
  const app = express();
  app.use(courtsRouter);
  return app;
}

describe('GET /api/courts', () => {
  let app: Express;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockCore.findCourtByCodeOrSubdomain = vi.fn(() => null);
    mockCore.findCourtsByName = vi.fn(() => [{ code: '59RS0007', name: 'Ленинский районный суд г. Перми' }]);
    mockCore.getAllCourts = vi.fn(() => [{ code: '59RS0007', name: 'Ленинский районный суд г. Перми' }]);
    app = await buildApp();
  });

  it('без q — возвращает все суды', async () => {
    const { default: supertest } = await import('supertest');
    const res = await (supertest(app) as any).get('/api/courts');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('с q=ленинский — возвращает отфильтрованные', async () => {
    const { default: supertest } = await import('supertest');
    const res = await (supertest(app) as any).get('/api/courts?q=ленинский');
    expect(res.status).toBe(200);
    expect(res.body.data[0].code).toBe('59RS0007');
    expect(mockCore.findCourtsByName).toHaveBeenCalledWith('ленинский');
  });

  it('лимитирует результат до 30', async () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ code: `${i}`, name: `Суд ${i}` }));
    mockCore.findCourtsByName.mockReturnValue(many);
    const { default: supertest } = await import('supertest');
    const res = await (supertest(app) as any).get('/api/courts?q=суд');
    expect(res.body.data).toHaveLength(30);
  });
});

describe('GET /api/courts/:id', () => {
  let app: Express;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockCore.findCourtByCodeOrSubdomain = vi.fn(() => null);
    mockCore.findCourtsByName = vi.fn(() => []);
    mockCore.getAllCourts = vi.fn(() => []);
    app = await buildApp();
  });

  it('200 для существующего суда', async () => {
    mockCore.findCourtByCodeOrSubdomain.mockReturnValue({ code: '59RS0007', name: 'Ленинский районный суд г. Перми' });
    const { default: supertest } = await import('supertest');
    const res = await (supertest(app) as any).get('/api/courts/59RS0007');
    expect(res.status).toBe(200);
    expect(res.body.data.code).toBe('59RS0007');
  });

  it('404 если суд не найден', async () => {
    const { default: supertest } = await import('supertest');
    const res = await (supertest(app) as any).get('/api/courts/unknown');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});
