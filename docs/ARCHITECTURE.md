# CourtDesk — Архитектура
> CRM-оркестратор поиска и мониторинга судебных дел РФ.
> Единый API-сервис для интеграции с CRM (1С) и параллельного Web UI.
> Собирается из CourtSniffer (поиск), CourtFlow (мониторинг) и CourtDesk (intake).

> **Обновлено 2026-07-27** — добавлена Go UI-архитектура (TUI + Web), решение Go вместо Node.js для UI.

---

## 1. Роль и границы

CourtDesk — **не набор микросервисов**. Это один процесс, который:
- Принимает REST-запросы от CRM (1С)
- Предоставляет Web UI для пользователей без CRM
- Ищет дела на sudrf.ru / msudrf.ru (поиск)
- Парсит карточки дел (мониторинг)
- Отслеживает дату вступления решения в законную силу
- Хранит состояние в JSON-файлах

**Что не входит:**
- Сбор справочника судов (делает CourtOktmo, мы только потребляем)
- Первичная CRM-функциональность (клиенты, договоры, документооборот)

---

## 2. Безопасность

### 2.1 URL Allowlist (CR6-002)

`assertCourtUrl(url)` — валидация на API boundary и в scheduler:
- Protocol: `https:` only
- Hostname: ends with `.sudrf.ru` или `.msudrf.ru`
- Блокирует: `file://`, `http://`, `localhost`, IP-адреса, cloud metadata (`169.254.169.254`)

Применение (CR12-001 — все fetch-точки):
- `POST /api/cases` и `PATCH /api/cases/:uid` — проверка до любого fetch
- `POST /api/parse/url` — проверка перед fetch
- `search/shared.ts` — `fetchHtml`, `smartFetch` (единый HTTP-слой)
- `captcha/session.ts` — `fetchWithCaptcha`, `fetchMsudrfSearch`
- `scheduler/orchestrator.ts` — `fetchHtml` перед fetch

### 2.2 Store Integrity (CR6-001)

`readJson` при коррупции:
- Файл не существует (ENOENT) → fallback (норма)
- Файл повреждён → переименование в `.corrupt.<timestamp>` + throw
- Silent-wipe исключён: коррупция видна в логах/ошибках

### 2.3 Authentication (tech-debt, CR6-003)

API без аутентификации (локальная сеть). При публичном bind (`HOST=0.0.0.0`):
- Нужен `COURTDESK_API_TOKEN` (header `X-API-Token`)
- CORS `*` несовместим с auth — заменить на конкретный origin

---

## 3. Функциональные блоки

### 3.1 Поиск дел
- По номеру дела (caseNumber)
- По участникам (defendant/plaintiff + даты)
- По URL карточки дела (извлечение номера через intake)
- Все типы судов: district, appeal, cassation, magistrate
- Captcha для magistrate (Puppeteer + RuCaptcha)
- CP1251-encoding для PHP-форм sudrf.ru

### 3.2 Мониторинг
- Периодический парсинг карточки дела по URL
- Фиксация изменений (новые события, изменение статуса)
- Retry-прогон для «устаревших» и error-дел
- Error recovery: успешный прогон сбрасывает `status: 'error'` → `'monitoring'` (CR6-006)
- Archived race protection: re-check перед `updateCase` (CR6-004)

### 3.3 Отслеживание вступления в силу
- Извлечение `legalForceDate` из поиска (name_op=r)
- Нормализация `YYYY-MM-DD` при записи (`slice(0, 10)`)
- Уведомление / отметка при наступлении даты

### 3.4 Справочник судов
- 10 287 записей (`packages/core/data/courts.json`, OKTMO + телефоны; источник — CourtOktmo/data/unified-courts.json)
- O(1)-lookup по code и subdomain
- AND-поиск по названию (`filter → slice → map`, лимит 50)
- Иерархия: `findHigherCourt`, `CASSATION_MAP` (89 регионов → 9 кассационных), кэш MS→RS в `data/court-hierarchy.json`

---

## 4. Архитектура пакетов

