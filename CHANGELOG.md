# CourtDesk — CHANGELOG

Все значимые изменения фиксируются здесь в формате [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/).

---

## [0.5.0] — 2026-07-26

### msudrf — полностью переписан

- **Новая архитектура AJAX-поиска:** msudrf не поддерживает GET-формы (как sudrf). Поиск через JS/AJAX. Капча (`kcaptchaForm`) решается один раз на сессию. Результаты в `<div id="search_results">`.
- **`fetchMsudrfSearch()`** (`captcha/session.ts`) — отдельная функция для AJAX-пайплайна: открыть страницу → решить капчу (с retry) → заполнить поля → клик «Искать» → дождаться `#search_results`. Не переиспользует `fetchWithCaptcha`.
- **`search/adapters/magistrate.ts`** — переписан полностью. Использует `fetchMsudrfSearch()`, парсит 5-колоночную таблицу msudrf (№ дела | Категория/Лица | Судья | Дата решения | Решение). Участники извлекаются из колонки «Категория/Лица» через regex (ИСТЕЦ/ОТВЕТЧИК).
- **Таблица msudrf (5 колонок):** № дела | Категория/Лица | Судья | Дата решения | Решение. Отличается от sudrf (7 колонок: № дела | Дата поступления | Категория | Судья | Дата решения | Результат | Вступление).
- **TLS:** `rejectUnauthorized: false` для `https.get` в orchestrator и синхронном парсинге (msudrf требует игнорирования TLS-ошибок).

### UI

- **Убран КАПС:** `theme.css` — все КАПС-селекторы и переменные заменены на нормальный регистр. `index.html`, `search.html` — текст КАПС заменён.
- **Название суда вместо домена:** `GET /api/cases` и `GET /api/cases/:uid` обогащают ответ полем `courtName` через `findCourtByCodeOrSubdomain()`. Дашборд: колонка «Суд» отображает название, а не subdomain. Поиск по таблице включает `courtName`.
- **Прогресс-бар мониторинга:** новый эндпоинт `GET /api/parse/progress`, модуль `core/progress.ts`. Дашборд: поллинг прогресса каждые 5с, отображение `processed/total (errors)`, скрытие при завершении.
- **Настройки расписания:** модалка в `index.html` с полями: время полного прогона, интервал retry, stale-порог, вкл/выкл. Эндпоинты `GET/PUT /api/settings`.

### Синхронный парсинг при добавлении

- `POST /api/cases?parse=true` (или `body.parse`) — парсинг карточки сразу после добавления дела.
- Результат возвращается в теле ответа (`card`).
- Использует `https.get` с `rejectUnauthorized: false`, при капче — Puppeteer.
- Если парсинг упал — дело всё равно добавлено, ошибка в `parseError`.

### Счётчик ошибок

- `WatchedCase` получил `errorCount: number` и `lastError: string | null`.
- `PATCH_ALLOWED` включает эти поля.
- `orchestrator.ts`: при ошибке пишет `errorCount+1` и `lastError`, при успехе сбрасывает.

### Party matching (CR6-005 — закрыт)

- `matchParty(party, resultParties): number` — скоринг совпадения имён (100 = точное, 90 = startsWith, фамилия+слова).
- `pickBestMatch(results, party): SearchResult | null` — выбор лучшего по score.
- `processWaiting` использует `pickBestMatch` вместо `results[0]`.

### Infra

- **eslint + @typescript-eslint (CR5-009 — закрыт):** `eslint.config.js` (flat config, ESM). Правила: `no-console: warn`, `@typescript-eslint/no-unused-vars`, `@typescript-eslint/no-explicit-any`, `prefer-const`, `no-var`.
- **pino (CR5-011 — закрыт):** `core/logger.ts` — pino с dual-transport (файл `logs/courtdesk.log` + stdout), ISO-таймстампы. `log()` и `logRequest()` функции. Express-логи через `logRequest`.
- **Node engine:** `>=22.0.0` (было `>=20.6.0`). CR7-008 закрыт.

### Cron-планировщик

- `packages/scheduler/cron.ts` — `startCron()` проверяет каждые 60с, запускает `runFull()` по расписанию и `runRetry()` по интервалу.
- `stopCron()` — остановка.
- `server.ts` — автостарт `startCron()` при запуске.
- Настройки: `scheduleFull`, `retryIntervalHours`, `retryStaleHours`, `scheduleEnabled` — через UI и `PUT /api/settings`.

### TUI (packages/tui/)

