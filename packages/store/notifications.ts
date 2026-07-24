import { readJson, writeJson } from './json-store.js';
import type { Notification } from '../core/types.js';

const FILE = 'notifications.json';

let _cache: Notification[] | null = null;

function load(): Notification[] {
  if (_cache) return _cache;
  const raw = readJson<Notification[]>(FILE, []);
  _cache = raw;
  return _cache;
}

function save(data: Notification[]): void {
  _cache = data;
  writeJson(FILE, data);
}

export function addNotification(notif: Notification): void {
  const list = load();
  list.push(notif);
  save(list);
}

export function listNotifications(): Notification[] {
  return load();
}

export function markAsRead(uid: string): boolean {
  const list = load();
  const found = list.find(n => n.uid === uid);
  if (!found) return false;
  found.read = true;
  save(list);
  return true;
}

export function clearNotifications(): void {
  _cache = null;
  save([]);
}

export function deleteNotificationsByCase(caseUid: string): void {
  const list = load();
  const filtered = list.filter(n => n.caseUid !== caseUid);
  if (filtered.length === list.length) return; // не писать файл если ничего не изменилось
  save(filtered);
}