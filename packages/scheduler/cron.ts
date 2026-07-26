import { getSettings } from '../store/settings.js';
import { runFull, runRetry } from './index.js';

let _fullTimer: ReturnType<typeof setInterval> | null = null;
let _retryTimer: ReturnType<typeof setInterval> | null = null;
let _lastRetryRun: string | null = null; // дата последнего retry YYYY-MM-DD HH:00

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Проверить, настало ли время полного прогона */
function shouldRunFull(now: Date, scheduleTime: string): boolean {
  if (!scheduleTime) return false;
  const [h, m] = scheduleTime.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return false;
  // В окне 5 минут после назначенного времени
  const diff = now.getHours() * 60 + now.getMinutes() - (h * 60 + m);
  return diff >= 0 && diff < 5;
}

/** Проверить, прошло ли N часов с последнего retry */
function shouldRunRetry(now: Date, intervalHours: number): boolean {
  if (!_lastRetryRun) return true;
  const last = new Date(_lastRetryRun);
  const elapsed = (now.getTime() - last.getTime()) / (1000 * 60 * 60);
  return elapsed >= intervalHours;
}

async function tick() {
  try {
    const settings = getSettings();
    if (!settings.scheduleEnabled) return;

    const now = new Date();

    // Полный прогон по расписанию (раз в сутки)
    if (shouldRunFull(now, settings.scheduleFull)) {
      console.log('[cron] запуск полного мониторинга по расписанию');
      runFull().catch(err => console.error('[cron] full error:', err));
    }

    // Retry-прогон каждые N часов
    if (shouldRunRetry(now, settings.retryIntervalHours)) {
      _lastRetryRun = now.toISOString();
      console.log('[cron] запуск retry по расписанию');
      runRetry().catch(err => console.error('[cron] retry error:', err));
    }
  } catch {
    // игнорируем ошибки cron
  }
}

export function startCron(): void {
  if (_fullTimer) return; // уже запущен
  console.log('[cron] запуск планировщика (интервал: 60с)');
  _lastRetryRun = new Date().toISOString(); // не запускать retry сразу при старте
  _fullTimer = setInterval(tick, 60_000);
}

export function stopCron(): void {
  if (_fullTimer) { clearInterval(_fullTimer); _fullTimer = null; }
  if (_retryTimer) { clearInterval(_retryTimer); _retryTimer = null; }
}
