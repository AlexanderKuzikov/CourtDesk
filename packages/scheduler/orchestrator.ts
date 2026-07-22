// Оркестратор мониторинга
import iconv from 'iconv-lite'; // статический импорт — BUG-011
import { listCases, updateCase, addEvent, getCase, getEvents } from '../store/index.js';
import { getParseAdapter } from '../parse/index.js';
import { getSearchAdapter } from '../search/index.js';
import type { WatchedCase, CaseHistoryEvent } from '../core/types.js';

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
  // NEW-004 FIXED: включаем error-дела в полный прогон
  const cases = listCases({ status: 'monitoring' })
    .concat(listCases({ status: 'decision' }))
    .concat(listCases({ status: 'error' }));
  return processBatch(cases);
}

export async function runRetry(): Promise<{ ok: number; fail: number }> {
  // NEW-004 FIXED: error-дела также участвуют в retry
  const monitoring = listCases({ status: 'monitoring' }).filter(isStale);
  const errors = listCases({ status: 'error' }).filter(isStale);
  return processBatch(monitoring.concat(errors));
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
    const c = cases[i];
    try {
      await processOne(c);
      ok++;
    } catch (err) {
      fail++;
      console.error(`[scheduler] fail ${c.uid} (${c.number}):`, err);
      // Ставим статус error чтобы дело попало в runRetry
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
    const c = cases[i];
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
    // NEW-005 FIXED: обновляем lastChecked даже при отсутствии данных
    updateCase(c.uid, { lastChecked: now() });
    return;
  }

  const party = String(waitEvent.data['party'] ?? '');
  const filingDate = waitEvent.data['filingDate']
    ? String(waitEvent.data['filingDate'])
    : undefined;

  if (!party) {
    // NEW-005 FIXED: обновляем lastChecked при пустом party
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

  const r = results[0];
  updateCase(c.uid, {
    status: 'monitoring',
    url: r.caseUrl,
    number: r.caseNumber,
    lastChecked: now(),
  });
  // NEW-001 FIXED: caseUid передаётся в makeEvent
  addEvent(c.uid, makeEvent(c.uid, 'found', `Дело появилось: ${r.caseNumber}`, { caseUrl: r.caseUrl }));
}

async function processOne(c: WatchedCase): Promise<void> {
  const adapter = getParseAdapter(c.courtType);
  const html = await fetchHtml(c.url);
  const card = await adapter.parse(html, c.url);

  // NEW-002 FIXED: перечитываем актуальное состояние перед каждой записью,
  // чтобы не затереть изменения, внесённые через PATCH API пока шёл fetchHtml.
  const prev = getCase(c.uid);
  if (!prev) return;

  if (prev.status === 'archived' || prev.status === 'deleted' as unknown) return;

  const updates: Partial<WatchedCase> = {};

  if (card.card.result && !prev.result) {
    const latest = getCase(c.uid);
    if (latest && latest.result === null) {
      updates.status = 'decision';
      updates.result = card.card.result;
      addEvent(c.uid, makeEvent(c.uid, 'decision', `Вынесено решение: ${card.card.result}`));
    }
  }

  if (prev.status === 'decision' && !prev.legalForceDate) {
    try {
      const searchAdapter = getSearchAdapter(c.courtType);
      const results = await searchAdapter.searchByCaseNumber({
        courtId: c.courtId, courtCode: c.courtCode,
        courtType: c.courtType, caseNumber: c.number,
      });
      const r = results.find(r => r.uid === c.uid || r.caseNumber === c.number);
      if (r?.legalForceDate) {
        const latest = getCase(c.uid);
        if (latest && !latest.legalForceDate) {
          updates.status = 'enforced';
          updates.legalForceDate = r.legalForceDate;
          addEvent(
            c.uid,
            makeEvent(c.uid, 'enforced', `Решение вступило в силу ${r.legalForceDate}`, {
              legalForceDate: r.legalForceDate,
            }),
          );
        }
      }
    } catch {
      // Поиск может быть недоступен — не фатально
    }
  }

  // Единый вызов updateCase со всеми накопленными изменениями
  const finalState = getCase(c.uid);
  if (finalState) {
    updates.lastChecked = now();
    updateCase(c.uid, updates);
  }
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'CourtDesk/0.1' },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('charset=utf-8') || ct.includes('charset=UTF-8')) {
    return res.text();
  }
  // CP1251 — декодируем через iconv (статичный импорт вверху файла)
  const buf = await res.arrayBuffer();
  return iconv.decode(Buffer.from(buf), 'win1251');
}

export async function runSingle(uid: string): Promise<boolean> {
  const c = getCase(uid);
  if (!c) return false;
  await processOne(c);
  return true;
}
