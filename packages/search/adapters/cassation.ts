// Кассационные суды (*kas.sudrf.ru) — без капчи
// delo_id=2800001 — кассационные дела
// op=sf → op=r

import { encodeParam } from '../../core/encoding.js';
import type { SearchRequest, SearchResult } from '../../core/types.js';
import type { SearchAdapter } from './types.js';
import { fetchHtml, parseResults } from '../shared.js';
import { SEARCH_PARAMS } from '../constants.js';

export class CassationSearchAdapter implements SearchAdapter {
  buildSearchUrl(req: SearchRequest): string {
    const p = SEARCH_PARAMS.cassation;
    const base = `https://${req.courtId}.sudrf.ru/modules.php`;
    const q = [
      'name=sud_delo', 'srv_num=1',
      'name_op=r', `delo_id=${p.delo_id}`, `case_type=${p.case_type}`, 'new=0',
      'G1_PARTS__NAMESS=' + encodeParam(req.defendant || req.plaintiff || ''),
      'g1_case__CASE_NUMBERSS=' + encodeURIComponent(req.caseNumber || ''),
      'g1_case__JUDICIAL_UIDSS=', 'delo_table=g1_case',
      'g1_case__ENTRY_DATE1D=' + encodeURIComponent(req.filingDateFrom || ''),
      'g1_case__ENTRY_DATE2D=' + encodeURIComponent(req.filingDateTo || ''),
      'G1_CASE__JUDGE=', 'g1_case__RESULT_DATE1D=', 'g1_case__RESULT_DATE2D=',
      'G1_CASE__RESULT=', 'G1_CASE__BUILDING_ID=', 'G1_CASE__COURT_STRUCT=',
      'G1_EVENT__EVENT_NAME=', 'G1_EVENT__EVENT_DATEDD=',
      'G1_PARTS__PARTS_TYPE=', 'G1_PARTS__INN_STRSS=', 'G1_PARTS__KPP_STRSS=',
      'G1_PARTS__OGRN_STRSS=', 'G1_PARTS__OGRNIP_STRSS=',
      'G1_RKN_ACCESS_RESTRICTION__RKN_REASON=', 'g1_rkn_access_restriction__RKN_RESTRICT_URLSS=',
      'g1_requirement__ACCESSION_DATE1D=', 'g1_requirement__ACCESSION_DATE2D=',
      'G1_REQUIREMENT__CATEGORY=', 'g1_requirement__ESSENCESS=',
      'g1_requirement__JOIN_END_DATE1D=', 'g1_requirement__JOIN_END_DATE2D=',
      'G1_REQUIREMENT__PUBLICATION_ID=',
      'G1_DOCUMENT__PUBL_DATE1D=', 'G1_DOCUMENT__PUBL_DATE2D=',
      'G1_CASE__VALIDITY_DATE1D=', 'G1_CASE__VALIDITY_DATE2D=',
      'G1_ORDER_INFO__ORDER_DATE1D=', 'G1_ORDER_INFO__ORDER_DATE2D=',
      'G1_ORDER_INFO__ORDER_NUMSS=', 'G1_ORDER_INFO__EXTERNALKEYSS=',
      'G1_ORDER_INFO__STATE_ID=', 'G1_ORDER_INFO__RECIP_ID=',
      'Submit=%CD%E0%E9%F2%E8',
    ];
    return base + '?' + q.join('&');
  }
  async searchByCaseNumber(req: SearchRequest): Promise<SearchResult[]> {
    return parseResults(await fetchHtml(this.buildSearchUrl(req)), req);
  }
  async searchByParty(req: SearchRequest): Promise<SearchResult[]> {
    return parseResults(await fetchHtml(this.buildSearchUrl(req)), req);
  }
}
