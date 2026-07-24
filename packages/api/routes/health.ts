import { Router } from 'express';

const router = Router();

router.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', version: '0.4.0' } });
});

export default router;