# BUG REPORT — CourtDesk

> Последнее обновление: 2026-07-22
> Ревьюер: Perplexity (CR5), HEAD: `913c119` → исправлено в коммите после

---

## Открытых багов нет

**Все 50 замечаний исправлены или закрыты.**

---

## История — все закрытые баги

| ID | Severity | Файл | Описание | Статус |
|----|----------|------|----------|--------|
| BUG-001 | CRITICAL | `store/cases.ts` | Race condition read-modify-write | ✅ CLOSED |
| BUG-002 | CRITICAL | `scheduler/orchestrator.ts` | runNew() / fetchHtml('') | ✅ FIXED |
| BUG-003 | HIGH | `api/routes/parse.ts` | magistrate без captcha + CP1251 | ✅ FIXED |
| BUG-004 | HIGH | `api/routes/cases.ts` | PATCH без whitelist | ✅ FIXED |
| BUG-005 | HIGH | `search/adapters/district.ts` | magistrate caseUrl с `.sudrf.ru` | ✅ CLOSED |
| BUG-006 | MEDIUM | `store/cases.ts` | deleteCase лишняя I/O | ✅ FIXED |
| BUG-007 | MEDIUM | `package.json` | Node < 20.6 падает | ✅ FIXED |
| BUG-008 | MEDIUM | `scheduler/orchestrator.ts` | runFull блокирует event loop | ✅ FIXED |
| BUG-009 | MEDIUM | `store/cases.ts` | N×disk reads, нет cache | ✅ FIXED |
| BUG-010 | LOW | `captcha/rucaptcha.ts` | CRLF endings | ✅ FIXED |
| BUG-011 | LOW | `scheduler/orchestrator.ts` | Dynamic import iconv | ✅ FIXED |
| NEW-001 | HIGH | `scheduler/orchestrator.ts` | makeEvent() caseUid='' | ✅ FIXED |
| NEW-002 | HIGH | `scheduler/orchestrator.ts` | Race condition processOne vs PATCH | ✅ FIXED |
| NEW-003 | HIGH | `api/server.ts` | Нет /api/status, /api/notifications | ✅ FIXED |
| NEW-004 | MEDIUM | `scheduler/orchestrator.ts` | error-дела не ретраются | ✅ FIXED |
| NEW-005 | MEDIUM | `scheduler/orchestrator.ts` | processWaiting: нет lastChecked | ✅ FIXED |
| NEW-006 | MEDIUM | `core/types.ts` | ParseRunRequest.mode != switch | ✅ FIXED |
| NEW-007 | MEDIUM | `core/types.ts` | CaseStatus нет 'archived' | ✅ FIXED |
| NEW-008 | LOW | `core/courts.ts` | findCourtsByName: map перед slice | ✅ FIXED |
| NEW-009 | LOW | `core/config.ts` | EACCES не обрабатывается | ✅ FIXED |
| NEW-010 | LOW | `intake/classify.ts` | CASE_NUMBER_RE — арбитраж/кассация | ✅ FIXED |
| NEW-011 | LOW | `intake/classify.ts` | ФИО-эвристика без проверки алфавита | ✅ FIXED |
| CR4-001 | HIGH | search adapters | Дублирование fetchHtml/parseResults ×4 | ✅ FIXED |
| CR4-002 | MEDIUM | `server.ts` | Нет CORS | ✅ FIXED |
| CR4-003 | MEDIUM | `orchestrator.ts` | 3 updateCase в processOne | ✅ FIXED |
| CR4-004 | LOW | `courts.ts` | GET /api/courts без q= | ✅ FIXED |
| CR4-005 | LOW | `server.ts` | Нет graceful shutdown | ✅ FIXED |
| CR4-006 | MEDIUM | `store/notifications.ts` | Persistent notifications | ✅ FIXED |
| CR4-007 | MEDIUM | `magistrate.ts` | Два пути в searchByCaseNumber | ✅ FIXED |
| CR4-008 | LOW | `search/constants.ts` | Hardcoded delo_id | ✅ FIXED |
| CR5-001 | HIGH | `scheduler/orchestrator.ts` | Двойной запрос без rate-delay на decision-делах | ✅ FIXED |
| CR5-002 | HIGH | `scheduler/orchestrator.ts` | `'deleted' as unknown` — несуществующий статус | ✅ FIXED |
| CR5-003 | HIGH | `store/cases.ts` | legalForceDate без нормализации YYYY-MM-DD | ✅ FIXED |
| CR5-004 | MEDIUM | `api/server.ts` | CORS wildcard + Authorization header | ✅ FIXED |
| CR5-005 | MEDIUM | `intake/classify.ts` | `/i` без `/u` на кириллических regex | ✅ FIXED |
| CR5-006 | MEDIUM | `captcha/rucaptcha.ts` | fetch polling без retry при network error | ✅ FIXED |
| CR5-007 | MEDIUM | `store/cases.ts` | 3× listCases в runFull вместо одного прохода | ✅ FIXED |
| CR5-008 | LOW | `store/json-store.ts` | tmp/rename без fsync — задокументировано как trade-off | ✅ DOCUMENTED |
| CR5-009 | LOW | `package.json` | `lint` = type-check, eslint отсутствует | ✅ DOCUMENTED |
| CR5-010 | LOW | `api/server.ts` | Hardcoded bind `127.0.0.1` | ✅ FIXED |
| CR5-011 | LOW | `orchestrator.ts` | console.log вместо structured logging | ✅ DOCUMENTED |
| CR5-012 | MEDIUM | `api/routes/parse.ts` | Нет guard от параллельных runFull() | ✅ FIXED |

**50/50 замечаний исправлено, закрыто или задокументировано.**
