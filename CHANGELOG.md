# CourtDesk — CHANGELOG

Все значимые изменения фиксируются здесь в формате [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/).

---

## [0.4.0] — 2026-07-24

### CR6 — Security & Data Integrity (20 замечаний)

#### Fixed (CRITICAL)

- **CR6-001**: `readJson` при коррупции файла бэкапит в `.corrupt.<ts>` и бросает ошибку вместо silent-wipe (`store/json-store.ts`)
- **CR6-002**: `assertCourtUrl()` — allowlist `*.sudrf.ru` / `*.msudrf.ru`, https-only. Применён в `/api/parse/url` и `orchestrator.fetchHtml`. Блок SSRF (`file://`, `localhost`, cloud metadata) (`core/errors.ts`, `api/routes/parse.ts`, `scheduler/orchestrator.ts`)
- **CR6-004**: Re-check `archived` перед финальным `updateCase` — если дело заархивировано во время async-обработки, пишется только `lastChecked`, изменения статуса отбрасываются (`scheduler/orchestrator.ts`)
- **CR6-006**: `status: 'error'` сбрасывается в `'monitoring'` при успешном `processOne` — error-дела больше не крутятся вечно (`scheduler/orchestrator.ts`)

#### Fixed (HIGH)

- **CR6-007**: `search.html` — исправлены API-пути (`/api/search/by-number`, `/api/search/by-party`) и unwrap (`data.data.results`). Страница поиска восстановлена (`viewer/public/search.html`)
- **CR6-008**: Удалён дублирующий `GET /api/status` из `health.ts` — `status.ts` больше не тенится (`api/routes/health.ts`)
- **CR6-009**: Удалён дублирующий `POST /api/resolve` из `search.ts` — `resolve.ts` (URL builder) работает корректно (`api/routes/search.ts`)
- **CR6-013**: `_isRunning = true` перемещён до `res.status(202)` — устранён TOCTOU в guard (`api/routes/parse.ts`)
- **CR6-016**: `DELETE /api/cases/:uid` теперь каскадно чистит events и notifications (`api/routes/cases.ts`, `store/notifications.ts`)

#### UX/UI — Dashboard

- Дашборд: фильтры по статусу (Все / Мониторинг / Ожидание / Решение / Вступило / Ошибка / Архив) с счётчиками
- Дашборд: кнопка «Запустить мониторинг» (`POST /api/parse/run`) с polling обновления
- Дашборд: детали дела в modal — карточка + timeline событий (`GET /api/cases/:uid` + `GET /api/cases/:uid/events`)
- Дашборд: архивирование (PATCH → `archived`), возврат из архива, удаление (с confirm)
- Дашборд: авто-обновление каждые 30с, обработка ошибок соединения

#### UX/UI — Search

- Поиск: исправлены API-пути и unwrap (CR6-007)
- Поиск: кнопка «В мониторинг» (+📋) в каждой строке результатов → `POST /api/cases`
- Поиск: форма «Отслеживать появление» → `POST /api/cases/wait`
- Поиск: `<input type="date">` вместо text с placeholder
- Поиск: убраны тестовые данные (Кислицин, 59RS0007, быстрые тесты)
- Поиск: брендинг изменён с "CourtSniffer" на "CourtDesk"
- Поиск: toast-уведомления вместо alert

#### Cleanup

- Magistrate search adapter: удалены мёртвые `createMagistrateSession()` и `solveCaptchaOnPage()` — дубликаты `captcha/session.ts`
- `GET /api/cases/:uid/events` — новый эндпоинт для timeline событий в UI
- `version` синхронизирована: package.json / health = 0.4.0

### Tech-debt (перенесено)

| ID | Описание | Заметка |
|----|----------|---------|
| CR6-003 | Zero authentication | `COURTDESK_API_TOKEN` в .env.example — реализация в отдельном sprint |
| CR6-005 | waiting → `results[0]` без матчинга | Нужен score/party matching |
| CR6-010 | TLS `rejectUnauthorized: false` | Осознанный trade-off для sudrf.ru wildcard |
| CR6-009 | eslint — tech-debt | Отложен с CR5-009 |
| CR6-011 | Structured logging | Отложен с CR5-011 |

---

## [0.3.0] — 2026-07-22

### Added
- CORS middleware, graceful shutdown, GET /api/courts без q=, shared fetchHtml/parseResults
- Batch updateCase, persistent notifications, magistrate search refactor
- Viewer dashboard (UC-0), SEARCH_PARAMS constants
- CODE_REVIEW4.md, CODE_REVIEW5.md, BUG_REPORT.md

### Fixed
- CR4-001..008, NEW-001..011, CR5-001..012

---

## [0.2.0] — 2026-07-22

### Added
- Дашборд UC-0, /api/status, /api/notifications, persistent notifications, POST /api/resolve

### Fixed
- NEW-001..011, INFRA-001..004

---

## [0.1.0] — 2026-07-21

### Added
- Модульная структура packages/: api, core, store, scheduler, search, parse, captcha, intake, viewer
- REST API: 15 эндпоинтов, JSON-хранилище с tmp+rename, in-memory кэш
- PATCH-whitelist, deleteCase guard, runNew через searchByParty
- 202 Accepted для parse/run, статический import iconv, rate limit
- 57 unit/smoke тестов, Apache 2.0