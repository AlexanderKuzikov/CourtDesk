import type { CourtType } from '../../core/types.js';
import type { ParseAdapter } from './types.js';
import { DistrictAdapter } from './district.js';
import { AppealAdapter } from './appeal.js';
import { CassationAdapter } from './cassation.js';
import { MagistrateAdapter } from './magistrate.js';

const adapters: Partial<Record<CourtType, ParseAdapter>> = {
  district: new DistrictAdapter(),
  appeal: new AppealAdapter(),
  cassation: new CassationAdapter(),
  magistrate: new MagistrateAdapter(),
};

export function getParseAdapter(courtType: CourtType): ParseAdapter {
  const a = adapters[courtType];
  if (!a) throw new Error(`Нет адаптера парсинга для типа суда: ${courtType}`);
  return a;
}
