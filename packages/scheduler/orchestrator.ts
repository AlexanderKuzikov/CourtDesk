// Оркестратор мониторинга
import { listCases, updateCase, addEvent, getCase } from '../store/index.js';
import { getParseAdapter } from '../parse/index.js';
import { getSearchAdapter } from '../search/index.js';
import type { WatchedCase, CaseCard, CaseHistoryEvent } from '../core/types.js';

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 часа

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

export async function runFull(): Promise<{ ok: number; fail: number }> {
  const cases = listCases({ status: 'monitoring' }).concat(listCases({ status: 'decision' }));
  return processBatch(cases);
}

export async function runRetry(): Promise<{ ok: number; fail: number }> {
  const cases = listCases({ status: 'monitoring' }).filter(isStale);
  return processBatch(cases);
}

export async function runNew(): Promise<{ ok: number; fail: number }> {
  const cases = listCases({ status: 'waiting' });
  return processBatch(cases);
}

async function processBatch(cases: WatchedCase[]): Promise<{ ok: number; fail: number }> {
  let ok = 0;
  let fail = 0;

  for (const c of cases) {
    try {
      await processOne(c);
      ok++;
    } catch (err) {
      fail++;
      console.error(`[scheduler] fail ${c.uid} (${c.number}):`, err);
    }
  }

  return { ok, fail };
}

async function processOne(c: WatchedCase): Promise<void> {
  const adapter = getParseAdapter(c.courtType);
  const html = await fetchHtml(c.url);
  const card = await adapter.parse(html, c.url);

  // Сравниваем с предыдущим состоянием — фиксируем изменения
  const prev = getCase(c.uid);
  if (prev) {
    // Если появился result, которого не было — переводим в decision
    if (card.card.result && !prev.result) {
      updateCase(c.uid, { status: 'decision', result: card.card.result });
      addEvent(c.uid, makeEvent('decision', `Вынесено решение: ${card.card.result}`));
    }

    // Если появился legalForceDate — переводим в enforced
    // legalForceDate берётся из поиска по номеру, не из карточки
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
        // Поиск может быть недоступен — не фатально, повторим в следующий раз
      }
    }
  }

  // Если статус waiting — проверяем, появилось ли дело
  if (c.status === 'waiting' && card.uid) {
    updateCase(c.uid, { status: 'monitoring', url: c.url }); // url уже должен быть
    addEvent(c.uid, makeEvent('found', `Дело появилось: ${card.number}`));
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
  // CP1251 — декодируем через iconv
  const buf = await res.arrayBuffer();
  const { default: iconv } = await import('iconv-lite');
  return iconv.decode(Buffer.from(buf), 'win1251');
}

export async function runSingle(uid: string): Promise<boolean> {
  const c = getCase(uid);
  if (!c) return false;
  await processOne(c);
  return true;
}
