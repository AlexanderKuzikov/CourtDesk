# CourtDesk — CONTEXT
> CRM-система поиска и мониторинга судебных дел РФ.
> Единый сервис для интеграции с 1С и параллельного Web UI.
> Собирается из CourtSniffer (поиск), CourtFlow (мониторинг) и существующего скелета CourtDesk.

---

## Статус

**v0.4.0** — CR5 закрыт. 12 замечаний исправлено (3 HIGH, 5 MEDIUM, 4 LOW задокументированы). 57 тестов, tsc clean.

| Компонент | Статус | Последнее изменение |
|-----------|--------|---------------------|
| Архитектура | ✅ Утверждена | ARCHITECTURE.md |
| API-контракты | ✅ Утверждены (15/15) | CONTEXT.md |
| Core (типы) | ✅ Готово | NEW-006, NEW-007 |
| Captcha | ✅ Готово — CR5-006 retry в polling | CR5-006 |
| Search | ✅ Готово | CourtSniffer |
| Parse | ✅ Исправлено | BUG-003, BUG-008 |
| Intake | ✅ Исправлено — CR5-005 regex /iu | CR5-005 |
| Scheduler | ✅ Исправлено — CR5-001 rate-delay, CR5-002 deleted, CR5-007 listCases | CR5-001..003, CR5-007 |
| Store | ✅ Исправлено — CR5-003 legalForceDate, CR5-007 multi-status | CR5-003, CR5-007 |
| API | ✅ Исправлено — CR5-004 CORS, CR5-010 HOST, CR5-012 guard | CR5-004, CR5-010, CR5-012 |
| server.ts | ✅ createApp() + graceful shutdown + HOST env | CR5-010 |
| Tests | ✅ 57/57 зелёных | Vitest |
| tsconfig | ✅ moduleResolution: Node16 | INFRA-001 |
| vitest.config | ✅ pool: forks, environment: node | INFRA-003 |
| CI | ✅ tsc --noEmit, 57 тестов | .github/workflows/ci.yml |
| Viewer | ✅ Дашборд + поиск | CourtDesk |
| CODE_REVIEW5 | ✅ Применён | 849fdb4 |
| BUG_REPORT | ✅ 50/50 закрыто | 849fdb4 |

---

## Use cases (утверждено)

### UC-0: Дашборд
- Счётчики: monitoring, waiting, вступило сегодня — `GET /api/status` ✅
- Таблица дел с фильтрами
- Кнопка «Поиск нового дела»
- Уведомления о событиях — `GET /api/notifications` ✅

### UC-1: Добавить новое дело (через поиск)
### UC-2: Следить за делом
### UC-3: Отслеживать появление дела
> ✅ **BUG-002 fixed:** `runNew()` через `searchByParty`, не `fetchHtml('')`.

### UC-4: Отслеживание решения и вступления
> ✅ **CR5-001 fixed:** `await sleep(RATE_DELAY_MS)` перед `searchByCaseNumber` на `decision`-делах.
> ✅ **CR5-003 fixed:** `legalForceDate` нормализуется к `YYYY-MM-DD` при записи — `enforcedToday` корректен.

### UC-5: CRM-запросы (1С)

---

## API-контракты (утверждено)

| # | Запрос | Назначение | Статус |
|---|--------|-----------|--------|
| 1 | `GET /api/status` | Счётчики + здоровье | ✅ |
| 2 | `GET /api/cases` | Список дел | ✅ |
| 3 | `GET /api/cases/:uid` | Карточка дела | ✅ |
| 4 | `POST /api/cases` | Добавить в мониторинг | ✅ |
| 5 | `PATCH /api/cases/:uid` | Обновить разрешённые поля | ✅ |
| 6 | `DELETE /api/cases/:uid` | Удалить | ✅ |
| 7 | `POST /api/cases/wait` | Отслеживать появление | ✅ |
| 8 | `POST /api/resolve` | Суд + номер → ссылка | ✅ |
| 9 | `POST /api/search/by-number` | Поиск по номеру | ✅ |
| 10 | `POST /api/search/by-party` | Поиск по участникам | ✅ |
| 11 | `POST /api/parse/url` | Парсинг URL | ✅ |
| 12 | `GET /api/courts?q=` | Поиск судов | ✅ |
| 13 | `GET /api/courts/:id` | Инфо о суде | ✅ |
| 14 | `GET /api/notifications` | Уведомления | ✅ |
| 15 | `POST /api/parse/run` | Асинх парсинг (202 Accepted) + 409 при повторном запуске | ✅ CR5-012 |

---

## Решения

