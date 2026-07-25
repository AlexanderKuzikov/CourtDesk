import express from 'express';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import healthRouter from './routes/health.js';
import casesRouter from './routes/cases.js';
import searchRouter from './routes/search.js';
import parseRouter from './routes/parse.js';
import courtsRouter from './routes/courts.js';
import intakeRouter from './routes/intake.js';
import statusRouter from './routes/status.js';
import notificationsRouter from './routes/notifications.js';
import resolveRouter from './routes/resolve.js';
import { errorHandler } from './middleware/error.js';
import { logRequest } from '../core/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, '..', 'viewer', 'public');

// CR5-004 FIXED: убран Authorization из allow-headers при wildcard origin.
// Если понадобится авторизация — заменить '*' на конкретный ALLOWED_ORIGIN из .env.
function corsMiddleware(_req: express.Request, res: express.Response, next: express.NextFunction) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (_req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
}

export function createApp() {
  const app = express();
  app.use(corsMiddleware);
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => logRequest(req.method, req.originalUrl, res.statusCode, Date.now() - start));
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.use(healthRouter);
  app.use(casesRouter);
  app.use(searchRouter);
  app.use(parseRouter);
  app.use(courtsRouter);
  app.use(intakeRouter);
  app.use(statusRouter);
  app.use(notificationsRouter);
  app.use(resolveRouter);
  app.use(express.static(PUBLIC_DIR));
  app.use(errorHandler);
  return app;
}

const PORT = Number(process.env['PORT']) || 8767;
// CR5-010 FIXED: HOST из env, fallback 127.0.0.1
const HOST = process.env['HOST'] ?? '127.0.0.1';

const app = createApp();

function gracefulShutdown(signal: string) {
  console.log(`[courtdesk] ${signal} получен, завершаю работу...`);
  server.close(() => {
    console.log('[courtdesk] HTTP сервер остановлен');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('[courtdesk] Принудительное завершение по таймауту');
    process.exit(1);
  }, 10_000).unref();
}

const server = app.listen(PORT, HOST, () => {
  console.log(`[courtdesk] API: http://${HOST}:${PORT}`);
});

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