```
courtdesk/
├── packages/
│   ├── core/              # Фундамент: типы, справочник, encoding, config, errors, logger, progress
│   │   ├── types.ts       # Единые типы
│   │   ├── courts.ts      # Справочник судов (data/courts.json, 10 287 записей)
│   │   ├── encoding.ts    # CP1251 percent-encoder
│   │   ├── errors.ts      # CaptchaRequiredError, CourtUrlError, assertCourtUrl, isCaptchaPage
│   │   ├── config.ts      # .env (RUCAPTCHA_API_KEY, TWOCAPTCHA_API_KEY)
│   │   ├── logger.ts      # pino (файл + stdout)
│   │   └── progress.ts    # ScanProgress (in-memory)
│   │
│   ├── captcha/           # Puppeteer + RuCaptcha
│   │   ├── session.ts     # Browser-сессия: капча → решение → поиск
│   │   ├── rucaptcha.ts   # Клиент RuCaptcha API v2
│   │   └── browser.ts     # Пул браузера Puppeteer (idle-close 30 с)
│   │
│   ├── search/            # Поиск дел
│   │   ├── adapters/      # district, appeal, cassation, magistrate
│   │   ├── shared.ts      # fetchHtml, smartFetch, buildSearchUrl, parseResults
│   │   └── constants.ts   # SEARCH_PARAMS (delo_id, case_type)
│   │
│   ├── parse/             # Парсинг карточек дел
│   │   ├── adapters/      # district, appeal, cassation, magistrate
│   │   └── shared.ts      # extractCourtSubdomain, parseDate, parsePublishInfo, cleanText
│   │
│   ├── intake/            # Классификатор запросов
│   │   ├── classify.ts    # classify(), identifyCourt()
│   │   ├── types.ts       # Classification
│   │   └── index.ts
│   │
│   ├── scheduler/         # Оркестратор мониторинга
│   │   ├── orchestrator.ts # runFull / runRetry / runNew / runSingle + withRunLock + in-flight guard
│   │   ├── cron.ts        # setInterval 60 с поверх лока прогонов
│   │   └── index.ts
│   │
│   ├── store/             # Хранилище состояния
│   │   ├── cases.ts       # CRUD + in-memory cache
│   │   ├── events.ts      # История изменений
│   │   ├── notifications.ts # Уведомления + deleteNotificationsByCase
│   │   ├── cards.ts       # CaseCard (полные карточки)
│   │   ├── settings.ts    # AppSettings (расписание)
│   │   └── json-store.ts  # Атомарная запись (tmp+rename, corrupt backup)
│   │
│   ├── tui/               # ❄ Заморожен (ADR 2026-08-02)
│   │   ├── index.ts       # Точка входа
│   │   ├── app.ts         # screen, list, detail, клавиши
│   │   └── fetch.ts       # tuiFetch() с AbortController
│   │
│   ├── tui-go/            # ❄ Заморожен (ADR 2026-08-02)
│   │   └── main.go        # Bubble Tea TUI (1146 строк)
│   │
│   ├── courtdesktop/      # Go Desktop App (WebView, ~6.9 MB)
│   │   ├── main.go        # WebView-оболочка: health-check, watcher, настройки, Ctrl+,
│   │   ├── hotkeys_windows.go / hotkeys_other.go
│   │   ├── msgbox_windows.go / msgbox_other.go
│   │   └── go.mod / go.sum
│   │
│   └── api/               # Express-сервер
│       ├── server.ts      # createApp() + CORS + graceful shutdown
│       ├── routes/
│       │   ├── health.ts         # GET /api/health
│       │   ├── status.ts         # GET /api/status
│       │   ├── notifications.ts  # GET /api/notifications, PATCH read
│       │   ├── cases.ts          # CRUD /api/cases + /card /events /wait /:uid/parse
│       │   ├── search.ts         # POST /api/search/by-number, by-party, by-case-uid
│       │   ├── parse.ts          # POST /api/parse/url (assertCourtUrl), /run, GET /progress
│       │   ├── resolve.ts        # POST /api/resolve (URL builder)
│       │   ├── courts.ts         # GET /api/courts, /api/courts/:id
│       │   ├── intake.ts         # POST /api/intake
│       │   └── settings.ts       # GET/PUT /api/settings
│       └── middleware/
│           └── error.ts          # Global error handler
│
└── packages/viewer/public/ # Web UI (vanilla JS, без бандлера)
    ├── index.html      # Дашборд: счётчики, фильтры, таблица, детали, управление
    ├── search.html     # Поиск: суд, режим, результаты, +в мониторинг, +waiting
    ├── terminal.html   # Терминал (Bloomberg-стиль)
    ├── app.js          # Общие утилиты, иконки, темы, скины, labels
    ├── terminal.js     # Логика терминала
    └── theme.css       # Темы (dark/light) × скины (corporate/legal/compact)
```

---

## 5. Data Flow

