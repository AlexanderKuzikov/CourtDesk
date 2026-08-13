Ты работаешь в одиночном режиме глубокого анализа.
НЕ используй никакие инструменты, не звони функциям, не обращайся к сети.
Верни ОДИН финальный ответ. Требуемая глубина: 6 (1 — бегло, 10 — экстремально).

── КОНТЕКСТ ──
CourtDesk — CRM-мониторинг судебных дел РФ (sudrf.ru / msudrf.ru). Node.js 22 + TypeScript 7 (ESM), Express 5, Puppeteer 25 + RuCaptcha, cheerio, iconv-lite. 213 тестов. Парсинг карточек дел и поиск по 4 типам судов: районные (district), апелляционные (appeal), кассационные (cassation), мировые (magistrate).

── СИМПТОМ ПОЛОМКИ ──
Мировые суды (*.msudrf.ru) ПЕРЕСТАЛИ корректно парситься/искаться — раньше работали, теперь нет. Регрессия появилась после правок 2026-08-05 (поднятие таймаутов под WAF-тормоза ГАС, backoff при 403/429, переработка капча-пайплайна). Конкретные проявления неизвестны точно — определи по коду наиболее вероятные причины отказа. Известный фон: WAF ГАС «Правосудие» банит IP по rate-limit (403), замедляет ответы до 1-2 минут, RuCaptcha иногда даёт ERROR_KEY_DOES_NOT_EXIST, msudrf поиск идёт через AJAX (кнопка «Искать» = <input type="button" class="button-normal search">), результаты в <div id="search_results">.

── КОД (весь msudrf-пайплайн) ──

=== packages/search/adapters/magistrate.ts ===
import * as cheerio from 'cheerio';
import { getRuCaptchaKey } from '../../core/config.js';
import type { SearchRequest, SearchResult } from '../../core/types.js';
import type { SearchAdapter } from './types.js';
import { SEARCH_PARAMS } from '../constants.js';

/** Построить URL формы поиска msudrf (name_op=sf, не r) */
export function buildFormUrl(req: SearchRequest): string {
  const params = SEARCH_PARAMS.magistrate;
  return `https://${req.courtId}.msudrf.ru/modules.php?name=sud_delo&srv_num=1&name_op=sf&delo_id=${params.delo_id}&case_type=${params.case_type}&new=${params.new_ ?? '0'}`;
}

/** Собрать поля для заполнения формы из SearchRequest */
export function buildFields(req: SearchRequest): Record<string, string> {
  const fields: Record<string, string> = {};
  if (req.caseNumber) fields['g1_case__CASE_NUMBERSS'] = req.caseNumber;
  // CR12-010 FIXED: G1_PARTS__NAMESS — одно поле участника (как в shared.buildSearchUrl:
  // defendant || plaintiff). Раньше plaintiff молча перезаписывал defendant.
  const party = req.defendant || req.plaintiff;
  if (party) fields['G1_PARTS__NAMESS'] = party;
  if (req.caseUid) fields['g1_case__JUDICIAL_UIDSS'] = req.caseUid;
  if (req.filingDateFrom) fields['g1_case__ENTRY_DATE1D'] = req.filingDateFrom;
  if (req.filingDateTo) fields['g1_case__ENTRY_DATE2D'] = req.filingDateTo;
  return fields;
}

/**
 * Парсинг таблицы результатов msudrf.
 * HTML — фрагмент из #search_results.
 * Колонки msudrf: № дела | Категория/Лица | Судья | Дата решения | Решение
 * (отличается от sudrf, где 7 колонок с датой поступления и вступлением)
 */
export function parseResults(html: string, req: SearchRequest): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  const table = $('table').filter((_, t) => $(t).text().includes('№ дела')).first();
  if (!table.length) return results;

  table.find('tr').slice(1).each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 4) return;
    const link = cells.eq(0).find('a');
    const href = link.attr('href') || '';
    const num = link.text().trim().split(/\s+/)[0] || '';
    const caseIdMatch = href.match(/case_id=(\d+)/i);
    const partiesText = cells.eq(1).text().trim();
    // Извлекаем истца/ответчика из колонки «Категория/Лица»
    // Формат: "КАТЕГОРИЯ: ... ИСТЕЦ: ... ОТВЕТЧИК: ..." (разделители <br> в HTML, cheerio даёт пробелы)
    const parties: { role: string; name: string }[] = [];
    const istetsMatch = partiesText.match(/ИСТЕЦ:\s*(.+?)(?:\s+ОТВЕТЧИК:|$)/i);
    const otvetchikMatch = partiesText.match(/ОТВЕТЧИК:\s*(.+?)$/i);
    if (istetsMatch) parties.push({ role: 'Истец', name: istetsMatch[1].trim() });
    if (otvetchikMatch) parties.push({ role: 'Ответчик', name: otvetchikMatch[1].trim() });

    results.push({
      caseNumber: num,
      // FIX: относительный href без ведущего «/» — нормализуем, иначе склейка «.rumodules.php»
      caseUrl: href.startsWith('http') ? href : `https://${req.courtId}.msudrf.ru/${href.replace(/^\//, '')}`,
      caseUid: null,
      caseId: caseIdMatch ? caseIdMatch[1] : null,
      courtCode: req.courtCode,
      judge: cells.eq(2).text().trim() || null,
      result: cells.eq(4).text().trim() || null,
      legalForceDate: null,
      filingDate: null,
      decisionDate: cells.eq(3).text().trim() || null,
      parties,
      courtId: req.courtId,
      courtType: 'magistrate',
    });
  });
  return results;
}

