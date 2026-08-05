import { describe, it, expect } from 'vitest';
import { AppealAdapter } from './appeal.js';
import { CaptchaRequiredError } from '../../core/errors.js';

const URL = 'https://oblsud--perm.sudrf.ru/modules.php?name_op=case&case_uid=45dcad31-4ad4-448c-ab97-33ec62895e23&delo_id=5&case_type=0';

// Структура appeal: #cont1 ДЕЛО, #cont2 НИЖЕСТОЯЩИЙ СУД, #cont3 ДВИЖЕНИЕ, #cont4 УЧАСТНИКИ, #cont5 СУДЕБНЫЕ АКТЫ
const CASE_HTML = `
<html><body>
<div class="title">Гражданское дело</div>
<div class="casenumber">ДЕЛО № 33-105/2026</div>
<div id="cont1">
  <a href="modules.php?name_op=case&amp;judicial_uid=x">45dcad31-4ad4-448c-ab97-33ec62895e23</a>
  <table id="tablcont">
    <tr><td>Категория дела:</td><td>О защите прав потребителей<br>из договоров</td></tr>
    <tr><td>Дата поступления:</td><td>01.04.2026</td></tr>
    <tr><td>Судья:</td><td>Смирнова Е.А.</td></tr>
    <tr><td>Дата рассмотрения:</td><td>15.05.2026</td></tr>
    <tr><td>Результат рассмотрения:</td><td>Апелляционная жалоба оставлена без удовлетворения</td></tr>
    <tr><td>Признак рассмотрения дела:</td><td>Рассмотрено коллегиально</td></tr>
  </table>
</div>
<div id="cont2">
  <table id="tablcont">
    <tr><td>Суд:</td><td>Свердловский районный суд г. Перми</td></tr>
    <tr><td>Номер дела:</td><td>2-4160/2026</td></tr>
  </table>
</div>
<div id="cont3">
  <table id="tablcont">
    <tr><td colspan="8">Движение дела</td></tr>
    <tr><td>Событие</td><td>Дата</td><td>Время</td><td>Место</td><td>Результат</td><td>Основание</td><td>Прим</td><td>Опубл</td></tr>
    <tr><td>Поступление жалобы</td><td>01.04.2026</td><td>10:00</td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr><td>Судебное заседание</td><td>15.05.2026</td><td>11:00</td><td>Зал 12</td><td>Отложено</td><td>неявка</td><td>note1</td><td>20.05.2026</td></tr>
  </table>
</div>
<div id="cont4">
  <table id="tablcont">
    <tr><td colspan="6">Участники</td></tr>
    <tr><td>Роль</td><td>Наименование</td><td>ИНН</td><td>КПП</td><td>ОГРН</td><td>ОГРНИП</td></tr>
    <tr><td>Истец</td><td>Иванов И.И.</td><td></td><td></td><td></td><td></td></tr>
    <tr><td>Ответчик</td><td>ООО Ромашка</td><td>5401123456</td><td>540101001</td><td>1025400000001</td><td></td></tr>
  </table>
</div>
<div id="cont5">
  <div class="publishInfo">опубликовано 21.06.2026 14:30, изменено 22.06.2026 09:15</div>
</div>
</body></html>`;

describe('AppealAdapter.parse — карточка апелляционного суда', () => {
  const adapter = new AppealAdapter();

  it('uid — судебный номер дела (из .casenumber)', async () => {
    const card = await adapter.parse(CASE_HTML, URL);
    expect(card.uid).toBe('33-105/2026');
    expect(card.number).toBe('33-105/2026');
  });

  it('УИД ГАС извлекается в identifiers.case_uid', async () => {
    const card = await adapter.parse(CASE_HTML, URL);
    expect(card.identifiers.case_uid).toBe('45dcad31-4ad4-448c-ab97-33ec62895e23');
  });

  it('нет номера дела — ошибка', async () => {
    const html = CASE_HTML.replace(/<div class="casenumber">[^<]*<\/div>/, '');
    await expect(adapter.parse(html, URL)).rejects.toThrow('не удалось определить номер дела');
  });

  it('тип, суд, courtType', async () => {
    const card = await adapter.parse(CASE_HTML, URL);
    expect(card.type).toBe('Гражданское дело');
    expect(card.court).toBe('oblsud--perm');
    expect(card.courtType).toBe('appeal');
  });

  it('карточка дела из #cont1', async () => {
    const card = await adapter.parse(CASE_HTML, URL);
    expect(card.card.filingDate).toBe('2026-04-01');
    expect(card.card.judge).toBe('Смирнова Е.А.');
    expect(card.card.hearingDate).toBe('2026-05-15');
    expect(card.card.result).toBe('Апелляционная жалоба оставлена без удовлетворения');
    expect(card.card.proceedingType).toBe('Рассмотрено коллегиально');
  });

  it('категория разбивается по <br>', async () => {
    const card = await adapter.parse(CASE_HTML, URL);
    expect(card.card.category).toEqual(['О защите прав потребителей', 'из договоров']);
  });

  it('движение дела из #cont3 (не #cont2!)', async () => {
    const card = await adapter.parse(CASE_HTML, URL);
    expect(card.events).toHaveLength(2);
    const e = card.events[1]!;
    expect(e.eventName).toBe('Судебное заседание');
    expect(e.eventDate).toBe('2026-05-15');
    expect(e.location).toBe('Зал 12');
    expect(e.result).toBe('Отложено');
    expect(e.reason).toBe('неявка');
    expect(e.note).toBe('note1');
    expect(e.publishDate).toBe('2026-05-20');
  });

  it('участники из #cont4 (не #cont3!)', async () => {
    const card = await adapter.parse(CASE_HTML, URL);
    expect(card.parties).toHaveLength(2);
    expect(card.parties[0]).toMatchObject({ role: 'Истец', name: 'Иванов И.И.' });
    expect(card.parties[1]).toMatchObject({
      role: 'Ответчик', name: 'ООО Ромашка',
      inn: '5401123456', kpp: '540101001', ogrn: '1025400000001',
    });
  });

  it('publishedAt/modifiedAt из #cont5 .publishInfo', async () => {
    const card = await adapter.parse(CASE_HTML, URL);
    expect(card.publishedAt).toBe('2026-06-21T14:30:00');
    expect(card.modifiedAt).toBe('2026-06-22T09:15:00');
  });

  it('identifiers из URL', async () => {
    const card = await adapter.parse(CASE_HTML, URL);
    expect(card.identifiers).toEqual({
      delo_id: '5',
      case_uid: '45dcad31-4ad4-448c-ab97-33ec62895e23',
      case_type: '0',
      case_id: null,
    });
  });

  it('страница капчи — CaptchaRequiredError', async () => {
    await expect(adapter.parse('<div id="captcha"></div>', URL)).rejects.toThrow(CaptchaRequiredError);
  });
});
