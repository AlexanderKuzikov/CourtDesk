import { readJson, writeJson } from './json-store.js';
import type { CaseHistoryEvent } from '../core/types.js';

const FILE = 'events.json';

// In-memory cache — аналогично cases.ts
let _cache: Map<string, CaseHistoryEvent[]> | null = null;

function load(): Map<string, CaseHistoryEvent[]> {
  if (_cache) return _cache;
  const raw = readJson<Record<string, CaseHistoryEvent[]>>(FILE, {});
  _cache = new Map(Object.entries(raw));
  return _cache;
}

function save(map: Map<string, CaseHistoryEvent[]>): void {
  _cache = map;
  const obj: Record<string, CaseHistoryEvent[]> = {};
  for (const [k, v] of map) obj[k] = v;
  writeJson(FILE, obj);
}

export function getEvents(caseUid: string): CaseHistoryEvent[] {
  return load().get(caseUid) ?? [];
}

export function addEvent(caseUid: string, event: CaseHistoryEvent): void {
  const map = load();
  const events = map.get(caseUid) ?? [];
  events.push({ ...event, caseUid });
  map.set(caseUid, events);
  save(map);
}

export function clearEvents(caseUid: string): void {
  const map = load();
  if (!map.has(caseUid)) return; // не писать файл если ключа нет
  map.delete(caseUid);
  save(map);
}
