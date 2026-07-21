// Совместимый слой для CourtFlow-модулей (captcha)

export function isCaptchaPage(html: string): boolean {
  // Маркер капчи на msudrf.ru
  return html.includes('kcaptchaForm');
}
