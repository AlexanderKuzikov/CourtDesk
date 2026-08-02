// Мировые суды (*.msudrf.ru) — AJAX-поиск через Puppeteer+RuCaptcha
//
// msudrf отличается от sudrf:
// - Нет <form method="get"> — поиск через JS/AJAX
// - Капча (kcaptchaForm) решается ОДИН раз на сессию
// - После капчи — форма поиска с вкладками
// - Кнопка «Искать» — <input type="button" class="button-normal search">
// - Результаты в <div id="search_results">

import * as cheerio from 'cheerio';
import { getRuCaptchaKey } from '../../core/config.js';
import type { SearchRequest, SearchResult } from '../../core/types.js';
import type { SearchAdapter } from './types.js';
import { SEARCH_PARAMS } from '../constants.js';

/** Построить URL формы поиска msudrf (name_op=sf, не r) */
export function buildFormUrl(req: SearchRequest): string {
  const params = SEARCH_PARAMS.magistrate;
  return `https://${req.courtId}.msudrf.ru/modules.php?name=sud_delo&srv_num=1&name_op=sf&delo_id=${params.delo_id}&case_type=${params.case_type}&new=${params.new_ ?? '0'}`;
}

/** Собрать поля для заполнения формы из SearchRequest */
export function buildFields(req: SearchRequest): Record<string, string> {
  const fields: Record<string, string> = {};
  if (req.caseNumber) fields['g1_case__CASE_NUMBERSS'] = req.caseNumber;
  // CR12-010 FIXED: G1_PARTS__NAMESS — одно поле участника (как в shared.buildSearchUrl:
  // defendant || plaintiff). Раньше plaintiff молча перезаписывал defendant.
  const party = req.defendant || req.plaintiff;
  if (party) fields['G1_PARTS__NAMESS'] = party;
  if (req.caseUid) fields['g1_case__JUDICIAL_UIDSS'] = req.caseUid;
  if (req.filingDateFrom) fields['g1_case__ENTRY_DATE1D'] = req.filingDateFrom;
  if (req.filingDateTo) fields['g1_case__ENTRY_DATE2D'] = req.filingDateTo;
  return fields;
}

/**
 * Парсинг таблицы результатов msudrf.
 * HTML — фрагмент из #search_results.
 * Колонки msudrf: № дела | Категория/Лица | Судья | Дата решения | Решение
 * (отличается от sudrf, где 7 колонок с датой поступления и вступлением)
 */
export function parseResults(html: string, req: SearchRequest): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  const table = $('table').filter((_, t) => $(t).text().includes('№ дела')).first();
  if (!table.length) return results;

  table.find('tr').slice(1).each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 4) return;
    const link = cells.eq(0).find('a');
    const href = link.attr('href') || '';
    const num = link.text().trim().split(/\s+/)[0] || '';
    const caseIdMatch = href.match(/case_id=(\d+)/i);
    const partiesText = cells.eq(1).text().trim();
    // Извлекаем истца/ответчика из колонки «Категория/Лица»
    // Формат: "КАТЕГОРИЯ: ... ИСТЕЦ: ... ОТВЕТЧИК: ..." (разделители <br> в HTML, cheerio даёт пробелы)
    const parties: { role: string; name: string }[] = [];
    const istetsMatch = partiesText.match(/ИСТЕЦ:\s*(.+?)(?:\s+ОТВЕТЧИК:|$)/i);
    const otvetchikMatch = partiesText.match(/ОТВЕТЧИК:\s*(.+?)$/i);
    if (istetsMatch) parties.push({ role: 'Истец', name: istetsMatch[1].trim() });
    if (otvetchikMatch) parties.push({ role: 'Ответчик', name: otvetchikMatch[1].trim() });

    results.push({
      caseNumber: num,
      // FIX: относительный href без ведущего «/» — нормализуем, иначе склейка «.rumodules.php»
      caseUrl: href.startsWith('http') ? href : `https://${req.courtId}.msudrf.ru/${href.replace(/^\//, '')}`,
      uid: caseIdMatch ? caseIdMatch[1] : '',
      courtCode: req.courtCode,
      judge: cells.eq(2).text().trim() || null,
      result: cells.eq(4).text().trim() || null,
      legalForceDate: null,
      filingDate: null,
      decisionDate: cells.eq(3).text().trim() || null,
      parties,
      courtId: req.courtId,
      courtType: 'magistrate',
    });
  });
  return results;
}

export class MagistrateSearchAdapter implements SearchAdapter {
  buildSearchUrl(_req: SearchRequest): string {
    // Не используется — msudrf не поддерживает прямые GET-запросы результатов
    return '';
  }

  async searchByCaseNumber(req: SearchRequest): Promise<SearchResult[]> {
    const apiKey = getRuCaptchaKey();
    if (!apiKey) {
      throw new Error('Для мировых судов нужен ключ RuCaptcha в .env');
    }

    // Парсинг по URL дела — делегируем parse-адаптеру (через старый fetchWithCaptcha)
    if (req.caseNumber && req.caseNumber.startsWith('http')) {
      const { fetchWithCaptcha } = await import('../../captcha/session.js');
      const html = await fetchWithCaptcha({ url: req.caseNumber, apiKey });
      const { isCaptchaPage } = await import('../../core/errors.js');
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

    // Поиск через AJAX-форму msudrf
    const { fetchMsudrfSearch } = await import('../../captcha/session.js');
    const formUrl = buildFormUrl(req);
    const fields = buildFields(req);
    const html = await fetchMsudrfSearch({ formUrl, fields, apiKey });

    return parseResults(html, req);
  }

  async searchByParty(req: SearchRequest): Promise<SearchResult[]> {
    return this.searchByCaseNumber(req);
  }

  async searchByCaseUid(req: SearchRequest): Promise<SearchResult[]> {
    const apiKey = getRuCaptchaKey();
    if (!apiKey) throw new Error('Для мировых судов нужен ключ RuCaptcha в .env');

    const { fetchMsudrfSearch } = await import('../../captcha/session.js');
    const formUrl = buildFormUrl(req);
    const fields = buildFields(req);
    const html = await fetchMsudrfSearch({ formUrl, fields, apiKey });

    return parseResults(html, req);
  }
}