| Дата | Решение | Обоснование |
|------|---------|-------------|
| 2026-07-21 | Единый проект | Одна кодовая база, один деплой |
| 2026-07-21 | Один package.json | Все пакеты в одном процессе |
| 2026-07-21 | JSON-хранилище | Объём < 10 000 дел; при росте — SQLite |
| 2026-07-21 | REST API | 1С умеет REST |
| 2026-07-21 | API+UI один процесс | Нет CORS-проблем изнутри |
| 2026-07-21 | Search ≠ Parse | Разные URL и логика |
| 2026-07-21 | In-memory cache | Один readFileSync при старте |
| 2026-07-21 | Rate limit 1500ms | Задержка между запросами к sudrf.ru |
| 2026-07-21 | PATCH whitelist | Нельзя менять uid, createdAt, courtId, courtType |
| 2026-07-21 | LF через .gitattributes | Linux-сервер / Windows-клиенты |
| 2026-07-21 | Тесты через mocks | Без реального I/O и сети |
| 2026-07-22 | moduleResolution: Node16 | bundler предназначен для Vite/esbuild |
| 2026-07-22 | vitest pool: forks | Чистый module registry per-test |
| 2026-07-22 | createApp() отдельно | Импорт app в тестах без HTTP сервера |
| 2026-07-22 | CI actions @v4 | v5 не существует |
| 2026-07-22 | error-дела в runFull/runRetry | После ошибки дело должно повторяться автоматически |
| 2026-07-22 | getCase() перед каждым updateCase | Защита от race condition с PATCH API |
| 2026-07-22 | CaseStatus += 'archived' | Пользователь должен иметь возможность архивировать дело |
| 2026-07-22 | ParseRunRequest.mode: 'retry' | Синхронизация типов с реальным switch |
| 2026-07-22 | Persistent notifications | notifications.json по той же схеме, что cases/events |
| 2026-07-22 | Magistrate search → parse delegation | Устранение дублирования cheerio-скрейпинга |
| 2026-07-22 | CORS wildcard без Authorization (CR5-004) | Wildcard origin несовместим с Authorization по спецификации CORS |
| 2026-07-22 | HOST из env (CR5-010) | Деплой в контейнер не должен требовать изменения кода |
| 2026-07-22 | listCases status: CaseStatus\|CaseStatus[] (CR5-007) | Один проход по Map вместо N вызовов; API не ломается — old callers передают строку |
| 2026-07-22 | _isRunning guard в /api/parse/run (CR5-012) | 409 Conflict предотвращает race condition и двойную нагрузку |
| 2026-07-22 | regex /iu для кириллицы (CR5-005) | Флаг /i без /u не даёт Unicode case-insensitive для кириллицы в V8 |
| 2026-07-22 | captcha retry ≤2 при network error (CR5-006) | Нестабильный интернет на VDS в РФ — одна упавшая fetch убивала сессию |
| 2026-07-22 | legalForceDate.slice(0,10) при записи (CR5-003) | Гарантия YYYY-MM-DD для сравнения в getStats().enforcedToday |
| 2026-07-22 | await sleep перед searchByCaseNumber (CR5-001) | Без паузы два запроса к sudrf.ru в рамках одного processOne шли без rate-limit |
| 2026-07-22 | tmp/rename без fsync — документированный trade-off (CR5-008) | Single-process, объём мал; fsync добавит задержку без практической пользы |
| 2026-07-22 | eslint — tech-debt, не в CR5 (CR5-009) | Добавление eslint — отдельный sprint; type-check через tsc достаточен сейчас |
| 2026-07-22 | structured logging — tech-debt, не в CR5 (CR5-011) | console.log достаточен для v0.x; pino — при появлении prod-мониторинга |

---

## Баги

> **50/50 закрыто.** Открытых замечаний нет.
> Полная история — в BUG_REPORT.md

| ID | Severity | Файл | Описание | Статус |
|----|----------|------|----------|---------|
| BUG-002 | 🔴 | `scheduler/orchestrator.ts` | runNew() сломан для waiting | ✅ FIXED |
| BUG-003 | 🔴 | `api/routes/parse.ts` | magistrate: captcha+CP1251 | ✅ FIXED |
| BUG-004 | 🟠 | `api/routes/cases.ts` | PATCH без whitelist | ✅ FIXED |
| BUG-006 | 🟡 | `store/cases.ts` | deleteCase писал файл если uid нет | ✅ FIXED |
| BUG-007 | 🟡 | `package.json` | Нет engines Node≥20.6 | ✅ FIXED |
| BUG-008 | 🟡 | `api/routes/parse.ts` | parse/run висел до конца | ✅ FIXED |
| BUG-009 | 🟠 | `store/cases.ts` | Нет in-memory cache | ✅ FIXED |
| CR5-001 | 🔴 | `scheduler/orchestrator.ts` | Двойной запрос без rate-delay на decision | ✅ FIXED |
| CR5-002 | 🔴 | `scheduler/orchestrator.ts` | `'deleted' as unknown` — несуществующий статус | ✅ FIXED |
| CR5-003 | 🔴 | `store/cases.ts` | legalForceDate без нормализации YYYY-MM-DD | ✅ FIXED |
| CR5-004 | 🟠 | `api/server.ts` | CORS wildcard + Authorization | ✅ FIXED |
| CR5-005 | 🟠 | `intake/classify.ts` | regex /i без /u на кириллице | ✅ FIXED |
| CR5-006 | 🟠 | `captcha/rucaptcha.ts` | fetch polling без retry при network error | ✅ FIXED |
| CR5-007 | 🟠 | `store/cases.ts` | 3× listCases в runFull | ✅ FIXED |
| CR5-008 | 🟡 | `store/json-store.ts` | tmp/rename без fsync | ✅ DOCUMENTED |
| CR5-009 | 🟡 | `package.json` | lint = type-check, нет eslint | ✅ DOCUMENTED |
| CR5-010 | 🟡 | `api/server.ts` | Hardcoded 127.0.0.1 | ✅ FIXED |
| CR5-011 | 🟡 | `orchestrator.ts` | console.log вместо structured logging | ✅ DOCUMENTED |
| CR5-012 | 🟠 | `api/routes/parse.ts` | Нет guard от параллельных runFull() | ✅ FIXED |