export class MagistrateSearchAdapter implements SearchAdapter {
  buildSearchUrl(_req: SearchRequest): string {
    // Не используется — msudrf не поддерживает прямые GET-запросы результатов
    return '';
  }

  async searchByCaseNumber(req: SearchRequest): Promise<SearchResult[]> {
    const apiKey = getRuCaptchaKey();
    if (!apiKey) {
      throw new Error('Для мировых судов нужен ключ RuCaptcha в .env');
    }

    // Парсинг по URL дела — делегируем parse-адаптеру (через старый fetchWithCaptcha)
    if (req.caseNumber && req.caseNumber.startsWith('http')) {
      const { fetchWithCaptcha } = await import('../../captcha/session.js');
      const html = await fetchWithCaptcha({ url: req.caseNumber, apiKey });
      const { isCaptchaPage } = await import('../../core/errors.js');
      if (isCaptchaPage(html)) {
        throw new Error('Captcha loop: не удалось загрузить страницу дела');
      }
      const { getParseAdapter } = await import('../../parse/index.js');
      const adapter = getParseAdapter('magistrate');
      const card = await adapter.parse(html, req.caseNumber);
      return [{
        caseNumber: card.number,
        caseUrl: req.caseNumber,
        caseUid: card.identifiers?.case_uid ?? null,
        caseId: card.identifiers?.case_id ?? null,
        courtCode: req.courtCode,
        judge: card.card.judge,
        result: card.card.result,
        legalForceDate: null,
        filingDate: card.card.filingDate,
        decisionDate: card.card.hearingDate,
        parties: card.parties.map(p => ({ role: p.role ?? '', name: p.name ?? '' })),
        courtId: req.courtId,
        courtType: 'magistrate',
      }];
    }

    // Поиск через AJAX-форму msudrf
    const { fetchMsudrfSearch } = await import('../../captcha/session.js');
    const formUrl = buildFormUrl(req);
    const fields = buildFields(req);
    const html = await fetchMsudrfSearch({ formUrl, fields, apiKey });

    return parseResults(html, req);
  }

  async searchByParty(req: SearchRequest): Promise<SearchResult[]> {
    return this.searchByCaseNumber(req);
  }

  async searchByCaseUid(req: SearchRequest): Promise<SearchResult[]> {
    const apiKey = getRuCaptchaKey();
    if (!apiKey) throw new Error('Для мировых судов нужен ключ RuCaptcha в .env');

    const { fetchMsudrfSearch } = await import('../../captcha/session.js');
    const formUrl = buildFormUrl(req);
    const fields = buildFields(req);
    const html = await fetchMsudrfSearch({ formUrl, fields, apiKey });

    return parseResults(html, req);
  }
}

=== packages/captcha/session.ts ===
// Универсальный captcha-resolver для msudrf.ru и sudrf.ru

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { Page } from 'puppeteer';
import iconv from 'iconv-lite';
import { isCaptchaPage, assertCourtUrl } from '../core/errors.js';
import { RuCaptchaClient } from './rucaptcha.js';
import { getBrowser, releaseBrowser } from './browser.js';

export interface FetchWithCaptchaOptions {
  url: string;
  apiKey: string;
  softId?: string;
  debugDir?: string;
}

type CaptchaMode = 'msudrf' | 'sudrf';

const CAPTCHA_ERROR = 'Неверно указан проверочный код';

// WAF ГАС «Правосудие» замедляет ответы до 1-2 минут (наблюдение 2026-08-05).
// Таймауты подняты, чтобы пайплайн капчи переживал тормоза вместо обрыва.
const NAV_TIMEOUT_MS = 120_000;   // page.goto / waitForNavigation
const WAIT_TIMEOUT_MS = 90_000;   // waitForFunction / locator

function detectMode(html: string): CaptchaMode | null {
  if (html.includes('kcaptchaForm')) return 'msudrf';
  if (html.includes('id="captcha"') || html.includes('name="captcha"')) return 'sudrf';
  return null;
}

function buildFormUrl(searchUrl: string): string {
  const params = extractSearchParams(searchUrl);
  const deloId = params['delo_id'] || '1540005';
  const caseType = params['case_type'] || '0';
  const newVal = params['new'] || '0';
  try {
    const hostname = new URL(searchUrl).hostname;
    return `https://${hostname}/modules.php?name=sud_delo&srv_num=1&name_op=sf&delo_id=${deloId}&case_type=${caseType}&new=${newVal}`;
  } catch {
    return searchUrl.replace(/name_op=r/, 'name_op=sf').replace(/&Submit=[^&]*/, '');
  }
}

