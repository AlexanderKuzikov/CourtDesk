import express from 'express';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import healthRouter from './routes/health.js';
import casesRouter from './routes/cases.js';
import searchRouter from './routes/search.js';
import parseRouter from './routes/parse.js';
import courtsRouter from './routes/courts.js';
import intakeRouter from './routes/intake.js';
import { errorHandler } from './middleware/error.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, '..', 'viewer', 'public');

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(healthRouter);
  app.use(casesRouter);
  app.use(searchRouter);
  app.use(parseRouter);
  app.use(courtsRouter);
  app.use(intakeRouter);
  app.use(express.static(PUBLIC_DIR));
  app.use(errorHandler);
  return app;
}

const PORT = Number(process.env['PORT']) || 8767;
const app = createApp();
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[courtdesk] API: http://127.0.0.1:${PORT}`);
});
