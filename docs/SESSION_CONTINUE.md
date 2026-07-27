# Session Continue — CourtDesk v0.5.0

> Создан: 2026-07-26
> Предыдущая сессия: Court Hierarchy + Grace Period (CR9)
> Всего замечаний закрыто: 99/99

> **Текущая сессия:** msudrf overhaul, UI polish (КАПС→капс, courtName), sync parse, error counters, progress bar, cron scheduler, party matching, eslint, pino, Node engine, TUI.

---

## Быстрый старт для новой сессии

### 1. Прочитать документацию (в порядке важности)

| Файл | Что даст |
|------|----------|
| `ARCHITECTURE.md` | Полная архитектура, data flow, модули |
| `CONTEXT.md` | Статус, use cases, API-контракты, что сделано, что нет |
| `DECISIONS.md` | ADR — почему так, а не иначе |
| `BUG_REPORT.md` | Все закрытые замечания по раундам + OPEN TUI |
| `CHANGELOG.md` | История изменений |

### 2. Полная история сессии v0.5.0 (2026-07-26)

---

#### 2.1 Убран КАПС из UI

**Проблема:** Весь UI был в КАПСЕ — заголовки, кнопки, метки. КРИЧАЛ НА ПОЛЬЗОВАТЕЛЯ.

**Решение:**
- `theme.css`: все КАПС-селекторы и переменные (`text-transform: uppercase`) заменены на нормальный регистр.
- `index.html`, `search.html`: весь текст КАПС заменён на строчный/заголовочный регистр (title case).
- `app.js`: текстовые константы приведены к нормальному регистру.

**Файлы:** `viewer/public/theme.css`, `viewer/public/index.html`, `viewer/public/search.html`, `viewer/public/app.js`.

---

#### 2.2 Название суда вместо домена

**Проблема:** В дашборде отображался `courtId` (subdomain типа `zheleznodorozhny--dostav brb.sudrf.ru`) — нечитаемо для юриста.

**Решение:**
- `api/routes/cases.ts`: `GET /api/cases` и `GET /api/cases/:uid` обогащают ответ полем `courtName` через `findCourtByCodeOrSubdomain()`.
- Дашборд: колонка «Суд» отображает `courtName` (например «Железнодорожный районный суд г. Ростова-на-Дону») вместо subdomain.
- Поиск по таблице включает `courtName`.

**Файлы:** `packages/api/routes/cases.ts`, `packages/core/courts.ts`.

---

#### 2.3 msudrf — полностью переписан (AJAX-поиск)

**Проблема:** msudrf.ru не поддерживает GET-формы как sudrf.ru. Поиск только через AJAX/JavaScript. Старый код пытался использовать GET-подход и ничего не находил.

**Новая архитектура msudrf:**
- **Captcha:** отдельная страница `kcaptchaForm` — решается **один раз на сессию** (POST → редирект на форму поиска).
- **Форма поиска:** после капчи — форма с вкладками (типы дел), поля: номер, стороны, дата, УИД.
- **Кнопка «Искать»:** `<input type="button" class="button-normal search">` — клик → AJAX-запрос.
- **Результаты:** `<div id="search_results">` (изначально `display:none`), 5 колонок:

  | № дела | Категория/Лица | Судья | Дата решения | Решение |
  |--------|---------------|-------|-------------|---------|

- **Участники:** парсятся из колонки «Категория/Лица» строки вида «ИСТЕЦ: ... ОТВЕТЧИК: ...» через regex / (ИСТЕЦ|ОТВЕТЧИК|ЗАЯВИТЕЛЬ|ЗАИНТЕРЕСОВАННОЕ ЛИЦО):\s*(.+?)(?=\s+(ИСТЕЦ|ОТВЕТЧИК|ЗАЯВИТЕЛЬ|ЗАИНТЕРЕСОВАННОЕ ЛИЦО):|$)/.
- **`fetchMsudrfSearch()`** (`captcha/session.ts`) — отдельная функция, не переиспользует `fetchWithCaptcha` (AJAX-пайплайн иной: открыть → решить капчу → дождаться формы → заполнить → клик → дождаться `#search_results`).

