// packages/captcha/session.ts
// Универсальный captcha-resolver для msudrf.ru и sudrf.ru

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import puppeteer, { type Page } from 'puppeteer';
import { isCaptchaPage } from '../core/errors.js';
import { RuCaptchaClient } from './rucaptcha.js';

export interface FetchWithCaptchaOptions {
  url: string;
  apiKey: string;
  softId?: string;
  debugDir?: string;
  /** URL формы поиска (name_op=sf) для preflight captcha */
  formUrl?: string;
}

type CaptchaMode = 'msudrf' | 'sudrf';

const CAPTCHA_ERROR = 'Неверно указан проверочный код';

function detectMode(html: string): CaptchaMode | null {
  if (html.includes('kcaptchaForm')) return 'msudrf';
  if (html.includes('id="captcha"') || html.includes('name="captcha"')) return 'sudrf';
  return null;
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
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    }, src);
  }

  // sudrf: data URIs directly in the page
  const base64 = await page.evaluate(() => {
    const el = document.querySelector('input#captcha');
    if (!el) return null;
    const row = el.closest('tr');
    if (!row) return null;
    const img = row.querySelector('img');
    if (!img) return null;
    const src = img.getAttribute('src') || '';
    const m = src.match(/^data:\s*image\/[^;]+;base64,(.+)$/i);
    return m ? m[1] : null;
  });
  if (!base64) throw new Error('Captcha image base64 not found in sudrf page');
  return base64;
}

async function fillCaptcha(page: Page, text: string, mode: CaptchaMode): Promise<void> {
  if (mode === 'msudrf') {
    await page.locator('input[name="captcha-response"]').fill(text);
    await page.locator('form#kcaptchaForm button[type="submit"]').click();
    await page.waitForNetworkIdle({ timeout: 60000 }).catch(() => {});
  } else {
    await page.locator('#captcha').fill(text);
    await page.locator('input[name="Submit"]').click();
    await page.waitForNetworkIdle({ timeout: 60000 }).catch(err => console.warn('[captcha] waitForNetworkIdle:', err));
  }
}
/** Решить капчу, заполнить поля поиска и отправить форму через JS */
async function solveCaptchaAndSubmitSearch(page: Page, searchUrl: string, captchaText: string): Promise<void> {
  // Заполняем капчу
  await page.locator('#captcha').fill(captchaText);

  // Извлекаем параметры поиска из URL
  const qs = new URL(searchUrl).searchParams;

  // Заполняем поля поиска — пробуем оба префикса
  for (const prefix of ['G2', 'G1']) {
    const p = prefix.toLowerCase();
    const fields = [
      [`${prefix}_PARTS__NAMESS`, qs.get(`${prefix}_PARTS__NAMESS`)],
      [`${p}_case__CASE_NUMBERSS`, qs.get(`${p}_case__CASE_NUMBERSS`)],
      [`${p}_case__ENTRY_DATE1D`, qs.get(`${p}_case__ENTRY_DATE1D`)],
      [`${p}_case__ENTRY_DATE2D`, qs.get(`${p}_case__ENTRY_DATE2D`)],
    ];
    for (const [name, val] of fields) {
      if (val) {
        await page.locator(`input[name="${name}"]`).fill(val).catch(() => {});
      }
    }
  }

  // Кликаем кнопку «Найти» — это вызовет checkForm(event) и отправит форму
  await page.locator('input[name="Submit"]').click();
  await page.waitForNetworkIdle({ timeout: 60000 }).catch(err => console.warn('[captcha] waitForNetworkIdle:', err));
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
  const page = await browser.newPage();

  try {
    await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    let html = await page.content();
    let mode = detectMode(html);

    // Если капчи нет — возможно, sudrf вернул ошибку. Пробуем форму.
    if (!mode && (options.formUrl || html.includes(CAPTCHA_ERROR))) {
      const formUrl = options.formUrl ?? buildFormUrl(options.url);
      await page.goto(formUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      html = await page.content();
      mode = detectMode(html);
    }

    if (!mode) return html;

    if (options.debugDir) ensureDir(options.debugDir);

    const client = new RuCaptchaClient({ apiKey: options.apiKey, softId: options.softId });
    const imageBase64 = await readCaptchaImageBase64(page, mode);
    const captchaText = await client.solveImage(imageBase64);

    if (mode === 'msudrf') {
      await fillCaptcha(page, captchaText, mode);
    } else if (options.formUrl) {
      // sudrf: решаем капчу, заполняем поля поиска, сабмитим через JS
      await solveCaptchaAndSubmitSearch(page, options.url, captchaText);
    } else {
      await fillCaptcha(page, captchaText, mode);
    }

    html = await page.content();

    if (options.debugDir) {
      writeFileSync(resolve(options.debugDir, 'captcha-last.html'), html, 'utf-8');
    }

    if (isCaptchaPage(html)) {
      throw new Error('Captcha loop: после отправки капча показана повторно');
    }

    return html;
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

/** Построить URL формы поиска (name_op=sf) из URL поиска (name_op=r) */
function buildFormUrl(searchUrl: string): string {
  const u = new URL(searchUrl);
  const deloId = u.searchParams.get('delo_id') || '1540005';
  const caseType = u.searchParams.get('case_type') || '0';
  // Чистая форма поиска — только идентификаторы, без полей поиска
  return `https://${u.hostname}/modules.php?name=sud_delo&srv_num=1&name_op=sf&delo_id=${deloId}&case_type=${caseType}&new=0`;
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}
