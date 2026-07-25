// Параметры поиска ГАС «Правосудие» (sudrf.ru)
// delo_id и case_type зависят от инстанции суда.
// Эти идентификаторы могут меняться при обновлении БД sudrf.ru.

// Префикс полей формы G1_/g1_ для первой инстанции, G2_/g2_ для апелляции/кассации
export const SEARCH_PARAMS = {
  district:   { delo_id: '1540005', case_type: '0', prefix: 'g1' },
  appeal:     { delo_id: '5',       case_type: '0', prefix: 'g2' },
  cassation:  { delo_id: '2800001', case_type: '4', prefix: 'g2' },
  magistrate: { delo_id: '1540005', case_type: '0', prefix: 'g1' },
} as const;

export type CourtSearchType = keyof typeof SEARCH_PARAMS;