async function readCaptchaImageBase64(page: Page, mode: CaptchaMode): Promise<string> {
  if (mode === 'msudrf') {
    const src = await page.$eval(
      'form#kcaptchaForm img',
      (img: HTMLImageElement) => img.getAttribute('src'),
    );
    if (!src) throw new Error('Captcha image src not found');
    return page.evaluate(async (imgSrc: string) => {
      const res = await fetch(imgSrc, { credentials: 'include', signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`Captcha image fetch failed: HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary);
    }, src);
  }

  const base64 = await page.evaluate(() => {
    const el = document.querySelector('input#captcha');
    if (!el) return null;
    const row = el.closest('tr');
    if (!row) return null;
    const img = row.querySelector('img');
    if (!img) return null;
    const src = img.getAttribute('src') || '';
    const m = src.match(/^data:\s*image\/[^;]+;base64,\s*(.+)$/i);
    return m ? m[1].trim() : null;
  });
  if (!base64) throw new Error('Captcha image base64 not found in sudrf page');
  return base64;
}

/** Для msudrf: заполнить капчу, дождаться формы поиска, заполнить поля и сабмитнуть */
async function fillCaptchaMsudrf(page: Page, searchUrl: string, captchaText: string): Promise<void> {
  // 1. Решаем капчу
  await page.locator('input[name="captcha-response"]').fill(captchaText);
  await page.locator('form#kcaptchaForm button[type="submit"]').click();
  // Ждём появления формы поиска (вместо капчи)
  try {
    await page.waitForFunction(() => {
      const html = document.body?.innerHTML || '';
      return html.includes('sud_delo') && !html.includes('kcaptchaForm');
    }, { timeout: WAIT_TIMEOUT_MS });
  } catch {
    // Если после капчи снова капча — выходим, caller retry
    return;
  }
  await new Promise(r => setTimeout(r, 500));

  // 2. Заполняем поля поиска из URL и сабмитим (как fillAndSubmit для sudrf)
  const params = extractSearchParams(searchUrl);
  const fillable = ['G2_PARTS__NAMESS', 'G1_PARTS__NAMESS', 'g2_case__CASE_NUMBERSS', 'g1_case__CASE_NUMBERSS',
    'g2_case__ENTRY_DATE1D', 'g1_case__ENTRY_DATE1D', 'g2_case__ENTRY_DATE2D', 'g1_case__ENTRY_DATE2D',
    'g2_case__JUDICIAL_UIDSS', 'g1_case__JUDICIAL_UIDSS'];

  for (const name of fillable) {
    const val = params[name];
    if (val && val.trim()) {
      await page.locator(`input[name="${name}"]`).fill(val).catch(() => {});
    }
  }

  await page.locator('input[name="Submit"]').click().catch(async () => {
    // Fallback: кнопка может быть button, не input
    await page.locator('button[name="Submit"]').click().catch(() => {});
  });

  // 3. Ждём появления таблицы результатов
  try {
    await page.waitForFunction(() => {
      const html = document.body?.innerHTML || '';
      return html.includes('№ дела') || html.includes('Данных по запросу') || html.includes('Неверно указан');
    }, { timeout: WAIT_TIMEOUT_MS });
  } catch {}
  await new Promise(r => setTimeout(r, 1000));
}

/** Декодировать CP1251 percent-encoded параметр в строку */
function decodeCp1251Param(encoded: string): string {
  // Ручной декодер percent → bytes (без проверки UTF-8 как decodeURIComponent)
  const bytes: number[] = [];
  for (let i = 0; i < encoded.length; i++) {
    if (encoded[i] === '%' && i + 2 < encoded.length) {
      bytes.push(parseInt(encoded.substring(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(encoded.charCodeAt(i));
    }
  }
  return iconv.decode(Buffer.from(bytes), 'win1251');
}

/** Извлечь search-параметры из URL, декодируя CP1251 */
function extractSearchParams(searchUrl: string): Record<string, string> {
  const qs = searchUrl.includes('?') ? searchUrl.split('?')[1]! : '';
  const result: Record<string, string> = {};
  for (const part of qs.split('&')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.substring(0, eq);
    const val = part.substring(eq + 1);
    if (!val || val === 'Submit=%CD%E0%E9%F2%E8') continue;
    try {
      result[key] = val.includes('%') ? decodeCp1251Param(val) : decodeURIComponent(val);
    } catch {
      result[key] = val;
    }
  }
  return result;
}

/** Для sudrf: заполнить поле фамилии + капчу, сабмитнуть форму */
async function fillAndSubmit(page: Page, searchUrl: string, captchaText: string): Promise<void> {
  const params = extractSearchParams(searchUrl);
  const fillable = ['G2_PARTS__NAMESS', 'G1_PARTS__NAMESS', 'g2_case__CASE_NUMBERSS', 'g1_case__CASE_NUMBERSS',
    'g2_case__ENTRY_DATE1D', 'g1_case__ENTRY_DATE1D', 'g2_case__ENTRY_DATE2D', 'g1_case__ENTRY_DATE2D'];

  for (const name of fillable) {
    const val = params[name];
    if (val && val.trim()) {
      await page.locator(`input[name="${name}"]`).fill(val).catch(() => {});
    }
  }

  await page.locator('#captcha').fill(captchaText);
  await page.locator('input[name="Submit"]').click();
  // Ждём появления таблицы результатов или сообщения об ошибке
  try {
    await page.waitForFunction(() => {
      const html = document.body?.innerHTML || '';
      return html.includes('№ дела') || html.includes('Данных по запросу') || html.includes('Неверно указан');
    }, { timeout: WAIT_TIMEOUT_MS });
  } catch {}
  // Даём время на завершение рендеринга
  await new Promise(r => setTimeout(r, 1000));
}

export async function fetchWithCaptcha(options: FetchWithCaptchaOptions): Promise<string> {
  assertCourtUrl(options.url);
  // CR12-009 FIXED: общий браузер из пула вместо launch на каждый вызов
  const browser = await getBrowser();

  try {
    const page = await browser.newPage();
    try {
      // WAF-тормоза: locator/fill/click по умолчанию ждут 30с — поднимаем
      page.setDefaultTimeout(WAIT_TIMEOUT_MS);
      page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
      const MAX_TRIES = 3;
      for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
        await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
        let html = await page.content();
        let mode = detectMode(html);

        if (!mode && html.includes(CAPTCHA_ERROR)) {
          await page.goto(buildFormUrl(options.url), { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
          html = await page.content();
          mode = detectMode(html);
        }

        if (!mode) return html;
        if (options.debugDir) ensureDir(options.debugDir);

        const client = new RuCaptchaClient({ apiKey: options.apiKey, softId: options.softId });
        const imageBase64 = await readCaptchaImageBase64(page, mode);
        const captchaText = await client.solveImage(imageBase64);

        if (mode === 'msudrf') {
          await fillCaptchaMsudrf(page, options.url, captchaText);
        } else {
          await fillAndSubmit(page, options.url, captchaText);
        }

        html = await page.content();

        if (options.debugDir) {
          writeFileSync(resolve(options.debugDir, 'captcha-last.html'), html, 'utf-8');
        }

        if (isCaptchaPage(html)) continue;
        if (html.includes(CAPTCHA_ERROR)) {
          console.warn(`[captcha] attempt ${attempt}/${MAX_TRIES}: wrong captcha, retry`);
          continue;
        }

        return html;
      }

      throw new Error('Captcha error: решение RuCaptcha не принято сервером после 3 попыток');
    } finally {
      await page.close().catch(() => {});
    }
  } finally {
    releaseBrowser();
  }
}

export { fetchWithCaptcha as fetchMagistrateHtml };

/**
 * Поиск по мировым судам (*.msudrf.ru)
 *
 * msudrf имеет другую архитектуру, чем sudrf:
 * - Нет <form method="get"> — поиск через AJAX/JS
 * - Капча (kcaptchaForm) решается ОДИН раз на страницу
 * - После капчи — форма поиска с вкладками и полями
 * - Кнопка "Искать" — <input type="button" class="button-normal search">
 * - Результаты в <div id="search_results">
 */
interface MsudrfSearchOptions {
  formUrl: string;
  fields: Record<string, string>;
  apiKey: string;
  debugDir?: string;
}

export async function fetchMsudrfSearch(options: MsudrfSearchOptions): Promise<string> {
  assertCourtUrl(options.formUrl);
  // CR12-009 FIXED: общий браузер из пула
  const browser = await getBrowser();
  try {
    const page = await browser.newPage();
    try {
      return await runMsudrfSearch(page, options);
    } finally {
      await page.close().catch(() => {});
    }
  } finally {
    releaseBrowser();
  }
}

async function runMsudrfSearch(page: Page, options: MsudrfSearchOptions): Promise<string> {
    // WAF-тормоза: locator/fill/click по умолчанию ждут 30с — поднимаем
    page.setDefaultTimeout(WAIT_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
    // Шаг 1: открываем форму поиска (покажет kcaptchaForm)
    await page.goto(options.formUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });

    // Шаг 2: решаем капчу с retry (как fetchWithCaptcha)
    const client = new RuCaptchaClient({ apiKey: options.apiKey });
    const MAX_TRIES = 3;

    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
      const pageHtml = await page.content();

      // Если капчи нет — выходим из цикла
      if (!pageHtml.includes('kcaptchaForm')) break;

      // Читаем капчу
      const src = await page.$eval(
        'form#kcaptchaForm img',
        (img: HTMLImageElement) => img.getAttribute('src') || '',
      );
      if (!src) throw new Error('Captcha image src not found');

      const imageBase64 = await page.evaluate(async (imgSrc: string) => {
        const res = await fetch(imgSrc, { credentials: 'include', signal: AbortSignal.timeout(60_000) });
        if (!res.ok) throw new Error(`Captcha image fetch failed: HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        let binary = '';
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
      }, src) as unknown as string;

      const captchaText = await client.solveImage(imageBase64);

      // Заполняем капчу и отправляем
      await page.locator('input[name="captcha-response"]').fill(captchaText);

      // Ждём navigation/network после submit (POST → новая страница)
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS }).catch(() => {}),
        page.locator('form#kcaptchaForm button[type="submit"]').click(),
      ]);
    }

    // Проверяем, решена ли капча после всех попыток
    const afterCaptcha = await page.content();
    if (afterCaptcha.includes('kcaptchaForm')) {
      throw new Error('Captcha loop: капча не решена после ' + MAX_TRIES + ' попыток');
    }

    // Сохраняем состояние формы после капчи для отладки
    if (options.debugDir) {
      ensureDir(options.debugDir);
      writeFileSync(resolve(options.debugDir, 'msudrf-form.html'), await page.content(), 'utf-8');
    }

    // Шаг 3: заполняем поля поиска
    for (const [name, value] of Object.entries(options.fields)) {
      if (value) {
        await page.locator(`input[name="${name}"]`).fill(value).catch(() => {});
      }
    }

    // Шаг 4: кликаем «Искать» (AJAX)
    await page.locator('input.button-normal.search').click();

    // Шаг 5: ждём появления результатов
    try {
      await page.waitForFunction(() => {
        const el = document.querySelector('#search_results');
        if (!el) return false;
        try {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && el.innerHTML.trim().length > 0;
        } catch {
          return el.innerHTML.trim().length > 0;
        }
      }, { timeout: WAIT_TIMEOUT_MS });
    } catch {
      // Таймаут — возможно результатов нет
    }

    const resultsHtml = await page.evaluate(() => {
      const el = document.querySelector('#search_results');
      return el ? el.innerHTML : '';
    });

    if (options.debugDir) {
      ensureDir(options.debugDir);
      writeFileSync(resolve(options.debugDir, 'msudrf-results.html'), resultsHtml, 'utf-8');
      writeFileSync(resolve(options.debugDir, 'msudrf-page.html'), await page.content(), 'utf-8');
    }

    return resultsHtml || (await page.content());
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

