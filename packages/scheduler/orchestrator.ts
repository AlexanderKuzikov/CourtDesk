// Оркестратор мониторинга
import iconv from 'iconv-lite'; // статический импорт — BUG-011
import { listCases, updateCase, addEvent, getCase, getEvents, addNotification, saveCard } from '../store/index.js';
import { getParseAdapter } from '../parse/index.js';
import { getSearchAdapter } from '../search/index.js';
import { assertCourtUrl, CourtUrlError, isCaptchaPage } from '../core/errors.js';
import { getRuCaptchaKey } from '../core/config.js';
import { findHigherCourt, findRsCandidatesForMs, saveMsToRsMapping, extractRegion } from '../core/index.js';
import type { WatchedCase, CaseHistoryEvent, Notification } from '../core/types.js';

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const RATE_DELAY_MS = 1500;
const ENFORCED_GRACE_MS = 90 * 24 * 60 * 60 * 1000; // 90 дней

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
  const cases = listCases({ status: ['monitoring', 'decision', 'enforced', 'error'] });
  console.log(`[scheduler] runFull: ${cases.length} cases, statuses:`, cases.map(c => `${c.number}:${c.status}`));
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
      if (err instanceof CourtUrlError) {
        // Перманентная ошибка — архивируем, чтобы не крутилось в error-цикле
        console.warn(`[scheduler] archive ${c.uid} (${c.number}): invalid URL`);
        updateCase(c.uid, { status: 'archived', lastChecked: now() });
        addEvent(c.uid, makeEvent(c.uid, 'archived', 'Заархивировано: URL не принадлежит судовой системе РФ'));
      } else {
        console.error(`[scheduler] fail ${c.uid} (${c.number}):`, err);
        updateCase(c.uid, { status: 'error', lastChecked: now() });
      }
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

async function fetchHtml(url: string): Promise<string> {
  assertCourtUrl(url);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'CourtDesk/0.1' },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get('content-type') ?? '';
  const charset = ct.includes('charset=utf-8') || ct.includes('charset=UTF-8') ? 'utf8' : 'win1251';
  let html: string;
  if (charset === 'utf8') {
    html = await res.text();
  } else {
    const buf = await res.arrayBuffer();
    html = iconv.decode(Buffer.from(buf), 'win1251');
  }

  // Если капча или её ошибка — решаем через Puppeteer
  const NEEDS_CAPTCHA = 'Неверно указан проверочный код';
  if (isCaptchaPage(html) || html.includes(NEEDS_CAPTCHA)) {
    const apiKey = getRuCaptchaKey();
    if (apiKey) {
      const { fetchWithCaptcha } = await import('../captcha/session.js');
      html = await fetchWithCaptcha({ url, apiKey });
    }
  }

  return html;
}

export async function runSingle(uid: string): Promise<boolean> {
  const c = getCase(uid);
  if (!c) return false;
  await processOne(c);
  return true;
}
