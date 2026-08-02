import { Router, type Request, type Response } from 'express';
import { getSettings, updateSettings } from '../../store/index.js';

const router = Router();

function errMsg(e: unknown) { return e instanceof Error ? e.message : 'Внутренняя ошибка'; }

router.get('/api/settings', (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: getSettings() });
  } catch (e) { res.status(500).json({ success: false, error: errMsg(e), code: 'SETTINGS_ERROR' }); }
});

// CR12-015 FIXED: валидация значений до записи в store
function validateSettings(safe: Record<string, unknown>): string | null {
  if ('scheduleFull' in safe) {
    const v = safe['scheduleFull'];
    const m = typeof v === 'string' && /^(\d{2}):(\d{2})$/.exec(v);
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) {
      return 'scheduleFull должен быть строкой HH:mm (00:00–23:59)';
    }
  }
  for (const key of ['retryIntervalHours', 'retryStaleHours'] as const) {
    if (key in safe) {
      const v = safe[key];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 1 || v > 720) {
        return `${key} должен быть числом от 1 до 720`;
      }
    }
  }
  if ('scheduleEnabled' in safe && typeof safe['scheduleEnabled'] !== 'boolean') {
    return 'scheduleEnabled должен быть boolean';
  }
  return null;
}

router.put('/api/settings', (req: Request, res: Response) => {
  try {
    const allowed = ['scheduleFull', 'retryIntervalHours', 'retryStaleHours', 'scheduleEnabled'];
    const safe = Object.fromEntries(
      Object.entries(req.body ?? {}).filter(([k]) => allowed.includes(k)),
    );
    const invalid = validateSettings(safe);
    if (invalid) {
      res.status(400).json({ success: false, error: invalid, code: 'INVALID_SETTINGS' });
      return;
    }
    const updated = updateSettings(safe);
    res.json({ success: true, data: updated });
  } catch (e) { res.status(500).json({ success: false, error: errMsg(e), code: 'SETTINGS_ERROR' }); }
});

export default router;
