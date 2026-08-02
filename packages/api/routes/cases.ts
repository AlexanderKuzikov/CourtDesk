import { Router, type Request, type Response } from 'express';
import { getCase, listCases, addCase, updateCase, deleteCase, getStats,
  deleteNotificationsByCase, deleteCard, getCard, saveCard } from '../../store/index.js';
import { fetchHtml } from '../../search/shared.js';
import { addEvent as addHistoryEvent, getEvents as getCaseEvents, clearEvents } from '../../store/events.js';
import { findCourtByCodeOrSubdomain, getRuCaptchaKey } from '../../core/index.js';
import { getParseAdapter } from '../../parse/index.js';
import { isCaptchaPage, assertCourtUrl } from '../../core/errors.js';
import { fetchWithCaptcha } from '../../captcha/session.js'; // CR10-009: static import
import { runSingle } from '../../scheduler/index.js';
import type { WatchedCase, CaseStatus } from '../../core/types.js';

const router = Router();

function ok(res: Response, data: unknown) { res.json({ success: true, data }); }
function fail(res: Response, code: string, msg: string, status = 400) {
  res.status(status).json({ success: false, error: msg, code });
}
function errMsg(e: unknown) { return e instanceof Error ? e.message : 'Внутренняя ошибка'; }

/**
 * Express 5: req.query values are string | string[] | ParsedQs | ParsedQs[] | undefined.
 * For scalar params use this helper.
 */
function strQuery(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

// Fields allowed via PATCH. uid, createdAt, courtId, courtType — immutable.
const PATCH_ALLOWED = new Set([
  'status', 'result', 'legalForceDate', 'legalForceNotified',
  'userId', 'url', 'errorCount', 'lastError',
]);

// List cases
router.get('/api/cases', (req: Request, res: Response) => {
  try {
    const cases = listCases({
      status: strQuery(req.query['status']) as CaseStatus | undefined,
      userId: strQuery(req.query['userId']),
      courtId: strQuery(req.query['courtId']),
      q: strQuery(req.query['q']),
    });
    const enriched = cases.map(c => {
      const courtInfo = findCourtByCodeOrSubdomain(c.courtCode || c.courtId);
      return { ...c, courtName: courtInfo?.name ?? c.courtId };
    });
    ok(res, enriched);
  } catch (e) { fail(res, 'STORE_ERROR', 'Ошибка получения списка: ' + errMsg(e), 500); }
});

// Stats
router.get('/api/cases/stats', (_req: Request, res: Response) => {
  try { ok(res, getStats()); } catch (e) { fail(res, 'STORE_ERROR', errMsg(e), 500); }
});

// Single case
router.get('/api/cases/:uid', (req: Request, res: Response) => {
  try {
    const c = getCase(String(req.params['uid']));
    if (!c) return fail(res, 'NOT_FOUND', 'Дело не найдено', 404);
    const courtInfo = findCourtByCodeOrSubdomain(c.courtCode || c.courtId);
    ok(res, { ...c, courtName: courtInfo?.name ?? c.courtId });
  } catch (e) { fail(res, 'STORE_ERROR', errMsg(e), 500); }
});

// Add case to monitoring
router.post('/api/cases', async (req: Request, res: Response) => {
  try {
    const { url, courtId, courtCode, courtType, caseNumber, caseUid, userId } = req.body ?? {};
    if (!url || !courtId || !courtType || !caseNumber) {
      return fail(res, 'BAD_REQUEST', 'url, courtId, courtType, caseNumber обязательны');
    }
    // CR12-001 FIXED: URL валидируется до любого fetch (защита от SSRF)
    try {
      assertCourtUrl(String(url));
    } catch {
      return fail(res, 'INVALID_URL', 'URL должен принадлежать судовой системе РФ (*.sudrf.ru или *.msudrf.ru)');
    }
    const uid = crypto.randomUUID();
    const now = new Date().toISOString();
    const c: WatchedCase = {
      uid, url, courtId,
      courtCode: courtCode ?? courtId,
      courtType, number: caseNumber,
      caseUid: caseUid ?? null,
      status: 'monitoring',
      result: null, legalForceDate: null, legalForceNotified: false,
      enforcedAt: null,
      userId: userId ?? null,
      lastChecked: null, createdAt: now, updatedAt: now,
      errorCount: 0, lastError: null,
    };
    addCase(c);
    addHistoryEvent(c.uid, {
      uid: crypto.randomUUID(), caseUid: c.uid, type: 'added',
      message: 'Добавлено в мониторинг', data: {}, createdAt: now,
    });

    // Parse при добавлении: ?parse=true — синхронно (совместимость с 1С),
    // ?parse=async — 202 + карточка в фоне (CR11-011)
    const qParse = strQuery(req.query['parse']);
    const bParse = req.body?.parse;
    const parseAsync = qParse === 'async' || bParse === 'async';
    const parseSync = qParse === 'true' || bParse === true || bParse === 'true';

    if (parseAsync || parseSync) {
      // CR10-009: static imports, no dynamic import() in hot path
      const doParse = async () => {
        const adapter = getParseAdapter(courtType);
        let html = '';
        const apiKey = getRuCaptchaKey();

        try {
          // CR11-007 FIXED: общий HTTP-слой из search/shared
          html = await fetchHtml(url);
        } catch { /* fall through to captcha */ }

        if (!html || isCaptchaPage(html)) {
          if (!apiKey) throw new Error('Требуется RuCaptcha для капчи');
          html = await fetchWithCaptcha({ url, apiKey });
        }

        const card = await adapter.parse(html, url);
        saveCard(uid, card);
        if (card.identifiers?.case_uid) updateCase(uid, { caseUid: card.identifiers.case_uid });
        return card;
      };

      if (parseAsync) {
        // Не держим HTTP-соединение: клиент поллит GET /api/cases/:uid/card (404 пока не готово)
        doParse()
          .then(() => {
            addHistoryEvent(c.uid, {
              uid: crypto.randomUUID(), caseUid: c.uid, type: 'card_loaded',
              message: 'Карточка дела загружена', data: {}, createdAt: new Date().toISOString(),
            });
          })
          .catch(parseErr => {
            console.error('[cases/add] async parse error:', parseErr);
            addHistoryEvent(c.uid, {
              uid: crypto.randomUUID(), caseUid: c.uid, type: 'parse_error',
              message: 'Ошибка парсинга: ' + errMsg(parseErr), data: {}, createdAt: new Date().toISOString(),
            });
          });
        res.status(202).json({ success: true, data: { ...c, parseStatus: 'running' } });
        return;
      }

      try {
        const card = await doParse();
        return ok(res, { ...c, card });
      } catch (parseErr) {
        console.error('[cases/add] parse error:', parseErr);
        return ok(res, { ...c, parseError: errMsg(parseErr) });
      }
    }

    ok(res, c);
  } catch (e) { fail(res, 'STORE_ERROR', 'Ошибка добавления: ' + errMsg(e), 500); }
});

// Wait for case appearance
router.post('/api/cases/wait', (req: Request, res: Response) => {
  try {
    const { courtId, courtCode, courtType, party, filingDate, userId } = req.body ?? {};
    if (!courtId || !courtType || !party) {
      return fail(res, 'BAD_REQUEST', 'courtId, courtType, party обязательны');
    }
    const c: WatchedCase = {
      uid: crypto.randomUUID(), url: '', courtId,
      courtCode: courtCode ?? courtId, courtType, number: '',
      caseUid: null, status: 'waiting', result: null,
      legalForceDate: null, legalForceNotified: false, enforcedAt: null,
      userId: userId ?? null, lastChecked: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      errorCount: 0, lastError: null,
    };
    addCase(c);
    addHistoryEvent(c.uid, {
      uid: crypto.randomUUID(), caseUid: c.uid, type: 'waiting',
      message: `Ожидается появление: ${party}, подача ${filingDate ?? '—'}`,
      data: { party, filingDate }, createdAt: c.createdAt,
    });
    ok(res, c);
  } catch (e) { fail(res, 'STORE_ERROR', errMsg(e), 500); }
});

// Update case — allowed fields only
router.patch('/api/cases/:uid', (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    // CR12-001 FIXED: url в PATCH тоже проходит allowlist (его позже fetchит scheduler)
    if (typeof body['url'] === 'string' && body['url'] !== '') {
      try {
        assertCourtUrl(body['url']);
      } catch {
        return fail(res, 'INVALID_URL', 'URL должен принадлежать судовой системе РФ (*.sudrf.ru или *.msudrf.ru)');
      }
    }
    const safeUpdates = Object.fromEntries(
      Object.entries(body).filter(([k]) => PATCH_ALLOWED.has(k as keyof WatchedCase)),
    ) as Partial<WatchedCase>;
    const updated = updateCase(String(req.params['uid']), safeUpdates);
    if (!updated) return fail(res, 'NOT_FOUND', 'Дело не найдено', 404);
    ok(res, updated);
  } catch (e) { fail(res, 'STORE_ERROR', errMsg(e), 500); }
});

