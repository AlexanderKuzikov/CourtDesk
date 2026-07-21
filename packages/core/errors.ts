// Совместимый слой для CourtFlow-модулей (captcha)

export function isCaptchaPage(html: string): boolean {
  // Маркер капчи на msudrf.ru
  return html.includes('kcaptchaForm');
}

export class CaptchaRequiredError extends Error {
  constructor(message = 'Captcha required') {
    super(message);
    this.name = 'CaptchaRequiredError';
  }
}