> Закрыты как не воспроизводящиеся: BUG-001, BUG-005.

---

## Журнал работ

| Дата | Коммит | Изменение |
|------|--------|-----------|
| 2026-07-17 | — | Создан репозиторий |
| 2026-07-17 | — | Intake-модуль + 18 тестов |
| 2026-07-21 | `5932ff8` | fix(store): in-memory cache, deleteCase (BUG-006, BUG-009) |
| 2026-07-21 | `219e1ac` | fix(api): PATCH whitelist (BUG-004) |
| 2026-07-21 | `67173ba` | fix(scheduler): runNew, rate limit, static iconv (BUG-002, RATE-001, BUG-011) |
| 2026-07-21 | `89570af` | fix(api): magistrate parse + 202 Accepted (BUG-003, BUG-008) |
| 2026-07-21 | `fd7fa7e` | fix(config): Node engines + .gitattributes (BUG-007, BUG-010) |
| 2026-07-21 | `ebeea53` | docs: CONTEXT.md статусы багов |
| 2026-07-21 | `e8297cb` | test: store, cases route, parse/run, runNew |
| 2026-07-21 | `7d7f989` | chore: supertest + @types/supertest |
| 2026-07-22 | `8dd66b7` | fix(tsc): query param types, getEvents import, mock types |
| 2026-07-22 | `954fa5c` | docs: CODE_REVIEW + BUG_REPORT полное ревью |
| 2026-07-22 | `cb120b2` | fix: NEW-001..011 — scheduler, types, courts, config, classify, api/status, notifications |
| 2026-07-22 | `315488f` | refactor: magistrate searchByCaseNumber делегирует parse-адаптеру |
| 2026-07-22 | `dceaa8d` | feat: viewer dashboard (UC-0) + search.html |
| 2026-07-22 | *(серия)* | fix: CR4-001..008 — CORS, shared fetchHtml, batch updateCase, graceful shutdown, notifications |
| 2026-07-22 | `2c8a767` | docs: add CODE_REVIEW5.md (CR5, 12 замечаний) |
| 2026-07-22 | `ada9ce3` | docs: update BUG_REPORT — открыты CR5-001..012 |
| 2026-07-22 | `849fdb4` | fix: apply CR5-001..012 — rate-delay, type safety, legalForceDate, CORS, regex /iu, captcha retry, listCases multi-status, runFull guard, HOST env |
| 2026-07-22 | *(этот)* | docs: CONTEXT, DECISIONS, CHANGELOG актуализированы по CR5 |

---

## Tech-debt (открытые, не критичные)

| ID | Приоритет | Описание | Заметка |
|----|-----------|----------|---------|
| CR5-008 | LOW | tmp/rename без fsync в json-store | Документированный trade-off; актуально при переходе на prod-сервер |
| CR5-009 | LOW | Нет eslint / @typescript-eslint | Добавить в отдельный sprint; type-check через tsc покрывает большинство случаев |
| CR5-011 | LOW | console.log вместо pino | Добавить при появлении prod-мониторинга или log aggregator |

---

## Следующие шаги

1. **WebSocket / SSE** — push-уведомления в браузер в реальном времени (UC-0 upgrade)
2. **Фильтры и сортировка** — в таблице дел дашборда
3. **eslint + @typescript-eslint** — закрыть CR5-009 (tech-debt)
4. **Structured logging (pino)** — закрыть CR5-011 (tech-debt)
5. **Scheduler cron** — автозапуск `runFull()` по расписанию без ручного `POST /api/parse/run`

---

## Структура проекта

```
courtdesk/
├── packages/
│   ├── core/         — типы, справочник судов, конфиг
│   ├── captcha/      — RuCaptcha client (CR5-006: retry)
│   ├── search/       — адаптеры поиска + shared.ts
│   ├── parse/        — адаптеры парсинга карточек
│   ├── intake/       — classify() (CR5-005: regex /iu)
│   ├── scheduler/    — orchestrator (CR5-001,002,007)
│   ├── store/        — cases, events, notifications (CR5-003,007)
│   ├── api/
│   │   ├── routes/   — 15 эндпоинтов (CR5-012: parse.ts guard)
│   │   └── middleware/
│   └── viewer/       — дашборд + search.html
├── .env.example
├── .gitattributes
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── ARCHITECTURE.md
├── CHANGELOG.md
├── CODE_REVIEW5.md
├── BUG_REPORT.md
├── DECISIONS.md
└── CONTEXT.md
```
