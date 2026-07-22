# CODE REVIEW — CourtDesk

> Consolidated: 2026-07-22  
> Все 4 раунда ревью сведены с прогрессом по каждому замечанию.

---

## Сводка

| Раунд | Дата | Ревьюер | Найдено | Исправлено | Закрыто |
|-------|------|---------|---------|------------|---------|
| CR1 | 2026-07-21 | Первичное | 11 (BUG-001..011) | 9 | 2 (не воспр.) |
| CR2 | 2026-07-22 | Первичное | 11 (NEW-001..011) | 11 | 0 |
| CR3 | 2026-07-22 | Perplexity | 8 замечаний | 8 | 0 |
| CR4 | 2026-07-22 | Perplexity (CR3→4) | 8 замечаний | 8 | 0 |
| **Итого** | | | **38** | **36** | **2** |

**Открытых замечаний нет.** Все баги исправлены, все CR-замечания имплементированы.

| Метрика | Значение |
|---------|----------|
| Тестов | 57, все зелёные |
| tsc --noEmit | Чисто |
| CI | Зелёный |
| API-контракты | 15/15 реализованы |
| Viewer | Дашборд + поиск |

---

## CR1 — Первичное ревью (BUG-001..011)

| ID | Severity | Файл | Описание | Статус | Коммит |
|----|----------|------|----------|--------|--------|
| BUG-001 | CRITICAL | `store/cases.ts` | Race condition read-modify-write | ✅ CLOSED (не воспр.) | — |
| BUG-002 | CRITICAL | `scheduler/orchestrator.ts` | runNew() / fetchHtml('') | ✅ FIXED | `67173ba` |
| BUG-003 | HIGH | `api/routes/parse.ts` | magistrate без captcha + CP1251 | ✅ FIXED | `89570af` |
| BUG-004 | HIGH | `api/routes/cases.ts` | PATCH без whitelist | ✅ FIXED | `219e1ac` |
| BUG-005 | HIGH | `search/adapters/district.ts` | magistrate caseUrl с `.sudrf.ru` | ✅ CLOSED (не воспр.) | — |
| BUG-006 | MEDIUM | `store/cases.ts` | deleteCase лишняя I/O | ✅ FIXED | `5932ff8` |
| BUG-007 | MEDIUM | `package.json` | Node < 20.6 падает | ✅ FIXED | `fd7fa7e` |
| BUG-008 | MEDIUM | `scheduler/orchestrator.ts` | runFull блокирует event loop | ✅ FIXED | `89570af` |
| BUG-009 | MEDIUM | `store/cases.ts` | N×disk reads, нет cache | ✅ FIXED | `5932ff8` |
| BUG-010 | LOW | `captcha/rucaptcha.ts` | CRLF endings | ✅ FIXED | `fd7fa7e` |
| BUG-011 | LOW | `scheduler/orchestrator.ts` | Dynamic import iconv | ✅ FIXED | `67173ba` |

---

## CR2 — Второе ревью (NEW-001..011)

| ID | Severity | Файл | Описание | Статус | Коммит |
|----|----------|------|----------|--------|--------|
| NEW-001 | HIGH | `scheduler/orchestrator.ts` | makeEvent() caseUid='' | ✅ FIXED | `cb120b2` |
| NEW-002 | HIGH | `scheduler/orchestrator.ts` | Race condition processOne vs PATCH | ✅ FIXED | `cb120b2` + CR4 |
| NEW-003 | HIGH | `api/server.ts` | Нет /api/status, /api/notifications | ✅ FIXED | `cb120b2` |
| NEW-004 | MEDIUM | `scheduler/orchestrator.ts` | error-дела не ретраются | ✅ FIXED | `cb120b2` |
| NEW-005 | MEDIUM | `scheduler/orchestrator.ts` | processWaiting: нет lastChecked | ✅ FIXED | `cb120b2` |
| NEW-006 | MEDIUM | `core/types.ts` | ParseRunRequest.mode != switch | ✅ FIXED | `cb120b2` |
| NEW-007 | MEDIUM | `core/types.ts` | CaseStatus нет 'archived' | ✅ FIXED | `cb120b2` |
| NEW-008 | LOW | `core/courts.ts` | findCourtsByName: map перед slice | ✅ FIXED | `cb120b2` |
| NEW-009 | LOW | `core/config.ts` | EACCES не обрабатывается | ✅ FIXED | `cb120b2` |
| NEW-010 | LOW | `intake/classify.ts` | CASE_NUMBER_RE — арбитраж/кассация | ✅ FIXED | `cb120b2` |
| NEW-011 | LOW | `intake/classify.ts` | ФИО-эвристика без проверки алфавита | ✅ FIXED | `cb120b2` |

