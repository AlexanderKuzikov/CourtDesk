# CourtDesk — CONTEXT
> CRM-система поиска и мониторинга судебных дел РФ.
> Единый сервис для интеграции с 1С и параллельного Web UI.
> Собирается из CourtSniffer (поиск), CourtFlow (мониторинг) и существующего скелета CourtDesk.

---

## Статус

**v0.5.0** — msudrf AJAX overhaul, UI polish (courtName, КАПС→капс, прогресс-бар, настройки), infra (eslint, pino, cron), party matching, error counters, sync parse, TUI (blessed). Node engine ≥22. 4 tech-debt закрыто.

| Компонент | Статус | Последнее изменение |
|-----------|--------|---------------------|
| Архитектура | ✅ Утверждена | ARCHITECTURE.md |
| API-контракты | ✅ Утверждены (22 эндпоинта) | CONTEXT.md |
| Core (типы) | ✅ errorCount, lastError, ScanProgress | 2026-07-26 |
| Security (URL allowlist) | ✅ assertCourtUrl | CR6-002 |
| Store integrity | ✅ corrupt backup + throw | CR6-001 |
| Captcha | ✅ msudrf AJAX + sudrf form | 2026-07-26 |
| Search | ✅ msudrf полностью переписан (AJAX) | 2026-07-26 |
| Parse | ✅ Синхронный парсинг при добавлении | 2026-07-26 |
| Intake | ✅ Исправлено | CR5-005 |
| Scheduler | ✅ Cron-планировщик + прогресс | 2026-07-26 |
| Store | ✅ Каскадное удаление + settings | CR6-016 + new |
| API | ✅ 22 эндпоинта, +progress, +settings | 2026-07-26 |
| Tests | ✅ tsc clean | Vitest |
| tsconfig | ✅ moduleResolution: Node16 | INFRA-001 |
| CI | ✅ tsc --noEmit | .github/workflows/ci.yml |
| Viewer (Dashboard) | ✅ Прогресс-бар, настройки расписания, courtName | 2026-07-26 |
| Viewer (Search) | ✅ msudrf поиск, КАПС убран | 2026-07-26 |
| Court Hierarchy | ✅ CR9 — findHigherCourt, CASSATION_MAP, MS→RS кэш | 2026-07-25 |
| Grace Period | ✅ 90 дней для enforced дел | 2026-07-25 |
| Party Matching | ✅ pickBestMatch, matchParty | 2026-07-26 |
| eslint | ✅ Flat config (eslint.config.js) | 2026-07-26 |
| pino | ✅ Structured logging | 2026-07-26 |
| Cron scheduler | ✅ startCron/stopCron, настройки | 2026-07-26 |
| TUI | ⚠️ Работает на Linux, глючно на Windows | 2026-07-26 |

---

## Архитектура сайтов судов

### sudrf.ru (районные, апелляционные, кассационные суды)

- **Форма:** `<form method="get">` — параметры в URL query string.
- **Captcha:** встроена в форму поиска (`input#captcha`), изображение в data URI (base64).
- **Результаты:** HTML-таблица, 7 колонок:

| № дела | Дата поступления | Категория | Судья | Дата решения | Результат | Вступление |
|--------|-----------------|-----------|-------|-------------|-----------|------------|

- **Парсинг:** `parseResults` из `search/shared.ts` — Cheerio, разбор `tr`/`td`.
- **Encoding:** CP1251 (php-формы), ручной percent-декодер в `captcha/session.ts`.
- **Проблема:** фоновые счётчики не дают `waitForNetworkIdle` — используется `waitForNavigation`.

### msudrf.ru (мировые суды)

- **Форма:** Нет `<form method="get">`. Поиск через AJAX/JavaScript.
- **Captcha:** отдельная страница `kcaptchaForm` — решается **один раз на сессию** (POST → новая страница).
- **После капчи:** форма поиска с вкладками (типы дел), поля: номер, стороны, дата, УИД.
- **Кнопка «Искать»:** `<input type="button" class="button-normal search">` — AJAX-запрос.
- **Результаты:** `<div id="search_results">` (изначально скрыт, `display:none`), 5 колонок:

| № дела | Категория/Лица | Судья | Дата решения | Решение |
|--------|---------------|-------|-------------|---------|

- **Участники:** парсятся из колонки «Категория/Лица» строки вида «ИСТЕЦ: ... ОТВЕТЧИК: ...» через regex.
- **Архитектура:** `fetchMsudrfSearch()` в `captcha/session.ts` — отдельная функция, не переиспользует `fetchWithCaptcha` (AJAX-пайплайн иной).
- **TLS:** `rejectUnauthorized: false` (используется `https.get`, не `fetch`).