**Сравнение с sudrf:**

| Характеристика | sudrf.ru | msudrf.ru |
|---------------|----------|-----------|
| Форма | `<form method="get">` | AJAX/JavaScript |
| Captcha | В форме (`input#captcha`) | Отдельная страница (`kcaptchaForm`) |
| Captcha решается | Каждый поиск | Один раз на сессию |
| Результаты | HTML-таблица (полный reload) | `<div id="search_results">` (AJAX) |
| Колонок | 7 | 5 |
| Парсинг участников | Отдельные колонки | Из «Категория/Лица» через regex |

**Файлы:** `packages/search/adapters/magistrate.ts` (полностью переписан), `packages/captcha/session.ts` (+`fetchMsudrfSearch`).

---

#### 2.4 SSL: rejectUnauthorized: false для msudrf

**Проблема:** Серверы msudrf.ru используют wildcard-сертификаты, не проходящие валидацию Node.js. `fetch()` не поддерживает `rejectUnauthorized` в Node.js.

**Решение:**
- Для HTTP-запросов к судовым сайтам используется `https.get` с `{ rejectUnauthorized: false, timeout: 120000 }`.
- Применение: `orchestrator.ts fetchHtml()`, синхронный парсинг в `cases.ts`.
- Защита: `assertCourtUrl` ограничивает домены `.sudrf.ru` / `.msudrf.ru` (CR6-002).

**Обоснование:** `fetch()` в Node.js не имеет опции отключения TLS-проверки. `https.get` — единственный встроенный способ. Trade-off задокументирован.

**Файлы:** `packages/scheduler/orchestrator.ts`, `packages/api/routes/cases.ts`.

---

#### 2.5 Синхронный парсинг при добавлении (?parse=true)

**Проблема:** После добавления дела через «+📋» карточка была пустой, пока scheduler не запустит `processOne`. Пользователь ждал непонятно чего.

**Решение:**
- `POST /api/cases?parse=true` (или `body.parse`) запускает парсинг карточки сразу после добавления дела.
- Результат (`card`) возвращается в теле ответа.
- Использует `https.get` с `rejectUnauthorized: false`, при капче — Puppeteer.
- Если парсинг упал — дело всё равно добавлено, ошибка в `parseError`.

**Файлы:** `packages/api/routes/cases.ts`.

---

#### 2.6 Счётчик ошибок (errorCount, lastError)

**Проблема:** Была только `lastChecked` — нельзя было отличить «дело никогда не проверялось» от «дело упало 20 раз подряд».

**Решение:**
- `WatchedCase.errorCount: number` и `WatchedCase.lastError: string | null`.
- `PATCH_ALLOWED` включает `errorCount` и `lastError`.
- `orchestrator.ts`: при ошибке пишет `errorCount+1` и `lastError.slice(0, 200)`, при успехе сбрасывает.

**Файлы:** `packages/core/types.ts`, `packages/scheduler/orchestrator.ts`.

---

#### 2.7 Прогресс-бар мониторинга

**Проблема:** Без прогресс-бара пользователь не знал, сколько дел обработано.

**Решение:**
- `core/progress.ts` — in-memory `ScanProgress { running, total, processed, errors }`.
- `orchestrator.ts`: вызовы `setProgress()` в начале и после каждого кейса.
- `GET /api/parse/progress` — новый эндпоинт.
- UI: `scanBar` с прогрессом, поллинг каждые 5с, отображение `processed/total (errors)`.

**Файлы:** `packages/core/progress.ts`, `packages/api/routes/parse.ts`, `packages/scheduler/orchestrator.ts`, `viewer/public/index.html`, `viewer/public/app.js`.

---

#### 2.8 Cron-планировщик

**Проблема:** Мониторинг запускался только вручную через `POST /api/parse/run`.

