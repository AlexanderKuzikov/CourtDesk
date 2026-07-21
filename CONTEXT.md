# CourtDesk — CONTEXT

> CRM-система поиска и мониторинга судебных дел РФ.
> Единый сервис для интеграции с 1С и параллельного Web UI.
> Собирается из CourtSniffer (поиск), CourtFlow (мониторинг) и существующего скелета CourtDesk.

---

## Статус

**v0.1.0** — Фаза 4 завершена. Code Review проведён, отзыв владельца получен. Баги уточнены. Начат этап фиксов.

| Компонент | Статус | Источник |
|-----------|--------|----------|
| Архитектура | ✅ Утверждена | ARCHITECTURE.md |
| API-контракты | ✅ Утверждены | CONTEXT.md |
| Use cases | ✅ Утверждены | CONTEXT.md |
| Core (типы) | ✅ Готово | — |
| Captcha | ✅ Готово | CourtSniffer |
| Search | ✅ Готово | CourtSniffer |
| Parse | ✅ Готово | CourtFlow |
| Intake | ✅ Готово | CourtDesk |
| Scheduler | ⚠️ Баги (BUG-002, BUG-008) | CourtFlow |
| Store | ⚠️ Баги (BUG-006, BUG-009) | CourtFlow |
| API | ⚠️ Баги (BUG-003, BUG-004) | Новый |
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
2. Система периодически ищет по участнику + дате
3. Когда карточка появляется — уведомление + авто-добавление в мониторинг

> ⚠️ **BUG-002:** `runNew()` вызывает `fetchHtml('')` — waiting-кейс необрабатывается. Требует переработки через `searchAdapter.searchByParty`.

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
| 5 | `PATCH /api/cases/:uid` | Обновить статус/заметку |
| 6 | `DELETE /api/cases/:uid` | Удалить из мониторинга |
| 7 | `POST /api/cases/wait` | Отслеживать появление дела |
| 8 | **`POST /api/resolve`** | Суд + номер → ссылка на карточку |
| 9 | `POST /api/search/by-number` | Поиск по номеру (с `legalForceDate`) |
| 10 | `POST /api/search/by-party` | Поиск по участникам |
| 11 | `POST /api/parse/url` | Распарсить URL карточки |
| 12 | `GET /api/courts?q=` | Поиск судов по названию |
| 13 | `GET /api/courts/:id` | Инфо о суде |
| 14 | `GET /api/notifications` | Уведомления |
| 15 | `POST /api/parse/run` | Запуск парсинга (full/new/retry) |

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

---

## Решения (зафиксированы)

| Дата | Решение | Обоснование |
|------|---------|-------------|
| 2026-07-21 | Единый проект (не микросервисы) | Одна кодовая база, один деплой, нет накладных расходов |
| 2026-07-21 | Один package.json, не workspaces | Все пакеты в одном процессе, npm install один раз |
| 2026-07-21 | JSON-хранилище (не SQL) | Объём < 10 000 дел, tmp+rename достаточно |
| 2026-07-21 | REST API (не GraphQL) | 1С умеет REST, 15 эндпоинтов — не GraphQL-задача |
| 2026-07-21 | API и UI — один Express-процесс | Экономия портов, нет CORS при разработке |
| 2026-07-21 | Search ≠ Parse (разные адаптеры) | Поиск (name_op=r) и парсинг карточки (name_op=case) — разные URL и парсинг |
| 2026-07-21 | Core — единый источник типов | CourtType, SearchResult, CaseCard — в одном месте |
| 2026-07-21 | Intake — один `classify` | Весь разбор внутри, остальные модули не занимаются классификацией |
| 2026-07-21 | Дата вступления — только из поиска | В карточке дела этой даты нет. CourtSniffer уже умеет |
| 2026-07-21 | Нет расчёта сроков | Слишком много нюансов. Только факт вступления |
| 2026-07-21 | userId — просто поле | CRM фильтрует сама, объёмы мизерные |
| 2026-07-21 | Нет авторизации | Локальная сеть |
| 2026-07-21 | CourtSniffer, CourtFlow — заморозить | Функционал мигрирует в CourtDesk |
| 2026-07-21 | BUG-001 (рейс-кондишн) — не воспроизводится | Все store-операции sync (readFileSync/writeFileSync). Node.js однопоточный — между load() и save() нет await, значит callback не вклинится. Проблема появится только если добавить async между load и save. |
| 2026-07-21 | BUG-005 (magistrate caseUrl) — не воспроизводится | Magistrate использует magistrate.ts-адаптер со своей логикой сборки URL. District-адаптер не вызывается для magistrate-судов при правильной диспетчеризации. |
| 2026-07-21 | BUG-008 (блокировка event loop) — UX, не reliability | runFull висит в HTTP-ответе. Фикс: 202 Accepted + background. Было заложено с самого начала. |
| 2026-07-21 | BUG-010 (CRLF) — отложено | Windows-среда разработки. Добавить .gitattributes при переходе на Linux/CI. |
| 2026-07-21 | Rate limit для scheduler | Из отзыва владельца: scheduler гоняет runFull без интервалов — риск блокировки IP судрф. Требует delay 1–2 сек между запросами. |
| 2026-07-21 | store/events.ts — in-memory cache | Аналогично BUG-009: addEvent читает полный events.json на каждый вызов. Фиксить вместе с BUG-009. |
| 2026-07-21 | PATCH whitelist | BUG-004: без whitelist — data tamper возможен |

---

## Известные баги (актуальные)

