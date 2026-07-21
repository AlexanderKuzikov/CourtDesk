# CourtDesk — CONTEXT

> CRM-система поиска и мониторинга судебных дел РФ.
> Единый сервис для интеграции с 1С и параллельного Web UI.
> Собирается из CourtSniffer (поиск), CourtFlow (мониторинг) и существующего скелета CourtDesk.

---

## Статус

**v0.1.0** — Фаза 4 завершена. Основные баги code review исправлены. Добавлены первые smoke/unit тесты для store, scheduler и API routes.

| Компонент | Статус | Источник |
|-----------|--------|----------|
| Архитектура | ✅ Утверждена | ARCHITECTURE.md |
| API-контракты | ✅ Утверждены | CONTEXT.md |
| Use cases | ✅ Утверждены | CONTEXT.md |
| Core (типы) | ✅ Готово | — |
| Captcha | ✅ Готово | CourtSniffer |
| Search | ✅ Готово | CourtSniffer |
| Parse | ✅ Исправлено (BUG-003, BUG-008) | CourtFlow |
| Intake | ✅ Готово | CourtDesk |
| Scheduler | ✅ Исправлено (BUG-002, RATE-001, BUG-011) | CourtFlow |
| Store | ✅ Исправлено (BUG-006, BUG-009) | CourtFlow |
| API | ✅ Исправлено (BUG-003, BUG-004, BUG-008) | Новый |
| Tests | 🟡 Базовые smoke/unit тесты добавлены | Vitest |
| Viewer | 🟡 Заглушка | CourtSniffer |

---

## Use cases (утверждено)

### UC-0: Дашборд (главный экран)

Пользователь видит первым делом:
- Счётчики: сколько дел в мониторинге, ожидается, вступило сегодня
- Таблица дел с фильтрами (статус, пользователь, суд, поиск)
- Кнопка «Поиск нового дела»

**Статусы дел:**
- ⏳ Ожидается — ищем появление карточки по ответчику
- ▨ В мониторинге — карточка есть, следим за изменениями
- 🔍 Вынесено решение — в карточке появился результат, отслеживаем вступление
- ✅ Вступило — решение вступило в силу

### UC-1: Добавить новое дело (через поиск)

1. Выбрать суд (поиск по названию, подстановка)
2. Ввести номер дела ИЛИ участников (ФИО/название)
3. Тип поиска — автоматически (есть номер → по номеру, нет → по участникам)
4. Дата подачи — опционально (для UC-3)
5. Результат: карточка дела (если один) или список
6. Из карточки — «Следить за делом»

**Важно:** дата вступления в силу — только из поиска по номеру, не из карточки. CourtSniffer это уже умеет.

### UC-2: Следить за делом

1. Из карточки дела → «Следить»
2. Система сохраняет, начинает регулярно парсить
3. Дело на дашборде → ▨

### UC-3: Отслеживать появление дела

1. Суд + участник + дата подачи → «Отслеживать появление»
2. Система периодически ищет по участнику + дате через `searchAdapter.searchByParty`
3. Когда карточка появляется — уведомление + авто-перевод в monitoring

> ✅ **BUG-002 fixed:** `runNew()` больше не вызывает `fetchHtml('')`, waiting-кейсы обрабатываются отдельным путём поиска.

### UC-4: Отслеживание решения и вступления в силу

1. Дело в мониторинге. В карточке появился `result` → 🔍
2. Система запускает поиск по номеру дела (раз в день)
3. Когда `legalForceDate` найдена → ✅ Вступило + уведомление

**Никаких расчётов сроков.** Только факт: вступило / не вступило.

### UC-5: CRM-запросы (1С)

CRM отправляет запросы, получает JSON. Фильтрует данные сама (userId и пр.).

---

## API-контракты (утверждено)

| # | Запрос | Назначение |
|---|--------|-----------|
| 1 | `GET /api/status` | Счётчики для дашборда + здоровье |
| 2 | `GET /api/cases` | Список дел (фильтры: status, userId, courtId, q) |
| 3 | `GET /api/cases/:uid` | Карточка дела + история изменений |
| 4 | `POST /api/cases` | Добавить дело в мониторинг |
| 5 | `PATCH /api/cases/:uid` | Обновить разрешённые поля |
| 6 | `DELETE /api/cases/:uid` | Удалить из мониторинга |
| 7 | `POST /api/cases/wait` | Отслеживать появление дела |
| 8 | **`POST /api/resolve`** | Суд + номер → ссылка на карточку |
| 9 | `POST /api/search/by-number` | Поиск по номеру (с `legalForceDate`) |
| 10 | `POST /api/search/by-party` | Поиск по участникам |
| 11 | `POST /api/parse/url` | Распарсить URL карточки |
| 12 | `GET /api/courts?q=` | Поиск судов по названию |
| 13 | `GET /api/courts/:id` | Инфо о суде |
| 14 | `GET /api/notifications` | Уведомления |
| 15 | `POST /api/parse/run` | Асинхронный запуск парсинга (`202 Accepted`) |

**Формат ответа:**
```json
{ "success": true, "data": ... }
{ "success": false, "error": "текст", "code": "ERROR_CODE" }
```

