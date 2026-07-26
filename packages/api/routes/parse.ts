import { Router, type Request, type Response } from 'express';
import iconv from 'iconv-lite';
import { getParseAdapter } from '../../parse/index.js';
import { findCourtByCodeOrSubdomain } from '../../core/index.js';
import { fetchWithCaptcha } from '../../captcha/session.js';
import { getRuCaptchaKey } from '../../core/config.js';
import { assertCourtUrl, isCaptchaPage } from '../../core/errors.js';
import { runFull, runRetry, runNew } from '../../scheduler/index.js';
import { saveCard } from '../../store/index.js';
import { getProgress, setProgress, resetProgress } from '../../core/index.js';

const router = Router();

// CR5-012 FIXED: guard от параллельных runFull() → 409 Conflict если прогон уже идёт
let _isRunning = false;

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : 'Внутренняя ошибка';
}

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

router.post('/api/parse/url', async (req: Request, res: Response) => {
  try {
    const { url, courtId, courtType } = req.body ?? {};
    if (!url) {
      return res.status(400).json({ success: false, error: 'url обязателен', code: 'BAD_REQUEST' });
    }
    try {
      assertCourtUrl(url);
    } catch {
      return res.status(400).json({ success: false, error: 'URL должен принадлежать судовой системе РФ (*.sudrf.ru или *.msudrf.ru)', code: 'INVALID_URL' });
    }
    const courtInfo = courtId ? findCourtByCodeOrSubdomain(courtId) : null;
    const type = courtType ?? courtInfo?.courtType ?? 'district';
    const adapter = getParseAdapter(type);
    let html: string;
    try {
      html = await fetchWithIconv(url);
    } catch {
      html = '';
    }

    // Если капча или fetch не удался — решаем через Puppeteer (для всех типов судов)
    if (!html || isCaptchaPage(html)) {
      const apiKey = getRuCaptchaKey();
      if (!apiKey) {
        return res.status(503).json({
          success: false,
          error: 'RUCAPTCHA_API_KEY не задан — требуется для прохождения капчи',
          code: 'CAPTCHA_KEY_MISSING',
        });
      }
      html = await fetchWithCaptcha({ url, apiKey });
    }
    const card = await adapter.parse(html, url);
    // Сохраняем полную карточку если известен uid дела
    if (card.uid) saveCard(card.uid, card);
    res.json({ success: true, data: card });
  } catch (err) {
    console.error('[parse/url]', err);
    res.status(500).json({ success: false, error: errMsg(err), code: 'PARSE_ERROR' });
  }
});

router.post('/api/parse/run', (req: Request, res: Response) => {
  // CR5-012: отклоняем если прогон уже идёт
  if (_isRunning) {
    return res.status(409).json({
      success: false,
      error: 'Прогон уже выполняется',
      code: 'RUN_IN_PROGRESS',
    });
  }

  const { mode } = req.body ?? {};
  let runner: () => Promise<{ ok: number; fail: number }>;
  switch (mode) {
    case 'full':   runner = runFull;  break;
    case 'retry':  runner = runRetry; break;
    case 'new':    runner = runNew;   break;
    default:       runner = runFull;  break;
  }

  _isRunning = true;
  resetProgress();
  setProgress({ running: true });
  res.status(202).json({ success: true, data: { status: 'started', mode: mode ?? 'full' } });

  runner()
    .then(result => {
      console.info(`[parse/run] mode=${mode ?? 'full'} done:`, result);
      setProgress({ running: false, total: result.ok + result.fail, processed: result.ok + result.fail, errors: result.fail });
    })
    .catch(err => {
      console.error('[parse/run] background error:', err);
      setProgress({ running: false, errors: 1 });
    })
    .finally(() => {
      _isRunning = false;
    });
});

// Прогресс мониторинга
router.get('/api/parse/progress', (_req, res) => {
  res.json({ success: true, data: getProgress() });
});

export default router;
