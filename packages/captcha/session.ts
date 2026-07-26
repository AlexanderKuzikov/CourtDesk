// packages/captcha/session.ts
// Универсальный captcha-resolver для msudrf.ru и sudrf.ru

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import puppeteer, { type Page } from 'puppeteer';
import iconv from 'iconv-lite';
import { isCaptchaPage } from '../core/errors.js';
import { RuCaptchaClient } from './rucaptcha.js';

export interface FetchWithCaptchaOptions {
  url: string;
  apiKey: string;
  softId?: string;
  debugDir?: string;
}

type CaptchaMode = 'msudrf' | 'sudrf';

const CAPTCHA_ERROR = 'Неверно указан проверочный код';

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
      const res = await fetch(imgSrc, { credentials: 'include' });
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
    }, { timeout: 30000 });
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
    }, { timeout: 30000 });
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
    }, { timeout: 30000 });
  } catch {}
  // Даём время на завершение рендеринга
  await new Promise(r => setTimeout(r, 1000));
}

export async function fetchWithCaptcha(options: FetchWithCaptchaOptions): Promise<string> {
  const headless: boolean | 'shell' = process.env['PUPPETEER_HEADLESS'] === 'false' ? false : 'shell';

  const browser = await puppeteer.launch({
    headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-features=NetworkServiceInProcess',
      '--ignore-certificate-errors',
    ],
  });

  try {
    const page = await browser.newPage();

    const MAX_TRIES = 3;
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
      await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      let html = await page.content();
      let mode = detectMode(html);

      if (!mode && html.includes(CAPTCHA_ERROR)) {
        await page.goto(buildFormUrl(options.url), { waitUntil: 'domcontentloaded', timeout: 60000 });
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
    await browser.close().catch(() => {});
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
export async function fetchMsudrfSearch(options: {
  formUrl: string;
  fields: Record<string, string>;
  apiKey: string;
  debugDir?: string;
}): Promise<string> {
  const headless: boolean | 'shell' = process.env['PUPPETEER_HEADLESS'] === 'false' ? false : 'shell';
  const browser = await puppeteer.launch({
    headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-features=NetworkServiceInProcess',
      '--ignore-certificate-errors',
    ],
  });

  try {
    const page = await browser.newPage();

    // Шаг 1: открываем форму поиска (покажет kcaptchaForm)
    await page.goto(options.formUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    let html = await page.content();

    // Шаг 2: решаем капчу, если есть
    if (html.includes('kcaptchaForm')) {
      const client = new RuCaptchaClient({ apiKey: options.apiKey });
      const src = await page.$eval(
        'form#kcaptchaForm img',
        (img: HTMLImageElement) => img.getAttribute('src') || '',
      );
      if (!src) throw new Error('Captcha image src not found');
      const imageBase64 = await page.evaluate(async (imgSrc: string) => {
        const res = await fetch(imgSrc, { credentials: 'include' });
        if (!res.ok) throw new Error(`Captcha image fetch failed: HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        let binary = '';
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
      }, src) as unknown as string;

      const captchaText = await client.solveImage(imageBase64);

      await page.locator('input[name="captcha-response"]').fill(captchaText);
      await page.locator('form#kcaptchaForm button[type="submit"]').click();

      // Ждём загрузки формы поиска (kcaptchaForm исчезла)
      try {
        await page.waitForFunction(() => {
          const body = document.body?.innerHTML || '';
          return body.includes('bookmark-content') && !body.includes('kcaptchaForm');
        }, { timeout: 30000 });
      } catch {
        const after = await page.content();
        if (isCaptchaPage(after)) {
          throw new Error('Captcha loop: капча не решена после 1 попытки');
        }
      }
    }

    // Шаг 3: заполняем поля поиска
    for (const [name, value] of Object.entries(options.fields)) {
      if (value) {
        await page.locator(`input[name="${name}"]`).fill(value).catch(() => {});
      }
    }

    // Шаг 4: кликаем «Искать»
    await page.locator('input.button-normal.search').click();

    // Шаг 5: ждём появления результатов
    try {
      await page.waitForFunction(() => {
        const el = document.querySelector('#search_results');
        if (!el) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && el.innerHTML.trim().length > 0;
      }, { timeout: 30000 });
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
    }

    return resultsHtml || html;
  } finally {
    await browser.close().catch(() => {});
  }
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}