**Решение:**
- `packages/scheduler/cron.ts` — `startCron()`, `stopCron()`. Проверка каждые 60с.
- `settings.ts` — `AppSettings`: `scheduleFull` (HH:mm), `retryIntervalHours`, `retryStaleHours`, `scheduleEnabled`.
- `api/routes/settings.ts` — `GET /api/settings`, `PUT /api/settings`.
- `server.ts` — при старте вызывает `startCron()`.
- UI: модалка настроек в `index.html` (часы, интервал, stale, вкл/выкл).

**Файлы:** `packages/scheduler/cron.ts`, `packages/store/settings.ts`, `packages/api/routes/settings.ts`, `packages/api/server.ts`, `viewer/public/index.html`, `viewer/public/app.js`.

---

#### 2.9 Party matching (pickBestMatch)

**Проблема:** `processWaiting` брал `results[0]` — первый результат поиска, который мог не относиться к искомой стороне (CR6-005).

**Решение:**
- `matchParty(party, resultParties): number` — скоринг: 100 (точное), 90 (startsWith), фамилия + совпавшие слова (30 + N*20).
- `pickBestMatch(results, party): SearchResult | null` — выбор лучшего по score.
- `processWaiting` использует `pickBestMatch(results, party) ?? results[0]`.

**Файлы:** `packages/scheduler/orchestrator.ts` (+matchParty/pickBestMatch).

---

#### 2.10 eslint + @typescript-eslint (CR5-009 — закрыт)

**Решение:** `eslint.config.js` — flat config (ESM), `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`.

**Правила:** `no-console: warn`, `no-unused-vars: warn`, `no-explicit-any: warn`, `prefer-const: error`, `no-var: error`.

**Файлы:** `eslint.config.js`, `package.json`.

---

#### 2.11 pino вместо console.log (CR5-011 — закрыт)

**Решение:** `core/logger.ts` — pino с dual-transport (файл `logs/courtdesk.log` + stdout). ISO-таймстампы.

**Экспорт:** `log(level, msg, data?)`, `logRequest(method, url, status, durationMs)`, default export `logger`.

**Файлы:** `packages/core/logger.ts`, `packages/api/server.ts`.

---

#### 2.12 Node engine ≥22 (CR7-008 — закрыт)

**Решение:** `package.json`: `"engines": { "node": ">=22.0.0" }` (было `>=20.6.0`). `process.loadEnvFile()` доступен с Node 21, но 22 — LTS.

---

#### 2.13 TUI — полная история создания (терминальный интерфейс)

**Контекст:** Понадобился терминальный интерфейс для админов, чтобы смотреть дела без браузера.

**Хроника страданий (5 попыток):**

