import pino from 'pino';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = resolve(__dirname, '..', '..', 'logs');

// CR12-S05 FIXED: проблемы с logs/ не роняют процесс при импорте —
// fallback на stdout-логгер
let logger: pino.Logger;
try {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
  const transport = pino.transport({
    targets: [
      { target: 'pino/file', options: { destination: resolve(LOG_DIR, 'courtdesk.log') } },
      { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
    ],
  });
  logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' }, transport);
} catch {
  logger = pino({ level: process.env['LOG_LEVEL'] ?? 'info' });
}

export function log(level: 'INFO' | 'WARN' | 'ERROR', message: string, data?: unknown): void {
  const fn = level === 'ERROR' ? logger.error : level === 'WARN' ? logger.warn : logger.info;
  if (data) fn(data as Record<string, unknown>, message);
  else fn(message);
}

export function logRequest(method: string, url: string, status: number, durationMs: number): void {
  logger.info({ method, url, status, durationMs }, `${method} ${url} -> ${status}`);
}

export default logger;
