# CourtDesk — CONTEXT
> CRM-система поиска и мониторинга судебных дел РФ.
> Единый сервис для интеграции с 1С и параллельного Web UI.
> Собирается из CourtSniffer (поиск), CourtFlow (мониторинг) и существующего скелета CourtDesk.

---

## Статус

**v0.2.0** — Фаза 4 завершена. Code Review 2026-07-22 применён. CI зелёный, tsc чист.

| Компонент | Статус | Источник |
|-----------|--------|----------|
| Архитектура | ✅ Утверждена | ARCHITECTURE.md |
| API-контракты | ✅ Утверждены | CONTEXT.md |
| Use cases | ✅ Утверждены | CONTEXT.md |
| Core (типы) | ✅ Готово — NEW-006, NEW-007 исправлены | — |
| Captcha | ✅ Готово | CourtSniffer |
| Search | ✅ Готово | CourtSniffer |
| Parse | ✅ Исправлено (BUG-003, BUG-008) | CourtFlow |
| Intake | ✅ Исправлено (NEW-010, NEW-011) | CourtDesk |
| Scheduler | ✅ Исправлено (NEW-001..005, BUG-002, RATE-001) | CourtFlow |
| Store | ✅ Исправлено (BUG-006, BUG-009) | CourtFlow |
| API | ✅ Исправлено (NEW-003, BUG-003, BUG-004, BUG-008) | Новый |
| server.ts | ✅ createApp() + statusRouter + notificationsRouter | packages/api/server.ts |
| Tests | ✅ Базовые unit тесты, typecheck-ошибки исправлены | Vitest |
| tsconfig | ✅ moduleResolution: Node16 | tsconfig.json |
| vitest.config | ✅ pool: forks, environment: node | vitest.config.ts |
| CI | ✅ tsc --noEmit, 42 тестов проходят | .github/workflows/ci.yml |
| Viewer | 🟡 Заглушка | CourtSniffer |

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
### UC-5: CRM-запросы (1С)

---

## API-контракты (утверждено)

| # | Запрос | Назначение | Статус |
|---|--------|-----------|--------|
| 1 | `GET /api/status` | Счётчики + здоровье | ✅ реализован |
| 2 | `GET /api/cases` | Список дел | ✅ реализован |
| 3 | `GET /api/cases/:uid` | Карточка дела | ✅ реализован |
| 4 | `POST /api/cases` | Добавить в мониторинг | ✅ реализован |
| 5 | `PATCH /api/cases/:uid` | Обновить разрешённые поля | ✅ реализован |
| 6 | `DELETE /api/cases/:uid` | Удалить | ✅ реализован |
| 7 | `POST /api/cases/wait` | Отслеживать появление | ✅ реализован |
| 8 | `POST /api/resolve` | Суд + номер → ссылка | 🟡 не реализован |
| 9 | `POST /api/search/by-number` | Поиск по номеру | ✅ реализован |
| 10 | `POST /api/search/by-party` | Поиск по участникам | ✅ реализован |
| 11 | `POST /api/parse/url` | Парсинг URL | ✅ реализован |
| 12 | `GET /api/courts?q=` | Поиск судов | ✅ реализован |
| 13 | `GET /api/courts/:id` | Инфо о суде | ✅ реализован |
| 14 | `GET /api/notifications` | Уведомления | ✅ реализован |
| 15 | `POST /api/parse/run` | Асинх парсинг (202 Accepted) | ✅ реализован |

---

## Решения

| Дата | Решение | Обоснование |
|------|---------|-------------|
| 2026-07-21 | Единый проект | Одна кодовая база, один деплой |
| 2026-07-21 | Один package.json | Все пакеты в одном процессе |
| 2026-07-21 | JSON-хранилище | Объём < 10 000 дел |
| 2026-07-21 | REST API | 1С умеет REST |
| 2026-07-21 | API+UI один процесс | Нет CORS |
| 2026-07-21 | Search ≠ Parse | Разные URL и логика |
| 2026-07-21 | In-memory cache | Один readFileSync при старте |
| 2026-07-21 | Rate limit | delay ~1.5 сек между запросами |
| 2026-07-21 | PATCH whitelist | Нельзя менять uid, createdAt, courtId, courtType |
| 2026-07-21 | LF через .gitattributes | Linux-сервер / Windows-клиенты |
| 2026-07-21 | Тесты через mocks | Без реального I/O и сети |
| 2026-07-22 | moduleResolution: Node16 | bundler предназначен для Vite/esbuild |
| 2026-07-22 | vitest pool: forks | Чистый module registry per-test |
| 2026-07-22 | createApp() отдельно | Импорт app в тестах без HTTP сервера |
| 2026-07-22 | CI actions @v4 | v5 не существует |
| 2026-07-22 | error-дела в runFull/runRetry | После ошибки дело должно повторяться автоматически |
| 2026-07-22 | getCase() перед каждым updateCase в processOne | Защита от race condition с PATCH API |
| 2026-07-22 | CaseStatus += 'archived' | Пользователь должен иметь возможность архивировать дело |
| 2026-07-22 | ParseRunRequest.mode: 'retry' | Синхронизация типов с реальным switch |