=== packages/parse/adapters/magistrate.ts ===
// Адаптер для мировых судов (*.msudrf.ru)
// BUG-017: uid = судебный номер дела (не case_id), events — 5 колонок, filingDate/hearingDate/result

import * as cheerio from 'cheerio';
import type { Case, CaseEvent, CaseParty, CourtAdapter } from '../../core/types.js';
import { CaptchaRequiredError, isCaptchaPage } from '../../core/errors.js';
import { extractCourtSubdomain, parseDate, cleanText } from './shared.js';

export class MagistrateAdapter implements CourtAdapter {
  async parse(html: string, url: string): Promise<Case> {
    if (isCaptchaPage(html)) throw new CaptchaRequiredError(url);

    // FIX (CODE_REVIEW #1): decodeEntities удалён — в cheerio 1.x эта опция убрана из CheerioOptions, false является дефолтом.
    const $ = cheerio.load(html);
    const parsedUrl = new URL(url);

    // BUG-017: uid — судебный номер из заголовка h2, fallback — case_id из URL
    const caseNumber = cleanText(
      $('h2').filter((_i, el) => $(el).text().includes('ДЕЛО №')).first().text().replace(/ДЕЛО\s*№/i, '')
    ) ?? parsedUrl.searchParams.get('case_id') ?? '';

    if (!caseNumber) throw new Error('MagistrateAdapter: не удалось определить номер дела');

    const tabs = $('.tab-content');
    if (tabs.length < 3) throw new Error('MagistrateAdapter: не найдены tab-content');

    // Таб 0 — основные сведения (Категория, Председательствующий судья,
    // Дело рассмотрено, Результат рассмотрения)
    const rawCard: Record<string, string> = {};
    tabs.eq(0).find('table.tablcont tr').each((_i, el) => {
      const tds = $(el).find('td');
      if (tds.length < 2) return;
      const key = cleanText(tds.eq(0).text())?.replace(/:$/, '');
      const value = cleanText(tds.eq(1).text());
      if (key) rawCard[key] = value ?? '';
    });

    // Таб 1 — движение дела: 5 колонок (событие, дата, время, результат, судья)
    const events: CaseEvent[] = [];
    tabs.eq(1).find('table.tablcont tr').each((i, el) => {
      if (i < 2) return; // пропускаем заголовок h2-строку и строку с названиями колонок
      const tds = $(el).find('td');
      if (tds.length < 4) return;
      const rawResult = cleanText(tds.eq(3).text());
      // Из результата извлекаем дату публикации решения вида "(DD.MM.YYYY)"
      const publishMatch = rawResult?.match(/\((\d{2}\.\d{2}\.\d{4})\)/);
      events.push({
        eventName: cleanText(tds.eq(0).text()),
        eventDate: parseDate(cleanText(tds.eq(1).text())),
        eventTime: cleanText(tds.eq(2).text()),
        location: null,
        result: rawResult,
        reason: null,
        judge: tds.length >= 5 ? cleanText(tds.eq(4).text()) : null,
        note: null,
        publishDate: publishMatch ? parseDate(publishMatch[1]) : null,
      });
    });

    // Из событий извлекаем дату первого события (подача) и ближайшее слушание
    const filingDate = events.length > 0 ? events[0].eventDate : null;
    const hearingDate = events
      .map(e => e.eventDate)
      .filter((d): d is string => !!d)
      .sort()
      .find(d => d >= new Date().toISOString().slice(0, 10))
      ?? events.map(e => e.eventDate).filter((d): d is string => !!d).sort().at(-1)
      ?? parseDate(cleanText(rawCard['Дело рассмотрено (выдан приказ)']))
      ?? null;

    // Последний результат из событий
    const lastResult = [...events].reverse().find(e => e.result)?.result ?? null;

    // Таб 2 — стороны
    const parties: CaseParty[] = [];
    const partyRows = tabs.eq(2).find('table.tablcont tr');
    if (partyRows.length >= 3) {
      const roles = partyRows.eq(1).find('td').slice(1).map((_i, el) => cleanText($(el).text())).get();
      const names = partyRows.eq(2).find('td').slice(1).map((_i, el) => cleanText($(el).text())).get();

      for (let i = 0; i < Math.max(roles.length, names.length); i++) {
        if (!roles[i] && !names[i]) continue;
        parties.push({
          role: roles[i] ?? null,
          name: names[i] ?? null,
          inn: null,
          kpp: null,
          ogrn: null,
          ogrnip: null,
        });
      }
    }

    const category = rawCard['Категория'] ? [rawCard['Категория']] : [];

    return {
      $schema: 'courtflow/case/v1',
      uid: caseNumber, // судебный номер дела, напр. "2-2808/2026"
      type: 'Гражданское дело',
      number: caseNumber,
      court: extractCourtSubdomain(url, 'magistrate'),
      courtType: 'magistrate',
      identifiers: {
        delo_id: parsedUrl.searchParams.get('delo_id'),
        case_uid: null,
        case_type: parsedUrl.searchParams.get('op'),
        case_id: parsedUrl.searchParams.get('case_id'),
      },
      publishedAt: null,
      modifiedAt: null,
      card: {
        filingDate,
        category,
        judge: rawCard['Председательствующий судья'] ?? null,
        // result из 'Результат рассмотрения' (Tab 0); fallback на последнее событие
        hearingDate,
        result: rawCard['Результат рассмотрения'] ?? lastResult,
        proceedingType: null,
      },
      events,
      parties,
    };
  }
}

