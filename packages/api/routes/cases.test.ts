import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import type { Express } from 'express';
import type { WatchedCase, CaseHistoryEvent } from '../../core/types.js';

const baseCase: WatchedCase = {
  uid: 'u1',
  url: 'https://kirov--perm.sudrf.ru/modules.php?name_op=case&case_id=1',
  courtId: 'kirov--perm',
  courtCode: 'kirov--perm',
  courtType: 'district',
  number: '2-100/2026',
  caseUid: null,
  status: 'monitoring',
  result: null,
  legalForceDate: null,
  legalForceNotified: false,
  enforcedAt: null,
  userId: null,
  lastChecked: null,
  createdAt: '2026-07-21T10:00:00.000Z',
  updatedAt: '2026-07-21T10:00:00.000Z',
  errorCount: 0,
  lastError: null,
};

const storeMock = {
  listCases: vi.fn((_f?: { status?: string; userId?: string; courtId?: string; q?: string }): WatchedCase[] => []),
  getCase: vi.fn((_uid: string): WatchedCase | null => null),
  addCase: vi.fn((_c: WatchedCase): void => undefined),
  updateCase: vi.fn((_uid: string, _updates: Partial<WatchedCase>): WatchedCase | null => null),
  deleteCase: vi.fn((_uid: string): boolean => false),
  getStats: vi.fn(() => ({ monitoring: 0, waiting: 0, decision: 0, enforcedToday: 0 })),
  deleteNotificationsByCase: vi.fn((): void => undefined),
  deleteCard: vi.fn((): void => undefined),
  getCard: vi.fn((): any => null),
  saveCard: vi.fn((): void => undefined),
};

const eventsMock = {
  addEvent: vi.fn((_caseUid: string, _event: CaseHistoryEvent): void => undefined),
  getEvents: vi.fn((): CaseHistoryEvent[] => []),
  clearEvents: vi.fn((): void => undefined),
};

const mockCore = {
  findCourtByCodeOrSubdomain: vi.fn(() => null),
  getRuCaptchaKey: vi.fn(() => ''),
};

const mockParse = {
  getParseAdapter: vi.fn(() => ({ parse: vi.fn(async () => ({ uid: 'u1', card: { result: 'Удовлетворено' } })) })),
};

const mockCaptcha = {
  fetchWithCaptcha: vi.fn(async () => '<html><body>captcha bypassed</body></html>'),
};

const schedulerMock = {
  runSingle: vi.fn(async (_uid: string): Promise<boolean> => true),
};

vi.mock('../../store/index.js', () => storeMock);
vi.mock('../../store/events.js', () => eventsMock);
vi.mock('../../core/index.js', () => mockCore);
vi.mock('../../parse/index.js', () => mockParse);
vi.mock('../../captcha/session.js', () => mockCaptcha);
vi.mock('../../core/errors.js', async () => {
  const actual = await vi.importActual<typeof import('../../core/errors.js')>('../../core/errors.js');
  return { ...actual, isCaptchaPage: vi.fn(() => false) };
});
vi.mock('../../scheduler/index.js', () => schedulerMock);

async function buildApp(): Promise<Express> {
  const { default: casesRouter } = await import('./cases.js');
  const app = express();
  app.use(express.json());
  app.use(casesRouter);
  return app;
}

async function req(app: Express, method: string, path: string, body?: unknown) {
  const { default: supertest } = await import('supertest');
  const r = (supertest(app) as any)[method](path);
  if (body !== undefined) r.send(body).set('Content-Type', 'application/json');
  return r;
}

// ---------- LIST ----------

describe('GET /api/cases — list', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    storeMock.listCases.mockReturnValue([baseCase]);
    storeMock.getCase.mockReturnValue(null);
    app = await buildApp();
  });

  it('возвращает список дел с courtName', async () => {
    const res = await req(app, 'get', '/api/cases');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].courtName).toBe('kirov--perm');
  });

  it('фильтрует по статусу', async () => {
    await req(app, 'get', '/api/cases?status=decision');
    expect(storeMock.listCases).toHaveBeenCalledWith({ status: 'decision' });
  });

  it('фильтрует по поиску', async () => {
    await req(app, 'get', '/api/cases?q=2-100');
    expect(storeMock.listCases).toHaveBeenCalledWith({ q: '2-100' });
  });
});

// ---------- STATS ----------

describe('GET /api/cases/stats', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    storeMock.getStats.mockReturnValue({ monitoring: 5, waiting: 2, decision: 1, enforcedToday: 0 });
    app = await buildApp();
  });

  it('возвращает статистику', async () => {
    const res = await req(app, 'get', '/api/cases/stats');
    expect(res.status).toBe(200);
    expect(res.body.data.monitoring).toBe(5);
    expect(res.body.data.enforcedToday).toBe(0);
  });
});

// ---------- SINGLE ----------

