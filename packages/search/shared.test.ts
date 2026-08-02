import { describe, it, expect } from 'vitest';
import { buildSearchUrl, parseResults, fetchHtml, smartFetch } from './shared.js';
import { CourtUrlError } from '../core/errors.js';
import { encodeParam } from '../core/encoding.js';
import type { SearchRequest } from '../core/types.js';

const districtReq: SearchRequest = {
  courtId: 'kirov--perm',
  courtCode: 'kirov--perm',
  courtType: 'district',
};

// ---------- buildSearchUrl ----------

describe('buildSearchUrl — ГАС «Правосудие»', () => {
  it('district: base sudrf.ru, delo_id первой инстанции, префикс g1', () => {
    const url = buildSearchUrl({ ...districtReq, caseNumber: '2-100/2026' },
      { delo_id: '1540005', case_type: '0', prefix: 'g1' });
    expect(url).toContain('https://kirov--perm.sudrf.ru/modules.php?');
    expect(url).toContain('delo_id=1540005');
    expect(url).toContain('g1_case__CASE_NUMBERSS=2-100%2F2026');
  });

  it('defendant кодируется в CP1251', () => {
    const url = buildSearchUrl({ ...districtReq, defendant: 'Иванов' },
      { delo_id: '1540005', case_type: '0', prefix: 'g1' });
    expect(url).toContain('G1_PARTS__NAMESS=' + encodeParam('Иванов'));
    expect(url).not.toContain('Иванов'); // никакого UTF-8 в query
  });

  it('нет defendant — используется plaintiff', () => {
    const url = buildSearchUrl({ ...districtReq, plaintiff: 'Петров' },
      { delo_id: '1540005', case_type: '0', prefix: 'g1' });
    expect(url).toContain('G1_PARTS__NAMESS=' + encodeParam('Петров'));
  });

  it('magistrate: base msudrf.ru', () => {
    const url = buildSearchUrl({ ...districtReq, courtId: '35.perm', courtType: 'magistrate' },
      { delo_id: '1540005', case_type: '0', prefix: 'g1' });
    expect(url).toContain('https://35.perm.msudrf.ru/modules.php?');
  });

  it('appeal: префикс g2 и delo_id апелляции', () => {
    const url = buildSearchUrl({ ...districtReq, courtType: 'appeal', caseUid: 'uid-1' },
      { delo_id: '5', case_type: '0', prefix: 'g2', new_: '5' });
    expect(url).toContain('delo_id=5');
    expect(url).toContain('new=5');
    expect(url).toContain('g2_case__JUDICIAL_UIDSS=uid-1');
  });
});

// ---------- parseResults ----------

const SUDRF_RESULTS = `
<table cellspacing="0">
  <tr><td>№ дела</td><td>Дата поступления</td><td>УИД</td><td>Судья</td><td>Дата решения</td><td>Результат</td><td>Вступление в силу</td></tr>
  <tr>
    <td><a href="/modules.php?name_op=case&amp;case_uid=abc-def-123">2-100/2026</a></td>
    <td>01.04.2026</td>
    <td><input name="g2_case__JUDICIAL_UIDSS" value="54RS0001-01-2026-000123-45"/></td>
    <td>Иванова Т.П.</td>
    <td>15.05.2026</td>
    <td>Удовлетворено</td>
    <td>21.06.2026</td>
  </tr>
</table>`;

describe('parseResults — таблица sudrf', () => {
  it('извлекает все колонки', () => {
    const results = parseResults(SUDRF_RESULTS, districtReq);
    expect(results).toHaveLength(1);
    const r = results[0]!;
    expect(r.caseNumber).toBe('2-100/2026');
    expect(r.uid).toBe('abc-def-123');
    expect(r.filingDate).toBe('01.04.2026');
    expect(r.caseUid).toBe('54RS0001-01-2026-000123-45');
    expect(r.judge).toBe('Иванова Т.П.');
    expect(r.decisionDate).toBe('15.05.2026');
    expect(r.result).toBe('Удовлетворено');
    expect(r.legalForceDate).toBe('21.06.2026');
  });

  it('относительный href → абсолютный URL суда', () => {
    const results = parseResults(SUDRF_RESULTS, districtReq);
    expect(results[0]!.caseUrl).toBe('https://kirov--perm.sudrf.ru/modules.php?name_op=case&case_uid=abc-def-123');
  });

  it('div#error — бросает текст ошибки', () => {
    const html = '<div id="error">Данных по запросу не найдено</div>' + SUDRF_RESULTS;
    expect(() => parseResults(html, districtReq)).toThrow('Данных по запросу не найдено');
  });

  it('нет таблицы результатов — пустой список', () => {
    expect(parseResults('<html><body>пусто</body></html>', districtReq)).toEqual([]);
  });
});

// ---------- CR11-002: URL-allowlist на fetch-слое ----------

describe('fetchHtml/smartFetch — только судовые домены', () => {
  it('fetchHtml бросает CourtUrlError для не-судового домена', () => {
    expect(() => fetchHtml('https://evil.example.com/')).toThrow(CourtUrlError);
  });

  it('fetchHtml бросает CourtUrlError для http', () => {
    expect(() => fetchHtml('http://kirov--perm.sudrf.ru/')).toThrow(CourtUrlError);
  });

  it('smartFetch отклоняет не-судовой домен', async () => {
    await expect(smartFetch('https://169.254.169.254/')).rejects.toThrow(CourtUrlError);
  });
});
