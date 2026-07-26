# Session Continue — CourtDesk v0.5.0

> Создан: 2026-07-26
> Предыдущая сессия: Court Hierarchy + Grace Period (CR9)
> Всего замечаний закрыто: 99/99

> **Текущая сессия:** msudrf overhaul, UI polish, infra (eslint/pino/cron), party matching, error counters, progress bar, sync parse, KАПС → капс, courtName.

---

## Быстрый старт для новой сессии

### 1. Прочитать документацию (в порядке важности)

| Файл | Что даст |
|------|----------|
| `ARCHITECTURE.md` | Полная архитектура, data flow, модули |
| `CONTEXT.md` | Статус, use cases, API-контракты, что сделано, что нет |
| `DECISIONS.md` | ADR — почему так, а не иначе |
| `BUG_REPORT.md` | Все закрытые замечания по раундам |
| `CHANGELOG.md` | История изменений |

### 2. Ключевые изменения в текущей сессии (v0.5.0)

**msudrf — полностью переписан:**
- Архитектура msudrf принципиально отличается от sudrf: AJAX-поиск, captcha на отдельной странице (`kcaptchaForm`, одна на сессию), таблица 5 колонок (№ дела | Категория/Лица | Судья | Дата решения | Решение).
- В отличие от sudrf (GET-форма, captcha в форме `input#captcha`, таблица 7 колонок).
- `fetchMsudrfSearch()` — новая функция в `captcha/session.ts` (AJAX-пайплайн: открыть → решить капчу → заполнить поля → клик «Искать» → дождаться `#search_results`).
- `search/adapters/magistrate.ts` полностью переработан: использует `fetchMsudrfSearch()`, парсит участников из колонки «Категория/Лица» (парсинг ИСТЕЦ/ОТВЕТЧИК через regex), не использует старый GET-подход.
- TLS: для msudrf используется `https.get` с `rejectUnauthorized: false` (both orchestrator и синхронный парсинг).

**UI — убран КАПС:**
- `theme.css`: все КАПС-селекторы и переменные заменены на нормальный регистр.
- `index.html`, `search.html`: весь текст КАПС заменён на строчный/заголовочный регистр.

**Название суда вместо домена:**
- `api/routes/cases.ts`: `GET /api/cases` и `GET /api/cases/:uid` обогащают ответ полем `courtName` через `findCourtByCodeOrSubdomain()`.
- Дашборд: колонка «Суд» отображает `courtName` (было: `courtId`/subdomain), поиск по таблице включает `courtName`.

**Синхронный парсинг при добавлении (`?parse=true`):**
- `POST /api/cases` с query-параметром `?parse=true` (или `body.parse`) запускает парсинг карточки сразу после добавления дела.
- Использует `https.get` с `rejectUnauthorized: false` для TLS msudrf.
- Если капча — решает через Puppeteer.
- Результат парсинга возвращается в теле ответа (`card`).
- Если парсинг упал — дело всё равно добавлено, ошибка в `parseError` поле.

**Счётчик ошибок (errorCount, lastError):**
- `WatchedCase` получил поля `errorCount: number` и `lastError: string | null`.
- `PATCH_ALLOWED` включает `errorCount` и `lastError`.
- `orchestrator.ts` при ошибке пишет `errorCount: (c.errorCount ?? 0) + 1` и `lastError: err.message.slice(0, 200)`.
- При успешном `processOne` errorCount сбрасывается в 0, lastError в null.

**Прогресс-бар мониторинга:**
- `core/progress.ts` — модуль состояния `ScanProgress { running, total, processed, errors }`.
- `GET /api/parse/progress` — новый эндпоинт.
- `orchestrator.ts`: вызовы `setProgress()` в начале и после каждого кейса.
- `index.html`: `scanBar` с прогрессом, поллинг `/api/parse/progress` каждые 5с, отображение `processed/total (errors)`.