=== packages/search/shared.ts (для контекста: fetchHtml/backoff) ===
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import https from 'https';
import { encodeParam } from '../core/encoding.js';
import { isCaptchaPage, assertCourtUrl } from '../core/errors.js';
import { getRuCaptchaKey } from '../core/config.js';
import type { SearchRequest, SearchResult } from '../core/types.js';

// WAF ГАС «Правосудие» банит IP по rate-limit (403) — ретраим с экспоненциальным backoff
// (наблюдение 2026-08-05: бан временный, суды доступны с другого IP)
const RETRY_STATUSES = new Set([403, 429]);
const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 5000;

function isRetryableStatus(status: number): boolean {
  return RETRY_STATUSES.has(status);
}

export function fetchHtml(url: string): Promise<string> {
  // CR11-002: rejectUnauthorized:false допустим только за allowlist'ом судовых доменов
  assertCourtUrl(url);

  const attempt = (n: number): Promise<string> => new Promise((resolve, reject) => {
    const parsed = new URL(url);
    https.get({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      rejectUnauthorized: false,
      timeout: 120000,
      headers: { 'User-Agent': 'CourtDesk/0.1' },
    }, res => {
      if (res.statusCode && res.statusCode >= 400) {
        if (isRetryableStatus(res.statusCode) && n < MAX_ATTEMPTS) {
          const backoff = BACKOFF_BASE_MS * 2 ** (n - 1);
          setTimeout(() => resolve(attempt(n + 1)), backoff);
          return;
        }
        reject(new Error(`HTTP ${res.statusCode} — sudrf.ru временно недоступен`));
        return;
      }
      const chunks: Buffer[] = [];
      const ct = res.headers['content-type'] ?? '';
      const cs = ct.match(/charset=([\w-]+)/i);
      const encoding = (cs && cs[1]?.toLowerCase() === 'utf-8') ? 'utf8' : 'win1251';
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        try { resolve(iconv.decode(Buffer.concat(chunks), encoding)); }
        catch { resolve(Buffer.concat(chunks).toString('utf8')); }
      });
    }).on('error', (err: Error) => {
      reject(new Error(`Ошибка соединения с sudrf.ru: ${err.message}`));
    }).on('timeout', function (this: any) { this.destroy(); reject(new Error('sudrf.ru временно недоступен (таймаут). Попробуйте позже.')); });
  });

  return attempt(1);
}

