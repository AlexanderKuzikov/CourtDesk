import { Router, type Request, type Response } from 'express';
import { getSearchAdapter } from '../../search/index.js';
import type { SearchRequest, CourtType } from '../../core/types.js';

const router = Router();

function validateCourtType(v: unknown): CourtType {
  const s = String(v);
  if (['district', 'appeal', 'cassation', 'magistrate'].includes(s)) return s as CourtType;
  throw new Error(`Неизвестный тип суда: ${s}`);
}

router.post('/api/resolve', (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const courtId = String(body['courtId'] ?? '');
    const caseNumber = String(body['caseNumber'] ?? '');
    const courtTypeRaw = body['courtType'];
    if (!courtId || !courtTypeRaw || !caseNumber) {
      res.status(400).json({ success: false, error: 'Необходимы courtId, courtType и caseNumber', code: 'BAD_REQUEST' });
      return;
    }
    const courtType = validateCourtType(courtTypeRaw);
    const adapter = getSearchAdapter(courtType);
    const url = adapter.buildSearchUrl({ courtId, courtCode: courtId, courtType, caseNumber });
    res.json({ success: true, data: { url } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    res.status(400).json({ success: false, error: msg, code: 'RESOLVE_ERROR' });
  }
});

export default router;