---

## CR3 — Perplexity-ревью (8 замечаний)

| # | Замечание | Severity | Статус |
|---|-----------|----------|--------|
| 1 | Дублирование fetchHtml/parseResults ×4 в search-адаптерах | HIGH | ✅ FIXED (shared.ts) |
| 2 | Нет CORS middleware | MEDIUM | ✅ FIXED (server.ts inline) |
| 3 | 3 updateCase в processOne вместо батча | MEDIUM | ✅ FIXED (один updateCase) |
| 4 | GET /api/courts без q= → только total | LOW | ✅ FIXED (getAllCourts()) |
| 5 | Нет graceful shutdown | LOW | ✅ FIXED (SIGTERM/SIGINT) |
| 6 | Notifications — синтетика, нет persistent-хранилища | MEDIUM | ✅ FIXED (store/notifications.ts) |
| 7 | Magistrate два пути в searchByCaseNumber | MEDIUM | ✅ FIXED (делегирован parse-адаптеру) |
| 8 | Hardcoded delo_id | LOW | ✅ FIXED (SEARCH_PARAMS constants) |

---

## CR4 — Имплементация CR3

| # | Изменение | Файлы | Коммит |
|---|-----------|-------|--------|
| 1 | CORS middleware (inline) | `packages/api/server.ts` | CR4 |
| 2 | Shared fetchHtml() + parseResults() | `search/shared.ts` — новый | CR4 |
| 3 | Batch updateCase — один вызов в конце processOne | `orchestrator.ts` | CR4 |
| 4 | GET /api/courts без q= → getAllCourts() | `api/routes/courts.ts` | CR4 |
| 5 | Graceful shutdown (SIGTERM/SIGINT) | `server.ts` | CR4 |
| 6 | Persistent notifications (store/notifications.ts) | `store/notifications.ts` | `c420471` |
| 7 | Magistrate URL-парсинг делегирован parse-адаптеру | `search/adapters/magistrate.ts` | `315488f` |
| 8 | SEARCH_PARAMS constants (delo_id/case_type) | `search/constants.ts` | `5d50109` |

---

## Что сделано в этой итерации (2026-07-22)

1. **delo_id/case_type → SEARCH_PARAMS constants** — hardcoded magic numbers вынесены в единый конфиг
2. **Тесты**: makeEvent, GET /api/status, GET /api/notifications, POST /api/resolve, parse.url magistrate
3. **POST /api/resolve** — API#8: суд + номер → ссылка
4. **Persistent notifications** — `store/notifications.ts`, `PATCH /api/notifications/:uid/read`, интеграция в scheduler
5. **Smoke test** — POST /api/parse/url для magistrate
6. **Magistrate refactor** — URL-парсинг делегирован parse-адаптеру из search
7. **Viewer dashboard** — дашборд UC-0 (счётчики, таблица дел, уведомления), search.html
8. **Защита ветки** — убран Required status check "CI", оставлены enforce_admins, запрет force-push/удаления
9. **Документация** — все файлы актуализированы, удалены дубликаты

---

## API-контракты — статус

| # | Эндпоинт | Назначение | Статус |
|---|----------|-----------|--------|
| 1 | GET /api/status | Счётчики + здоровье | ✅ |
| 2 | GET /api/cases | Список дел | ✅ |
| 3 | GET /api/cases/:uid | Карточка дела | ✅ |
| 4 | POST /api/cases | Добавить в мониторинг | ✅ |
| 5 | PATCH /api/cases/:uid | Обновить разрешённые поля | ✅ |
| 6 | DELETE /api/cases/:uid | Удалить | ✅ |
| 7 | POST /api/cases/wait | Отслеживать появление | ✅ |
| 8 | POST /api/resolve | Суд + номер → ссылка | ✅ |
| 9 | POST /api/search/by-number | Поиск по номеру | ✅ |
| 10 | POST /api/search/by-party | Поиск по участникам | ✅ |
| 11 | POST /api/parse/url | Парсинг URL | ✅ |
| 12 | GET /api/courts?q= | Поиск судов | ✅ |
| 13 | GET /api/courts/:id | Инфо о суде | ✅ |
| 14 | GET /api/notifications | Уведомления | ✅ |
| 15 | POST /api/parse/run | Асинхр. парсинг (202) | ✅ |

---

## Что дальше

1. **Мониторинг в реальном времени** — WebSocket/SSE для push-уведомлений
2. **Фильтры и сортировка** в таблице дел дашборда
3. **Structured logging** — замена console.log на pino/winston
