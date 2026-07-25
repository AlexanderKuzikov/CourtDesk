// Общие утилиты для search-адаптеров
// Вынесены из дублированного кода в district/appeal/cassation — см. CODE_REVIEW4

import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import https from 'https';
import { encodeParam } from '../core/encoding.js';
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

/** Построить URL формы (name_op=sf) из URL поиска (name_op=r) */
function buildFormUrl(searchUrl: string): string {
  return searchUrl.replace(/name_op=r/, 'name_op=sf').replace(/&new=\d+/, '&new=0');
}

const CAPTCHA_ERROR = 'Неверно указан проверочный код';

/** fetchHtml с fallback на captcha-resolution при детекте капчи */
export async function smartFetch(url: string, alwaysCaptcha = false): Promise<string> {
  if (alwaysCaptcha) {
    const apiKey = getRuCaptchaKey();
    if (!apiKey) throw new Error('Для этого типа суда требуется ключ RuCaptcha в .env');
    const { fetchWithCaptcha } = await import('../captcha/session.js');
    return fetchWithCaptcha({ url, apiKey, formUrl: buildFormUrl(url) });
  }
  let html = await fetchHtml(url);
  if (!isCaptchaPage(html) && !html.includes(CAPTCHA_ERROR)) return html;
  const apiKey = getRuCaptchaKey();
  if (!apiKey) return html;
  const { fetchWithCaptcha } = await import('../captcha/session.js');
  return fetchWithCaptcha({ url, apiKey, formUrl: buildFormUrl(url) });
}

/** Построить URL поиска ГАС «Правосудие» с префиксом полей */
export function buildSearchUrl(req: SearchRequest, params: { delo_id: string; case_type: string; prefix: string }): string {
  const base = req.courtType === 'magistrate'
    ? `https://${req.courtId}.msudrf.ru/modules.php`
    : `https://${req.courtId}.sudrf.ru/modules.php`;
  const P = params.prefix.toUpperCase();
  const p = params.prefix.toLowerCase();
  const q = [
    'name=sud_delo', 'srv_num=1',
    'name_op=r', `delo_id=${params.delo_id}`, `case_type=${params.case_type}`, 'new=0',
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
