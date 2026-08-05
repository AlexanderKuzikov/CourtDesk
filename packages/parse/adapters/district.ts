// packages/adapters/district.ts
// Адаптер для районных судов (*.sudrf.ru, delo_id=1540005)

import * as cheerio from 'cheerio';
import type { Case, CaseEvent, CaseParty, CourtAdapter } from '../../core/types.js';
import { CaptchaRequiredError, isCaptchaPage } from '../../core/errors.js';
import { extractCourtSubdomain, parseDate } from './shared.js';

export class DistrictAdapter implements CourtAdapter {
  async parse(html: string, url: string): Promise<Case> {
    if (isCaptchaPage(html)) throw new CaptchaRequiredError(url);

        // FIX (CODE_REVIEW #1): decodeEntities удалён — в cheerio 1.x эта опция убрана из CheerioOptions, false является дефолтом.
        const $ = cheerio.load(html);

    // BUG-009/UID-NORM: uid — судебный номер дела (единый смысл для всех судов).
    // УИД ГАС отдельно в identifiers.case_uid, картотечный номер — в identifiers.case_id.
    const parsedUrl = new URL(url);
    const number = $('div.casenumber, .case-num, span[class*="number"]').first().text().replace(/ДЕЛО\s*№/i, '').trim();
    const judicialUid = $('#cont1 a[href*="judicial_uid"]').text().trim()
      || $('a[href*="judicial_uid"]').first().text().trim()
      || parsedUrl.searchParams.get('case_uid') || '';

    if (!number) throw new Error(`DistrictAdapter: не удалось определить номер дела`);

    const type = $('div.title, h1.case-title, .delo_name').first().text().trim();

    // Карточка дела
    const rawCard: Record<string, string> = {};
    $('#cont1 table tr, #tablcont tr').each((_i, el) => {
      const tds = $(el).find('td');
      if (tds.length >= 2) {
        const key = tds.eq(0).text().replace(':', '').trim();
        if (key) rawCard[key] = tds.eq(1).html() ?? '';
      }
    });

    const categoryRaw = rawCard['Категория дела'] ?? '';
    const category = categoryRaw
      .split(/<br\s*\/?>/i)
      .map(s => cheerio.load(s).text().replace(/&rarr;/g, ' → ').trim())
      .filter(Boolean);

    // Движение дела
    const events: CaseEvent[] = [];
    $('#cont2 table tr').each((i, el) => {
      if (i < 2) return;
      const tds = $(el).find('td');
      if (tds.length < 6) return;
      const col = (j: number) => tds.eq(j).text().trim() || null;
      events.push({
        eventName:   col(0),
        eventDate:   parseDate(col(1)),
        eventTime:   col(2),
        location:    col(3),
        result:      col(4),
        reason:      col(5),
        judge:       null,
        note:        tds.length > 6 ? col(6) : null,
        publishDate: tds.length > 7 ? parseDate(col(7)) : null,
      });
    });

    // Стороны
    const parties: CaseParty[] = [];
    $('#cont3 table tr').each((i, el) => {
      if (i < 2) return;
      const tds = $(el).find('td');
      if (tds.length < 2) return;
      const col = (j: number) => tds.eq(j)?.text().trim() || null;
      parties.push({
        role:   col(0),
        name:   col(1),
        inn:    col(2) ?? null,
        kpp:    col(3) ?? null,
        ogrn:   col(4) ?? null,
        ogrnip: col(5) ?? null,
      });
    });

    const strip = (s: string | undefined) => s?.replace(/<[^>]+>/g, '').trim() || null;

    return {
      $schema:   'courtflow/case/v1',
      uid: number,
      type,
      number,
      court:     extractCourtSubdomain(url, 'district'),
      courtType: 'district',
      identifiers: {
        delo_id:   parsedUrl.searchParams.get('delo_id'),
        case_uid:  judicialUid || null,
        case_type: parsedUrl.searchParams.get('case_type'),
        case_id:   parsedUrl.searchParams.get('case_id'),
      },
      publishedAt: null,
      modifiedAt:  null,
      card: {
        filingDate:     parseDate(strip(rawCard['Дата поступления'])),
        category,
        judge:          strip(rawCard['Судья']),
        hearingDate:    parseDate(strip(rawCard['Дата рассмотрения'])),
        result:         strip(rawCard['Результат рассмотрения']),
        proceedingType: strip(rawCard['Признак рассмотрения дела']),
      },
      events,
      parties,
    };
  }
}
