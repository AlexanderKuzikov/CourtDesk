// Оркестратор мониторинга
import { listCases, updateCase, addEvent, getCase, getEvents, addNotification, saveCard } from '../store/index.js';
import { getParseAdapter } from '../parse/index.js';
import { getSearchAdapter } from '../search/index.js';
import { fetchHtml as fetchCourtHtml } from '../search/shared.js';
import { CourtUrlError, isCaptchaPage } from '../core/errors.js';
import { getRuCaptchaKey } from '../core/config.js';
import { findHigherCourt, findRsCandidatesForMs, saveMsToRsMapping, extractRegion, setProgress } from '../core/index.js';
import { getSettings } from '../store/settings.js';
import type { WatchedCase, CaseHistoryEvent, Notification, SearchResult } from '../core/types.js';

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const RATE_DELAY_MS = 1500;
const ENFORCED_GRACE_MS = 90 * 24 * 60 * 60 * 1000; // 90 дней

function now(): string {
  return new Date().toISOString();
}

function isStale(c: WatchedCase): boolean {
  if (!c.lastChecked) return true;
  const thresholdMs = (getSettings().retryStaleHours || 24) * 60 * 60 * 1000;
  return Date.now() - new Date(c.lastChecked).getTime() > thresholdMs;
}

// NEW-001 FIXED: caseUid передаётся первым параметром
export function makeEvent(
  caseUid: string,
  type: string,
  message: string,
  data?: Record<string, unknown>,
): CaseHistoryEvent {
  return {
    uid: crypto.randomUUID(),
    caseUid,
    type,
    message,
    data: data ?? {},
    createdAt: now(),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// CR11-005 FIXED: единый лок прогонов в orchestrator (не в роуте) —
// cron и API используют один guard, check-and-set без await = атомарно
let _runningMode: string | null = null;

export function getRunningMode(): string | null {
  return _runningMode;
}

async function withRunLock(
  mode: string,
  fn: () => Promise<{ ok: number; fail: number }>,
): Promise<{ ok: number; fail: number }> {
  if (_runningMode) {
    console.warn(`[scheduler] ${mode} пропущен: уже выполняется ${_runningMode}`);
    return { ok: 0, fail: 0 };
  }
  _runningMode = mode;
  try {
    return await fn();
  } finally {
    _runningMode = null;
  }
}

// CR11-005: per-uid guard — ручной перепарсинг не пересекается с пакетным прогоном
const _inFlight = new Set<string>();

export function isCaseInFlight(uid: string): boolean {
  return _inFlight.has(uid);
}

export function runFull(): Promise<{ ok: number; fail: number }> {
  return withRunLock('full', async () => {
    const cases = listCases({ status: ['monitoring', 'decision', 'enforced', 'error'] });
    console.log(`[scheduler] runFull: ${cases.length} cases, statuses:`, cases.map(c => `${c.number}:${c.status}`));
    return processBatch(cases);
  });
}

export function runRetry(): Promise<{ ok: number; fail: number }> {
  return withRunLock('retry', async () => {
    const cases = listCases({ status: ['monitoring', 'error'] }).filter(isStale);
    return processBatch(cases);
  });
}

// BUG-002 FIXED: waiting-дела — поиск по участнику через searchAdapter
export function runNew(): Promise<{ ok: number; fail: number }> {
  return withRunLock('new', async () => {
    const cases = listCases({ status: 'waiting' });
    return processWaitingBatch(cases);
  });
}

async function processBatch(cases: WatchedCase[]): Promise<{ ok: number; fail: number }> {
  let ok = 0;
  let fail = 0;
  setProgress({ total: cases.length });
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]!;
    _inFlight.add(c.uid);
    try {
      await processOne(c);
      ok++;
    } catch (err) {
      fail++;
      if (err instanceof CourtUrlError) {
        // Перманентная ошибка — архивируем, чтобы не крутилось в error-цикле
        console.warn(`[scheduler] archive ${c.uid} (${c.number}): invalid URL`);
        updateCase(c.uid, { status: 'archived', lastChecked: now() });
        addEvent(c.uid, makeEvent(c.uid, 'archived', 'Заархивировано: URL не принадлежит судовой системе РФ'));
      } else {
        console.error(`[scheduler] fail ${c.uid} (${c.number}):`, err);
        updateCase(c.uid, {
          status: 'error', lastChecked: now(),
          errorCount: (c.errorCount ?? 0) + 1,
          lastError: err instanceof Error ? err.message.slice(0, 200) : 'Unknown error',
        });
      }
    } finally {
      _inFlight.delete(c.uid);
    }
    setProgress({ processed: ok + fail, errors: fail });
    // RATE-001: пауза между запросами (не после последнего)
    if (i < cases.length - 1) await sleep(RATE_DELAY_MS);
  }
  return { ok, fail };
}

