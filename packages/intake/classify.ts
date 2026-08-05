import type { CourtType } from '../core/types.js';
import type { Classification, CaseCardClassification, SearchClassification } from './types.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// CR12-S10 FIXED: Ё/ё в префиксе и суффиксе номера дела, /iu
// NEW-010 FIXED: расширенный паттерн номеров дел РФ
// CR5-005 FIXED: /iu вместо /i — корректный Unicode case-insensitive для кириллицы
const CASE_NUMBER_RE = /^[А-ЯЁA-Z]?\d+[а-яёa-z]?[-–][А-ЯёЁа-яёЁ\d]+([-–][А-ЯёЁа-яёЁ\d]+)*(\/\d{4})?$/iu;

// CR12-S10 FIXED: латиница допускается — иностранные ФИО/организации
// CR5-005 FIXED: /u для корректного Unicode matching
const WORD_RE = /^[А-ЯЁа-яёA-Za-z]+(-[А-ЯЁа-яёA-Za-z]+)?$/u;

// CR12-S10 FIXED: лимит длины входа — защита от патологических строк
const MAX_INPUT_LENGTH = 500;

function detectCourtTypeFromHost(host: string, deloId: string | null): CourtType {
  if (host.endsWith('.msudrf.ru')) return 'magistrate';
  if (deloId === '2800001') return 'cassation';
  if (deloId === '5') return 'appeal';
  return 'district';
}

function extractCourtId(host: string): string {
  if (host.endsWith('.msudrf.ru')) return host.replace('.msudrf.ru', '');
  return host.replace('.sudrf.ru', '');
}

function tryParseCaseCardUrl(input: string): CaseCardClassification | null {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return null;
  }

  const host = u.hostname;
  const isSudrf = host.endsWith('.sudrf.ru');
  const isMsudrf = host.endsWith('.msudrf.ru');
  if (!isSudrf && !isMsudrf) return null;

  const caseId = u.searchParams.get('case_id') ?? '';
  if (!caseId || !/^\d+$/.test(caseId)) return null;

  if (isSudrf) {
    const nameOp = u.searchParams.get('name_op');
    if (nameOp !== 'case') return null;
  }
  if (isMsudrf) {
    const op = u.searchParams.get('op');
    if (op !== 'cs') return null;
  }

  const deloId = u.searchParams.get('delo_id');
  const courtType = detectCourtTypeFromHost(host, deloId);
  const courtId = extractCourtId(host);
  const caseUid = u.searchParams.get('case_uid') ?? null;
  if (caseUid && !UUID_RE.test(caseUid)) return null;

  return {
    type: 'case_card',
    url: input,
    courtId,
    courtType,
    caseId,
    caseUid,
    deloId,
  };
}

function tryParseSearchText(input: string): SearchClassification | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length < 3) return null;
  // CR12-S10: патологические входы (тысячи символов) — не regex, а malformed
  if (trimmed.length > MAX_INPUT_LENGTH) return null;

  if (CASE_NUMBER_RE.test(trimmed)) {
    return { type: 'search', caseNumber: trimmed };
  }

  const words = trimmed.split(/\s+/).filter(w => w.length >= 2);
  if (
    words.length >= 2 &&
    words.length <= 4 &&
    words.every(w => WORD_RE.test(w))
  ) {
    return { type: 'search', defendant: trimmed };
  }

  return null;
}

/**
 * Классифицирует входной запрос.
 *
 * @param input - сырой ввод: URL, номер дела, ФИО
 * @returns классификация: case_card / search / malformed
 */
export function classify(input: string): Classification {
  if (!input || typeof input !== 'string') {
    return { type: 'malformed', error: 'Пустой запрос' };
  }

  const card = tryParseCaseCardUrl(input);
  if (card) return card;

  const search = tryParseSearchText(input);
  if (search) return search;

  return { type: 'malformed', error: 'Не удалось распознать запрос' };
}

/** Извлекает courtId и courtType из URL без строгой валидации */
export function identifyCourt(input: string): { courtId: string; courtType: CourtType } | null {
  try {
    const u = new URL(input);
    const host = u.hostname;
    if (!host.endsWith('.sudrf.ru') && !host.endsWith('.msudrf.ru')) return null;
    const deloId = u.searchParams.get('delo_id');
    return {
      courtId: extractCourtId(host),
      courtType: detectCourtTypeFromHost(host, deloId),
    };
  } catch {
    return null;
  }
}
