// Общие утилиты для search-адаптеров
// Вынесены из дублированного кода в district/appeal/cassation — см. CODE_REVIEW4

import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import https from 'https';
import { isCaptchaPage } from '../core/errors.js';
import { getRuCaptchaKey } from '../core/config.js';
import type { SearchRequest, SearchResult } from '../core/types.js';

export function fetchHtml(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    https.get({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      rejectUnauthorized: false,
      timeout: 120000,
      headers: { 'User-Agent': 'CourtDesk/0.1' },
    }, res => {
      if (res.statusCode && res.statusCode >= 400) {
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
}

/** fetchHtml с fallback на captcha-resolution при детекте капчи */
export async function smartFetch(url: string): Promise<string> {
  let html = await fetchHtml(url);
  if (!isCaptchaPage(html)) return html;
  const apiKey = getRuCaptchaKey();
  if (!apiKey) return html;
  const { fetchWithCaptcha } = await import('../captcha/session.js');
  return fetchWithCaptcha({ url, apiKey });
}

export function parseResults(html: string, req: SearchRequest): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  const table = $('table').filter((_, t) => $(t).text().includes('№ дела')).first();
  if (!table.length) return results;

  table.find('tr').slice(1).each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 5) return;
    const link = cells.eq(0).find('a');
    const href = link.attr('href') || '';
    const num = link.text().trim().split(/\s+/)[0] || '';
    const uidMatch = href.match(/case_uid=([a-f0-9-]+)/i);
    const caseUidRaw = cells.eq(2).find('.case-uid, .uid').text().trim()
      || cells.find('input[name="g2_case__JUDICIAL_UIDSS"]').val() as string | undefined;
    results.push({
      caseNumber: num,
      caseUrl: href.startsWith('http') ? href : `https://${req.courtId}.sudrf.ru${href}`,
      uid: uidMatch ? uidMatch[1] : '',
      courtCode: req.courtCode,
      judge: cells.eq(3).text().trim() || null,
      result: cells.eq(5).text().trim() || null,
      legalForceDate: cells.eq(6).text().trim() || null,
      filingDate: cells.eq(1).text().trim() || null,
      decisionDate: cells.eq(4).text().trim() || null,
      parties: [],
      courtId: req.courtId,
      courtType: req.courtType,
      caseUid: caseUidRaw || undefined,
    });
  });
  return results;
}