**Особенности:**
- Авторизации нет (локальная сеть)
- userId — просто поле, CRM фильтрует сама
- URL карточки — полный (с case_id), возвращается из `/api/resolve`
- Несколько результатов поиска — возвращаются массивом, CRM выбирает сама
- `PATCH /api/cases/:uid` принимает только whitelist полей
- `POST /api/parse/run` сразу отвечает `202 Accepted`, реальная работа идёт в фоне

---

## Решения (зафиксированы)

| Дата | Решение | Обоснование |
|------|---------|-------------|
| 2026-07-21 | Единый проект (не микросервисы) | Одна кодовая база, один деплой, нет накладных расходов |
| 2026-07-21 | Один package.json, не workspaces | Все пакеты в одном процессе, npm install один раз |
| 2026-07-21 | JSON-хранилище (не SQL) | Объём < 10 000 дел, tmp+rename достаточно |
| 2026-07-21 | REST API (не GraphQL) | 1С умеет REST, 15 эндпоинтов — не GraphQL-задача |
| 2026-07-21 | API и UI — один Express-процесс | Экономия портов, нет CORS при разработке |
| 2026-07-21 | Search ≠ Parse (разные адаптеры) | Поиск и парсинг карточки — разные URL и логика |
| 2026-07-21 | Store — singleton in-memory cache | `cases.json` и `events.json` читаются один раз в runtime, запись — только при изменении |
| 2026-07-21 | Scheduler rate limit | Между запросами к sudrf/msudrf нужен delay ~1.5 сек |
| 2026-07-21 | PATCH whitelist | Через REST нельзя менять `uid`, `createdAt`, `courtId`, `courtType` и служебные поля |
| 2026-07-21 | Linux-server / Windows-clients | В репозитории фиксируем LF через `.gitattributes`; Windows-пользователи работают через обычный Git checkout |
| 2026-07-21 | Тесты без реального I/O и сети | Store, scheduler и route-smoke тестируются через mocks, чтобы локально гонялись быстро и стабильно |

---

## Известные баги (актуальные)

| ID | Severity | Файл | Описание | Статус |
|----|----------|------|----------|---------|
| BUG-002 | 🔴 CRITICAL | `scheduler/orchestrator.ts` | `runNew()` был сломан для waiting-кейсов | FIXED |
| BUG-003 | 🔴 CRITICAL | `api/routes/parse.ts` | magistrate: captcha + CP1251 | FIXED |
| BUG-004 | 🟠 HIGH | `api/routes/cases.ts` | PATCH без whitelist | FIXED |
| BUG-009 | 🟠 HIGH | `store/cases.ts` + `store/events.ts` | Нет in-memory cache | FIXED |
| BUG-006 | 🟡 MEDIUM | `store/cases.ts` | `deleteCase` писал файл даже если uid не существовал | FIXED |
| BUG-007 | 🟡 MEDIUM | `package.json` | Нет `engines` для Node ≥ 20.6 | FIXED |
| BUG-008 | 🟡 MEDIUM | `api/routes/parse.ts` | `POST /api/parse/run` висел до конца прогона | FIXED |
| BUG-010 | 🟢 LOW | `.gitattributes` | Не были зафиксированы LF для Linux-сервера | FIXED |
| BUG-011 | 🟢 LOW | `scheduler/orchestrator.ts` | Dynamic import `iconv-lite` в hot path | FIXED |
| RATE-001 | 🟠 HIGH | `scheduler/orchestrator.ts` | Нет rate limit между запросами | FIXED |

> **Закрыты как не воспроизводящиеся:** BUG-001, BUG-005.

---

## Журнал работ

| Дата | Коммит | Изменение |
|------|--------|-----------|
| 2026-07-17 | — | Создан репозиторий CourtDesk |
| 2026-07-17 | — | Intake-модуль (классификатор) |
| 2026-07-17 | — | 18 unit-тестов Intake |
| 2026-07-21 | `5932ff8` | **fix(store)** — in-memory cache для cases/events, fix deleteCase |
| 2026-07-21 | `219e1ac` | **fix(api)** — PATCH whitelist |
| 2026-07-21 | `67173ba` | **fix(scheduler)** — runNew, rate limit, static iconv |
| 2026-07-21 | `89570af` | **fix(api)** — magistrate parse + `202 Accepted` |
| 2026-07-21 | `fd7fa7e` | **fix(config)** — Node engines + `.gitattributes` |
| 2026-07-21 | `ebeea53` | **docs** — CONTEXT.md: статусы багов обновлены до FIXED |
| 2026-07-21 | `e8297cb` | **test** — store, cases route, parse/run, runNew smoke/unit tests |
| 2026-07-21 | `7d7f989` | **chore** — `supertest` + `@types/supertest` для route tests |
| 2026-07-21 | *(текущий)* | **docs** — CONTEXT.md обновлён: тестовое покрытие и новые коммиты |

---

## Следующие шаги (приоритет)

1. Прогнать `npm install && npm test && npm run lint` на Linux-окружении
2. Добавить отдельный smoke-тест для `POST /api/parse/url` magistrate path с mock `fetchMagistrateHtml`
3. Добавить endpoint/стейт для фонового scheduler-run (`idle/running/lastResult`)
4. Сделать viewer для списка дел и статусов
5. При необходимости — вынести background-run из Express в отдельный worker

---

## Структура проекта (актуальная)

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
│   └── viewer/
├── .env.example
├── .gitattributes
├── package.json
├── tsconfig.json
├── ARCHITECTURE.md
├── CODE_REVIEW.md
└── BUG_REPORT.md
```
