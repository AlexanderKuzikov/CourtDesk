import { readJson, writeJson } from './json-store.js';
import type { WatchedCase, CaseStatus } from '../core/types.js';

const FILE = 'cases.json';

// In-memory cache — единственный источник истины в runtime.
// Сбрасывается только через save(). readFileSync вызывается один раз при старте.
let _cache: Map<string, WatchedCase> | null = null;

function load(): Map<string, WatchedCase> {
  if (_cache) return _cache;
  const raw = readJson<Record<string, WatchedCase>>(FILE, {});
  _cache = new Map(Object.entries(raw));
  return _cache;
}

function save(map: Map<string, WatchedCase>): void {
  _cache = map;
  const obj: Record<string, WatchedCase> = {};
  for (const [k, v] of map) obj[k] = v;
  writeJson(FILE, obj);
}

export function getCase(uid: string): WatchedCase | null {
  return load().get(uid) ?? null;
}

export function listCases(filter?: {
  status?: CaseStatus;
  userId?: string;
  courtId?: string;
  q?: string;
}): WatchedCase[] {
  const all = Array.from(load().values());
  if (!filter) return all;
  return all.filter(c => {
    if (filter.status && c.status !== filter.status) return false;
    if (filter.userId && c.userId !== filter.userId) return false;
    if (filter.courtId && c.courtId !== filter.courtId) return false;
    if (filter.q) {
      const q = filter.q.toLowerCase();
      if (!c.number.toLowerCase().includes(q) && !c.courtId.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

export function addCase(c: WatchedCase): void {
  const map = load();
  map.set(c.uid, c);
  save(map);
}

export function updateCase(uid: string, updates: Partial<WatchedCase>): WatchedCase | null {
  const map = load();
  const existing = map.get(uid);
  if (!existing) return null;
  const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
  map.set(uid, updated);
  save(map);
  return updated;
}

export function deleteCase(uid: string): boolean {
  const map = load();
  const existed = map.has(uid);
  if (!existed) return false; // BUG-006: не писать файл если uid не существует
  map.delete(uid);
  save(map);
  return true;
}

export function getStats(): { monitoring: number; waiting: number; decision: number; enforcedToday: number } {
  // Один проход по кэшу вместо 4×load()
  const all = Array.from(load().values());
  const today = new Date().toISOString().slice(0, 10);
  return {
    monitoring: all.filter(c => c.status === 'monitoring').length,
    waiting: all.filter(c => c.status === 'waiting').length,
    decision: all.filter(c => c.status === 'decision').length,
    enforcedToday: all.filter(c => c.status === 'enforced' && c.legalForceDate === today).length,
  };
}