### 5.1 Поиск → Мониторинг
```
Search UI ──→ POST /api/search/by-number
         → results table
         → click "+📋" on row
         → POST /api/cases { url, courtId, courtType, caseNumber }
         → Dashboard: status=monitoring
```

### 5.2 Циклический прогон
```
Dashboard ──→ POST /api/parse/run { mode: 'full' }
  → 202 Accepted (или 409 если уже идёт)
  → runFull() в фоне
       │
       ├─→ listCases({ status: ['monitoring', 'decision', 'enforced', 'error'] })
       ├─→ processOne(case)
       │     ├─→ assertCourtUrl(url)
       │     ├─→ fetchHtml(url)
       │     ├─→ getCase(uid) → check archived
       │     ├─→ if error: recover → monitoring (CR6-006)
       │     ├─→ if new result: → decision
       │     ├─→ if decision + no legalForceDate: search → enforced
       │     └─→ re-check archived → updateCase (CR6-004)
       └─→ updateCase(uid, { status: 'error' }) — при исключении
```

### 5.3 Дашборд
```
Браузер ──→ GET /api/status → счётчики
Браузер ──→ GET /api/cases → таблица с фильтрами
Браузер ──→ GET /api/cases/:uid + /events → modal деталей
Браузер ──→ PATCH /api/cases/:uid → архив/возврат
Браузер ──→ DELETE /api/cases/:uid → удаление (каскадно)
Браузер ──→ POST /api/parse/run → запуск мониторинга
```

---

## 6. API-контракты

### 6.1 Эндпоинты

| Метод | Путь | Назначение |
|-------|------|-----------|
| `GET` | `/api/health` | Liveness probe |
| `GET` | `/api/status` | Счётчики дашборда + health |
| `GET` | `/api/notifications` | Уведомления |
| `PATCH`| `/api/notifications/:uid/read` | Пометить прочитанным |
| `GET` | `/api/cases` | Список дел (`?status=&userId=&courtId=&q=`) |
| `GET` | `/api/cases/stats` | Детальная статистика |
| `GET` | `/api/cases/:uid` | Карточка дела |
| `GET` | `/api/cases/:uid/card` | Полная CaseCard (404 до готовности) |
| `GET` | `/api/cases/:uid/events` | События дела (timeline) |
| `POST`| `/api/cases` | Добавить в мониторинг (`?parse=true` sync / `?parse=async` 202) |
| `POST`| `/api/cases/wait` | Отслеживать появление |
| `PATCH`| `/api/cases/:uid` | Обновить разрешённые поля |
| `DELETE`| `/api/cases/:uid` | Удалить (каскадно: events + notifications + card) |
| `POST`| `/api/cases/:uid/parse` | Перепарсинг карточки (409 `PARSE_IN_PROGRESS`) |
| `POST`| `/api/search/by-number` | Поиск по номеру |
| `POST`| `/api/search/by-party` | Поиск по участникам |
| `POST`| `/api/search/by-case-uid` | Поиск по УИД |
| `POST`| `/api/parse/url` | Парсинг карточки (assertCourtUrl) |
| `POST`| `/api/parse/run` | Запуск прогона (202/409) |
| `GET` | `/api/parse/progress` | Прогресс мониторинга |
| `POST`| `/api/resolve` | Суд + номер → URL (builder) |
| `GET` | `/api/courts` | Поиск судов (`?q=`, лимит 30) |
| `GET` | `/api/courts/:id` | Инфо о суде |
| `POST`| `/api/intake` | Классификация текста |
| `GET` | `/api/settings` | Настройки расписания |
| `PUT` | `/api/settings` | Сохранить настройки |

### 6.2 Формат ответа
```typescript
interface ApiResponse<T> { success: true; data: T; }
interface ApiError { success: false; error: string; code: string; }
```

### 6.3 PATCH whitelist
Только: `status`, `result`, `legalForceDate`, `legalForceNotified`, `userId`, `url`, `errorCount`, `lastError`.
Нельзя: `uid`, `createdAt`, `courtId`, `courtType`, `number`.

---

## 7. Хранилище (store)

### 7.1 Формат файлов
```
data/
├── cases.json
├── events.json
└── notifications.json
```

### 7.2 Атомарность + Integrity
- Запись: tmp-файл + `renameSync`
- Чтение: при JSON.parse error → backup `.corrupt.<ts>` + throw (CR6-001)
- In-memory cache: `_cache` обновляется при каждом write

