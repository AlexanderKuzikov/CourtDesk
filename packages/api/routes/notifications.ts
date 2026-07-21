// NEW-003: GET /api/notifications — уведомления о событиях по делам
import { Router, type Request, type Response } from 'express';
import { listCases } from '../../store/index.js';
import type { Notification } from '../../core/types.js';

const router = Router();

// Временная реализация: синтезируем уведомления из статусов дел.
// Постоянное хранилище уведомлений (notifications.json) — следующий шаг.
router.get('/api/notifications', (_req: Request, res: Response) => {
  try {
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    // Дела, вступившие в силу сегодня
    const enforcedToday = listCases({ status: 'enforced' }).filter(
      c => c.legalForceDate === today && !c.legalForceNotified,
    );

    const notifications: Notification[] = enforcedToday.map(c => ({
      uid: crypto.randomUUID(),
      caseUid: c.uid,
      type: 'enforced',
      message: `Решение по делу ${c.number} вступило в законную силу`,
      read: false,
      createdAt: now,
    }));

    res.json({ success: true, data: notifications });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Ошибка получения уведомлений', code: 'STORE_ERROR' });
  }
});

export default router;