/** fetchHtml с fallback на captcha-resolution при детекте капчи */
export async function smartFetch(url: string, alwaysCaptcha = false): Promise<string> {
  assertCourtUrl(url);
  if (alwaysCaptcha) {
    const apiKey = getRuCaptchaKey();
    if (!apiKey) throw new Error('Для этого типа суда требуется ключ RuCaptcha в .env');
    const { fetchWithCaptcha } = await import('../captcha/session.js');
    return fetchWithCaptcha({ url, apiKey });
  }
  const html = await fetchHtml(url);
  // После plain fetch проверяем, нет ли капчи или ошибки капчи
  if (html.includes('Неверно указан проверочный код')) {
    const apiKey = getRuCaptchaKey();
    if (!apiKey) throw new Error('Сервер требует проверочный код, но RUCAPTCHA_API_KEY не задан');
    const { fetchWithCaptcha } = await import('../captcha/session.js');
    return fetchWithCaptcha({ url, apiKey });
  }
  if (!isCaptchaPage(html)) return html;
  // CR12-012 FIXED: HTML капчи не возвращается как результат — явная ошибка
  const apiKey = getRuCaptchaKey();
  if (!apiKey) throw new Error('Сервер требует капчу, но RUCAPTCHA_API_KEY не задан');
  const { fetchWithCaptcha } = await import('../captcha/session.js');
  return fetchWithCaptcha({ url, apiKey });
}

