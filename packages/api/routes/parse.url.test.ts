import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Express } from 'express';

const parseAdapter = {
  parse: vi.fn(async (html: string, url: string) => ({
    card: { result: 'Удовлетворено', judge: 'Иванов И.И.' },
  })),
};
const mockConfig = { getRuCaptchaKey: vi.fn(() => 'fake-key') };

vi.mock('../../parse/index.js', () => ({ getParseAdapter: vi.fn(() => parseAdapter) }));
vi.mock('../../core/index.js', () => ({ findCourtByCodeOrSubdomain: vi.fn(() => null) }));
vi.mock('../../captcha/session.js', () => ({ fetchMagistrateHtml: vi.fn(async () => '<html><body>msudrf</body></html>') }));
vi.mock('../../core/config.js', () => mockConfig);

async function buildApp(): Promise<Express> {
  const { default: parseRouter } = await import('./parse.js');
  const app = express();
  app.use(express.json());
  app.use(parseRouter);
  return app;
}

describe('POST /api/parse/url — magistrate smoke', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mockConfig.getRuCaptchaKey.mockReturnValue('fake-key');
    parseAdapter.parse.mockResolvedValue({ card: { result: 'Удовлетворено', judge: 'Иванов И.И.' } });
    app = await buildApp();
  });

  it('парсит URL мирового суда через капча-сессию', async () => {
    const { default: supertest } = await import('supertest');
    const res = await (supertest(app) as any)
      .post('/api/parse/url')
      .send({ url: 'https://35.perm.msudrf.ru/modules.php?name_op=case&case_id=1', courtType: 'magistrate' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.card.result).toBe('Удовлетворено');
  });
});