describe('GET /api/cases/:uid', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    storeMock.getCase.mockReturnValue(baseCase);
    app = await buildApp();
  });

  it('200 с карточкой дела', async () => {
    const res = await req(app, 'get', '/api/cases/u1');
    expect(res.status).toBe(200);
    expect(res.body.data.number).toBe('2-100/2026');
    expect(res.body.data.courtName).toBe('kirov--perm');
  });

  it('404 если uid не найден', async () => {
    storeMock.getCase.mockReturnValue(null);
    const res = await req(app, 'get', '/api/cases/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});

// ---------- ADD ----------

describe('POST /api/cases — add to monitoring', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    storeMock.addCase.mockImplementation(() => undefined);
    eventsMock.addEvent.mockImplementation(() => undefined);
    app = await buildApp();
  });

  it('400 если нет обязательных полей', async () => {
    const res = await req(app, 'post', '/api/cases', { url: 'https://...' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_REQUEST');
  });

  it('создаёт monitoring-дело', async () => {
    const res = await req(app, 'post', '/api/cases', {
      url: 'https://kirov--perm.sudrf.ru/modules.php?name_op=case&case_id=1',
      courtId: 'kirov--perm', courtType: 'district', caseNumber: '2-100/2026',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('monitoring');
    expect(storeMock.addCase).toHaveBeenCalledTimes(1);
    expect(eventsMock.addEvent).toHaveBeenCalledTimes(1);
  });

  it('принимает userId', async () => {
    const res = await req(app, 'post', '/api/cases', {
      url: 'https://kirov--perm.sudrf.ru/...', courtId: 'kirov--perm',
      courtType: 'district', caseNumber: '2-100/2026', userId: '1c-001',
    });
    expect(res.body.data.userId).toBe('1c-001');
  });

  // CR12-001: SSRF — url из req.body не должен уходить в fetch без allowlist
  it('400 INVALID_URL если url не судебный (SSRF)', async () => {
    const res = await req(app, 'post', '/api/cases', {
      url: 'http://169.254.169.254/latest/meta-data', courtId: 'kirov--perm',
      courtType: 'district', caseNumber: '2-100/2026',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_URL');
    expect(storeMock.addCase).not.toHaveBeenCalled();
  });

  it('400 INVALID_URL если url судебный, но http (не https)', async () => {
    const res = await req(app, 'post', '/api/cases', {
      url: 'http://kirov--perm.sudrf.ru/modules.php', courtId: 'kirov--perm',
      courtType: 'district', caseNumber: '2-100/2026',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_URL');
  });

  it('400 INVALID_URL если url не парсится', async () => {
    const res = await req(app, 'post', '/api/cases', {
      url: 'not-a-url', courtId: 'kirov--perm',
      courtType: 'district', caseNumber: '2-100/2026',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_URL');
  });

  it('принимает msudrf URL', async () => {
    const res = await req(app, 'post', '/api/cases', {
      url: 'https://msudrf.ru/modules.php?name_op=case&case_id=1', courtId: 'msudrf',
      courtType: 'magistrate', caseNumber: '2-100/2026',
    });
    expect(res.status).toBe(200);
    expect(storeMock.addCase).toHaveBeenCalledTimes(1);
  });
});

// ---------- EVENTS ----------

describe('GET /api/cases/:uid/events', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    storeMock.getCase.mockReturnValue(baseCase);
    eventsMock.getEvents.mockReturnValue([
      { uid: 'e1', caseUid: 'u1', type: 'added', message: 'Добавлено в мониторинг', data: {}, createdAt: '2026-07-21T10:00:00.000Z' },
    ]);
    app = await buildApp();
  });

  it('возвращает события дела', async () => {
    const res = await req(app, 'get', '/api/cases/u1/events');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].type).toBe('added');
  });

  it('404 если uid не найден', async () => {
    storeMock.getCase.mockReturnValue(null);
    const res = await req(app, 'get', '/api/cases/ghost/events');
    expect(res.status).toBe(404);
  });
});

// ---------- CARD ----------

describe('GET /api/cases/:uid/card', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    storeMock.getCase.mockReturnValue(baseCase);
    app = await buildApp();
  });

  it('возвращает полную карточку', async () => {
    storeMock.getCard.mockReturnValue({ uid: 'u1', number: '2-100/2026', court: 'kirov--perm', card: { result: 'Удовлетворено' } });
    const res = await req(app, 'get', '/api/cases/u1/card');
    expect(res.status).toBe(200);
    expect(res.body.data.card.result).toBe('Удовлетворено');
  });

  it('404 если uid не найден', async () => {
    storeMock.getCase.mockReturnValue(null);
    const res = await req(app, 'get', '/api/cases/ghost/card');
    expect(res.status).toBe(404);
  });

  it('404 если карточка не загружена', async () => {
    storeMock.getCard.mockReturnValue(null);
    const res = await req(app, 'get', '/api/cases/u1/card');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});

// ---------- PATCH ----------

describe('PATCH /api/cases/:uid — whitelist (BUG-004)', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    storeMock.listCases.mockReturnValue([]);
    storeMock.getCase.mockReturnValue(null);
    storeMock.updateCase.mockReturnValue({ ...baseCase, status: 'decision' });
    storeMock.deleteCase.mockReturnValue(false);
    app = await buildApp();
  });

  it('пропускает разрешённое поле status', async () => {
    const res = await req(app, 'patch', '/api/cases/u1', { status: 'decision' });
    expect(res.status).toBe(200);
    expect(storeMock.updateCase).toHaveBeenCalledWith('u1', { status: 'decision' });
  });

  it('отфильтровывает uid из PATCH-тела', async () => {
    await req(app, 'patch', '/api/cases/u1', { uid: 'injected', status: 'enforced' });
    const updates = storeMock.updateCase.mock.calls[0]?.[1];
    expect(updates).not.toHaveProperty('uid');
    expect(updates).toHaveProperty('status', 'enforced');
  });

  it('отфильтровывает createdAt из PATCH-тела', async () => {
    await req(app, 'patch', '/api/cases/u1', { createdAt: '1970-01-01', status: 'monitoring' });
    const updates = storeMock.updateCase.mock.calls[0]?.[1];
    expect(updates).not.toHaveProperty('createdAt');
  });

  it('отфильтровывает courtType из PATCH-тела', async () => {
    await req(app, 'patch', '/api/cases/u1', { courtType: 'appeal', status: 'monitoring' });
    const updates = storeMock.updateCase.mock.calls[0]?.[1];
    expect(updates).not.toHaveProperty('courtType');
  });

  it('404 если дело не найдено', async () => {
    storeMock.updateCase.mockReturnValue(null);
    const res = await req(app, 'patch', '/api/cases/ghost', { status: 'monitoring' });
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  // CR12-001: url в PATCH тоже проходит allowlist
  it('400 INVALID_URL при замене url на не-судебный', async () => {
    const res = await req(app, 'patch', '/api/cases/u1', { url: 'https://evil.example.com/x' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_URL');
    expect(storeMock.updateCase).not.toHaveBeenCalled();
  });

  it('пропускает валидный судебный url в PATCH', async () => {
    const res = await req(app, 'patch', '/api/cases/u1', { url: 'https://kirov--perm.sudrf.ru/modules.php?case_id=2' });
    expect(res.status).toBe(200);
    expect(storeMock.updateCase).toHaveBeenCalledWith('u1', { url: 'https://kirov--perm.sudrf.ru/modules.php?case_id=2' });
  });
});

// ---------- DELETE ----------

describe('DELETE /api/cases/:uid — не пишет если uid нет (BUG-006)', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    storeMock.deleteCase.mockReturnValue(false);
    app = await buildApp();
  });

  it('404 на удаление несуществующего', async () => {
    const res = await req(app, 'delete', '/api/cases/ghost');
    expect(res.status).toBe(404);
  });

  it('200 на удаление существующего', async () => {
    storeMock.deleteCase.mockReturnValue(true);
    const res = await req(app, 'delete', '/api/cases/real-uid');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ---------- WAIT ----------

describe('POST /api/cases/wait — waiting-кейс', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    storeMock.addCase.mockImplementation(() => undefined);
    eventsMock.addEvent.mockImplementation(() => undefined);
    app = await buildApp();
  });

  it('400 если нет party', async () => {
    const res = await req(app, 'post', '/api/cases/wait', { courtId: 'kirov--perm', courtType: 'district' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_REQUEST');
  });

  it('создаёт waiting-дело со всеми обязательными полями', async () => {
    storeMock.updateCase.mockReturnValue(null);
    const res = await req(app, 'post', '/api/cases/wait', {
      courtId: 'kirov--perm', courtType: 'district', party: 'Иванов Иван', filingDate: '2026-06-01',
    });
    expect(res.status).toBe(200);
    const c = storeMock.addCase.mock.calls[0]?.[0] as WatchedCase;
    expect(c.status).toBe('waiting');
    expect(c.url).toBe('');
    expect(c.number).toBe('');
  });
});

// ---------- REPARSE ----------

describe('POST /api/cases/:uid/parse — ручной перепарсинг дела', () => {
  let app: Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    app = await buildApp();
  });

  it('200 и вызывает runSingle с uid', async () => {
    storeMock.getCase.mockReturnValue(baseCase);
    schedulerMock.runSingle.mockResolvedValue(true);
    const res = await req(app, 'post', '/api/cases/u1/parse');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(schedulerMock.runSingle).toHaveBeenCalledWith('u1');
  });

  it('404 если дело не найдено', async () => {
    storeMock.getCase.mockReturnValue(null);
    const res = await req(app, 'post', '/api/cases/ghost/parse');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(schedulerMock.runSingle).not.toHaveBeenCalled();
  });

  it('500 если runSingle бросает', async () => {
    storeMock.getCase.mockReturnValue(baseCase);
    schedulerMock.runSingle.mockRejectedValue(new Error('kaput'));
    const res = await req(app, 'post', '/api/cases/u1/parse');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('PARSE_ERROR');
  });

  it('409 PARSE_IN_PROGRESS если дело уже в пакетном прогоне (CR11-005)', async () => {
    storeMock.getCase.mockReturnValue(baseCase);
    schedulerMock.runSingle.mockResolvedValue(false);
    const res = await req(app, 'post', '/api/cases/u1/parse');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PARSE_IN_PROGRESS');
  });
});
