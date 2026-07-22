import express from 'express';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import healthRouter from './routes/health.js';
import casesRouter from './routes/cases.js';
import searchRouter from './routes/search.js';
import parseRouter from './routes/parse.js';
import courtsRouter from './routes/courts.js';
import intakeRouter from './routes/intake.js';
// NEW-003 FIXED: подключены роутеры /api/status и /api/notifications
import statusRouter from './routes/status.js';
import notificationsRouter from './routes/notifications.js';
import { errorHandler } from './middleware/error.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, '..', 'viewer', 'public');

function corsMiddleware(_req: express.Request, res: express.Response, next: express.NextFunction) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (_req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
}

export function createApp() {
  const app = express();
  app.use(corsMiddleware);
  app.use(express.json({ limit: '1mb' }));

  app.use(healthRouter);
  app.use(casesRouter);
  app.use(searchRouter);
  app.use(parseRouter);
  app.use(courtsRouter);
  app.use(intakeRouter);
  // NEW-003: статус дашборда и уведомления
  app.use(statusRouter);
  app.use(notificationsRouter);

  app.use(express.static(PUBLIC_DIR));
  app.use(errorHandler);
  return app;
}

const PORT = Number(process.env['PORT']) || 8767;
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

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`[courtdesk] API: http://127.0.0.1:${PORT}`);
});
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
