import { describe, it, expect } from 'vitest';
import { CassationAdapter } from './cassation.js';
import { CaptchaRequiredError } from '../../core/errors.js';

const URL = 'https://7kas.sudrf.ru/modules.php?name_op=case&case_uid=07ae7a19-4220-47e9-9f09-094b2e72e9fb&new=2800001&delo_id=2800001&case_type=0';

// Структура cassation: #cont1 ПРОИЗВОДСТВО, #cont2 НИЖЕСТОЯЩИЙ СУД, #cont3 СЛУШАНИЯ,
// #cont4 ЖАЛОБЫ (не парсим), #cont5 УЧАСТНИКИ
const CASE_HTML = `
<html><body>
<div class="title">Кассационное производство</div>
<div class="casenumber">ДЕЛО № 8Г-2500/2026</div>
<div id="cont1">
  <a href="modules.php?name_op=case&amp;judicial_uid=x">07ae7a19-4220-47e9-9f09-094b2e72e9fb</a>
  <table id="tablcont">
    <tr><td>Категория дела:</td><td>Кассационные жалобы<br>на решения судов</td></tr>
    <tr><td>Дата поступления:</td><td>01.04.2026</td></tr>
    <tr><td>Судья:</td><td>Кузнецов А.В.</td></tr>
    <tr><td>Дата рассмотрения:</td><td>15.05.2026</td></tr>
    <tr><td>Результат рассмотрения:</td><td>Жалоба удовлетворена частично</td></tr>
    <tr><td>Признак рассмотрения дела:</td><td>Рассмотрено единолично</td></tr>
  </table>
</div>
<div id="cont2">
  <table id="tablcont">
    <tr><td>Суд:</td><td>Пермский краевой суд</td></tr>
  </table>
</div>
<div id="cont3">
  <table id="tablcont">
    <tr><td colspan="8">Слушания</td></tr>
    <tr><td>Событие</td><td>Дата</td><td>Время</td><td>Место</td><td>Результат</td><td>Основание</td><td>Прим</td><td>Опубл</td></tr>
    <tr><td>Назначено судебное заседание</td><td>01.04.2026</td><td>10:00</td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr><td>Судебное заседание</td><td>15.05.2026</td><td>11:00</td><td>Зал 3</td><td>Рассмотрено</td><td>по существу</td><td>note1</td><td>20.05.2026</td></tr>
  </table>
</div>
<div id="cont4">
  <table id="tablcont">
    <tr><td colspan="4">Жалобы</td></tr>
    <tr><td>Кассационная жалоба</td><td>01.04.2026</td><td>Иванов И.И.</td><td></td></tr>
  </table>
</div>
<div id="cont5">
  <table id="tablcont">
    <tr><td colspan="6">Участники</td></tr>
    <tr><td>Роль</td><td>Наименование</td><td>ИНН</td><td>КПП</td><td>ОГРН</td><td>ОГРНИП</td></tr>
    <tr><td>Заявитель</td><td>Иванов И.И.</td><td></td><td></td><td></td><td></td></tr>
    <tr><td>Заинтересованное лицо</td><td>ООО Ромашка</td><td>5401123456</td><td>540101001</td><td>1025400000001</td><td></td></tr>
  </table>
</div>
<div class="publishInfo">опубликовано 21.06.2026 14:30</div>
</body></html>`;

describe('CassationAdapter.parse — карточка кассационного суда', () => {
  const adapter = new CassationAdapter();

  it('uid — судебный номер дела (из .casenumber)', async () => {
    const card = await adapter.parse(CASE_HTML, URL);
    expect(card.uid).toBe('8Г-2500/2026');
    expect(card.number).toBe('8Г-2500/2026');
  });

  it('УИД ГАС извлекается в identifiers.case_uid', async () => {
    const card = await adapter.parse(CASE_HTML, URL);
    expect(card.identifiers.case_uid).toBe('07ae7a19-4220-47e9-9f09-094b2e72e9fb');
  });

  it('нет номера дела — ошибка', async () => {
    const html = CASE_HTML.replace(/<div class="casenumber">[^<]*<\/div>/, '');
    await expect(adapter.parse(html, URL)).rejects.toThrow('не удалось определить номер дела');
  });

  it('тип, суд, courtType', async () => {
    const card = await adapter.parse(CASE_HTML, URL);
    expect(card.type).toBe('Кассационное производство');
    expect(card.court).toBe('7kas');
    expect(card.courtType).toBe('cassation');
  });

  it('карточка дела из #cont1', async () => {
    const card = await adapter.parse(CASE_HTML, URL);
    expect(card.card.filingDate).toBe('2026-04-01');
    expect(card.card.judge).toBe('Кузнецов А.В.');
    expect(card.card.hearingDate).toBe('2026-05-15');
    expect(card.card.result).toBe('Жалоба удовлетворена частично');
    expect(card.card.proceedingType).toBe('Рассмотрено единолично');
  });

  it('категория разбивается по <br>', async () => {
    const card = await adapter.parse(CASE_HTML, URL);
    expect(card.card.category).toEqual(['Кассационные жалобы', 'на решения судов']);
  });

  it('слушания из #cont3 (не #cont2!)', async () => {
    const card = await adapter.parse(CASE_HTML, URL);
    expect(card.events).toHaveLength(2);
    const e = card.events[1]!;
    expect(e.eventName).toBe('Судебное заседание');
    expect(e.eventDate).toBe('2026-05-15');
    expect(e.location).toBe('Зал 3');
    expect(e.result).toBe('Рассмотрено');
    expect(e.reason).toBe('по существу');
    expect(e.note).toBe('note1');
    expect(e.publishDate).toBe('2026-05-20');
  });

  it('участники из #cont5 (не #cont4 — жалобы!)', async () => {
    const card = await adapter.parse(CASE_HTML, URL);
    expect(card.parties).toHaveLength(2);
    expect(card.parties[0]).toMatchObject({ role: 'Заявитель', name: 'Иванов И.И.' });
    expect(card.parties[1]).toMatchObject({
      role: 'Заинтересованное лицо', name: 'ООО Ромашка',
      inn: '5401123456', kpp: '540101001', ogrn: '1025400000001',
    });
  });

  it('publishedAt из .publishInfo', async () => {
    const card = await adapter.parse(CASE_HTML, URL);
    expect(card.publishedAt).toBe('2026-06-21T14:30:00');
    expect(card.modifiedAt).toBeNull();
  });

  it('identifiers из URL', async () => {
    const card = await adapter.parse(CASE_HTML, URL);
    expect(card.identifiers).toEqual({
      delo_id: '2800001',
      case_uid: '07ae7a19-4220-47e9-9f09-094b2e72e9fb',
      case_type: '0',
      case_id: null,
    });
  });

  it('страница капчи — CaptchaRequiredError', async () => {
    await expect(adapter.parse('<div id="captcha"></div>', URL)).rejects.toThrow(CaptchaRequiredError);
  });
});
