import type { CaseCard } from '../../core/types.js';

export interface ParseAdapter {
  parse(html: string, url: string): Promise<CaseCard>;
}
