import { Router } from 'express';
import { findCourtsByName, findCourtByCodeOrSubdomain, getTotalCourts } from '../../core/index.js';

const router = Router();

// Поиск судов / общая информация
router.get('/api/courts', (req, res) => {
  const q = req.query.q;
  if (q && typeof q === 'string') {
    const courts = findCourtsByName(q).slice(0, 30);
    return res.json({ success: true, data: courts });
  }
  res.json({ success: true, data: { total: getTotalCourts() } });
});

// Инфо о суде
router.get('/api/courts/:id', (req, res) => {
  const court = findCourtByCodeOrSubdomain(req.params.id);
  if (!court) {
    return res.status(404).json({ success: false, error: 'Суд не найден', code: 'NOT_FOUND' });
  }
  res.json({ success: true, data: court });
});

export default router;