---

## Баги

| ID | Severity | Файл | Описание | Статус |
|----|----------|------|----------|---------|
| BUG-002 | 🔴 | `scheduler/orchestrator.ts` | runNew() сломан для waiting | ✅ FIXED |
| BUG-003 | 🔴 | `api/routes/parse.ts` | magistrate: captcha+CP1251 | ✅ FIXED |
| BUG-004 | 🟠 | `api/routes/cases.ts` | PATCH без whitelist | ✅ FIXED |
| BUG-006 | 🟡 | `store/cases.ts` | deleteCase писал файл если uid нет | ✅ FIXED |
| BUG-007 | 🟡 | `package.json` | Нет engines Node≥20.6 | ✅ FIXED |
| BUG-008 | 🟡 | `api/routes/parse.ts` | parse/run висел до конца | ✅ FIXED |
| BUG-009 | 🟠 | `store/cases.ts` | Нет in-memory cache | ✅ FIXED |
| BUG-010 | 🟢 | `.gitattributes` | Нет LF для Linux | ✅ FIXED |
| BUG-011 | 🟢 | `scheduler/orchestrator.ts` | Dynamic import iconv | ✅ FIXED |
| INFRA-001 | 🔴 | `tsconfig.json` | moduleResolution bundler ломал tsc | ✅ FIXED 2026-07-22 |
| INFRA-002 | 🔴 | `.github/workflows/ci.yml` | checkout@v5 не существует | ✅ FIXED 2026-07-22 |
| INFRA-003 | 🟠 | — | vitest.config.ts отсутствовал | ✅ FIXED 2026-07-22 |
| INFRA-004 | 🟡 | `packages/api/server.ts` | listen() на верхнем уровне | ✅ FIXED 2026-07-22 |
| RATE-001 | 🟠 | `scheduler/orchestrator.ts` | Нет rate limit | ✅ FIXED |
| NEW-001 | 🔴 | `scheduler/orchestrator.ts` | makeEvent() caseUid='' | ✅ FIXED 2026-07-22 |
| NEW-002 | 🔴 | `scheduler/orchestrator.ts` | Race condition processOne vs PATCH | ✅ FIXED 2026-07-22 |
| NEW-003 | 🔴 | `api/server.ts` | /api/status, /api/notifications не реализованы | ✅ FIXED 2026-07-22 |
| NEW-004 | 🟠 | `scheduler/orchestrator.ts` | error-дела не ретраются в runFull/runRetry | ✅ FIXED 2026-07-22 |
| NEW-005 | 🟠 | `scheduler/orchestrator.ts` | processWaiting: нет lastChecked при !party | ✅ FIXED 2026-07-22 |
| NEW-006 | 🟠 | `core/types.ts` | ParseRunRequest.mode != switch | ✅ FIXED 2026-07-22 |
| NEW-007 | 🟠 | `core/types.ts` | CaseStatus нет 'archived' | ✅ FIXED 2026-07-22 |
| NEW-008 | 🟡 | `core/courts.ts` | findCourtsByName: map перед slice | ✅ FIXED 2026-07-22 |
| NEW-009 | 🟡 | `core/config.ts` | EACCES не обрабатывался | ✅ FIXED 2026-07-22 |
| NEW-010 | 🟡 | `intake/classify.ts` | CASE_NUMBER_RE: арбитраж/кассация | ✅ FIXED 2026-07-22 |
| NEW-011 | 🟡 | `intake/classify.ts` | ФИО-эвристика без проверки алфавита | ✅ FIXED 2026-07-22 |

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
| 2026-07-22 | `954fa5c` | docs: CODE_REVIEW + BUG_REPORT полное ревью по реальному коду |
| 2026-07-22 | *(текущий)* | fix: NEW-001..011 — scheduler, types, courts, config, classify, api/status, api/notifications |
| 2026-07-22 | `(этот)` | fix: tsc errors — req.params, mock types, vi.clearAllMocks; CI зелёный |

---

## Следующие шаги

1. **Обновить тесты** — добавить покрытие для `makeEvent(caseUid, ...)`, `GET /api/status`, `GET /api/notifications`
2. Реализовать `POST /api/resolve` (суд + номер → ссылка)
3. Добавить smoke-тест для `POST /api/parse/url` magistrate
4. Добавить persistent хранилище уведомлений (`store/notifications.ts`)
5. Viewer — список дел и статусы (дашборд UC-0)

---

## Структура проекта

```
courtdesk/
├── packages/
│   ├── core/
│   ├── captcha/
│   ├── search/
│   ├── parse/
│   ├── intake/
│   ├── scheduler/
│   ├── store/
│   ├── api/
│   │   └── routes/
│   │       ├── status.ts        ← NEW
│   │       └── notifications.ts ← NEW
│   └── viewer/
├── .env.example
├── .gitattributes
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── ARCHITECTURE.md
├── CHANGELOG.md
├── CODE_REVIEW.md
├── BUG_REPORT.md
├── DECISIONS.md
└── CONTEXT.md
```
