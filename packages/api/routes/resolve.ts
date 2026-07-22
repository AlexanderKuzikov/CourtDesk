import { Router, type Request, type Response } from 'express';
import { getSearchAdapter } from '../../search/index.js';
import type { SearchRequest } from '../../core/types.js';

const router = Router();

router.post('/api/resolve', (req: Request, res: Response) => {
  try {
    const { courtId, courtType, caseNumber } = req.body as Record<string, unknown>;
    if (!courtId || !courtType || !caseNumber) {
      res.status(400).json({ success: false, error: 'Необходимы courtId, courtType и caseNumber', code: 'BAD_REQUEST' });
      return;
    }
    const adapter = getSearchAdapter(String(courtType));
    const url = adapter.buildSearchUrl({
      courtId: String(courtId),
      courtCode: String(courtId),
      courtType: String(courtType),
      caseNumber: String(caseNumber),
    });
    res.json({ success: true, data: { url } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    res.status(400).json({ success: false, error: msg, code: 'RESOLVE_ERROR' });
  }
});

export default router;
