import { readJson, writeJson } from './json-store.js';

export interface AppSettings {
  scheduleFull: string;        // время полного прогона, HH:mm
  retryIntervalHours: number;  // интервал retry-прогонов в часах
  retryStaleHours: number;     // дела с lastChecked старше N часов тоже в retry
  scheduleEnabled: boolean;    // вкл/выкл авторасписание
}

const FILE = 'settings.json';

const DEFAULTS: AppSettings = {
  scheduleFull: '03:00',
  retryIntervalHours: 3,
  retryStaleHours: 6,
  scheduleEnabled: true,
};

let _cache: AppSettings | null = null;

export function getSettings(): AppSettings {
  if (_cache) return _cache;
  const raw = readJson<Partial<AppSettings>>(FILE, {});
  _cache = { ...DEFAULTS, ...raw };
  return _cache!;
}

export function updateSettings(updates: Partial<AppSettings>): AppSettings {
  const current = getSettings();
  const updated = { ...current, ...updates };
  writeJson(FILE, updated);
  _cache = updated;
  return updated;
}
