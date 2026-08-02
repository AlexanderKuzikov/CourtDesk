// packages/captcha/browser.ts
// CR12-009 FIXED: один браузер Puppeteer переиспользуется между вызовами.
// Раньше каждый fetchWithCaptcha/fetchMsudrfSearch запускал новый Chrome (~1-2 c).
// Браузер живёт пока есть вызовы и закрывается после IDLE_CLOSE_MS простоя.

import puppeteer, { type Browser } from 'puppeteer';

const IDLE_CLOSE_MS = 30_000;

let _browser: Browser | null = null;
let _launching: Promise<Browser> | null = null;
let _idleTimer: ReturnType<typeof setTimeout> | null = null;

function launchOptions(): Parameters<typeof puppeteer.launch>[0] {
  const headless: boolean | 'shell' = process.env['PUPPETEER_HEADLESS'] === 'false' ? false : 'shell';
  return {
    headless,
    args: [
      // --no-sandbox сохранён осознанно: headless Chrome в контейнерах/CI без него падает;
      // целевой хост — изолированная LAN-машина заказчика (ADR 2026-08-02 про доверенную среду)
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-features=NetworkServiceInProcess',
      '--ignore-certificate-errors',
    ],
  };
}

/** Получить общий браузер (запустится при первом обращении) */
export async function getBrowser(): Promise<Browser> {
  if (_idleTimer) {
    clearTimeout(_idleTimer);
    _idleTimer = null;
  }
  if (_browser && _browser.connected) return _browser;
  _browser = null;
  // Параллельные вызовы не должны запускать два браузера
  if (!_launching) {
    _launching = puppeteer.launch(launchOptions());
    _launching.catch(() => { _launching = null; });
  }
  const browser = await _launching;
  _launching = null;
  _browser = browser;
  return browser;
}

/** Вызов закончил работу: браузер закроется после простоя */
export function releaseBrowser(): void {
  if (_idleTimer) clearTimeout(_idleTimer);
  _idleTimer = setTimeout(() => {
    _idleTimer = null;
    const b = _browser;
    _browser = null;
    if (b) b.close().catch(() => {});
  }, IDLE_CLOSE_MS);
  // Не держать процесс в alive только ради таймера
  (_idleTimer as { unref?: () => void }).unref?.();
}

/** Принудительно закрыть (для тестов/завершения процесса) */
export async function closeBrowser(): Promise<void> {
  if (_idleTimer) {
    clearTimeout(_idleTimer);
    _idleTimer = null;
  }
  const b = _browser;
  _browser = null;
  if (b) await b.close().catch(() => {});
}
