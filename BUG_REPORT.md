# BUG REPORT — CourtDesk

> Последнее обновление: 2026-07-22
> Ревьюер: Perplexity (CR5), HEAD: `913c119`

---

## История: все закрытые баги

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
| NEW-004 | MEDIUM | `scheduler/orchestrator.ts` | error-дела не ретраяются | ✅ FIXED |
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

**38/38 исторических багов закрыто.**

---

## Открытые баги (CR5, 2026-07-22)

| ID | Severity | Файл | Описание | Статус |
|----|----------|------|----------|--------|
| CR5-001 | **HIGH** | `scheduler/orchestrator.ts` | Двойной HTTP-запрос к sudrf.ru без rate-delay внутри `processOne` на `decision`-делах | 🔴 OPEN |
| CR5-002 | **HIGH** | `scheduler/orchestrator.ts` | `prev.status === 'deleted' as unknown` — несуществующий статус, silent type-safety bypass | 🔴 OPEN |
| CR5-003 | **HIGH** | `store/cases.ts` | `legalForceDate` без нормализации `YYYY-MM-DD` — `enforcedToday` всегда 0 | 🔴 OPEN |
| CR5-004 | MEDIUM | `api/server.ts` | CORS `Access-Control-Allow-Origin: *` + `Authorization` header — нерабочая комбинация по спецификации CORS | 🔴 OPEN |
| CR5-005 | MEDIUM | `intake/classify.ts` | `CASE_NUMBER_RE` и `CYRILLIC_WORD_RE`: флаг `/i` без `/u` — undefined behaviour на кириллице | 🔴 OPEN |
| CR5-006 | MEDIUM | `captcha/rucaptcha.ts` | `fetch` в `pollResult` без retry при network error — вся captcha-сессия умирает | 🔴 OPEN |
| CR5-007 | MEDIUM | `store/cases.ts` | 3× `listCases` в `runFull` — 30k итераций вместо 10k | 🔴 OPEN |
| CR5-008 | LOW | `store/json-store.ts` | tmp/rename без fsync — не документирован trade-off | 🔴 OPEN |
| CR5-009 | LOW | `package.json` | `"lint": "npx tsc --noEmit"` — не линтинг, eslint отсутствует | 🔴 OPEN |
| CR5-010 | LOW | `api/server.ts` | Hardcoded bind `'127.0.0.1'` — нет `HOST` env | 🔴 OPEN |
| CR5-011 | LOW | `scheduler/orchestrator.ts` | `console.log`/`console.error` вместо structured logging (pino) | 🔴 OPEN |
| CR5-012 | MEDIUM | `api/routes/parse.ts` | Нет guard от параллельных `runFull()` — race condition + DoS | 🔴 OPEN |

**12/12 открытых багов CR5. Исправляй в порядке приоритета: CR5-002 → CR5-003 → CR5-012 → CR5-001 → CR5-005 → остальные.**