// Delete case
router.delete('/api/cases/:uid', (req: Request, res: Response) => {
  try {
    const uid = String(req.params['uid']);
    const deleted = deleteCase(uid);
    if (!deleted) return fail(res, 'NOT_FOUND', 'Дело не найдено', 404);
    clearEvents(uid);
    deleteNotificationsByCase(uid);
    deleteCard(uid);
    ok(res, null);
  } catch (e) { fail(res, 'STORE_ERROR', errMsg(e), 500); }
});

// Full case card (CaseCard)
router.get('/api/cases/:uid/card', (req: Request, res: Response) => {
  try {
    const c = getCase(String(req.params['uid']));
    if (!c) return fail(res, 'NOT_FOUND', 'Дело не найдено', 404);
    const card = getCard(String(req.params['uid']));
    if (!card) return fail(res, 'NOT_FOUND', 'Карточка дела ещё не загружена', 404);
    ok(res, card);
  } catch (e) { fail(res, 'STORE_ERROR', errMsg(e), 500); }
});

// Case events (timeline)
router.get('/api/cases/:uid/events', (req: Request, res: Response) => {
  try {
    const c = getCase(String(req.params['uid']));
    if (!c) return fail(res, 'NOT_FOUND', 'Дело не найдено', 404);
    const events = getCaseEvents(String(req.params['uid']));
    ok(res, events);
  } catch (e) { fail(res, 'STORE_ERROR', errMsg(e), 500); }
});

// Manual reparse of a single watched case (bound parse via orchestrator.runSingle)
router.post('/api/cases/:uid/parse', async (req: Request, res: Response) => {
  const uid = String(req.params['uid']);
  if (!getCase(uid)) return fail(res, 'NOT_FOUND', 'Дело не найдено', 404);
  try {
    const done = await runSingle(uid);
    // CR11-005: runSingle вернул false при живом деле = оно уже в пакетном прогоне
    if (!done) return fail(res, 'PARSE_IN_PROGRESS', 'Дело уже обрабатывается', 409);
    ok(res, getCase(uid));
  } catch (e) { fail(res, 'PARSE_ERROR', 'Ошибка парсинга: ' + errMsg(e), 500); }
});

export default router;
