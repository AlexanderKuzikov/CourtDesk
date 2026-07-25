// Совместимый слой для CourtFlow-модулей (captcha)

const CAPTCHA_MARKERS = [
  'kcaptchaForm',             // msudrf.ru — отдельная форма капчи
  'id="captcha"',             // sudrf.ru — капча встроена в форму поиска
  'name="captcha"',           // sudrf.ru — альтернативный маркер
];

export function isCaptchaPage(html: string): boolean {
  return CAPTCHA_MARKERS.some(m => html.includes(m));
}

export class CaptchaRequiredError extends Error {
  constructor(message = 'Captcha required') {
    super(message);
    this.name = 'CaptchaRequiredError';
  }
}

export class CourtUrlError extends Error {
  constructor(message = 'Invalid court URL') {
    super(message);
    this.name = 'CourtUrlError';
  }
}

const ALLOWED_HOST_SUFFIXES = ['.sudrf.ru', '.msudrf.ru'];

export function assertCourtUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new CourtUrlError(`Invalid URL: ${url}`);
  }
  if (parsed.protocol !== 'https:') {
    throw new CourtUrlError(`Expected https, got ${parsed.protocol}`);
  }
  const hostname = parsed.hostname.toLowerCase();
  const ok = ALLOWED_HOST_SUFFIXES.some(suffix => hostname === suffix.slice(1) || hostname.endsWith(suffix));
  if (!ok) {
    throw new CourtUrlError(`Host ${hostname} is not an allowed court domain`);
  }
}