- **Терминальный интерфейс на blessed** (не neo-blessed — сломан на Windows).
- **5 попыток создания:**
  1. neo-blessed → ошибка `fake` (node-pty не собирается на Windows). Отказ.
  2. ANSI-самопал → неинтерактивен, Q не работает. Брошен.
  3. blessed с `tags: true` → теги не рендерятся в `blessed.list` (баг blessed #400).
  4. ANSI drawBox → рамки есть, навигации нет. Брошен.
  5. **blessed (снова) — чистый список без тегов** → работает на Linux.
- **Возможности:** таблица дел (номер/статус/суд/результат), вкладки (дела/запуск), детали дела (Enter), F4/F5/F6 для прогонов, авто-обновление 60с, выход по Q/Й/Ctrl+C.
- **Ограничения:** на Windows глючно (стрелки, русская раскладка, blessed.list). Рекомендация: Linux/WSL.
- **Файлы:** `packages/tui/index.ts`, `packages/tui/app.ts`, `packages/tui/fetch.ts`.

### API

- **23 эндпоинта** (было 16 + 1 `GET /cases/:uid/card` в v0.4.0):
  - `GET /api/parse/progress` — прогресс мониторинга
  - `GET /api/settings` — настройки расписания
  - `PUT /api/settings` — сохранить настройки
  - `POST /api/cases?parse=true` — синхронный парсинг

### Tech-debt закрыто

| ID | Описание | Решение |
|----|----------|---------|
| CR5-009 | Нет eslint | eslint.config.js (flat config) |
| CR5-011 | console.log вместо pino | pino structured logging |
| CR6-005 | waiting → results[0] без матчинга | pickBestMatch + matchParty |
| CR7-008 | `process.loadEnvFile()` требует Node ≥21 | engine >=22.0.0 |

---

## [0.4.0] — 2026-07-25

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

---

## [0.4.0] — CR7-CR9

### CR7 — Deep Audit Fixes (10 замечаний)

- **CR7-001**: `success: true` → `false` при HTTP 500 в `/api/status` (`status.ts`)
- **CR7-002**: `toIso()` — битая ISO дата (двойные `:00`) (`parse/adapters/shared.ts`)
- **CR7-003**: Dead code `err.message === 'timeout'` удалён (`search/shared.ts`)
- **CR7-004**: `listNotifications()` возвращает копию массива, а не живую ссылку (`store/notifications.ts`)
- **CR7-005**: `findCourtsByRegion` — добавлен `.slice(0, 50)` (`core/courts.ts`)
- **CR7-006**: Матчинг `r.uid === c.uid` убран, только `r.caseNumber === c.number` (`scheduler/orchestrator.ts`)
- **CR7-007**: `waitForNetworkIdle().catch(() => {})` — логируем ошибки (`captcha/session.ts`)
- **CR7-009**: `&rarr;` унифицирован на ` → ` во всех адаптерах (`parse/adapters/`)
- **CR7-010**: `setInterval` чистится при `visibilitychange` (`viewer/index.html`)

### CR8 — Captcha & Search Overhaul (9 замечаний)

- **CR8-001/002**: Исправлены `case_type` (0→1) и `new` (0→5) для апелляции — поиск шёл в кассацию
- **CR8-003**: CP1251 percent-декодер: ручной парсинг вместо `decodeURIComponent` (падал на невалидных UTF-8)
- **CR8-004**: `waitForNetworkIdle` → `waitForNavigation` на sudrf (фоновые счетчики не давали network idle)
- **CR8-005**: Double-encoding CP1251 через `page.goto()` → DOM-заполнение + `checkForm` submit
- **CR8-006**: Regex base64 — пробел после `base64,` в data URI
- **CR8-007**: `parseResults` — проверка `<div id="error">`
- **CR8-008**: `isCaptchaPage` — добавлен маркер "Неверно указан проверочный код"
- **CR8-009**: `SEARCH_PARAMS` — добавлен `new_` параметр (0/5 для картотеки)

### CR9 — Court Hierarchy & Grace Period (10 замечаний)

- **CR9-001**: `runFull` — добавлен `'enforced'` в список статусов
- **CR9-002**: `fetchHtml` в оркестраторе — проверка "Неверно указан проверочный код"
- **CR9-003**: `findHigherCourt()` — новая функция в `core/courts.ts`
- **CR9-004**: `COURT_HIERARCHY` — иерархия MS→RS→OS→KJ
- **CR9-005**: `CASSATION_MAP` — 89 регионов → 9 кассационных судов
- **CR9-006**: `saveMsToRsMapping()` — кэш MS→RS привязок на диск
- **CR9-007**: `enforcedAt` — новое поле в `WatchedCase`
- **CR9-008**: `updateCase` — авто-простановка `enforcedAt`
- **CR9-009**: `ENFORCED_GRACE_MS` — 90 дней grace period для enforced дел
- **CR9-010**: `searchByCaseUid` — поиск в вышестоящей инстанции по УИД

### Tech-debt (без изменений)

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