### 7.3 Race condition
Node.js однопоточен, но `await fetchHtml()` освобождает event loop.
- Scheduler перечитывает `getCase()` перед каждым `updateCase`
- Re-check `archived` перед финальной записью (CR6-004)

---

## 8. Web UI

### 8.1 Принципы
- Multi-page (index.html + search.html), без bundler
- Event delegation, data-* атрибуты, XSS-safe (esc() на весь user-контент)
- Тёмная тема, адаптивная вёрстка
- Toast-уведомления, авто-обновление

### 8.2 Экраны

| Экран | Что показывает / делает |
|-------|------------------------|
| **Дашборд** | Счётчики, фильтры по статусу, таблица дел, детали (modal), архив/удаление, запуск мониторинга, уведомления |
| **Поиск** | Выбор суда, режим (номер/участники), результаты, +в мониторинг, +отслеживание появления |

---

## 9. Go UI — клиентский слой (в разработке)

### 9.1 Концепция

```text
HTTP :8767                      HTTP :8768
┌──────────────┐               ┌───────────────────┐
│ Node.js API  │ ←─ REST ──→   │ Go-бинарник       │
│ (Express)    │               │ (courtdesk-ui)    │
│              │               │                   │
│ store/search │               │ ├── Web UI (--serve)
│ parse/cron   │               │ └── TUI   (--tui)  │
└──────────────┘               └───────────────────┘
```

- Go-бинарник — **клиент** к Node.js API. Бэкенд не изменяется.
- Один исходный код, два режима: Web (HTTP-сервер статики) и TUI (Bubble Tea).
- `go:embed` — статика внутри бинарника, ноль внешних файлов.

### 9.2 Почему Go, а не Node.js

| Фактор | Node.js TUI | Go TUI |
|--------|------------|--------|
| Win32 API | Через ConPTY (глючит) | Прямые вызовы `kernel32.dll` |
| Alt-screen | Нестабилен | Из коробки |
| F-keys / resize | Через ConPTY (потери) | Нативные события |
| Размер | 200+ MB + Node.js | 7 MB статический .exe |
| Кроссплатформенность | Только сборка под свою ОС | `GOOS=linux go build` |

### 9.3 Текущий прототип (❄ заморожен, ADR 2026-08-02)

**`packages/tui-go/main.go`** — Bubble Tea TUI (1146 строк):
- Список дел (номер, суд, участники, статус, дата)
- Детали дела + события (timeline)
- Добавление/удаление дел
- Прогон (full/retry/new)
- Уведомления
- Фильтр по номеру/суду/cтатусу
- Поиск
- F-keys: F4=full, F5=retry, F6=new

Код сохраняется, но не дорабатывается. Web-режим `--serve` не развивается — единственный клиент — WebView-оболочка (`packages/courtdesktop/`).

---

## 10. Scheduler

### 10.1 Режимы

| Режим | Что делает |
|-------|-----------|
| **full** | monitoring + decision + enforced + error дела |
| **retry** | Устаревшие monitoring + error |
| **new** | waiting → searchByParty |

### 10.2 Lifecycle дел
```
waiting → monitoring → decision → enforced → archived
                ↑           |          |
                └─ error ────┘  (recover: CR6-006)
```

---

## 11. Стратегия миграции

### Фаза 1–5: Выполнено ✅
- Фундамент, поиск, парсинг, оркестрация, API, инфраструктура
- CR1–CR6 применены (70 замечаний закрыто)
- Dashboard с управлением делами, search с мониторингом

### Фаза 6: v0.5.0 — выполнено ✅
1. msudrf AJAX overhaul (полностью переписан) ✅
2. TUI (blessed) — терминальный интерфейс ✅
3. eslint + pino + cron — инфраструктура ✅
4. Party matching (CR6-005) — закрыт ✅
5. Синхронный парсинг, error counters, progress bar ✅
6. UI: КАПС→капс, courtName, настройки расписания ✅

### Фаза 7: Текущая — Go UI (2026-07-27)
1. **Go TUI прототип** — Bubble Tea, Win32 API, список/детали/добавление/удаление/прогон/уведомления ✅
2. **Go Web UI** — `--serve` режим, `go:embed` статика, порт :8768 ⏳
3. **Один бинарник** — объединение TUI + Web в `courtdesk-ui` ⏳
4. WebSocket / SSE — push-уведомления (отложено)
5. API token auth (CR6-003) (отложено)
6. Puppeteer browser pool (CR6-012) (отложено)