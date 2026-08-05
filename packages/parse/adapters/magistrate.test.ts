import { describe, it, expect } from 'vitest';
import { MagistrateAdapter } from './magistrate.js';
import { CaptchaRequiredError } from '../../core/errors.js';

const URL = 'https://35.perm.msudrf.ru/modules.php?name_op=case&case_id=12345&delo_id=1540005&op=1';

const CASE_HTML = `
<html><body>
<h2>ДЕЛО № 2-100/2026</h2>
<div class="tab-content">
  <table class="tablcont">
    <tr><td>Категория:</td><td>Иные дела</td></tr>
    <tr><td>Председательствующий судья:</td><td>Сидорова А.В.</td></tr>
    <tr><td>Дело рассмотрено (выдан приказ):</td><td>15.05.2026</td></tr>
    <tr><td>Результат рассмотрения:</td><td>Удовлетворено</td></tr>
  </table>
</div>
<div class="tab-content">
  <table class="tablcont">
    <tr><td colspan="5"><h2>Движение дела</h2></td></tr>
    <tr><td>Событие</td><td>Дата</td><td>Время</td><td>Результат</td><td>Судья</td></tr>
    <tr><td>Регистрация иска</td><td>01.04.2026</td><td>10:00</td><td>&nbsp;</td><td>Сидорова А.В.</td></tr>
    <tr><td>Судебное заседание</td><td>15.05.2026</td><td>11:00</td><td>Удовлетворено (20.05.2026)</td><td>Сидорова А.В.</td></tr>
  </table>
</div>
<div class="tab-content">
  <table class="tablcont">
    <tr><td colspan="3">Стороны</td></tr>
    <tr><td>&nbsp;</td><td>Истец</td><td>Ответчик</td></tr>
    <tr><td>&nbsp;</td><td>Иванов И.И.</td><td>Петров П.П.</td></tr>
  </table>
</div>
</body></html>`;

describe('MagistrateAdapter.parse — карточка мирового суда', () => {
  const adapter = new MagistrateAdapter();

  it('номер дела из h2 «ДЕЛО №»', async () => {
    const card = await adapter.parse(CASE_HTML, URL);
    expect(card.uid).toBe('2-100/2026');
    expect(card.number).toBe('2-100/2026');
    expect(card.courtType).toBe('magistrate');
  });

  it('court — поддомен msudrf', async () => {
    const card = await adapter.parse(CASE_HTML, URL);
    expect(card.court).toBe('35.perm');
  });

  it('основные сведения из таба 0', async () => {
    const card = await adapter.parse(CASE_HTML, URL);
    expect(card.card.judge).toBe('Сидорова А.В.');
    expect(card.card.result).toBe('Удовлетворено');
    expect(card.card.category).toEqual(['Иные дела']);
  });

  it('движение дела: 2 события, даты в ISO', async () => {
    const card = await adapter.parse(CASE_HTML, URL);
    expect(card.events).toHaveLength(2);
    expect(card.events[0]!.eventName).toBe('Регистрация иска');
    expect(card.events[0]!.eventDate).toBe('2026-04-01');
    expect(card.events[1]!.eventDate).toBe('2026-05-15');
  });

  it('publishDate извлекается из результата «(DD.MM.YYYY)»', async () => {
    const card = await adapter.parse(CASE_HTML, URL);
    expect(card.events[1]!.publishDate).toBe('2026-05-20');
    expect(card.events[0]!.publishDate).toBeNull();
  });

  it('filingDate — дата первого события', async () => {
    const card = await adapter.parse(CASE_HTML, URL);
    expect(card.card.filingDate).toBe('2026-04-01');
  });

  it('стороны из таба 2 (роли + имена)', async () => {
    const card = await adapter.parse(CASE_HTML, URL);
    expect(card.parties).toHaveLength(2);
    expect(card.parties[0]).toMatchObject({ role: 'Истец', name: 'Иванов И.И.' });
    expect(card.parties[1]).toMatchObject({ role: 'Ответчик', name: 'Петров П.П.' });
  });

  it('identifiers из URL', async () => {
    const card = await adapter.parse(CASE_HTML, URL);
    expect(card.identifiers.delo_id).toBe('1540005');
    expect(card.identifiers.case_type).toBe('1');
    expect(card.identifiers.case_id).toBe('12345');
  });

  it('страница капчи — CaptchaRequiredError', async () => {
    await expect(adapter.parse('<form id="kcaptchaForm"></form>', URL))
      .rejects.toThrow(CaptchaRequiredError);
  });

  it('нет номера дела и нет case_id в URL — ошибка', async () => {
    const noIdUrl = 'https://35.perm.msudrf.ru/modules.php?name_op=case';
    await expect(adapter.parse('<html><body><div class="tab-content"></div><div class="tab-content"></div><div class="tab-content"></div></body></html>', noIdUrl))
      .rejects.toThrow('не удалось определить номер дела');
  });

  it('fallback номера — case_id из URL', async () => {
    const html = CASE_HTML.replace('ДЕЛО № 2-100/2026', 'Судебное дело');
    const card = await adapter.parse(html, URL);
    expect(card.uid).toBe('12345');
  });
});
