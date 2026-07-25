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
  // Извлекаем только идентификаторы, чистая форма без полей поиска
  const params = extractSearchParams(searchUrl);
  const deloId = params['delo_id'] || '1540005';
  const caseType = params['case_type'] || '0';
  try {
    const hostname = new URL(searchUrl).hostname;
    return `https://${hostname}/modules.php?name=sud_delo&srv_num=1&name_op=sf&delo_id=${deloId}&case_type=${caseType}&new=0`;
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

/** Для msudrf: заполнить капчу и сабмитнуть (AJAX-обновление) */
async function fillCaptchaMsudrf(page: Page, text: string): Promise<void> {
  await page.locator('input[name="captcha-response"]').fill(text);
  await page.locator('form#kcaptchaForm button[type="submit"]').click();
  await page.waitForNetworkIdle({ timeout: 60000 }).catch(() => {});
}

/** Декодировать CP1251 percent-encoded параметр в строку */
function decodeCp1251Param(encoded: string): string {
  const latin1 = decodeURIComponent(encoded);
  return iconv.decode(Buffer.from(latin1, 'latin1'), 'win1251');
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
  // Извлекаем фамилию/номер из параметров поиска
  const params = extractSearchParams(searchUrl);
  const fillable = ['G2_PARTS__NAMESS', 'G1_PARTS__NAMESS', 'g2_case__CASE_NUMBERSS', 'g1_case__CASE_NUMBERSS',
    'g2_case__ENTRY_DATE1D', 'g1_case__ENTRY_DATE1D', 'g2_case__ENTRY_DATE2D', 'g1_case__ENTRY_DATE2D'];

  // Заполняем поля через locator.fill (эмуляция ввода)
  for (const name of fillable) {
    const val = params[name];
    if (val && val.trim()) {
      await page.locator(`input[name="${name}"]`).fill(val).catch(() => {});
    }
  }

  // Заполняем капчу
  await page.locator('#captcha').fill(captchaText);

  // Кликаем по кнопке «Найти» — checkForm сработает и отправит форму
  await page.locator('input[name="Submit"]').click();
  // Ждём загрузку результатов
  await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
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
        await fillCaptchaMsudrf(page, captchaText);
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

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}
