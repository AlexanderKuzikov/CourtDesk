// Оркестратор мониторинга
import iconv from 'iconv-lite'; // статический импорт — BUG-011
import { listCases, updateCase, addEvent, getCase, getEvents, addNotification } from '../store/index.js';
import { getParseAdapter } from '../parse/index.js';
import { getSearchAdapter } from '../search/index.js';
import { assertCourtUrl } from '../core/errors.js';
import type { WatchedCase, CaseHistoryEvent, Notification } from '../core/types.js';

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const RATE_DELAY_MS = 1500; // RATE-001: задержка между запросами к sudrf.ru

function now(): string {
  return new Date().toISOString();
}

function isStale(c: WatchedCase): boolean {
  if (!c.lastChecked) return true;
  return Date.now() - new Date(c.lastChecked).getTime() > STALE_THRESHOLD_MS;
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

export async function runFull(): Promise<{ ok: number; fail: number }> {
  // CR5-007 FIXED: один проход вместо 3×listCases — статусы через Set
  const cases = listCases({ status: ['monitoring', 'decision', 'error'] });
  return processBatch(cases);
}

export async function runRetry(): Promise<{ ok: number; fail: number }> {
  const cases = listCases({ status: ['monitoring', 'error'] }).filter(isStale);
  return processBatch(cases);
}

// BUG-002 FIXED: waiting-дела — поиск по участнику через searchAdapter
export async function runNew(): Promise<{ ok: number; fail: number }> {
  const cases = listCases({ status: 'waiting' });
  return processWaitingBatch(cases);
}

async function processBatch(cases: WatchedCase[]): Promise<{ ok: number; fail: number }> {
  let ok = 0;
  let fail = 0;
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]!;
    try {
      await processOne(c);
      ok++;
    } catch (err) {
      fail++;
      console.error(`[scheduler] fail ${c.uid} (${c.number}):`, err);
      updateCase(c.uid, { status: 'error', lastChecked: now() });
    }
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
    try {
      await processWaiting(c);
      ok++;
    } catch (err) {
      fail++;
      console.error(`[scheduler/new] fail ${c.uid}:`, err);
    }
    if (i < cases.length - 1) await sleep(RATE_DELAY_MS);
  }
  return { ok, fail };
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

  const r = results[0]!;
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

  // NEW-002 FIXED: перечитываем актуальное состояние перед каждой записью
  const prev = getCase(c.uid);
  if (!prev) return;

  // CR5-002 FIXED: убран 'deleted' as unknown — несуществующий статус
  if (prev.status === 'archived') return;

  const updates: Partial<WatchedCase> = {};

  // CR6-006: Recover from error status on successful parse
  if (prev.status === 'error') {
    updates.status = 'monitoring';
  }

  if (card.card.result && card.card.result !== prev.result) {
    updates.status = 'decision';
    updates.result = card.card.result;
    addEvent(c.uid, makeEvent(c.uid, 'decision', `Вынесено решение: ${card.card.result}`));
    addNotification({
      uid: crypto.randomUUID(),
      caseUid: c.uid,
      type: 'decision',
      message: `По делу ${c.number} вынесено решение: ${card.card.result}`,
      read: false,
      createdAt: now(),
    });
  }

  if ((prev.status === 'decision' || updates.status === 'decision') && !prev.legalForceDate) {
    // CR5-001 FIXED: rate-delay перед вторым запросом к sudrf.ru внутри processOne
    await sleep(RATE_DELAY_MS);
    try {
      const searchAdapter = getSearchAdapter(c.courtType);
      const results = await searchAdapter.searchByCaseNumber({
        courtId: c.courtId,
        courtCode: c.courtCode,
        courtType: c.courtType,
        caseNumber: c.number,
      });
      const r = results.find(r => r.uid === c.uid || r.caseNumber === c.number);
      if (r?.legalForceDate) {
        updates.status = 'enforced';
        // CR5-003 FIXED: нормализуем дату к YYYY-MM-DD при сохранении
        updates.legalForceDate = r.legalForceDate.slice(0, 10);
        addEvent(
          c.uid,
          makeEvent(c.uid, 'enforced', `Решение вступило в силу ${updates.legalForceDate}`, {
            legalForceDate: updates.legalForceDate,
          }),
        );
        addNotification({
          uid: crypto.randomUUID(),
          caseUid: c.uid,
          type: 'enforced',
          message: `Решение по делу ${c.number} вступило в законную силу`,
          read: false,
          createdAt: now(),
        });
      }
    } catch {
      // Поиск может быть недоступен — не фатально
    }
  }

  // CR6-004: Re-check archived before writing (race with PATCH API)
  const finalState = getCase(c.uid);
  if (!finalState) return;
  if (finalState.status === 'archived') {
    updateCase(c.uid, { lastChecked: now() });
    return;
  }
  updates.lastChecked = now();
  updateCase(c.uid, updates);
}

async function fetchHtml(url: string): Promise<string> {
  assertCourtUrl(url);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'CourtDesk/0.1' },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('charset=utf-8') || ct.includes('charset=UTF-8')) {
    return res.text();
  }
  const buf = await res.arrayBuffer();
  return iconv.decode(Buffer.from(buf), 'win1251');
}

export async function runSingle(uid: string): Promise<boolean> {
  const c = getCase(uid);
  if (!c) return false;
  await processOne(c);
  return true;
}
