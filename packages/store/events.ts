import { readJson, writeJson } from './json-store.js';
import type { CaseHistoryEvent } from '../core/types.js';

const FILE = 'events.json';

function load(): Map<string, CaseHistoryEvent[]> {
  const raw = readJson<Record<string, CaseHistoryEvent[]>>(FILE, {});
  return new Map(Object.entries(raw));
}

function save(map: Map<string, CaseHistoryEvent[]>): void {
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
  events.push(event);
  map.set(caseUid, events);
  save(map);
}

export function clearEvents(caseUid: string): void {
  const map = load();
  map.delete(caseUid);
  save(map);
}
