// Хранилище полных карточек дел (CaseCard)
import { readJson, writeJson } from './json-store.js';
import type { CaseCard } from '../core/types.js';

const FILE = 'cards.json';

let _cache: Map<string, CaseCard> | null = null;

function load(): Map<string, CaseCard> {
  if (_cache) return _cache;
  const raw = readJson<Record<string, CaseCard>>(FILE, {});
  _cache = new Map(Object.entries(raw));
  return _cache;
}

function save(map: Map<string, CaseCard>): void {
  _cache = map;
  const obj: Record<string, CaseCard> = {};
  for (const [k, v] of map) obj[k] = v;
  writeJson(FILE, obj);
}

export function getCard(uid: string): CaseCard | null {
  return load().get(uid) ?? null;
}

export function saveCard(uid: string, card: CaseCard): void {
  const map = load();
  map.set(uid, card);
  save(map);
}

export function deleteCard(uid: string): void {
  const map = load();
  map.delete(uid);
  save(map);
}
