# BUG REPORT — CourtDesk
> Дата создания: 2026-07-21  
> Дата обновления: **2026-07-22** (баги NEW-001..011 исправлены, добавлены CR4)  
> Ревьюер: Perplexity

---

## СТАТУС ВСЕХ БАГОВ

| ID | Severity | Файл | Описание | Статус | Коммит |
|----|----------|------|----------|--------|--------|
| BUG-001 | CRITICAL | `store/cases.ts` | Race condition, потеря данных | ✅ CLOSED | — |
| BUG-002 | CRITICAL | `scheduler/orchestrator.ts` | `runNew()` / `fetchHtml('')` | ✅ FIXED | `67173ba` |
| BUG-003 | HIGH | `api/routes/parse.ts` | magistrate без captcha + CP1251 | ✅ FIXED | `89570af` |
| BUG-004 | HIGH | `api/routes/cases.ts` | PATCH без whitelist | ✅ FIXED | `219e1ac` |
| BUG-005 | HIGH | `search/adapters/district.ts` | magistrate caseUrl с `.sudrf.ru` | ✅ CLOSED | — |
| BUG-006 | MEDIUM | `store/cases.ts` | deleteCase лишняя I/O | ✅ FIXED | `5932ff8` |
| BUG-007 | MEDIUM | `package.json` | Node < 20.6 падает | ✅ FIXED | `fd7fa7e` |
| BUG-008 | MEDIUM | `scheduler/orchestrator.ts` | runFull блокирует event loop | ✅ FIXED | `89570af` |
| BUG-009 | MEDIUM | `store/cases.ts` | N×disk reads, нет cache | ✅ FIXED | `5932ff8` |
| BUG-010 | LOW | `captcha/rucaptcha.ts` | CRLF endings | ✅ FIXED | `fd7fa7e` |
| BUG-011 | LOW | `scheduler/orchestrator.ts` | Dynamic import iconv hot path | ✅ FIXED | `67173ba` |
| NEW-001 | HIGH | `scheduler/orchestrator.ts` | `makeEvent()` caseUid='' | ✅ FIXED | `cb120b2` |
| NEW-002 | HIGH | `scheduler/orchestrator.ts` | Race condition processOne vs PATCH | ✅ FIXED | `cb120b2` |
| NEW-003 | HIGH | `api/server.ts` | `/api/status`, `/api/notifications` routes | ✅ FIXED | `cb120b2` |
| NEW-004 | MEDIUM | `scheduler/orchestrator.ts` | `error`-дела не ретраются | ✅ FIXED | `cb120b2` |
| NEW-005 | MEDIUM | `scheduler/orchestrator.ts` | processWaiting: нет lastChecked | ✅ FIXED | `cb120b2` |
| NEW-006 | MEDIUM | `core/types.ts` | ParseRunRequest.mode != switch | ✅ FIXED | `cb120b2` |
| NEW-007 | MEDIUM | `core/types.ts` | CaseStatus нет 'archived' | ✅ FIXED | `cb120b2` |
| NEW-008 | LOW | `core/courts.ts` | findCourtsByName: map перед slice | ✅ FIXED | `cb120b2` |
| NEW-009 | LOW | `core/config.ts` | EACCES не обрабатывается | ✅ FIXED | `cb120b2` |
| NEW-010 | LOW | `intake/classify.ts` | CASE_NUMBER_RE — арбитраж/кассация | ✅ FIXED | `cb120b2` |
| NEW-011 | LOW | `intake/classify.ts` | ФИО-эвристика без проверки алфавита | ✅ FIXED | `cb120b2` |

### Открытых багов нет

---

## CODE REVIEW 4 — новые замечания (CR4-xxx)

См. `CODE_REVIEW4.md` — замечания CODE_REVIEW3.md, принятые к реализации:

| ID | Severity | Описание | Статус |
|----|----------|----------|--------|
| CR4-001 | HIGH | Дублирование fetchHtml/parseResults ×4 в search-адаптерах | ✅ FIXED |
| CR4-002 | MEDIUM | Нет CORS middleware | ✅ FIXED |
| CR4-003 | MEDIUM | 3 updateCase в processOne вместо батча | ✅ FIXED |
| CR4-004 | LOW | GET /api/courts без q= → только total | ✅ FIXED |
| CR4-005 | LOW | Нет graceful shutdown | ✅ FIXED |
| CR4-006 | MEDIUM | Notifications — синтетика, нет persistent-хранилища | 🟡 Отложено |
| CR4-007 | MEDIUM | Magistrate два пути в searchByCaseNumber | 🟡 Отложено |
| CR4-008 | LOW | Hardcoded delo_id | 🟡 Отложено |

---
