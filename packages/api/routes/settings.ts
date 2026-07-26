import { Router, type Request, type Response } from 'express';
import { getSettings, updateSettings } from '../../store/index.js';

const router = Router();

function errMsg(e: unknown) { return e instanceof Error ? e.message : 'Внутренняя ошибка'; }

router.get('/api/settings', (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: getSettings() });
  } catch (e) { res.status(500).json({ success: false, error: errMsg(e), code: 'SETTINGS_ERROR' }); }
});

router.put('/api/settings', (req: Request, res: Response) => {
  try {
    const allowed = ['scheduleFull', 'retryIntervalHours', 'retryStaleHours', 'scheduleEnabled'];
    const safe = Object.fromEntries(
      Object.entries(req.body ?? {}).filter(([k]) => allowed.includes(k)),
    );
    const updated = updateSettings(safe);
    res.json({ success: true, data: updated });
  } catch (e) { res.status(500).json({ success: false, error: errMsg(e), code: 'SETTINGS_ERROR' }); }
});

export default router;
