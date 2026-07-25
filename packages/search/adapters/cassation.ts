// Кассационные суды (*kas.sudrf.ru) — G2_ префикс

import type { SearchRequest, SearchResult } from '../../core/types.js';
import type { SearchAdapter } from './types.js';
import { smartFetch, parseResults, buildSearchUrl } from '../shared.js';
import { SEARCH_PARAMS } from '../constants.js';

export class CassationSearchAdapter implements SearchAdapter {
  buildSearchUrl(req: SearchRequest): string {
    return buildSearchUrl(req, SEARCH_PARAMS.cassation);
  }

  async searchByCaseNumber(req: SearchRequest): Promise<SearchResult[]> {
    return parseResults(await smartFetch(this.buildSearchUrl(req)), req);
  }

  async searchByParty(req: SearchRequest): Promise<SearchResult[]> {
    return parseResults(await smartFetch(this.buildSearchUrl(req)), req);
  }

  async searchByCaseUid(req: SearchRequest): Promise<SearchResult[]> {
    return parseResults(await smartFetch(this.buildSearchUrl(req)), req);
  }
}