import { getSettings } from '../store/settings.js';
import { runFull, runRetry, getRunningMode } from './index.js';

let _fullTimer: ReturnType<typeof setInterval> | null = null;
// CR10-012: _retryTimer removed — was declared but never assigned
let _lastRetryRun: string | null = null; // дата последнего retry ISO
let _lastFullRunDate: string | null = null; // CR10-011: guard против double-fire

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

// CR12-013 FIXED: scheduleFull интерпретируется в локальном времени сервера,
// guard-ключ тоже локальный (раньше UTC-дата мешалась с локальными часами)
function todayDateLocal(now: Date): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** Проверить, настало ли время полного прогона */
function shouldRunFull(now: Date, scheduleTime: string): boolean {
  if (!scheduleTime) return false;
  const [h, m] = scheduleTime.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return false;
  // CR10-011: guard — не запускать дважды в одно окно (при задержке event loop)
  const today = todayDateLocal(now);
  if (_lastFullRunDate === `${today}T${pad2(h)}:${pad2(m)}`) return false;
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
    // CR11-005: не стартуем поверх идущего прогона (API или предыдущий cron);
    // окно не «сжигаем» — повторим на следующем тике
    if (getRunningMode()) return;
    const now = new Date();

    // Полный прогон по расписанию (раз в сутки)
    if (shouldRunFull(now, settings.scheduleFull)) {
      const [h, m] = settings.scheduleFull.split(':').map(Number);
      _lastFullRunDate = `${todayDateLocal(now)}T${pad2(h)}:${pad2(m)}`;
      console.log('[cron] запуск полного мониторинга по расписанию');
      runFull().catch(err => console.error('[cron] full error:', err));
      return; // retry не в том же тике — runFull держит лок
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
  if (_fullTimer) {
    clearInterval(_fullTimer);
    _fullTimer = null;
  }
}
