import { Router } from 'express';
import { getSearchAdapter } from '../../search/index.js';
import { findCourtByCodeOrSubdomain } from '../../core/index.js';
import type { SearchRequest } from '../../core/types.js';

const router = Router();

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : 'Внутренняя ошибка';
}

// Поиск по УИД (уникальному идентификатору дела)
router.post('/api/search/by-case-uid', async (req, res) => {
  try {
    const { courtId, courtType, caseUid } = req.body ?? {};
    if (!courtId || !caseUid) {
      return res.status(400).json({ success: false, error: 'courtId и caseUid обязательны', code: 'BAD_REQUEST' });
    }
    const courtInfo = findCourtByCodeOrSubdomain(courtId);
    if (!courtInfo) {
      return res.status(404).json({ success: false, error: `Суд "${courtId}" не найден`, code: 'COURT_NOT_FOUND' });
    }
    const type = courtType ?? courtInfo.courtType;
    const adapter = getSearchAdapter(type);
    const reqData: SearchRequest = {
      courtId: courtInfo.subdomain,
      courtCode: courtInfo.code,
      courtType: type,
      caseUid,
    };
    const results = await adapter.searchByCaseUid(reqData);
    res.json({
      success: true,
      data: {
        found: results.length > 0,
        count: results.length,
        results,
        court: { code: courtInfo.code, name: courtInfo.name },
      },
    });
  } catch (err) {
    console.error('[search/by-case-uid]', err);
    res.status(500).json({ success: false, error: errMsg(err), code: 'SEARCH_ERROR' });
  }
});

// Поиск по номеру дела
router.post('/api/search/by-number', async (req, res) => {
  try {
    const { courtId, courtType, caseNumber } = req.body ?? {};
    if (!courtId || !caseNumber) {
      return res.status(400).json({ success: false, error: 'courtId и caseNumber обязательны', code: 'BAD_REQUEST' });
    }
    const courtInfo = findCourtByCodeOrSubdomain(courtId);
    if (!courtInfo) {
      return res.status(404).json({ success: false, error: `Суд "${courtId}" не найден`, code: 'COURT_NOT_FOUND' });
    }
    const type = courtType ?? courtInfo.courtType;
    const adapter = getSearchAdapter(type);
    const reqData: SearchRequest = {
      courtId: courtInfo.subdomain,
      courtCode: courtInfo.code,
      courtType: type,
      caseNumber,
    };
    const results = await adapter.searchByCaseNumber(reqData);
    res.json({
      success: true,
      data: {
        found: results.length > 0,
        count: results.length,
        results,
        court: { code: courtInfo.code, name: courtInfo.name },
      },
    });
  } catch (err) {
    console.error('[search/by-number]', err);
    res.status(500).json({ success: false, error: errMsg(err), code: 'SEARCH_ERROR' });
  }
});

// Поиск по участникам
router.post('/api/search/by-party', async (req, res) => {
  try {
    const { courtId, courtType, defendant, plaintiff, from, to } = req.body ?? {};
    if (!courtId || (!defendant && !plaintiff)) {
      return res.status(400).json({ success: false, error: 'courtId и defendant/plaintiff обязательны', code: 'BAD_REQUEST' });
    }
    const courtInfo = findCourtByCodeOrSubdomain(courtId);
    if (!courtInfo) {
      return res.status(404).json({ success: false, error: `Суд "${courtId}" не найден`, code: 'COURT_NOT_FOUND' });
    }
    const type = courtType ?? courtInfo.courtType;
    const adapter = getSearchAdapter(type);
    const reqData: SearchRequest = {
      courtId: courtInfo.subdomain,
      courtCode: courtInfo.code,
      courtType: type,
      defendant,
      plaintiff,
      filingDateFrom: from,
      filingDateTo: to,
    };
    const results = await adapter.searchByParty(reqData);
    res.json({
      success: true,
      data: {
        found: results.length > 0,
        count: results.length,
        results,
        court: { code: courtInfo.code, name: courtInfo.name },
      },
    });
  } catch (err) {
    console.error('[search/by-party]', err);
    res.status(500).json({ success: false, error: errMsg(err), code: 'SEARCH_ERROR' });
  }
});

export default router;
