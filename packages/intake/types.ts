import type { CourtType } from '../core/types.js';

/** Результат классификации входного запроса */
export type Classification =
  | CaseCardClassification
  | SearchClassification
  | MalformedClassification;

export interface CaseCardClassification {
  type: 'case_card';
  url: string;
  courtId: string;
  courtType: CourtType;
  caseId: string;
  caseUid: string | null;
  deloId: string | null;
}

export interface SearchClassification {
  type: 'search';
  courtId?: string;
  courtType?: CourtType;
  caseNumber?: string;
  defendant?: string;
  plaintiff?: string;
}

export interface MalformedClassification {
  type: 'malformed';
  error: string;
}

/** Параметры запроса на классификацию */
export interface IntakeRequest {
  input: string;
  courtId?: string;
  courtType?: CourtType;
}
