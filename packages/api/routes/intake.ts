import { Router } from 'express';
import { classify } from '../../intake/index.js';

const router = Router();

router.post('/api/intake', (req, res) => {
  const { input } = req.body ?? {};
  if (!input || typeof input !== 'string') {
    return res.status(400).json({ success: false, error: 'input обязателен', code: 'BAD_REQUEST' });
  }
  const result = classify(input);
  res.json({ success: true, data: result });
});

export default router;
