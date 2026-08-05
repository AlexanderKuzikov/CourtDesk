// CourtDesk — единые типы
// Собраны из CourtSniffer (поиск), CourtFlow (парсинг/мониторинг), CourtDesk (оркестратор)

// ---- Общие ----
export type CourtType = 'district' | 'appeal' | 'cassation' | 'magistrate';

// NEW-007 FIXED: добавлен 'archived', синхронизировано с ARCHITECTURE.md §5.4
// Реальный lifecycle: waiting → monitoring → decision → enforced → archived
export type CaseStatus =
  | 'waiting'    // ожидается появление дела
  | 'monitoring' // дело найдено, периодически парсим
  | 'decision'   // решение вынесено, ждём вступления в силу
  | 'enforced'   // решение вступило в законную силу
  | 'archived'   // дело завершено/заархивировано пользователем
  | 'error';     // последний прогон завершился ошибкой

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
  caseUid?: string;
}

export interface SearchResult {
  caseNumber: string;   // судебный номер дела, напр. «2-124/2026» — то, чем оперируют люди
  caseUrl: string;
  caseUid: string | null;   // УИД ГАС «Правосудие» (XXWWXXXX-XX-XXXX-XXXXXX-XX)
  caseId: string | null;    // номер карточки в картотеке суда (case_id из URL)
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

// ---- Парсинг карточки (из CourtFlow) ----
export interface CaseCard {
  $schema: string;
  uid: string;      // судебный номер дела, напр. «2-2808/2026» (единый смысл для всех судов)
  type: string;
  number: string;   // судебный номер дела (дублирует uid — для совместимости с CourtFlow)
  court: string; // subdomain без суффикса .sudrf.ru / .msudrf.ru
  courtType: CourtType;
  identifiers: {
    delo_id: string | null;
    case_uid: string | null;  // УИД ГАС «Правосудие» (XXWWXXXX-XX-XXXX-XXXXXX-XX)
    case_type: string | null;
    case_id: string | null;   // номер карточки в картотеке суда
  };
  publishedAt: string | null; // ISO
  modifiedAt: string | null;
  card: {
    filingDate: string | null;    // YYYY-MM-DD
    category: string[];
    judge: string | null;
    hearingDate: string | null;
    result: string | null;
    proceedingType: string | null;
  };
  events: CaseEvent[];
  parties: CaseParty[];
}

export interface CaseEvent {
  eventName: string | null;
  eventDate: string | null;  // YYYY-MM-DD
  eventTime: string | null;
  location: string | null;
  result: string | null;
  reason: string | null;
  judge: string | null;
  note: string | null;
  publishDate: string | null;
}

export interface CaseParty {
  role: string | null;
  name: string | null;
  inn: string | null;
  kpp: string | null;
  ogrn: string | null;
  ogrnip: string | null;
}

// ---- Хранилище / Дашборд ----
export interface WatchedCase {
  uid: string;
  url: string;
  courtId: string;           // subdomain
  courtCode: string;
  courtType: CourtType;
  number: string;
  caseUid: string | null;    // УИД (XXWWXXXX-XX-XXXX-XXXXXX-XX)
  status: CaseStatus;
  result: string | null;
  legalForceDate: string | null;
  legalForceNotified: boolean;
  enforcedAt: string | null;  // ISO когда впервые проставлен enforced
  userId: string | null;
  lastChecked: string | null; // ISO
  createdAt: string;          // ISO
  updatedAt: string;          // ISO
  errorCount: number;         // сколько раз подряд ошибка (сбрасывается при успехе)
  lastError: string | null;   // последнее сообщение об ошибке
}

export interface CaseHistoryEvent {
  uid: string;
  caseUid: string;
  type: string; // 'added' | 'checked' | 'changed' | 'decision' | 'enforced' | 'found'
  message: string;
  data: Record<string, unknown>;
  createdAt: string; // ISO
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

export interface SearchUidRequest {
  courtId: string;
  courtType?: CourtType;
  caseUid: string;
}

// NEW-006 FIXED: mode синхронизирован с реальным switch в parse.ts
export interface ParseRunRequest {
  mode: 'full' | 'retry' | 'new';
}

// ---- Статус дашборда ----
export interface DashboardStatus {
  monitoring: number;
  waiting: number;
  decision: number;
  enforcedToday: number;
  health: 'ok' | 'degraded' | 'error';
}

// ---- Совместимость с CourtFlow (parse-адаптеры) ----
/** Алиас для обратной совместимости с кодом из CourtFlow */
export type Case = CaseCard;

export interface CourtAdapter {
  parse(html: string, url: string): Promise<CaseCard>;
}

export interface RunResult {
  courtId: string;
  courtType: CourtType;
  url: string;
  success: boolean;
  uid?: string;
  error?: string;
  duration: number;
  timestamp: string;
}
