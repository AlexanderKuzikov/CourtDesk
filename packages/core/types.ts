export type CourtType = 'district' | 'appeal' | 'cassation' | 'magistrate';

export type CaseStatus = 'searching' | 'monitoring' | 'completed' | 'archived' | 'error';

export interface Case {
  uid: string;
  url: string;
  courtId: string;
  courtType: CourtType;
  number: string;
  status: CaseStatus;
  lastChecked: string | null;
  createdAt: string;
}

export interface CaseEvent {
  type: string;
  date: string;
  description: string;
  caseId: string;
}

export interface Client {
  id: string;
  name: string;
  inn: string | null;
  cases: string[];
}

export interface Scenario {
  id: string;
  name: string;
  trigger: 'search_found' | 'status_change' | 'date_reached';
  actions: ScenarioAction[];
}

export interface ScenarioAction {
  type: 'monitor' | 'notify' | 'webhook';
  params: Record<string, string>;
}

export interface SearchRequest {
  courtId?: string;
  courtType?: CourtType;
  caseNumber?: string;
  defendant?: string;
  plaintiff?: string;
}

export interface MonitorRequest {
  url: string;
  courtId: string;
  courtType: CourtType;
  caseNumber: string;
  clientId?: string;
}