/** Построить URL поиска ГАС «Правосудие» с префиксом полей */
export function buildSearchUrl(req: SearchRequest, params: { delo_id: string; case_type: string; prefix: string; new_?: string }): string {
  const base = req.courtType === 'magistrate'
    ? `https://${req.courtId}.msudrf.ru/modules.php`
    : `https://${req.courtId}.sudrf.ru/modules.php`;
  const P = params.prefix.toUpperCase();
  const p = params.prefix.toLowerCase();
  const q = [
    'name=sud_delo', 'srv_num=1',
    'name_op=r', `delo_id=${params.delo_id}`, `case_type=${params.case_type}`, `new=${params.new_ ?? '0'}`,
    `${P}_PARTS__NAMESS=` + encodeParam(req.defendant || req.plaintiff || ''),
    `${p}_case__CASE_NUMBERSS=` + encodeURIComponent(req.caseNumber || ''),
    `${p}_case__JUDICIAL_UIDSS=` + encodeURIComponent(req.caseUid ?? ''),
    `delo_table=${p}_case`,
    `${p}_case__ENTRY_DATE1D=` + encodeURIComponent(req.filingDateFrom || ''),
    `${p}_case__ENTRY_DATE2D=` + encodeURIComponent(req.filingDateTo || ''),
    `${P}_CASE__JUDGE=`,
    `${p}_case__RESULT_DATE1D=`, `${p}_case__RESULT_DATE2D=`,
    `${P}_CASE__RESULT=`, `${P}_CASE__BUILDING_ID=`, `${P}_CASE__COURT_STRUCT=`,
    `${P}_EVENT__EVENT_NAME=`, `${P}_EVENT__EVENT_DATEDD=`,
    `${P}_PARTS__PARTS_TYPE=`,
    `${P}_PARTS__INN_STRSS=`, `${P}_PARTS__KPP_STRSS=`, `${P}_PARTS__OGRN_STRSS=`, `${P}_PARTS__OGRNIP_STRSS=`,
    `${P}_RKN_ACCESS_RESTRICTION__RKN_REASON=`,
    `${p}_rkn_access_restriction__RKN_RESTRICT_URLSS=`,
    `${p}_requirement__ACCESSION_DATE1D=`, `${p}_requirement__ACCESSION_DATE2D=`,
    `${P}_REQUIREMENT__CATEGORY=`, `${p}_requirement__ESSENCESS=`,
    `${p}_requirement__JOIN_END_DATE1D=`, `${p}_requirement__JOIN_END_DATE2D=`,
    `${P}_REQUIREMENT__PUBLICATION_ID=`,
    `${P}_DOCUMENT__PUBL_DATE1D=`, `${P}_DOCUMENT__PUBL_DATE2D=`,
    `${P}_CASE__VALIDITY_DATE1D=`, `${P}_CASE__VALIDITY_DATE2D=`,
    `${P}_ORDER_INFO__ORDER_DATE1D=`, `${P}_ORDER_INFO__ORDER_DATE2D=`,
    `${P}_ORDER_INFO__ORDER_NUMSS=`, `${P}_ORDER_INFO__EXTERNALKEYSS=`,
    `${P}_ORDER_INFO__STATE_ID=`, `${P}_ORDER_INFO__RECIP_ID=`,
    'Submit=%CD%E0%E9%F2%E8',
  ];
  return base + '?' + q.join('&');
}