async function processWaitingBatch(cases: WatchedCase[]): Promise<{ ok: number; fail: number }> {
  let ok = 0;
  let fail = 0;
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]!;
    _inFlight.add(c.uid);
    try {
      await processWaiting(c);
      ok++;
    } catch (err) {
      fail++;
      console.error(`[scheduler/new] fail ${c.uid}:`, err);
    } finally {
      _inFlight.delete(c.uid);
    }
    if (i < cases.length - 1) await sleep(RATE_DELAY_MS);
  }
  return { ok, fail };
}

/** Сравнить имя участника из waiting с участниками результата поиска */
function matchParty(party: string, resultParties: { role: string; name: string }[]): number {
  const q = party.toLowerCase().trim();
  if (!q) return 0;
  const qWords = q.split(/\s+/).filter(Boolean);
  let best = 0;
  for (const p of resultParties) {
    const name = (p.name || '').toLowerCase().trim();
    if (!name) continue;
    // Точное совпадение всей строки
    if (name === q) return 100;
    // Имя начинается с искомого или наоборот
    if (name.startsWith(q) || q.startsWith(name)) return 90;
    // Фамилия (первое слово) совпадает
    const nameFirst = name.split(/\s+/)[0] || '';
    const qFirst = qWords[0] || '';
    if (nameFirst === qFirst) {
      // Сколько слов совпало
      const nameWords = name.split(/\s+/);
      const matches = qWords.filter(w => nameWords.includes(w)).length;
      best = Math.max(best, 30 + matches * 20);
    }
  }
  return best;
}

