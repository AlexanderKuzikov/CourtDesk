import { Router, type Request, type Response } from 'express';
import iconv from 'iconv-lite';
import { getParseAdapter } from '../../parse/index.js';
import { findCourtByCodeOrSubdomain } from '../../core/index.js';
import { fetchMagistrateHtml } from '../../captcha/session.js';
import { getRuCaptchaKey } from '../../core/config.js';
import { runFull, runRetry, runNew } from '../../scheduler/index.js';

const router = Router();

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : 'Внутренняя ошибка';
}

// Фетч HTML с правильным CP1251-декодированием для обычных судов
async function fetchWithIconv(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'CourtDesk/0.1' },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('charset=utf-8') || ct.includes('charset=UTF-8')) {
    return res.text();
  }
  const buf = await res.arrayBuffer();
  return iconv.decode(Buffer.from(buf), 'win1251');
}

// Парсинг URL карточки
router.post('/api/parse/url', async (req: Request, res: Response) => {
  try {
    const { url, courtId, courtType } = req.body ?? {};
    if (!url) {
      return res.status(400).json({ success: false, error: 'url обязателен', code: 'BAD_REQUEST' });
    }

    const courtInfo = courtId ? findCourtByCodeOrSubdomain(courtId) : null;
    const type = courtType ?? courtInfo?.courtType ?? 'district';
    const adapter = getParseAdapter(type);

    let html: string;

    if (type === 'magistrate') {
      // BUG-003: msudrf.ru требует Puppeteer-сессию с решением капчи
      const apiKey = getRuCaptchaKey();
      if (!apiKey) {
        return res.status(503).json({
          success: false,
          error: 'RUCAPTCHA_API_KEY не задан — мировые суды недоступны',
          code: 'CAPTCHA_KEY_MISSING',
        });
      }
      html = await fetchMagistrateHtml({ url, apiKey });
    } else {
      html = await fetchWithIconv(url);
    }

    const card = await adapter.parse(html, url);
    res.json({ success: true, data: card });
  } catch (err) {
    console.error('[parse/url]', err);
    res.status(500).json({ success: false, error: errMsg(err), code: 'PARSE_ERROR' });
  }
});

// BUG-008: запуск парсинга асинхронно — 202 Accepted сразу
router.post('/api/parse/run', (req: Request, res: Response) => {
  const { mode } = req.body ?? {};

  let runner: () => Promise<{ ok: number; fail: number }>;
  switch (mode) {
    case 'full':  runner = runFull;  break;
    case 'retry': runner = runRetry; break;
    case 'new':   runner = runNew;   break;
    default:      runner = runFull;  break;
  }

  // Отвечаем сразу, прогон идёт в фоне
  res.status(202).json({ success: true, data: { status: 'started', mode: mode ?? 'full' } });

  runner().then(result => {
    console.info(`[parse/run] mode=${mode ?? 'full'} done:`, result);
  }).catch(err => {
    console.error('[parse/run] background error:', err);
  });
});

export default router;