---

## TUI (packages/tui/)

Терминальный интерфейс для администраторов. Создан на **blessed** (не neo-blessed).

### Стек
- **blessed** v0.1.81 — библиотека терминального UI (ncurses-подобный API)
- **fetch.ts** — `tuiFetch()` с AbortController (таймаут 5с)
- **app.ts** — 99 строк: screen → header → thead → list → detail

### Состояние
- ✅ **Работает на Linux** — полная функциональность
- ⚠️ **На Windows — глючно:** проблемы с русской раскладкой, стрелками, blessed.list
- Рекомендация: запускать на Linux или WSL

### Известные проблемы

1. **blessed.list НЕ рендерит `tags: true`** — теги `{red-fg}...{/red-fg}` отображаются как текст (баг blessed). Решение: не использовать теги в элементах списка.
2. **Стрелки вверх/вниз** — через `keys: true` у list, работает не на всех терминалах (на Windows Terminal — проблемы).
3. **Стрелки влево/вправо** — переключение вкладок через `screen.key(['left'], ...)`.
4. **Выход по Q в русской раскладке** — добавлены `й`/`Й` в обработчики (`screen.key(['q','Q','й','Й','C-c','C-d'])`).
5. **Enter открывает карточку** — через `list.on('select')` и `screen.key(['enter'])`.
6. **Курсор** — ручное скрытие `\x1b[?25l` / показ `\x1b[?25h` через `process.on('exit')`.

### История создания (TUI — полная хроника страданий)

