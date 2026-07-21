// Конфигурация CourtDesk — загрузка секретов из .env
import { resolve } from 'path';

// .env опционален: запуск без cp .env.example .env не должен падать
// NEW-009 FIXED: обрабатываем ENOENT и EACCES (нет файла / нет прав на чтение)
const SILENT_ENV_CODES = new Set(['ENOENT', 'EACCES']);
try {
  process.loadEnvFile(resolve(process.cwd(), '.env'));
} catch (e: unknown) {
  if (
    e instanceof Error &&
    'code' in e &&
    SILENT_ENV_CODES.has((e as NodeJS.ErrnoException).code!)
  ) {
    console.warn('[config] .env не загружен:', (e as NodeJS.ErrnoException).code);
  } else {
    throw e;
  }
}

export function getRuCaptchaKey(): string {
  return process.env['RUCAPTCHA_API_KEY'] || process.env['TWOCAPTCHA_API_KEY'] || '';
}

export function hasCaptchaKeys(): boolean {
  return Boolean(process.env['RUCAPTCHA_API_KEY'] || process.env['TWOCAPTCHA_API_KEY']);
}
