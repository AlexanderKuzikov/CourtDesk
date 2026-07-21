import { Router } from 'express';
import { getParseAdapter } from '../../parse/index.js';
import { findCourtByCodeOrSubdomain } from '../../core/index.js';
import { runFull, runRetry, runNew } from '../../scheduler/index.js';

const router = Router();

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : 'Внутренняя ошибка';
}

// Парсинг URL карточки
router.post('/api/parse/url', async (req, res) => {
  try {
    const { url, courtId, courtType } = req.body ?? {};
    if (!url) {
      return res.status(400).json({ success: false, error: 'url обязателен', code: 'BAD_REQUEST' });
    }
    const courtInfo = courtId ? findCourtByCodeOrSubdomain(courtId) : null;
    const type = courtType ?? courtInfo?.courtType ?? 'district';
    const adapter = getParseAdapter(type);
    const html = await fetch(url, {
      headers: { 'User-Agent': 'CourtDesk/0.1' },
      signal: AbortSignal.timeout(60000),
    }).then(r => r.text());
    const card = await adapter.parse(html, url);
    res.json({ success: true, data: card });
  } catch (err) {
    console.error('[parse/url]', err);
    res.status(500).json({ success: false, error: errMsg(err), code: 'PARSE_ERROR' });
  }
});

// Запуск парсинга
router.post('/api/parse/run', async (req, res) => {
  try {
    const { mode } = req.body ?? {};
    let result: { ok: number; fail: number };
    switch (mode) {
      case 'full':  result = await runFull(); break;
      case 'retry': result = await runRetry(); break;
      case 'new':   result = await runNew(); break;
      default:      result = await runFull(); break;
    }
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[parse/run]', err);
    res.status(500).json({ success: false, error: errMsg(err), code: 'SCHEDULE_ERROR' });
  }
});

export default router;
