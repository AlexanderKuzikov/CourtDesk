// CourtDesk — единые типы
// Собраны из CourtSniffer (поиск), CourtFlow (парсинг/мониторинг), CourtDesk (оркестратор)

// ---- Общие ----

export type CourtType = 'district' | 'appeal' | 'cassation' | 'magistrate';

export type CaseStatus = 'waiting' | 'monitoring' | 'decision' | 'enforced' | 'error';

// ---- Справочник судов ----

export interface CourtInfo {
  code: string;
  name: string;
  courtType: CourtType;
  subdomain: string;
  region: string;
  address: string;
  website: string;
  phone: string;
  oktmo: string;
  oktmoMethod: string;
}

// ---- Поиск (из CourtSniffer) ----

export interface SearchRequest {
  courtId: string;
  courtCode?: string;
  courtType: CourtType;
  caseNumber?: string;
  plaintiff?: string;
  defendant?: string;
  filingDateFrom?: string;
  filingDateTo?: string;
}

export interface SearchResult {
  caseNumber: string;
  caseUrl: string;
  uid: string;
  judge: string | null;
  result: string | null;
  legalForceDate: string | null;
  filingDate: string | null;
  decisionDate: string | null;
  parties: { role: string; name: string }[];
  courtId: string;
  courtCode?: string;
  courtType: CourtType;
  matchScore?: number;
}

// ---- Парсинг карточки (из CourtFlow, упрощён) ----

export interface CaseCard {
  uid: string;
  number: string;
  court: string;       // subdomain
  courtType: CourtType;
  filingDate: string | null;
  judge: string | null;
  result: string | null;
  legalForceDate: string | null;
  hearingDate: string | null;
  category: string[];
  events: CaseEvent[];
  parties: CaseParty[];
}

export interface CaseEvent {
  eventName: string | null;
  eventDate: string | null;   // YYYY-MM-DD
  result: string | null;
  judge: string | null;
  location: string | null;
  publishDate: string | null;
}

export interface CaseParty {
  role: string;
  name: string;
  inn?: string;
  ogrn?: string;
}

// ---- Хранилище / Дашборд ----

export interface WatchedCase {
  uid: string;
  url: string;
  courtId: string;       // subdomain
  courtCode: string;
  courtType: CourtType;
  number: string;
  status: CaseStatus;
  result: string | null;
  legalForceDate: string | null;
  legalForceNotified: boolean;
  userId: string | null;
  lastChecked: string | null;   // ISO
  createdAt: string;            // ISO
  updatedAt: string;            // ISO
}

export interface CaseHistoryEvent {
  uid: string;
  caseUid: string;
  type: string;          // 'added' | 'checked' | 'changed' | 'decision' | 'enforced'
  message: string;
  data: Record<string, unknown>;
  createdAt: string;     // ISO
}

// ---- Уведомления ----

export interface Notification {
  uid: string;
  caseUid: string;
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
}

// ---- Intake ----

export type IntentionType = 'case_card' | 'search' | 'malformed';

export interface Intention {
  type: IntentionType;
  url?: string;
  courtId?: string;
  courtType?: CourtType;
  caseId?: string;
  caseNumber?: string;
  defendant?: string;
  plaintiff?: string;
  error?: string;
}

export interface IntakeRequest {
  input: string;
}

// ---- API ----

export interface ApiResponse<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: string;
  code: string;
}

// ---- Запросы к API ----

export interface AddMonitorRequest {
  courtId?: string;
  courtCode?: string;
  courtType?: CourtType;
  caseNumber?: string;
  url?: string;
  userId?: string;
}

export interface WaitMonitorRequest {
  courtId: string;
  courtCode?: string;
  courtType?: CourtType;
  party: string;
  filingDate: string;
  userId?: string;
}

export interface ResolveRequest {
  courtId: string;
  caseNumber: string;
}

export interface SearchNumberRequest {
  courtId: string;
  courtType?: CourtType;
  caseNumber: string;
}

export interface SearchPartyRequest {
  courtId: string;
  courtType?: CourtType;
  defendant?: string;
  plaintiff?: string;
  from?: string;
  to?: string;
}

export interface ParseRunRequest {
  mode: 'full' | 'new' | 'errors';
}

// ---- Статус дашборда ----

export interface DashboardStatus {
  monitoring: number;
  waiting: number;
  decision: number;
  enforcedToday: number;
  health: 'ok' | 'degraded' | 'error';
}
