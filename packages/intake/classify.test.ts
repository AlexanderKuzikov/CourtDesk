import { describe, it, expect } from 'vitest';
import { classify, identifyCourt } from './classify.js';

describe('classify', () => {
  it('case_card: district', () => {
    const r = classify('https://sverdlov--perm.sudrf.ru/modules.php?name=sud_delo&srv_num=1&name_op=case&case_id=458075868&case_uid=177348e2-e763-4d56-be99-6e799d98de5d&delo_id=1540005');
    expect(r.type).toBe('case_card');
    if (r.type === 'case_card') {
      expect(r.courtId).toBe('sverdlov--perm');
      expect(r.courtType).toBe('district');
      expect(r.caseId).toBe('458075868');
      expect(r.caseUid).toBe('177348e2-e763-4d56-be99-6e799d98de5d');
    }
  });

  it('case_card: appeal', () => {
    const r = classify('https://oblsud--perm.sudrf.ru/modules.php?name=sud_delo&srv_num=1&name_op=case&case_id=11448818&case_uid=45dcad31-4ad4-448c-ab97-33ec62895e23&delo_id=5&new=5');
    expect(r.type).toBe('case_card');
    if (r.type === 'case_card') {
      expect(r.courtType).toBe('appeal');
    }
  });

  it('case_card: cassation', () => {
    const r = classify('https://7kas.sudrf.ru/modules.php?name=sud_delo&srv_num=1&name_op=case&case_id=11662670&case_uid=07ae7a19-4220-47e9-9f09-094b2e72e9fb&new=2800001&delo_id=2800001');
    expect(r.type).toBe('case_card');
    if (r.type === 'case_card') {
      expect(r.courtType).toBe('cassation');
    }
  });

  it('case_card: magistrate', () => {
    const r = classify('https://35.perm.msudrf.ru/modules.php?name=sud_delo&op=cs&case_id=2414120&delo_id=1540005');
    expect(r.type).toBe('case_card');
    if (r.type === 'case_card') {
      expect(r.courtId).toBe('35.perm');
      expect(r.courtType).toBe('magistrate');
      expect(r.caseId).toBe('2414120');
    }
  });

  it('case_card: magistrate (108 участок)', () => {
    const r = classify('https://108.perm.msudrf.ru/modules.php?name=sud_delo&op=cs&case_id=1387272&delo_id=1540005');
    expect(r.type).toBe('case_card');
    if (r.type === 'case_card') {
      expect(r.courtId).toBe('108.perm');
    }
  });

  it('malformed: op=hl (главная, не карточка)', () => {
    const r = classify('https://128.perm.msudrf.ru/modules.php?name=sud_delo&op=hl');
    expect(r.type).toBe('malformed');
  });

  it('malformed: name_op=sf (поисковая форма)', () => {
    const r = classify('https://kirov--perm.sudrf.ru/modules.php?name=sud_delo&name_op=sf&delo_id=1540005');
    expect(r.type).toBe('malformed');
  });

  it('malformed: name_op=r (результат поиска)', () => {
    const r = classify('https://kirov--perm.sudrf.ru/modules.php?name=sud_delo&srv_num=1&name_op=r&delo_id=1540005');
    expect(r.type).toBe('malformed');
  });

  it('malformed: не sudrf домен', () => {
    const r = classify('https://example.com/page');
    expect(r.type).toBe('malformed');
  });

  it('malformed: пустая строка', () => {
    const r = classify('');
    expect(r.type).toBe('malformed');
  });

  it('search: номер дела', () => {
    const r = classify('2-4160/2026');
    expect(r.type).toBe('search');
    if (r.type === 'search') {
      expect(r.caseNumber).toBe('2-4160/2026');
    }
  });

  it('search: ФИО', () => {
    const r = classify('Иванов Иван');
    expect(r.type).toBe('search');
  });

  it('search: ФИО полное', () => {
    const r = classify('Иванов Иван Иванович');
    expect(r.type).toBe('search');
  });

  it('malformed: короткий текст', () => {
    const r = classify('ab');
    expect(r.type).toBe('malformed');
  });
});

describe('identifyCourt', () => {
  it('извлекает суд из case_card URL', () => {
    const r = identifyCourt('https://sverdlov--perm.sudrf.ru/modules.php?name_op=case&case_id=1');
    expect(r).toEqual({ courtId: 'sverdlov--perm', courtType: 'district' });
  });

  it('извлекает суд из битого URL (op=hl)', () => {
    const r = identifyCourt('https://128.perm.msudrf.ru/modules.php?name=sud_delo&op=hl');
    expect(r).toEqual({ courtId: '128.perm', courtType: 'magistrate' });
  });

  it('извлекает appeal из поискового URL', () => {
    const r = identifyCourt('https://oblsud--perm.sudrf.ru/modules.php?name=sud_delo&name_op=sf&delo_id=5');
    expect(r).toEqual({ courtId: 'oblsud--perm', courtType: 'appeal' });
  });

  it('null для не-sudrf домена', () => {
    expect(identifyCourt('https://google.com')).toBeNull();
  });
});
