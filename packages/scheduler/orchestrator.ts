// Оркестратор мониторинга
import iconv from 'iconv-lite'; // статический импорт — BUG-011
import { listCases, updateCase, addEvent, getCase, getEvents } from '../store/index.js';
import { getParseAdapter } from '../parse/index.js';
import { getSearchAdapter } from '../search/index.js';
import type { WatchedCase, CaseHistoryEvent } from '../core/types.js';

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const RATE_DELAY_MS = 1500; // RATE-001: задержка между запросами к sudrf.ru — защита от блокировки IP

function now(): string {
  return new Date().toISOString();
}

function isStale(c: WatchedCase): boolean {
  if (!c.lastChecked) return true;
  return Date.now() - new Date(c.lastChecked).getTime() > STALE_THRESHOLD_MS;
}

function makeEvent(type: string, message: string, data?: Record<string, unknown>): CaseHistoryEvent {
  return {
    uid: crypto.randomUUID(),
    caseUid: '',
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
  const cases = listCases({ status: 'monitoring' }).concat(listCases({ status: 'decision' }));
  return processBatch(cases);
}

export async function runRetry(): Promise<{ ok: number; fail: number }> {
  const cases = listCases({ status: 'monitoring' }).filter(isStale);
  return processBatch(cases);
}

// BUG-002: waiting-дела — поиск по участнику через searchAdapter, а не fetchHtml('')
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
  // Данные участника хранятся в events: тип 'waiting', data.party + data.filingDate
  // getEvents импортирован статически вверху файла
  const events = getEvents(c.uid);
  const waitEvent = events.find(e => e.type === 'waiting');
  if (!waitEvent) {
    console.warn(`[scheduler/new] ${c.uid}: нет waiting-события с данными участника`);
    return;
  }

  const party = String(waitEvent.data['party'] ?? '');
  const filingDate = waitEvent.data['filingDate'] ? String(waitEvent.data['filingDate']) : undefined;

  if (!party) return;

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
  addEvent(c.uid, makeEvent('found', `Дело появилось: ${r.caseNumber}`, { caseUrl: r.caseUrl }));
}

async function processOne(c: WatchedCase): Promise<void> {
  const adapter = getParseAdapter(c.courtType);
  const html = await fetchHtml(c.url);
  const card = await adapter.parse(html, c.url);

  const prev = getCase(c.uid);
  if (prev) {
    if (card.card.result && !prev.result) {
      updateCase(c.uid, { status: 'decision', result: card.card.result });
      addEvent(c.uid, makeEvent('decision', `Вынесено решение: ${card.card.result}`));
    }

    if (c.status === 'decision' && !c.legalForceDate) {
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
          updateCase(c.uid, { status: 'enforced', legalForceDate: r.legalForceDate });
          addEvent(c.uid, makeEvent('enforced', `Решение вступило в силу ${r.legalForceDate}`, { legalForceDate: r.legalForceDate }));
        }
      } catch {
        // Поиск может быть недоступен — не фатально
      }
    }
  }

  updateCase(c.uid, { lastChecked: now() });
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
