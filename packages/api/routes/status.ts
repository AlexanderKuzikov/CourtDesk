// NEW-003: GET /api/status — счётчики дашборда + health сервиса
import { Router, type Request, type Response } from 'express';
import { getStats } from '../../store/index.js';
import type { DashboardStatus } from '../../core/types.js';

const router = Router();

router.get('/api/status', (_req: Request, res: Response) => {
  try {
    const stats = getStats();
    const status: DashboardStatus = {
      monitoring: stats.monitoring,
      waiting: stats.waiting,
      decision: stats.decision,
      enforcedToday: stats.enforcedToday,
      health: 'ok',
    };
    res.json({ success: true, data: status });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: 'Ошибка получения статуса',
      code: 'STORE_ERROR',
    });
  }
});

export default router;