/** Выбрать наилучший результат по совпадению участника */
function pickBestMatch(results: SearchResult[], party: string): SearchResult | null {
  let best = null;
  let bestScore = 0;
  for (const r of results) {
    const score = matchParty(party, r.parties || []);
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

// Обработка waiting-кейса: ищем дело по участнику + дате подачи
async function processWaiting(c: WatchedCase): Promise<void> {
  const events = getEvents(c.uid);
  const waitEvent = events.find(e => e.type === 'waiting');
  if (!waitEvent) {
    console.warn(`[scheduler/new] ${c.uid}: нет waiting-события с данными участника`);
    updateCase(c.uid, { lastChecked: now() });
    return;
  }

  const party = String(waitEvent.data['party'] ?? '');
  const filingDate = waitEvent.data['filingDate']
    ? String(waitEvent.data['filingDate'])
    : undefined;

  if (!party) {
    updateCase(c.uid, { lastChecked: now() });
    return;
  }

  const adapter = getSearchAdapter(c.courtType);
  const results = await adapter.searchByParty({
    courtId: c.courtId,
    courtCode: c.courtCode,
    courtType: c.courtType,
    defendant: party,
    filingDateFrom: filingDate,
    filingDateTo: filingDate,
  });

  if (results.length === 0) {
    updateCase(c.uid, { lastChecked: now() });
    return;
  }

  // CR6-005: ищем наилучшее совпадение по участнику
  const r = pickBestMatch(results, party) ?? results[0]!;
  updateCase(c.uid, {
    status: 'monitoring',
    url: r.caseUrl,
    number: r.caseNumber,
    lastChecked: now(),
  });
  addEvent(c.uid, makeEvent(c.uid, 'found', `Дело появилось: ${r.caseNumber}`, { caseUrl: r.caseUrl }));
  addNotification({
    uid: crypto.randomUUID(),
    caseUid: c.uid,
    type: 'found',
    message: `Дело ${r.caseNumber} появилось в системе`,
    read: false,
    createdAt: now(),
  });
}

async function processOne(c: WatchedCase): Promise<void> {
  const adapter = getParseAdapter(c.courtType);
  const html = await fetchHtml(c.url);
  const card = await adapter.parse(html, c.url);

  // Сохраняем полную карточку для UI
  saveCard(c.uid, card);

  // Сохраняем caseUid из карточки в WatchedCase
  if (card.identifiers?.case_uid && !c.caseUid) {
    updateCase(c.uid, { caseUid: card.identifiers.case_uid });
  }

  // NEW-002 FIXED: перечитываем актуальное состояние перед каждой записью
  const prev = getCase(c.uid);
  if (!prev) return;

  if (prev.status === 'archived') return;

  const updates: Partial<WatchedCase> = {};

  if (prev.status === 'error') {
    updates.status = 'monitoring';
    updates.errorCount = 0;
    updates.lastError = null;
  }

  // Проверка изменения результата
  if (card.card.result && card.card.result !== prev.result) {
    updates.status = 'decision';
    updates.result = card.card.result;
    addEvent(c.uid, makeEvent(c.uid, 'decision', `Вынесено решение: ${card.card.result}`));
    addNotification({
      uid: crypto.randomUUID(), caseUid: c.uid, type: 'decision',
      message: `По делу ${c.number} вынесено решение: ${card.card.result}`,
      read: false, createdAt: now(),
    });
  }

  // Определяем, нужно ли искать дату вступления
  const isInGracePeriod = prev.status === 'enforced' && prev.enforcedAt
    && (Date.now() - new Date(prev.enforcedAt).getTime() < ENFORCED_GRACE_MS);
  const shouldCheckLegalForce = !prev.legalForceDate || isInGracePeriod;

  if (shouldCheckLegalForce && (prev.status === 'decision' || updates.status === 'decision' || prev.status === 'enforced')) {
    await sleep(RATE_DELAY_MS);
    try {
      const searchAdapter = getSearchAdapter(c.courtType);
      const results = await searchAdapter.searchByCaseNumber({
        courtId: c.courtId, courtCode: c.courtCode, courtType: c.courtType, caseNumber: c.number,
      });
      const r = results.find(r => r.caseNumber === c.number);
      if (r?.legalForceDate) {
        updates.status = 'enforced';
        updates.legalForceDate = r.legalForceDate.slice(0, 10);
        if (!prev.enforcedAt) {
          addEvent(c.uid, makeEvent(c.uid, 'enforced', `Решение вступило в силу ${updates.legalForceDate}`, { legalForceDate: updates.legalForceDate }));
          addNotification({
            uid: crypto.randomUUID(), caseUid: c.uid, type: 'enforced',
            message: `Решение по делу ${c.number} вступило в законную силу`,
            read: false, createdAt: now(),
          });
        }
      } else if (prev.enforcedAt) {
        // Если раньше была дата вступления, а теперь её нет — откатываем
        updates.status = 'decision';
        updates.legalForceDate = null;
        addEvent(c.uid, makeEvent(c.uid, 'changed', 'Дата вступления отозвана — дело продолжает движение'));
      }
    } catch { /* не фатально */ }
  }

  // Поиск в вышестоящем суде (для enforced в grace period или если есть caseUid)
  const caseUid = card.identifiers?.case_uid || c.caseUid;
  if (caseUid && (isInGracePeriod || (prev.status !== 'enforced' && card.identifiers?.case_uid))) {
    let higherCourt = findHigherCourt(c.courtCode);

    // MS → RS: если нет кэша, перебираем кандидатов
    if (!higherCourt && c.courtType === 'magistrate') {
      const candidates = findRsCandidatesForMs(c.courtCode);
      for (const rs of candidates) {
        try {
          await sleep(RATE_DELAY_MS);
          const searchAdapter = getSearchAdapter('district');
          const rsResults = await searchAdapter.searchByCaseUid({
            courtId: rs.subdomain, courtCode: rs.code, courtType: 'district', caseUid,
          });
          if (rsResults.length > 0) {
            higherCourt = rs;
            saveMsToRsMapping(c.courtCode, rs.code);
            break;
          }
        } catch { /* следующий кандидат */ }
      }
    }

    if (higherCourt) {
      await sleep(RATE_DELAY_MS);
      try {
        const searchAdapter = getSearchAdapter(higherCourt.courtType);
        const results = await searchAdapter.searchByCaseUid({
          courtId: higherCourt.subdomain, courtCode: higherCourt.code, courtType: higherCourt.courtType, caseUid,
        });
        if (results.length > 0) {
          const found = results[0]!;
          addEvent(c.uid, makeEvent(c.uid, 'found_in_appeal',
            `Дело обнаружено в ${higherCourt.name}: ${found.caseNumber}`, { caseUrl: found.caseUrl }));
          addNotification({
            uid: crypto.randomUUID(), caseUid: c.uid, type: 'found',
            message: `Дело ${c.number} обнаружено в ${higherCourt.name} (${found.caseNumber})`,
            read: false, createdAt: now(),
          });
        }
      } catch { /* не фатально */ }
    }
  }

  // CR6-004: Re-check archived before writing
  const finalState = getCase(c.uid);
  if (!finalState) return;
  if (finalState.status === 'archived') {
    updateCase(c.uid, { lastChecked: now() });
    return;
  }
  updates.lastChecked = now();
  updateCase(c.uid, updates);
}

// CR11-007 FIXED: HTTP-слой переиспользуется из search/shared (assertCourtUrl внутри)
async function fetchHtml(url: string): Promise<string> {
  const html = await fetchCourtHtml(url);

  // Если капча или её ошибка — решаем через Puppeteer
  const NEEDS_CAPTCHA = 'Неверно указан проверочный код';
  if (isCaptchaPage(html) || html.includes(NEEDS_CAPTCHA)) {
    const apiKey = getRuCaptchaKey();
    if (apiKey) {
      const { fetchWithCaptcha } = await import('../captcha/session.js');
      return fetchWithCaptcha({ url, apiKey });
    }
  }

  return html;
}

export async function runSingle(uid: string): Promise<boolean> {
  const c = getCase(uid);
  if (!c) return false;
  // CR11-005: дело уже обрабатывается пакетным прогоном — не дублируем
  if (_inFlight.has(uid)) return false;
  _inFlight.add(uid);
  try {
    await processOne(c);
    return true;
  } finally {
    _inFlight.delete(uid);
  }
}
