import type { WatchedCase, CaseStatus } from '../core/types.js';

// Re-export core types
export type { WatchedCase, CaseStatus };

export interface DashboardStats {
  monitoring: number;
  waiting: number;
  decision: number;
  enforcedToday: number;
  health: 'ok' | 'degraded' | 'error';
}

export interface Notification {
  uid: string;
  caseUid: string;
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface CaseEvent {
  uid: string;
  caseUid: string;
  type: string;
  message: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface RunLogEntry {
  ts: string;
  mode: string;
  ok?: boolean;
  error?: string;
}

export type TabId = 'cases' | 'notifications' | 'run';
export type View = 'list' | 'detail';
