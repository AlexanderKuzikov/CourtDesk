import type { Request, Response, NextFunction } from 'express';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  console.error('[api]', err);
  res.status(500).json({ success: false, error: err.message || 'Внутренняя ошибка', code: 'INTERNAL_ERROR' });
}
