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
}

type CaptchaMode = 'msudrf' | 'sudrf';

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
    const m = src.match(/^data:image\/[^;]+;base64,(.+)$/i);
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
    const mode = detectMode(html);
    if (!mode) return html;

    if (options.debugDir) ensureDir(options.debugDir);

    const client = new RuCaptchaClient({ apiKey: options.apiKey, softId: options.softId });
    const imageBase64 = await readCaptchaImageBase64(page, mode);
    const captchaText = await client.solveImage(imageBase64);

    await fillCaptcha(page, captchaText, mode);

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

// Совместимость: старое имя для обратной совместимости
export { fetchWithCaptcha as fetchMagistrateHtml };

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}
