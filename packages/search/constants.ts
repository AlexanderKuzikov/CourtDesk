// Параметры поиска ГАС «Правосудие» (sudrf.ru)
// delo_id и case_type зависят от инстанции суда.
// Эти идентификаторы могут меняться при обновлении БД sudrf.ru.

export const SEARCH_PARAMS = {
  district: { delo_id: '1540005', case_type: '0' },
  appeal: { delo_id: '5', case_type: '1' },
  cassation: { delo_id: '2800001', case_type: '4' },
  magistrate: { delo_id: '1540005', case_type: '0' },
} as const;

export type CourtSearchType = keyof typeof SEARCH_PARAMS;
