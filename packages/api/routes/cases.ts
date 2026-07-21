import { Router } from 'express';
import { getCase, listCases, addCase, updateCase, deleteCase, getStats } from '../../store/index.js';
import type { WatchedCase } from '../../core/types.js';

const router = Router();

// Список дел
router.get('/api/cases', (req, res) => {
  const { status, userId, courtId, q } = req.query;
  const cases = listCases({
    status: (status as string) as import('../../core/types.js').CaseStatus | undefined,
    userId: userId as string | undefined,
    courtId: courtId as string | undefined,
    q: q as string | undefined,
  });
  res.json({ success: true, data: cases });
});

// Статистика
router.get('/api/cases/stats', (_req, res) => {
  res.json({ success: true, data: getStats() });
});

// Одно дело
router.get('/api/cases/:uid', (req, res) => {
  const c = getCase(req.params.uid);
  if (!c) return res.status(404).json({ success: false, error: 'Дело не найдено', code: 'NOT_FOUND' });
  res.json({ success: true, data: c });
});

// Добавить дело в мониторинг
router.post('/api/cases', (req, res) => {
  const { url, courtId, courtCode, courtType, caseNumber, userId } = req.body ?? {};
  if (!url || !courtId || !courtType || !caseNumber) {
    return res.status(400).json({ success: false, error: 'url, courtId, courtType, caseNumber обязательны', code: 'BAD_REQUEST' });
  }
  const c: WatchedCase = {
    uid: crypto.randomUUID(),
    url,
    courtId,
    courtCode: courtCode ?? courtId,
    courtType,
    number: caseNumber,
    status: 'monitoring',
    result: null,
    legalForceDate: null,
    legalForceNotified: false,
    userId: userId ?? null,
    lastChecked: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  addCase(c);
  const { addEvent } = require('../../store/events.js');
  addEvent(c.uid, {
    uid: crypto.randomUUID(),
    caseUid: c.uid,
    type: 'added',
    message: 'Добавлено в мониторинг',
    data: {},
    createdAt: c.createdAt,
  });
  res.json({ success: true, data: c });
});

// Отслеживать появление
router.post('/api/cases/wait', (req, res) => {
  const { courtId, courtCode, courtType, party, filingDate, userId } = req.body ?? {};
  if (!courtId || !courtType || !party) {
    return res.status(400).json({ success: false, error: 'courtId, courtType, party обязательны', code: 'BAD_REQUEST' });
  }
  const c: WatchedCase = {
    uid: crypto.randomUUID(),
    url: '',
    courtId,
    courtCode: courtCode ?? courtId,
    courtType,
    number: '',
    status: 'waiting',
    result: null,
    legalForceDate: null,
    legalForceNotified: false,
    userId: userId ?? null,
    lastChecked: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  addCase(c);
  const { addEvent } = require('../../store/events.js');
  addEvent(c.uid, {
    uid: crypto.randomUUID(),
    caseUid: c.uid,
    type: 'waiting',
    message: `Ожидается появление дела: ${party}, дата подачи ${filingDate ?? 'не указана'}`,
    data: { party, filingDate },
    createdAt: c.createdAt,
  });
  res.json({ success: true, data: c });
});

// Обновить дело
router.patch('/api/cases/:uid', (req, res) => {
  const { uid } = req.params;
  const updates = req.body ?? {};
  const updated = updateCase(uid, updates);
  if (!updated) return res.status(404).json({ success: false, error: 'Дело не найдено', code: 'NOT_FOUND' });
  res.json({ success: true, data: updated });
});

// Удалить дело
router.delete('/api/cases/:uid', (req, res) => {
  const ok = deleteCase(req.params.uid);
  if (!ok) return res.status(404).json({ success: false, error: 'Дело не найдено', code: 'NOT_FOUND' });
  res.json({ success: true, data: null });
});

export default router;