**Cron-планировщик:**
- `packages/scheduler/cron.ts` — `startCron()`, `stopCron()`. Проверка каждые 60с.
- `settings.ts` — `AppSettings`: `scheduleFull` (HH:mm), `retryIntervalHours`, `retryStaleHours`, `scheduleEnabled`.
- `api/routes/settings.ts` — `GET /api/settings`, `PUT /api/settings`.
- `server.ts` — при старте вызывает `startCron()`.
- UI: модалка настроек в `index.html` (часы, интервал, stale, вкл/выкл).

**Party matching:**
- `orchestrator.ts`: `matchParty(party, resultParties)` — скоринг (100 = точное, 90 = startsWith, 30 + words*20 для фамилии).
- `pickBestMatch(results, party)` — выбор лучшего по score.
- `SearchResult.matchScore?: number`.
- `processWaiting` использует `pickBestMatch(results, party) ?? results[0]` — закрывает CR6-005.

**eslint + @typescript-eslint:**
- `eslint.config.js` — flat config (ESM), `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`.
- Правила: `no-console: warn`, `no-unused-vars: warn`, `no-explicit-any: warn`, `prefer-const: error`, `no-var: error`.
- `package.json`: dependencies `eslint@^10.8.0`, `@typescript-eslint/parser@^8.65.0`, `@typescript-eslint/eslint-plugin@^8.65.0`, `eslint-config-prettier@^10.1.8`.
- Скрипт: `lint:eslint = "eslint packages/"`.

**pino:**
- `core/logger.ts` — `pino` с dual-transport (файл + stdout), уровень `LOG_LEVEL` из env, ISO-таймстампы.
- Экспорт: `log(level, msg, data?)`, `logRequest(method, url, status, durationMs)`, default export `logger`.
- `api/server.ts` использует `logRequest` для HTTP-логов.

**Node engine:** `>=22.0.0` (было `>=20.6.0`) — CR7-008 закрыт.

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
└── viewer/     — public/ (index.html, search.html, app.js, theme.css)
```

### 5. API эндпоинты (22)

| # | Метод | Путь | Добавлено |
|---|-------|------|-----------|
| 1 | GET | `/api/health` | — |
| 2 | GET | `/api/status` | — |
| 3 | GET | `/api/cases` | — |
| 4 | GET | `/api/cases/stats` | — |
| 5 | GET | `/api/cases/:uid` | — |
| 6 | POST | `/api/cases` | +`?parse=true` |
| 7 | POST | `/api/cases/wait` | — |
| 8 | PATCH | `/api/cases/:uid` | — |
| 9 | DELETE | `/api/cases/:uid` | — |
| 10 | GET | `/api/cases/:uid/events` | — |
| 11 | GET | `/api/cases/:uid/card` | — |
| 12 | POST | `/api/search/by-number` | — |
| 13 | POST | `/api/search/by-party` | — |
| 14 | POST | `/api/search/by-case-uid` | — |
| 15 | POST | `/api/parse/url` | — |
| 16 | POST | `/api/parse/run` | — |
| 17 | GET | `/api/parse/progress` | **NEW** |
| 18 | POST | `/api/resolve` | — |
| 19 | GET | `/api/courts` | — |
| 20 | GET | `/api/courts/:id` | — |
| 21 | POST | `/api/intake` | — |
| 22 | GET | `/api/settings` | **NEW** |
| 23 | PUT | `/api/settings` | **NEW** |

### 6. Запуск

```bash
npm run dev     # http://127.0.0.1:8767
npm test        # vitest run
npm run lint    # tsc --noEmit
npm run lint:eslint  # eslint packages/
npx tsc --noEmit     # type check
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

### 8. Закрытые tech-debt

| ID | Решение |
|----|---------|
| CR5-009 | eslint + @typescript-eslint — внедрён flat config |
| CR5-011 | pino — внедрён structured logging |
| CR6-005 | Party matching — `pickBestMatch` + `matchParty` |
| CR7-008 | Node engine поднят до >=22, `loadEnvFile` безопасен |

### 9. Планы на будущее

1. WebSocket / SSE — push-уведомления
2. TUI (neo-blessed) — терминальный интерфейс для администраторов
3. API token auth (CR6-003)
4. Puppeteer browser pool (CR6-012)

---

*Generated by OpenCode Go — 2026-07-26*
