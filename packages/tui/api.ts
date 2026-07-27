const BASE = 'http://127.0.0.1:8767/api';

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const r = await fetch(`${BASE}${path}`, { ...opts, signal: ctrl.signal });
    const j = await r.json();
    if (!r.ok || !j.success) throw new Error(j.error ?? `HTTP ${r.status}`);
    return j.data as T;
  } finally {
    clearTimeout(t);
  }
}

import type { WatchedCase, DashboardStats, Notification, CaseEvent } from './types.js';

export function listCases(): Promise<WatchedCase[]> {
  return apiFetch<WatchedCase[]>('/cases');
}

export function getCase(uid: string): Promise<WatchedCase> {
  return apiFetch<WatchedCase>(`/cases/${uid}`);
}

export function getStats(): Promise<DashboardStats> {
  return apiFetch<DashboardStats>('/cases/stats');
}

export function getNotifications(): Promise<Notification[]> {
  return apiFetch<Notification[]>('/notifications');
}

export function addCase(body: {
  url: string;
  courtId: string;
  courtCode?: string;
  courtType: string;
  caseNumber: string;
}): Promise<WatchedCase> {
  return apiFetch<WatchedCase>('/cases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function deleteCase(uid: string): Promise<null> {
  return apiFetch<null>(`/cases/${uid}`, { method: 'DELETE' });
}

export function runParse(mode: 'full' | 'retry' | 'new'): Promise<{ started: boolean }> {
  return apiFetch<{ started: boolean }>('/parse/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  });
}

export function getCaseEvents(uid: string): Promise<CaseEvent[]> {
  return apiFetch<CaseEvent[]>(`/cases/${uid}/events`);
}
