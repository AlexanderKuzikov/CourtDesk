import { describe, it, expect } from 'vitest';
import { DistrictAdapter } from './district.js';
import { CaptchaRequiredError } from '../../core/errors.js';

const URL = 'https://kirov--perm.sudrf.ru/modules.php?name_op=case&case_uid=54RS0001-01-2026-000123-45&delo_id=1540005&case_type=0';

const CASE_HTML = `
<html><body>
<div class="title">Гражданское дело</div>
<div class="casenumber">ДЕЛО № 2-100/2026</div>
<div id="cont1">
  <a href="modules.php?name_op=case&amp;judicial_uid=x">54RS0001-01-2026-000123-45</a>
  <table>
    <tr><td>Категория дела:</td><td>Иски о взыскании<br>Споры</td></tr>
    <tr><td>Дата поступления:</td><td>01.04.2026</td></tr>
    <tr><td>Судья:</td><td>Иванова Т.П.</td></tr>
    <tr><td>Дата рассмотрения:</td><td>15.05.2026</td></tr>
    <tr><td>Результат рассмотрения:</td><td>Удовлетворено</td></tr>
    <tr><td>Признак рассмотрения дела:</td><td>Рассмотрено единолично</td></tr>
  </table>
</div>
<div id="cont2">
  <table>
    <tr><td colspan="8">Движение дела</td></tr>
    <tr><td>Событие</td><td>Дата</td><td>Время</td><td>Место</td><td>Результат</td><td>Основание</td><td>Прим</td><td>Опубл</td></tr>
    <tr><td>Регистрация иска</td><td>01.04.2026</td><td>10:00</td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr><td>Судебное заседание</td><td>15.05.2026</td><td>11:00</td><td>Зал 5</td><td>Удовлетворено</td><td>по существу</td><td>note1</td><td>20.05.2026</td></tr>
  </table>
</div>
<div id="cont3">
  <table>
    <tr><td colspan="6">Стороны</td></tr>
    <tr><td>Роль</td><td>Наименование</td><td>ИНН</td><td>КПП</td><td>ОГРН</td><td>ОГРНИП</td></tr>
    <tr><td>Истец</td><td>Иванов И.И.</td><td></td><td></td><td></td><td></td></tr>
    <tr><td>Ответчик</td><td>ООО Ромашка</td><td>5401123456</td><td>540101001</td><td>1025400000001</td><td></td></tr>
  </table>
</div>
</body></html>`;

describe('DistrictAdapter.parse — карточка районного суда', () => {
  const adapter = new DistrictAdapter();

  it('uid из HTML ( judicial_uid ), fallback — URL', async () => {
    const card = await adapter.parse(CASE_HTML, URL);
    expect(card.uid).toBe('54RS0001-01-2026-000123-45');
  });

  it('uid из URL если в HTML нет', async () => {
    const html = CASE_HTML.replace(/<a href="modules\.php[^>]*>[^<]*<\/a>/, '');
    const card = await adapter.parse(html, URL);
    expect(card.uid).toBe('54RS0001-01-2026-000123-45');
  });

  it('нет uid нигде — ошибка', async () => {
    const html = CASE_HTML.replace(/<a href="modules\.php[^>]*>[^<]*<\/a>/, '');
    const noUidUrl = 'https://kirov--perm.sudrf.ru/modules.php?name_op=case';
    await expect(adapter.parse(html, noUidUrl)).rejects.toThrow('не удалось определить UID');
  });

  it('тип и номер дела', async () => {
    const card = await adapter.parse(CASE_HTML, URL);
    expect(card.type).toBe('Гражданское дело');
    expect(card.number).toBe('2-100/2026');
    expect(card.court).toBe('kirov--perm');
    expect(card.courtType).toBe('district');
  });

  it('карточка дела из #cont1', async () => {
    const card = await adapter.parse(CASE_HTML, URL);
    expect(card.card.filingDate).toBe('2026-04-01');
    expect(card.card.judge).toBe('Иванова Т.П.');
    expect(card.card.hearingDate).toBe('2026-05-15');
    expect(card.card.result).toBe('Удовлетворено');
    expect(card.card.proceedingType).toBe('Рассмотрено единолично');
  });

  it('категория разбивается по <br>', async () => {
    const card = await adapter.parse(CASE_HTML, URL);
    expect(card.card.category).toEqual(['Иски о взыскании', 'Споры']);
  });

  it('движение дела из #cont2 (2 строки, заголовки пропущены)', async () => {
    const card = await adapter.parse(CASE_HTML, URL);
    expect(card.events).toHaveLength(2);
    const e = card.events[1]!;
    expect(e.eventName).toBe('Судебное заседание');
    expect(e.eventDate).toBe('2026-05-15');
    expect(e.eventTime).toBe('11:00');
    expect(e.location).toBe('Зал 5');
    expect(e.result).toBe('Удовлетворено');
    expect(e.reason).toBe('по существу');
    expect(e.note).toBe('note1');
    expect(e.publishDate).toBe('2026-05-20');
  });

  it('пустые ячейки событий — null', async () => {
    const card = await adapter.parse(CASE_HTML, URL);
    const e = card.events[0]!;
    expect(e.location).toBeNull();
    expect(e.result).toBeNull();
  });

  it('стороны из #cont3 с ИНН/КПП/ОГРН', async () => {
    const card = await adapter.parse(CASE_HTML, URL);
    expect(card.parties).toHaveLength(2);
    expect(card.parties[0]).toMatchObject({ role: 'Истец', name: 'Иванов И.И.' });
    expect(card.parties[1]).toMatchObject({
      role: 'Ответчик', name: 'ООО Ромашка',
      inn: '5401123456', kpp: '540101001', ogrn: '1025400000001',
    });
  });

  it('identifiers из URL', async () => {
    const card = await adapter.parse(CASE_HTML, URL);
    expect(card.identifiers).toEqual({
      delo_id: '1540005',
      case_uid: '54RS0001-01-2026-000123-45',
      case_type: '0',
    });
  });

  it('страница капчи — CaptchaRequiredError', async () => {
    await expect(adapter.parse('<div id="captcha"></div>', URL)).rejects.toThrow(CaptchaRequiredError);
  });
});
