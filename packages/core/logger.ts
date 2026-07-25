// Простой файловый логгер (до перехода на pino — CR5-011)
import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = resolve(__dirname, '..', '..', 'logs');
const LOG_FILE = resolve(LOG_DIR, 'courtdesk.log');

function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
}

export function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, data?: unknown): void {
  try {
    ensureLogDir();
    const ts = new Date().toISOString();
    const line = data
      ? `[${ts}] [${level}] ${message} ${JSON.stringify(data)}\n`
      : `[${ts}] [${level}] ${message}\n`;
    appendFileSync(LOG_FILE, line, 'utf-8');
  } catch {
    // Логгер не должен валить приложение
  }
}

export function logRequest(method: string, url: string, status: number, durationMs: number): void {
  log('INFO', `${method} ${url} → ${status}`, { durationMs });
}
