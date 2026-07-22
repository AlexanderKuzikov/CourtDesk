import { Router, type Request, type Response } from 'express';
import { listNotifications, markAsRead, addNotification } from '../../store/index.js';
import type { Notification } from '../../core/types.js';

const router = Router();

router.get('/api/notifications', (_req: Request, res: Response) => {
  try {
    const notifications = listNotifications();
    res.json({ success: true, data: notifications });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Ошибка получения уведомлений', code: 'STORE_ERROR' });
  }
});

router.patch('/api/notifications/:uid/read', (req: Request, res: Response) => {
  try {
    const ok = markAsRead(req.params['uid']);
    if (!ok) {
      res.status(404).json({ success: false, error: 'Уведомление не найдено', code: 'NOT_FOUND' });
      return;
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Ошибка обновления уведомления', code: 'STORE_ERROR' });
  }
});

export default router;