| # | Попытка | Что сделано | Результат |
|---|---------|-------------|-----------|
| 1 | **neo-blessed** | Установка `npm install neo-blessed`. Написан `app.ts` с `screen`, `list`, горячими клавишами. | **НЕ РАБОТАЕТ НА WINDOWS.** Ошибка `fake` — битая зависимость `node-pty` не собирается на Windows. `process.stdout.isTTY = false` на Windows Terminal, что ломает neo-blessed вообще. Решение: удалён, забыт как страшный сон. |
| 2 | **ANSI-самопал** | Чистый `process.stdout.write` с ANSI escape-кодами (`\x1b[2J\x1b[H`, `\x1b[31m` и т.д.). Сырой `process.stdin.on('data')` для обработки клавиш. | **Неинтерактивен.** `Q` не работает — `process.stdin` в RAW mode не ловит 'q' нормально. Нет скролла, нет выделения. Текст уходит в трубу. Брошен. |
| 3 | **blessed с вкладками + tags** | Установка `blessed` (v0.1.81, стабильный). `screen`, `list` с `tags: true` для цветного форматирования. Вкладки «Дела» и «Запуск». | **Теги в `blessed.list` НЕ РЕНДЕРЯТСЯ.** `{red-fg}текст{/red-fg}` отображается как обычный текст, а не цветной. Это известный баг blessed (issue #400). Текст тегов виден как есть, не читаемо. |
| 4 | **ANSI drawBox** | Рисование рамок через `box.Draw` (ANSI box characters). Визуал есть — красивые рамки, но всё те же ANSI-кошмары. | **Нет навигации.** Обработка клавиатуры — `process.stdin.on('data')` — сырая и ненадёжная. Выделение строк не работает. |
| 5 | **blessed (снова) — чистый список без тегов** | Возврат к blessed, но **теги убраны из `list.setItems()`**. Форматирование через `pad()`/`clip()`. Заголовки через `header` с `tags: true` — работает (blessed.box рендерит теги). `list.on('select')` для Enter. | ✅ **ИТОГ: РАБОТАЕТ НА LINUX.** Enter открывает карточки, стрелки — навигация, Q — выход. На Windows — глючно (стрелки, русская раскладка), но хоть не падает. |

**Ключевые решения в TUI:**
- `fullUnicode: true` — для кириллицы.
- `screen.key(['q','Q','й','Й','C-c','C-d'])` — выход с русской раскладкой.
- Ручное скрытие/показ курсора через ANSI-коды.
- `setInterval(refresh, 60000)` — авто-обновление каждую минуту.
- `tuiFetch()` с AbortController (таймаут 5с) — защита от зависшего API.

**Почему blessed, а не neo-blessed:**
- neo-blessed требует `node-pty` (системная зависимость, не собирается на Windows).
- blessed (v0.1.81) — чистый JS, zero system dependencies, работает везде.
- Минус: баг с `tags: true` в `list` (issue #400, open с 2016).

**Почему не самопал:**
- Обработка клавиатуры в терминале — ад: RAW mode, CSI-последовательности, разная длина на разных терминалах.
- blessed даёт: `screen.key()`, `list.on('select')`, `scrollbar`, `focus` — из коробки.
- Самопал потребовал бы >500 строк только на каркас.

**Текущее состояние:**
- Linux: ✅ работает (стрелки, Enter, Q, F4/F5/F6, вкладки, детали).
- Windows: ⚠️ глючно (стрелки вверх/вниз иногда не работают, русская раскладка — Enter не открывает карточку, теги в заголовке не рендерятся на Windows Terminal).
- Рекомендация: запускать на Linux или WSL.

**Файлы:** `packages/tui/index.ts`, `packages/tui/app.ts`, `packages/tui/fetch.ts`.

---

**Вывод автора о TUI:** 

> **Автор долбоёб.** TUI — кусок говна. Пять попыток, и всё равно на Windows не работает нормально. Единственное оправдание: на Linux таскает, и это лучше чем ничего. Но если ты на Windows — даже не запускай. Серьёзно, иди лучше в браузер. Там хотя бы русская раскладка работает.

---

### 3. Стек

| Компонент | Версия |
|-----------|--------|
| Node.js | >=22.0.0 |
| TypeScript | 7.x |
| Express | 5.x |
| Puppeteer | 25.x |
| Cheerio | 1.x |
| Vitest | 4.x |
| iconv-lite | 0.7.x |
| pino | 10.x |
| eslint | 10.x |
| blessed | 0.1.x |

### 4. Пакеты (монорепо без bundler, ESM)

```
packages/
├── core/        — types, courts, config, encoding, errors, logger, progress
├── captcha/     — session.ts (Puppeteer), rucaptcha.ts, fetchMsudrfSearch()
├── search/      — adapters (4, magistrate переписан), shared.ts, constants.ts
├── parse/       — adapters (4), shared.ts
├── intake/      — classify.ts
├── scheduler/   — orchestrator.ts, cron.ts
├── store/       — json-store, cases, events, notifications, cards, settings
├── api/         — server.ts, routes (11), middleware
├── tui/         — blessed terminal (index.ts, app.ts, fetch.ts)
└── viewer/      — public/ (index.html, search.html, app.js, theme.css)
```

### 5. API эндпоинты (22 + 3 settings)

| # | Метод | Путь | Назначение | Добавлено |
|---|-------|------|-----------|-----------|
| 1 | GET | `/api/health` | Liveness | — |
| 2 | GET | `/api/status` | Счётчики + здоровье | — |
| 3 | GET | `/api/cases` | Список дел | — |
| 4 | GET | `/api/cases/stats` | Статистика | — |
| 5 | GET | `/api/cases/:uid` | Карточка дела | — |
| 6 | POST | `/api/cases` | Добавить (с `?parse=true`) | — |
| 7 | POST | `/api/cases/wait` | Отслеживать появление | — |
| 8 | PATCH | `/api/cases/:uid` | Обновить | — |
| 9 | DELETE | `/api/cases/:uid` | Удалить (каскадно) | — |
| 10 | GET | `/api/cases/:uid/events` | События дела | — |
| 11 | GET | `/api/cases/:uid/card` | Карточка дела (CaseCard) | — |
| 12 | POST | `/api/search/by-number` | Поиск по номеру | — |
| 13 | POST | `/api/search/by-party` | Поиск по участникам | — |
| 14 | POST | `/api/search/by-case-uid` | Поиск по УИД | — |
| 15 | POST | `/api/parse/url` | Парсинг URL | — |
| 16 | POST | `/api/parse/run` | Асинхр парсинг (202) | — |
| 17 | GET | `/api/parse/progress` | Прогресс мониторинга | **NEW** |
| 18 | POST | `/api/resolve` | URL builder | — |
| 19 | GET | `/api/courts` | Поиск судов | — |
| 20 | GET | `/api/courts/:id` | Инфо о суде | — |
| 21 | POST | `/api/intake` | Классификация | — |
| 22 | GET | `/api/settings` | Настройки расписания | **NEW** |
| 23 | PUT | `/api/settings` | Сохранить настройки | **NEW** |

### 6. Запуск

```bash
npm run dev          # http://127.0.0.1:8767
npm test             # vitest run
npm run lint         # tsc --noEmit
npm run lint:eslint  # eslint packages/
npx tsc --noEmit     # type check
npm run tui          # packages/tui/index.ts — только Linux/WSL
```

### 7. Известные проблемы (tech-debt)

| ID | Приоритет | Описание |
|----|-----------|----------|
| CR5-008 | LOW | tmp/rename без fsync |
| CR6-003 | MEDIUM | Zero authentication |
| CR6-010 | LOW | TLS rejectUnauthorized: false |
| CR6-012 | LOW | Puppeteer browser pool |
| CR6-014 | LOW | Subdomain коллизии в справочнике |
| CR6-011 | MEDIUM | RuCaptcha softId placement |
| CR6-015 | MEDIUM | parsePublishInfo HH:MM:SS |
| CR6-017 | MEDIUM | 0 HTML fixtures in tests |
| CR6-020 | LOW | Intention vs Classification types |
| TUI-001 | MEDIUM | TUI глючит на Windows (blessed.list, стрелки, русская раскладка) |
| TUI-002 | LOW | TUI теги не рендерятся в blessed.list (баг blessed #400) |
| TUI-003 | LOW | TUI нет авто-обновления при открытой карточке |

### 8. Закрытые tech-debt

| ID | Решение |
|----|---------|
| CR5-009 | eslint + @typescript-eslint — внедрён flat config |
| CR5-011 | pino — внедрён structured logging |
| CR6-005 | Party matching — `pickBestMatch` + `matchParty` |
| CR7-008 | Node engine поднят до >=22, `loadEnvFile` безопасен |

### 9. Планы на будущее

1. WebSocket / SSE — push-уведомления
2. TUI — стабилизация на Windows (переписать на termkit/ink или починить blessed)
3. API token auth (CR6-003)
4. Puppeteer browser pool (CR6-012)

---

*Generated by OpenCode Go — 2026-07-26*