export function parseResults(html: string, req: SearchRequest): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  // Если есть сообщение об ошибке — выбрасываем
  const errText = (() => {
    const m = html.match(/<div[^>]*id="error"[^>]*>([\s\S]*?)<\/div>/i);
    if (m) return m[1].replace(/<[^>]+>/g, '').trim();
    return null;
  })();
  if (errText) throw new Error(errText);

  const table = $('table').filter((_, t) => $(t).text().includes('№ дела')).first();
  if (!table.length) return results;

  table.find('tr').slice(1).each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 5) return;
    const link = cells.eq(0).find('a');
    const href = link.attr('href') || '';
    const num = link.text().trim().split(/\s+/)[0] || '';
    const caseUidMatch = href.match(/case_uid=([a-f0-9-]+)/i);
    const caseIdMatch = href.match(/case_id=(\d+)/i);
    const caseUidRaw = cells.eq(2).find('.case-uid, .uid').text().trim()
      || cells.find('input[name="g2_case__JUDICIAL_UIDSS"]').val() as string | undefined;
    results.push({
      caseNumber: num,
      caseUrl: href.startsWith('http') ? href : `https://${req.courtId}.sudrf.ru${href}`,
      caseUid: caseUidRaw || (caseUidMatch ? caseUidMatch[1] : null),
      caseId: caseIdMatch ? caseIdMatch[1] : null,
      courtCode: req.courtCode,
      judge: cells.eq(3).text().trim() || null,
      result: cells.eq(5).text().trim() || null,
      legalForceDate: cells.eq(6).text().trim() || null,
      filingDate: cells.eq(1).text().trim() || null,
      decisionDate: cells.eq(4).text().trim() || null,
      parties: [],
      courtId: req.courtId,
      courtType: req.courtType,
    });
  });
  return results;
}

── ДОПОЛНИТЕЛЬНЫЕ ФАКТЫ ──
- RuCaptchaClient: createTask/polling/retry (v2 API, api.rucaptcha.com, type=ImageToTextTask, softId="3898").
- getBrowser: пул Puppeteer (launch на первый вызов, reuse; releaseBrowser после каждого fetch).
- isCaptchaPage(html): детектит kcaptchaForm (msudrf) или id="captcha" (sudrf).
- assertCourtUrl: https + *.sudrf.ru/*.msudrf.ru allowlist, выброс при несоответствии.
- Окружение: Node ≥22, Puppeteer 25, Windows.
- Раньше (до 2026-08-05) msudrf-поиск работал и парсил дела (кейс 2-800/2026 спарсился, case_id=1284505, uid=судебный номер).
- В data/ остался файл cases.json.tmp.* — след обрыва tmp+rename записи store.

── ЗАДАЧА ──
1) НАЙДИ ПРИЧИНУ РЕГРЕССИИ: проанализируй код построчно, определи 3-5 наиболее вероятных мест, где пайплайн мировых судов может падать или возвращать пустые/битые данные. Для каждой — почему (механизм отказа) и как проверить. Обрати особое внимание на: ожидание AJAX-результатов (#search_results), клик по кнопке «Искать», заполнение полей формы (имена полей g1_/G1_, отличия от реальной формы msudrf), обработку капчи (kcaptchaForm → форма поиска), декодирование CP1251, ожидание waitForNavigation после POST-капчи, таймауты, пул браузера (новый page в общей сессии), парсинг таблицы (колонки 5 против 7), хрупкие regex (ИСТЕЦ:/ОТВЕТЧИК:, case_id=).
2) ПРЕДЛОЖИ КОНКРЕТНЫЙ ФИКС: точечные правки кода (дифф-паттерн: что заменить, на что), без переписывания архитектуры, с учётом WAF-тормозов. Пронумеруй по приоритету (сначала то, что чинит поломку, потом профилактика).
3) РЕКОМЕНДАЦИИ: как диагностировать на живом сервере (какие debugDir-файлы смотреть, что логировать), как добавить тесты, которые поймали бы эту регрессию (фикстуры HTML формы/результатов msudrf).
4) ДРУГИЕ РИСКИ в этом коде (гонки, утечки страниц/браузеров, падение при 404/пустых результатах, XSS в href) — кратко, по приоритету.

── ФОРМАТ ОТВЕТА (строго) ──
1) ДИАГНОЗ — таблица: # | подозрение | почему | как проверить | вероятность (высокая/средняя/низкая)
2) ФИКСЫ — нумерованный список: файл:строка | проблема | замена (кодом) | приоритет
3) ДИАГНОСТИКА НА ПРОДЕ — 3-5 шагов
4) ТЕСТЫ — какие фикстуры и ассерты добавить
5) ДРУГИЕ РИСКИ — кратко
РЕКОМЕНДАЦИЯ: <одна строка — с чего начать>
ОТКРЫТЫЕ ВОПРОСЫ: <что уточнить>
Ничего, кроме этого формата.

── СОХРАНЕНИЕ РЕЗУЛЬТАТА (обязательный последний раздел ответа) ──
Заверши ответ разделом «СОХРАНЕНИЕ РЕЗУЛЬТАТА» в строгом формате:

1) ФАЙЛЫ — таблица, по строке на каждый результат, который пользователь должен забрать:
   | Имя файла (латиница, с расширением) | Куда положить (путь относительно корня проекта из ТЗ, напр. articles/, site/, docs/) | Что вставить (какой раздел ответа) |
   Все файлы — UTF-8. Если в ТЗ задана папка (напр. «файл будет лежать в папке рядом с img/») — укажи её.

2) ОТЧЁТ — 3-5 строк: что сделано, главные решения, на что обратить внимание при проверке.

3) ПРОВЕРКА — конкретные шаги: как пользователь проверит результат (команды, браузер, что смотреть).
