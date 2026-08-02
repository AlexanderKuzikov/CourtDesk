import type { Request, Response, NextFunction } from 'express';
import logger from '../../core/logger.js';

// CR12-014 FIXED: детали ошибки идут только в лог, клиенту — generic-сообщение
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  logger.error({ err }, '[api] unhandled error');
  res.status(500).json({ success: false, error: 'Внутренняя ошибка сервера', code: 'INTERNAL_ERROR' });
}
