# CourtDesk — CHANGELOG

Все значимые изменения фиксируются здесь в формате [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/).

---

## [Unreleased]

### Fixed (CR5 — 2026-07-22, коммит `849fdb4`)
- **CR5-001**: `await sleep(RATE_DELAY_MS)` добавлен перед `searchByCaseNumber` внутри `processOne` — устранён двойной запрос к sudrf.ru без rate-limit на `decision`-делах (`orchestrator.ts`)
- **CR5-002**: Удалён `prev.status === 'deleted' as unknown` — несуществующий статус с подавлением TypeScript (`orchestrator.ts`)
- **CR5-003**: `r.legalForceDate.slice(0, 10)` при записи — `enforcedToday` в `getStats()` теперь корректен (`orchestrator.ts`, `store/cases.ts`)
- **CR5-004**: Убран `Authorization` из `Access-Control-Allow-Headers` при wildcard origin — нерабочая комбинация по спецификации CORS (`api/server.ts`)
- **CR5-005**: `CASE_NUMBER_RE` и `CYRILLIC_WORD_RE` переведены с `/i` на `/iu` — корректный Unicode case-insensitive для кириллицы (`intake/classify.ts`)
- **CR5-006**: Retry-цикл в `pollResult` до `NETWORK_RETRY_LIMIT=2` при `fetch`-исключении — captcha-сессия выживает при кратковременных сбоях сети (`captcha/rucaptcha.ts`)
- **CR5-007**: `listCases` принимает `status: CaseStatus | CaseStatus[]` через `Set` — один проход по Map вместо 3× в `runFull`/`runRetry` (`store/cases.ts`, `orchestrator.ts`)
- **CR5-010**: `HOST = process.env['HOST'] ?? '127.0.0.1'` — bind-адрес из env, не захардкожен (`api/server.ts`)
- **CR5-012**: `_isRunning` guard + `409 Conflict { code: 'RUN_IN_PROGRESS' }` в `POST /api/parse/run` — защита от параллельных запусков (`api/routes/parse.ts`)

### Documented as trade-offs (CR5 — 2026-07-22)
- **CR5-008**: tmp/rename без fsync — задокументировано в ARCHITECTURE.md §7.2 и DECISIONS.md как осознанный trade-off для single-process
- **CR5-009**: `lint` = type-check, eslint отсутствует — tech-debt, зафиксирован в DECISIONS.md
- **CR5-011**: `console.log` вместо structured logging — tech-debt, зафиксирован в DECISIONS.md

---

## [0.3.0] — 2026-07-22

### Added
- **CORS middleware**: разблокирован dev-режим с Vite (:5173 → API :8767)
- **Graceful shutdown**: SIGTERM/SIGINT → корректное завершение (`packages/api/server.ts`)
- **GET /api/courts** без `q=` возвращает полный список судов
- **Shared fetchHtml/parseResults**: дублированный код вынесен в `packages/search/shared.ts`
- **Batch updateCase**: `processOne()` делает один `updateCase` в конце
- **Persistent notifications**: `store/notifications.ts` с JSON-хранилищем, `PATCH /api/notifications/:uid/read`
- **Magistrate search refactor**: делегирование парсинга в `parse/adapters/magistrate.ts`
- **Viewer dashboard**: `packages/viewer/public/index.html` — дашборд UC-0
- **SEARCH_PARAMS constants**: hardcoded `delo_id`/`case_type` вынесены в `packages/search/constants.ts`
- **CODE_REVIEW4.md, CODE_REVIEW5.md**: документация всех раундов ревью
- **BUG_REPORT.md**: 50/50 закрыто

### Fixed
- CR4-001..008: дублирование адаптеров, CORS, batch updateCase, graceful shutdown, notifications, magistrate, delo_id, GET /api/courts
- NEW-001..011: makeEvent caseUid, race condition, /api/status, /api/notifications, error-ретрай, lastChecked, types, courts, config, classify

---

## [0.2.0] — 2026-07-22

### Added
- Дашборд UC-0 (viewer/public/index.html)
- /api/status, /api/notifications эндпоинты
- Persistent notifications (store/notifications.ts)
- POST /api/resolve

### Fixed
- NEW-001..011 (scheduler race conditions, types, intake, courts, config)
- INFRA-001..004 (tsconfig, CI, vitest, createApp)

---

## [0.1.0] — 2026-07-21

### Added
- Модульная структура `packages/`: api, core, store, scheduler, search, parse, captcha, intake, viewer
- REST API: все 15 эндпоинтов
- JSON-хранилище с атомарной записью (tmp + rename)
- In-memory кэш в store/cases.ts
- PATCH-whitelist, deleteCase guard
- runNew через searchByParty
- 202 Accepted для parse/run
- Статический import iconv, rate limit
- Полный набор unit/smoke тестов (57)
- Apache 2.0 лицензия
