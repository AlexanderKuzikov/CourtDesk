// Мировые суды (*.msudrf.ru) — с капчей через Puppeteer+RuCaptcha
//
// msudrf ставит капчу на любой запрос к modules.php.
// Стратегия: решаем капчу на op=hl (список дел),
// затем в той же сессии делаем page.goto с поисковыми параметрами.
//
// Параметры поиска — те же, что в district (CP1251 encoding):
//   name=sud_delo, srv_num=1, name_op=r, delo_id=1540005
//   g1_case__CASE_NUMBERSS, G1_PARTS__NAMESS (через encodeParam)

import * as cheerio from 'cheerio';
import { isCaptchaPage } from '../../core/errors.js';
import { getRuCaptchaKey } from '../../core/config.js';
import type { SearchRequest, SearchResult } from '../../core/types.js';
import type { SearchAdapter } from './types.js';
import { buildSearchUrl } from '../shared.js';
import { SEARCH_PARAMS } from '../constants.js';

/**
 * Парсинг таблицы результатов msudrf (формат ГАС «Правосудие»).
 * Колонки: № дела | Дата поступления | Категория | Судья | Дата решения | Результат | Вступление в силу
 */
function parseResults(html: string, req: SearchRequest): SearchResult[] {
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
    results.push({
      caseNumber: num,
      caseUrl: href.startsWith('http') ? href : `https://${req.courtId}.msudrf.ru${href}`,
      uid: uidMatch ? uidMatch[1] : '',
      courtCode: req.courtCode,
      judge: cells.eq(3).text().trim() || null,
      result: cells.eq(5).text().trim() || null,
      legalForceDate: cells.eq(6).text().trim() || null,
      filingDate: cells.eq(1).text().trim() || null,
      decisionDate: cells.eq(4).text().trim() || null,
      parties: [],
      courtId: req.courtId,
      courtType: 'magistrate',
    });
  });
  return results;
}

export class MagistrateSearchAdapter implements SearchAdapter {
  buildSearchUrl(req: SearchRequest): string {
    // msudrf использует те же параметры, что и district
    return buildSearchUrl(req, SEARCH_PARAMS.magistrate);
  }

  async searchByCaseNumber(req: SearchRequest): Promise<SearchResult[]> {
    const apiKey = getRuCaptchaKey();
    if (!apiKey) {
      throw new Error('Для мировых судов нужен ключ RuCaptcha в .env');
    }

    // Парсинг по URL дела — делегируем parse-адаптеру
    if (req.caseNumber && req.caseNumber.startsWith('http')) {
      const { fetchWithCaptcha } = await import('../../captcha/session.js');
      const html = await fetchWithCaptcha({ url: req.caseNumber, apiKey });
      if (isCaptchaPage(html)) {
        throw new Error('Captcha loop: не удалось загрузить страницу дела');
      }
      const { getParseAdapter } = await import('../../parse/index.js');
      const adapter = getParseAdapter('magistrate');
      const card = await adapter.parse(html, req.caseNumber);
      return [{
        caseNumber: card.number,
        caseUrl: req.caseNumber,
        uid: card.uid,
        courtCode: req.courtCode,
        judge: card.card.judge,
        result: card.card.result,
        legalForceDate: null,
        filingDate: card.card.filingDate,
        decisionDate: card.card.hearingDate,
        parties: card.parties.map(p => ({ role: p.role ?? '', name: p.name ?? '' })),
        courtId: req.courtId,
        courtType: 'magistrate',
      }];
    }

    // Поиск по номеру — через браузерную сессию (капча решается один раз)
    const { fetchWithCaptcha } = await import('../../captcha/session.js');
    const searchUrl = this.buildSearchUrl(req);
    const html = await fetchWithCaptcha({ url: searchUrl, apiKey });

    if (isCaptchaPage(html)) {
      throw new Error('Captcha loop: не удалось получить результаты поиска');
    }

    return parseResults(html, req);
  }

  async searchByParty(req: SearchRequest): Promise<SearchResult[]> {
    // Поиск по участникам использует тот же механизм (buildSearchUrl с G1_PARTS__NAMESS)
    return this.searchByCaseNumber(req);
  }

  async searchByCaseUid(req: SearchRequest): Promise<SearchResult[]> {
    const apiKey = getRuCaptchaKey();
    if (!apiKey) throw new Error('Для мировых судов нужен ключ RuCaptcha в .env');

    const { fetchWithCaptcha: fwc } = await import('../../captcha/session.js');
    const searchUrl = this.buildSearchUrl(req);
    const html = await fwc({ url: searchUrl, apiKey });

    if (isCaptchaPage(html)) {
      throw new Error('Captcha loop: не удалось получить результаты поиска');
    }

    return parseResults(html, req);
  }
}