| Попытка | Подход | Результат |
|---------|--------|-----------|
| 1 | **neo-blessed** | **Не работает на Windows** — ошибка `fake` (битая зависимость `node-pty` на Windows). Отказ. |
| 2 | **ANSI-самопал** | Сырой `process.stdout.write` с ANSI-кодами. Неинтерактивен. `Q` не работает (только `process.stdin.on('data')`). Брошен. |
| 3 | **blessed с вкладками + tags** | Вкладки есть. **Теги в `blessed.list` не рендерятся** — баг blessed (issue #400). Текст тегов виден как есть. |
| 4 | **ANSI drawBox** | Рамки через `box.Draw`. Есть визуал. **Нет навигации** — клавиатура не обрабатывается нормально. |
| 5 | **blessed (снова) — чистый список** | Теги убраны из `list.setItems()`. Форматирование через `pad()`. Enter открывает карточки. **ИТОГ: работает на Linux.** |

### Управление
- `1` / `←` — вкладка «Дела» (таблица)
- `2` / `→` — вкладка «Запуск» (F4/F5/F6)
- `Enter` — детали дела (на вкладке «Дела»)
- `r` — обновить
- `q` / `Q` / `й` / `Й` / `Ctrl+C` / `Ctrl+D` — выход
- `F4` — полный прогон
- `F5` — retry
- `F6` — новые дела

---

## Use cases (утверждено)

### UC-0: Дашборд
- Счётчики: monitoring, waiting, decision, вступило сегодня — `GET /api/status` ✅
- Фильтры по статусу: Все / Мониторинг / Ожидание / Решение / Вступило / Ошибка / Архив ✅
- Таблица дел с действиями: детали, архивировать, удалить ✅
- Кнопка «Запустить мониторинг» — `POST /api/parse/run` ✅
- **Прогресс-бар** — поллинг `GET /api/parse/progress`, отображение processed/total/errors ✅
- **Настройки расписания** — модалка `scheduleFull`, `retryIntervalHours`, `retryStaleHours` ✅
- Уведомления о событиях — `GET /api/notifications` ✅
- Авто-обновление каждые 30с ✅
- **Название суда** — колонка «Суд» отображает `courtName` вместо subdomain ✅

### UC-1: Добавить новое дело (через поиск)
- Кнопка «+📋» в результатах поиска → `POST /api/cases` ✅
- **Синхронный парсинг** при `?parse=true` — карточка загружается сразу ✅

### UC-2: Следить за делом
- Автоматический мониторинг через scheduler ✅
- **Cron-планировщик** — автозапуск `runFull()` по расписанию ✅

### UC-3: Отслеживать появление дела
- Форма «Отслеживать появление» в search.html → `POST /api/cases/wait` ✅
- `runNew()` через `searchByParty` ✅
- **Party matching** — `pickBestMatch` вместо `results[0]` ✅

### UC-4: Отслеживание решения и вступления
- `await sleep(RATE_DELAY_MS)` перед `searchByCaseNumber` на `decision`-делах ✅
- `legalForceDate` нормализуется к `YYYY-MM-DD` при записи ✅
- Error recovery: успешный прогон сбрасывает `status: 'error'` → `'monitoring'` ✅

### UC-5: Детали дела
- Timeline событий в modal — `GET /api/cases/:uid` + `GET /api/cases/:uid/events` ✅
- Архивирование / возврат / удаление ✅

### UC-6: CRM-запросы (1С)

---

## API-контракты (утверждено)

| # | Запрос | Назначение | Статус |
|---|--------|-----------|--------|
| 1 | `GET /api/status` | Счётчики + здоровье | ✅ |
| 2 | `GET /api/cases` | Список дел (с `courtName`) | ✅ |
| 3 | `GET /api/cases/:uid` | Карточка дела (с `courtName`) | ✅ |
| 4 | `POST /api/cases` | Добавить в мониторинг (`?parse=true`) | ✅ |
| 5 | `PATCH /api/cases/:uid` | Обновить разрешённые поля | ✅ |
| 6 | `DELETE /api/cases/:uid` | Удалить (каскадно: events + notifications + card) | ✅ CR6-016 |
| 7 | `POST /api/cases/wait` | Отслеживать появление | ✅ |
| 8 | `POST /api/resolve` | Суд + номер → ссылка (URL builder) | ✅ CR6-009 |
| 9 | `POST /api/search/by-number` | Поиск по номеру | ✅ |
| 10 | `POST /api/search/by-party` | Поиск по участникам | ✅ |
| 11 | `POST /api/parse/url` | Парсинг URL (assertCourtUrl) | ✅ CR6-002 |
| 12 | `GET /api/courts?q=` | Поиск судов | ✅ |
| 13 | `GET /api/courts/:id` | Инфо о суде | ✅ |
| 14 | `GET /api/notifications` | Уведомления | ✅ |
| 15 | `POST /api/parse/run` | Асинхр парсинг (202) + 409 | ✅ CR6-013 |
| 16 | `GET /api/cases/:uid/events` | События дела (timeline) | ✅ |
| 17 | `GET /api/cases/:uid/card` | Полная карточка дела (CaseCard) | ✅ |
| 18 | `GET /api/parse/progress` | Прогресс текущего прогона | ✅ NEW |
| 19 | `GET /api/settings` | Настройки расписания | ✅ NEW |
| 20 | `PUT /api/settings` | Сохранить настройки | ✅ NEW |

---

## Баги

> **99/99 закрыто.** Открытых замечаний нет.
> 4 tech-debt закрыты в v0.5.0: eslint (CR5-009), pino (CR5-011), party matching (CR6-005), Node engine (CR7-008).
> Полная история — в BUG_REPORT.md

---

## Tech-debt (открытые, не критичные)

| ID | Приоритет | Описание | Заметка |
|----|-----------|----------|---------|
| CR5-008 | LOW | tmp/rename без fsync | Документированный trade-off |
| CR6-003 | MEDIUM | Zero authentication | COURTDESK_API_TOKEN в .env.example, реализация — separate sprint |
| CR6-010 | LOW | TLS rejectUnauthorized: false | Trade-off для sudrf.ru wildcard |
| CR6-012 | LOW | Puppeteer browser pool | Single-session на magistrate |
| CR6-014 | LOW | Subdomain коллизии в справочнике | 3 дубликата, 1914 без subdomain |
| CR6-011 | MEDIUM | RuCaptcha softId placement | Игнорируется API, non-breaking |
| CR6-015 | MEDIUM | parsePublishInfo HH:MM:SS | Edge case |
| CR6-017 | MEDIUM | 0 HTML fixtures in tests | Tech-debt |
| CR6-020 | LOW | Intention vs Classification types | Tech-debt |

| TUI-001 | MEDIUM | TUI глючит на Windows | blessed.list, стрелки, русская раскладка — регрессия на Windows Terminal |
| TUI-002 | LOW | TUI теги не рендерятся | Баг blessed: `tags: true` не работает в `blessed.list` |
| TUI-003 | LOW | TUI нет авто-обновления при открытой карточке | detail скрывает list, refresh не обновляет фон |

### Закрытые tech-debt

| ID | Описание | Решение |
|----|----------|---------|
| CR5-009 | Нет eslint | eslint.config.js (flat config) + @typescript-eslint |
| CR5-011 | console.log вместо pino | core/logger.ts — pino dual-transport |
| CR6-005 | waiting → results[0] без матчинга | pickBestMatch + matchParty в orchestrator.ts |
| CR7-008 | `process.loadEnvFile()` требует Node ≥21 | Node engine ≥22.0.0 в package.json |

---

## Следующие шаги

1. **WebSocket / SSE** — push-уведомления в браузер
2. **TUI — стабилизация на Windows** — починить blessed.list, стрелки, русскую раскладку. Либо переписать на `termkit` / `ink`.
3. **API token auth** — закрыть CR6-003
4. **Puppeteer browser pool** — закрыть CR6-012

---

## Журнал работ

| Дата | Изменение |
|------|-----------|
| 2026-07-17 | Создан репозиторий, intake-модуль + 18 тестов |
| 2026-07-21 | BUG-001..011 + search/parse/store/scheduler/captcha |
| 2026-07-22 | NEW-001..011, CR4-001..008, CR5-001..012 (50 багов закрыто) |
| 2026-07-23 | CR6 — CODE_REVIEW6.md от Cursor Agent (20 замечаний) |
| 2026-07-24 | CR6 применён: security, store integrity, route dups, archived race, error recovery. UX/UI: dashboard с управлением, search с мониторингом. Dead code cleanup. Documentation. |
| 2026-07-25 | UX/UI v2: смена тем (dark/light), пагинация, сортировка, поиск по таблице, печать, mark-all-read, Esc-close. theme.css + app.js shared. CourtUrlError → автоархивация (разрыв error-цикла). |
| 2026-07-25 | CR7 — OpenCode Deep Audit (10 замечаний: 9 исправлено, 1 задокументировано). |
| 2026-07-25 | CR7 fix: `success: true`→`false` в status.ts, `toIso()` битая ISO, dead code `err.message`, живая ссылка кэша, лимит `findCourtsByRegion`, матчинг uid, логи captcha, `&rarr;` унификация, `setInterval` cleanup. |
| 2026-07-25 | CR8 — Captcha + Search overhaul. Исправлено 9 багов: `case_type`/`new` для appeal (искал в кассации); CP1251 декодинг (decodeURIComponent падал); waitForNetworkIdle → waitForNavigation; double-encoding CP1251; regex base64; поиск по УИД; полная карточка дела в UI; логгер; captcha для всех типов sudrf. |
| 2026-07-25 | CR9 — Court Hierarchy & Grace Period. `findHigherCourt()`, `COURT_HIERARCHY` (MS→RS→OS→KJ), `CASSATION_MAP` (89 регионов → 9 кассац. судов), MS→RS кэш, `enforcedAt`, grace period 90 дней, поиск в вышестоящем по УИД. |
| 2026-07-26 | **v0.5.0** — msudrf полностью переписан (AJAX, fetchMsudrfSearch, 5 колонок, парсинг участников из Категория/Лица). Убран КАПС из UI. Название суда (courtName) через findCourtByCodeOrSubdomain. Синхронный парсинг при ?parse=true. errorCount/lastError в WatchedCase. Прогресс-бар мониторинга (GET /api/parse/progress). Cron-планировщик (packages/scheduler/cron.ts, настройки). Party matching (pickBestMatch/matchParty). eslint flat config. pino structured logging. Node engine ≥22. TUI (blessed): 5 попыток (neo-blessed failed → ANSI-самопал → blessed с тегами → drawBox → blessed чистый). На Linux работает, на Windows — глючно. |

---

## Структура проекта

```
courtdesk/
├── packages/
│   ├── core/         — типы, справочник судов, конфиг, errors, logger, progress
│   ├── captcha/       — Puppeteer + RuCaptcha + fetchMsudrfSearch
│   ├── search/       — адаптеры поиска + shared.ts (magistrate переписан)
│   ├── parse/        — адаптеры парсинга карточек
│   ├── intake/       — classify() (regex /iu)
│   ├── scheduler/    — orchestrator + cron.ts
│   ├── store/        — cases, events, notifications, cards, settings
│   ├── api/
│   │   ├── routes/   — 20 эндпоинтов (+progress, +settings)
│   │   └── middleware/
│   ├── tui/          — терминальный интерфейс (blessed)
│   └── viewer/       — дашборд + search.html (courtName, прогресс-бар, настройки)
├── .env.example
├── .gitattributes
├── package.json      — Node ≥22, pino, eslint
├── tsconfig.json
├── vitest.config.ts
├── eslint.config.js  — flat config
├── ARCHITECTURE.md
├── CHANGELOG.md
├── CODE_REVIEW.md
├── BUG_REPORT.md
├── DECISIONS.md
└── CONTEXT.md
```
