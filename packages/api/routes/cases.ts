import { Router, type Request, type Response } from 'express';
import { getCase, listCases, addCase, updateCase, deleteCase, getStats, deleteNotificationsByCase, deleteCard, getCard } from '../../store/index.js';
import { addEvent as addHistoryEvent, getEvents as getCaseEvents, clearEvents } from '../../store/events.js';
import { findCourtByCodeOrSubdomain } from '../../core/index.js';
import type { WatchedCase, CaseStatus } from '../../core/types.js';

const router = Router();

function ok(res: Response, data: unknown) { res.json({ success: true, data }); }
function fail(res: Response, code: string, msg: string, status = 400) {
  res.status(status).json({ success: false, error: msg, code });
}
function errMsg(e: unknown) { return e instanceof Error ? e.message : 'Внутренняя ошибка'; }

/** Express 5: req.query значения имеют тип string | string[] | ParsedQs | ParsedQs[] | undefined.
 *  Для скалярных параметров используем помощную функцию. */
function strQuery(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

// Поля, которые пользователь может менять через PATCH.
// uid, createdAt, courtId, courtType — неизменяемы.
const PATCH_ALLOWED = new Set<keyof WatchedCase>([
  'status', 'result', 'legalForceDate', 'legalForceNotified', 'userId', 'url',
]);

// Список дел
router.get('/api/cases', (req: Request, res: Response) => {
  try {
    const cases = listCases({
      status: strQuery(req.query['status']) as CaseStatus | undefined,
      userId: strQuery(req.query['userId']),
      courtId: strQuery(req.query['courtId']),
      q: strQuery(req.query['q']),
    });
    // Обогащаем названием суда
    const enriched = cases.map(c => {
      const courtInfo = findCourtByCodeOrSubdomain(c.courtCode || c.courtId);
      return { ...c, courtName: courtInfo?.name ?? c.courtId };
    });
    ok(res, enriched);
  } catch (e) { fail(res, 'STORE_ERROR', 'Ошибка получения списка: ' + errMsg(e), 500); }
});

// Статистика
router.get('/api/cases/stats', (_req: Request, res: Response) => {
  try { ok(res, getStats()); }
  catch (e) { fail(res, 'STORE_ERROR', errMsg(e), 500); }
});

// Одно дело
router.get('/api/cases/:uid', (req: Request, res: Response) => {
  try {
    const c = getCase(String(req.params['uid']));
    if (!c) return fail(res, 'NOT_FOUND', 'Дело не найдено', 404);
    const courtInfo = findCourtByCodeOrSubdomain(c.courtCode || c.courtId);
    ok(res, { ...c, courtName: courtInfo?.name ?? c.courtId });
  } catch (e) { fail(res, 'STORE_ERROR', errMsg(e), 500); }
});

// Добавить дело в мониторинг
router.post('/api/cases', (req: Request, res: Response) => {
  try {
    const { url, courtId, courtCode, courtType, caseNumber, caseUid, userId } = req.body ?? {};
    if (!url || !courtId || !courtType || !caseNumber) {
      return fail(res, 'BAD_REQUEST', 'url, courtId, courtType, caseNumber обязательны');
    }
    const c: WatchedCase = {
      uid: crypto.randomUUID(), url,
      courtId, courtCode: courtCode ?? courtId, courtType,
      number: caseNumber, caseUid: caseUid ?? null, status: 'monitoring',
      result: null, legalForceDate: null, legalForceNotified: false,
      enforcedAt: null, userId: userId ?? null, lastChecked: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    addCase(c);
    addHistoryEvent(c.uid, {
      uid: crypto.randomUUID(), caseUid: c.uid, type: 'added',
      message: 'Добавлено в мониторинг', data: {}, createdAt: c.createdAt,
    });
    ok(res, c);
  } catch (e) { fail(res, 'STORE_ERROR', 'Ошибка добавления: ' + errMsg(e), 500); }
});

// Отслеживать появление
router.post('/api/cases/wait', (req: Request, res: Response) => {
  try {
    const { courtId, courtCode, courtType, party, filingDate, userId } = req.body ?? {};
    if (!courtId || !courtType || !party) {
      return fail(res, 'BAD_REQUEST', 'courtId, courtType, party обязательны');
    }
    const c: WatchedCase = {
      uid: crypto.randomUUID(), url: '',
      courtId, courtCode: courtCode ?? courtId, courtType,
      number: '', caseUid: null, status: 'waiting',
      result: null, legalForceDate: null, legalForceNotified: false,
      enforcedAt: null, userId: userId ?? null, lastChecked: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
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

// Обновить дело — только разрешённые поля
router.patch('/api/cases/:uid', (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const safeUpdates = Object.fromEntries(
      Object.entries(body).filter(([k]) => PATCH_ALLOWED.has(k as keyof WatchedCase)),
    ) as Partial<WatchedCase>;
    const updated = updateCase(String(req.params['uid']), safeUpdates);
    if (!updated) return fail(res, 'NOT_FOUND', 'Дело не найдено', 404);
    ok(res, updated);
  } catch (e) { fail(res, 'STORE_ERROR', errMsg(e), 500); }
});

// Удалить дело
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

// Полная карточка дела (CaseCard)
router.get('/api/cases/:uid/card', (req: Request, res: Response) => {
  try {
    const c = getCase(String(req.params['uid']));
    if (!c) return fail(res, 'NOT_FOUND', 'Дело не найдено', 404);
    const card = getCard(String(req.params['uid']));
    if (!card) return fail(res, 'NOT_FOUND', 'Карточка дела ещё не загружена', 404);
    ok(res, card);
  } catch (e) { fail(res, 'STORE_ERROR', errMsg(e), 500); }
});

// События дела (для дашборда)
router.get('/api/cases/:uid/events', (req: Request, res: Response) => {
  try {
    const c = getCase(String(req.params['uid']));
    if (!c) return fail(res, 'NOT_FOUND', 'Дело не найдено', 404);
    const events = getCaseEvents(String(req.params['uid']));
    ok(res, events);
  } catch (e) { fail(res, 'STORE_ERROR', errMsg(e), 500); }
});

export default router;