| ID | Severity | Файл | Описание | Статус |
|----|----------|------|----------|---------|
| BUG-002 | 🔴 CRITICAL | `scheduler/orchestrator.ts` | `runNew()` вызывает `fetchHtml('')` — waiting-кейс никогда не обрабатывается | OPEN |
| BUG-003 | 🔴 CRITICAL | `api/routes/parse.ts` | magistrate: нет captcha + CP1251 не декодируется — 7751 судов не работает | OPEN |
| BUG-004 | 🟠 HIGH | `api/routes/cases.ts` | PATCH без whitelist — можно перезаписать uid/createdAt/status | OPEN |
| BUG-009 | 🟠 HIGH | `store/cases.ts` + `store/events.ts` | Нет in-memory cache — N×readFileSync на каждый запрос; events.json — аналогично | OPEN |
| BUG-006 | 🟡 MEDIUM | `store/cases.ts` | `deleteCase` пишет файл даже если uid не существовал | OPEN |
| BUG-007 | 🟡 MEDIUM | `core/config.ts` | `process.loadEnvFile` требует Node ≥ 20.6, нет `engines` в package.json | OPEN |
| BUG-008 | 🟡 MEDIUM | `scheduler/orchestrator.ts` | `POST /api/parse/run` висит до окончания прогона — UX проблема, фикс: 202 Accepted | OPEN |
| BUG-010 | 🟢 LOW | `captcha/rucaptcha.ts` | CRLF endings, нет `.gitattributes` | OPEN |
| BUG-011 | 🟢 LOW | `scheduler/orchestrator.ts` | Dynamic import `iconv-lite` в hot path | OPEN |
| RATE-001 | 🟠 HIGH | `scheduler/orchestrator.ts` | Нет rate limit между запросами — риск блокировки IP судрф | OPEN |

> **Закрыты ревьюером как не воспроизводящиеся:** BUG-001 (race condition — store sync, Node single-thread), BUG-005 (magistrate.ts своя URL-логика).

---

## Журнал работ

| Дата | Коммит | Изменение |
|------|--------|-----------|
| 2026-07-17 | — | Создан репозиторий CourtDesk |
| 2026-07-17 | — | Intake-модуль (классификатор) |
| 2026-07-17 | — | 18 unit-тестов Intake |
| 2026-07-21 | — | Архитектура пересмотрена: CourtDesk — единый сервис, вбирает Sniffer + Flow |
| 2026-07-21 | — | Утверждены use cases, API-контракты |
| 2026-07-21 | — | Старые проекты (Sniffer, Flow) — архив |
| 2026-07-21 | `9cc099c` | **Фаза 1: core + captcha** |
| 2026-07-21 | `447d560` | **Фаза 2: search + parse + intake** |
| 2026-07-21 | `746b46d` | **Фаза 3: store + scheduler** |
| 2026-07-21 | `a2f1829` | **Фаза 4: API + Viewer** — 15 эндпоинтов, Express, Web UI |
| 2026-07-21 | `eceddc8` | **CODE_REVIEW.md** — полный разбор всех пакетов |
| 2026-07-21 | `8062dbe` | **BUG_REPORT.md** — 11 багов |
| 2026-07-21 | `ec8e50b` | **CONTEXT.md** — обновлён: статусы, баги, решения |
| 2026-07-21 | *(текущий)* | **CONTEXT.md** — отзыв владельца зафиксирован: пересмотр багов, новые замечания (RATE-001, events cache) |

---

## Следующие шаги (приоритет)

1. **BUG-002** — `runNew()`: заменить `fetchHtml` на `searchAdapter.searchByParty` с данными из `WatchedCase`
2. **BUG-003** — `parse/url`: детекция magistrate → `fetchMagistrateHtml` + iconv
3. **BUG-004** — `PATCH`: whitelist полей
4. **BUG-009** — store/cases + store/events: singleton in-memory Map + инвалидация при save
5. **RATE-001** — scheduler: delay 1–2 сек между `processOne`
6. **BUG-008** — `POST /api/parse/run`: 202 Accepted + background
7. **BUG-007** — `engines` в `package.json`
8. Viewer: наполнить `packages/viewer/public/`

---

## Структура проекта (актуальная)

```
courtdesk/
├── packages/
│   ├── core/        # Типы, справочник судов, encoding, config
│   ├── captcha/     # Puppeteer + RuCaptcha
│   ├── search/      # Поиск (из Sniffer)
│   ├── parse/       # Парсинг карточек (из Flow)
│   ├── intake/      # Классификатор
│   ├── scheduler/   # Мониторинг по расписанию
│   ├── store/       # JSON-хранилище
│   ├── api/         # Express API
│   └── viewer/      # Web UI
├── .env.example
├── package.json
├── tsconfig.json
├── ARCHITECTURE.md
├── CODE_REVIEW.md
└── BUG_REPORT.md
```

---

## Источники кода

| Модуль | Откуда берём |
|--------|-------------|
| core/encoding.ts | CourtSniffer |
| core/courts.ts | CourtSniffer (unified-courts.json) |
| core/config.ts | CourtSniffer (упрощённый, .env) |
| core/types.ts | Собираем из всех трёх проектов |
| captcha/ | CourtSniffer (более новый/чистый) |
| search/adapters | CourtSniffer |
| parse/adapters | CourtFlow |
| intake/ | CourtDesk (уже есть) |
| scheduler/ | CourtFlow (orchestrator) |
| store/ | CourtFlow (exporter) |
| api/ | Новый (общее из Sniffer viewer + Desk api) |
| viewer/ | Новый (идея из Sniffer viewer) |
