import { describe, it, expect } from 'vitest';
import { buildFields, buildFormUrl, parseResults } from './magistrate.js';
import type { SearchRequest } from '../../core/types.js';

const baseReq: SearchRequest = {
  courtId: '35.perm',
  courtCode: '35.perm',
  courtType: 'magistrate',
};

// ---------- buildFields (CR12-010) ----------

describe('buildFields — поля формы msudrf', () => {
  it('CR12-010: defendant имеет приоритет над plaintiff (одно поле G1_PARTS__NAMESS)', () => {
    const fields = buildFields({ ...baseReq, defendant: 'Петров П.П.', plaintiff: 'Иванов И.И.' });
    expect(fields['G1_PARTS__NAMESS']).toBe('Петров П.П.');
  });

  it('plaintiff используется если defendant пуст', () => {
    const fields = buildFields({ ...baseReq, plaintiff: 'Иванов И.И.' });
    expect(fields['G1_PARTS__NAMESS']).toBe('Иванов И.И.');
  });

  it('defendant используется если plaintiff пуст', () => {
    const fields = buildFields({ ...baseReq, defendant: 'Петров П.П.' });
    expect(fields['G1_PARTS__NAMESS']).toBe('Петров П.П.');
  });

  it('нет participants — нет поля G1_PARTS__NAMESS', () => {
    const fields = buildFields({ ...baseReq, caseNumber: '2-100/2026' });
    expect(fields).not.toHaveProperty('G1_PARTS__NAMESS');
  });

  it('маппит caseNumber, caseUid и даты', () => {
    const fields = buildFields({
      ...baseReq,
      caseNumber: '2-100/2026',
      caseUid: 'abc-123',
      filingDateFrom: '01.01.2026',
      filingDateTo: '31.12.2026',
    });
    expect(fields['g1_case__CASE_NUMBERSS']).toBe('2-100/2026');
    expect(fields['g1_case__JUDICIAL_UIDSS']).toBe('abc-123');
    expect(fields['g1_case__ENTRY_DATE1D']).toBe('01.01.2026');
    expect(fields['g1_case__ENTRY_DATE2D']).toBe('31.12.2026');
  });
});

// ---------- buildFormUrl ----------

describe('buildFormUrl — URL формы поиска msudrf', () => {
  it('строит URL с name_op=sf и delo_id мирового суда', () => {
    const url = buildFormUrl(baseReq);
    expect(url).toContain('https://35.perm.msudrf.ru/modules.php');
    expect(url).toContain('name_op=sf');
    expect(url).toContain('delo_id=1540005');
  });
});

// ---------- parseResults ----------

const RESULTS_HTML = `
<div id="search_results">
<table cellspacing="0">
  <tr><th>№ дела</th><th>Категория/Лица</th><th>Судья</th><th>Дата решения</th><th>Решение</th></tr>
  <tr>
    <td><a href="modules.php?name_op=case&amp;case_id=12345">2-100/2026</a></td>
    <td>КАТЕГОРИЯ: Иные дела ИСТЕЦ: Иванов Иван Иванович ОТВЕТЧИК: Петров Пётр Петрович</td>
    <td>Сидорова А.В.</td>
    <td>15.05.2026</td>
    <td>Удовлетворено</td>
  </tr>
  <tr>
    <td><a href="https://35.perm.msudrf.ru/modules.php?name_op=case&amp;case_id=999">2-200/2026</a></td>
    <td>КАТЕГОРИЯ: Споры ИСТЕЦ: ООО Ромашка</td>
    <td>Козлов Б.Г.</td>
    <td>20.06.2026</td>
    <td>Отказано</td>
  </tr>
</table>
</div>`;

describe('parseResults — таблица результатов msudrf', () => {
  it('извлекает номер, судью, дату и результат', () => {
    const results = parseResults(RESULTS_HTML, baseReq);
    expect(results).toHaveLength(2);
    const r = results[0]!;
    expect(r.caseNumber).toBe('2-100/2026');
    expect(r.judge).toBe('Сидорова А.В.');
    expect(r.decisionDate).toBe('15.05.2026');
    expect(r.result).toBe('Удовлетворено');
    expect(r.courtType).toBe('magistrate');
    expect(r.courtCode).toBe('35.perm');
  });

  it('относительный href превращается в абсолютный URL msudrf', () => {
    const results = parseResults(RESULTS_HTML, baseReq);
    expect(results[0]!.caseUrl).toBe('https://35.perm.msudrf.ru/modules.php?name_op=case&case_id=12345');
    expect(results[0]!.uid).toBe('12345');
  });

  it('абсолютный href сохраняется как есть', () => {
    const results = parseResults(RESULTS_HTML, baseReq);
    expect(results[1]!.caseUrl).toBe('https://35.perm.msudrf.ru/modules.php?name_op=case&case_id=999');
  });

  it('извлекает истца и ответчика из колонки «Категория/Лица»', () => {
    const results = parseResults(RESULTS_HTML, baseReq);
    const parties = results[0]!.parties ?? [];
    expect(parties).toContainEqual({ role: 'Истец', name: 'Иванов Иван Иванович' });
    expect(parties).toContainEqual({ role: 'Ответчик', name: 'Петров Пётр Петрович' });
  });

  it('строка без ответчика даёт только истца', () => {
    const results = parseResults(RESULTS_HTML, baseReq);
    const parties = results[1]!.parties ?? [];
    expect(parties).toHaveLength(1);
    expect(parties[0]!.role).toBe('Истец');
  });

  it('пустой HTML — пустой результат', () => {
    expect(parseResults('<div id="search_results"></div>', baseReq)).toEqual([]);
  });

  it('строки с <4 колонками пропускаются', () => {
    const html = `<table><tr><td>№ дела</td></tr><tr><td>1</td><td>2</td></tr></table>`;
    expect(parseResults(html, baseReq)).toEqual([]);
  });
});
