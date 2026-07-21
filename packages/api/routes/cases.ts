import { Router } from 'express';
import { getCase, listCases, addCase, updateCase, deleteCase, getStats } from '../../store/index.js';
import { addEvent as addHistoryEvent } from '../../store/events.js';
import type { WatchedCase } from '../../core/types.js';

const router = Router();

function ok(res: any, data: unknown) { res.json({ success: true, data }); }
function fail(res: any, code: string, msg: string, status = 400) { res.status(status).json({ success: false, error: msg, code }); }
function errMsg(e: unknown) { return e instanceof Error ? e.message : 'Внутренняя ошибка'; }

// Список дел
router.get('/api/cases', (req, res) => {
  try {
    const { status, userId, courtId, q } = req.query;
    const cases = listCases({
      status: (status as string) as import('../../core/types.js').CaseStatus | undefined,
      userId: userId as string | undefined,
      courtId: courtId as string | undefined,
      q: q as string | undefined,
    });
    ok(res, cases);
  } catch (e) { fail(res, 'STORE_ERROR', 'Ошибка получения списка: ' + errMsg(e), 500); }
});

// Статистика
router.get('/api/cases/stats', (_req, res) => {
  try { ok(res, getStats()); }
  catch (e) { fail(res, 'STORE_ERROR', errMsg(e), 500); }
});

// Одно дело
router.get('/api/cases/:uid', (req, res) => {
  try {
    const c = getCase(req.params.uid);
    if (!c) return fail(res, 'NOT_FOUND', 'Дело не найдено', 404);
    ok(res, c);
  } catch (e) { fail(res, 'STORE_ERROR', errMsg(e), 500); }
});

// Добавить дело в мониторинг
router.post('/api/cases', (req, res) => {
  try {
    const { url, courtId, courtCode, courtType, caseNumber, userId } = req.body ?? {};
    if (!url || !courtId || !courtType || !caseNumber) {
      return fail(res, 'BAD_REQUEST', 'url, courtId, courtType, caseNumber обязательны');
    }
    const c: WatchedCase = {
      uid: crypto.randomUUID(), url,
      courtId, courtCode: courtCode ?? courtId, courtType,
      number: caseNumber, status: 'monitoring',
      result: null, legalForceDate: null, legalForceNotified: false,
      userId: userId ?? null, lastChecked: null,
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
router.post('/api/cases/wait', (req, res) => {
  try {
    const { courtId, courtCode, courtType, party, filingDate, userId } = req.body ?? {};
    if (!courtId || !courtType || !party) {
      return fail(res, 'BAD_REQUEST', 'courtId, courtType, party обязательны');
    }
    const c: WatchedCase = {
      uid: crypto.randomUUID(), url: '',
      courtId, courtCode: courtCode ?? courtId, courtType,
      number: '', status: 'waiting',
      result: null, legalForceDate: null, legalForceNotified: false,
      userId: userId ?? null, lastChecked: null,
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

// Обновить дело
router.patch('/api/cases/:uid', (req, res) => {
  try {
    const updated = updateCase(req.params.uid, req.body ?? {});
    if (!updated) return fail(res, 'NOT_FOUND', 'Дело не найдено', 404);
    ok(res, updated);
  } catch (e) { fail(res, 'STORE_ERROR', errMsg(e), 500); }
});

// Удалить дело
router.delete('/api/cases/:uid', (req, res) => {
  try {
    const ok2 = deleteCase(req.params.uid);
    if (!ok2) return fail(res, 'NOT_FOUND', 'Дело не найдено', 404);
    ok(res, null);
  } catch (e) { fail(res, 'STORE_ERROR', errMsg(e), 500); }
});

export default router;
