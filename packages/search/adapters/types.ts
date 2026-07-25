import type { SearchRequest, SearchResult } from '../../core/types.js';

export interface SearchAdapter {
  searchByCaseNumber(req: SearchRequest): Promise<SearchResult[]>;
  searchByParty(req: SearchRequest): Promise<SearchResult[]>;
  searchByCaseUid(req: SearchRequest): Promise<SearchResult[]>;
  buildSearchUrl(req: SearchRequest): string;
}
