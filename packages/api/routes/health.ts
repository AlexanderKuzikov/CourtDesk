import { Router } from 'express';
import { getTotalCourts, hasCaptchaKeys } from '../../core/index.js';

const router = Router();

router.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', version: '0.1.0' } });
});

router.get('/api/status', (_req, res) => {
  const { getStats } = require('../../store/index.js');
  const stats = getStats();
  res.json({
    success: true,
    data: {
      ...stats,
      totalCourts: getTotalCourts(),
      captcha: hasCaptchaKeys(),
    },
  });
});

export default router;
