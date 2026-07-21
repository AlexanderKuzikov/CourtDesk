# CourtDesk — Архитектура
> CRM-оркестратор поиска и мониторинга судебных дел РФ.
> Единый API-сервис для интеграции с CRM (1С) и параллельного Web UI.
> Собирается из CourtSniffer (поиск), CourtFlow (мониторинг) и существующего скелета CourtDesk (intake).

> **Обновлено 2026-07-22** по результатам Code Review (NEW-001..011).

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

## 2. Функциональные блоки

### 2.1 Поиск дел
- По номеру дела (caseNumber)
- По участникам (defendant/plaintiff + даты)
- По URL карточки дела (извлечение номера через intake)
- Все типы судов: district, appeal, cassation, magistrate
- Captcha для magistrate (Puppeteer + RuCaptcha)
- CP1251-encoding для PHP-форм sudrf.ru

### 2.2 Мониторинг
- Периодический парсинг карточки дела по URL
- Фиксация изменений (новые события, изменение статуса, состава участников)
- Retry-прогон для «устаревших» и error-дел
- Хранение истории изменений с корректным `caseUid`

### 2.3 Отслеживание вступления в силу
- Извлечение `legalForceDate` из карточки (уже есть в поиске)
- Уведомление / отметка при наступлении даты
- Расчёт оставшихся сроков (до вступления / после вступления)

### 2.4 Классификация запросов (Intake)
- URL карточки дела → type: case_card
- Номер дела / ФИО (только кириллица) → type: search
- Мусор → type: malformed
- Извлечение courtId, courtType, caseId из URL

### 2.5 Справочник судов
- 10 287 записей (unified-courts.json, OKTMO + телефоны)
- O(1)-lookup по code и subdomain
- AND-поиск по названию (`filter → slice → map`, не `filter → map → slice`)

---

## 3. Архитектура пакетов

```
courtdesk/
├── packages/
│   ├── core/              # Фундамент: типы, справочник, encoding, config
│   │   ├── types.ts       # Единые типы (CourtType, CaseStatus, CaseHistoryEvent…)
│   │   ├── courts.ts      # Справочник судов (unified-courts.json)
│   │   ├── encoding.ts    # CP1251 percent-encoder
│   │   └── config.ts      # .env + config.json
│   │
│   ├── captcha/           # Puppeteer + RuCaptcha (один экземпляр)
│   │   ├── session.ts     # Browser-сессия: капча → решение → поиск
│   │   └── rucaptcha.ts   # Клиент RuCaptcha API v2
│   │
│   ├── search/            # Поиск дел (из CourtSniffer)
│   │   ├── adapters/      # district, appeal, cassation, magistrate
│   │   └── registry.ts    # getSearchAdapter(courtType)
│   │
│   ├── parse/             # Парсинг карточек дел (из CourtFlow)
│   │   ├── adapters/      # district, appeal, cassation, magistrate
│   │   └── registry.ts    # getParseAdapter(courtType)
│   │
│   ├── intake/            # Классификатор запросов
│   │   ├── classify.ts    # classify(input) → Classification
│   │   └── types.ts       # IntakeRequest, Classification
│   │
│   ├── scheduler/         # Оркестратор мониторинга
│   │   └── orchestrator.ts # runFull / runRetry / runNew / runSingle
│   │
│   ├── store/             # Хранилище состояния (JSON, tmp+rename)
│   │   ├── cases.ts       # CRUD для дел + in-memory cache
│   │   ├── events.ts      # История изменений
│   │   └── index.ts       # Barrel
│   │
│   └── api/               # Express-сервер (точка входа)
│       ├── server.ts      # createApp() + подключение всех роутеров
│       ├── routes/
│       │   ├── health.ts         # GET /api/health
│       │   ├── status.ts         # GET /api/status  ← NEW-003
│       │   ├── notifications.ts  # GET /api/notifications  ← NEW-003
│       │   ├── cases.ts          # CRUD /api/cases
│       │   ├── search.ts         # POST /api/search/*
│       │   ├── parse.ts          # POST /api/parse/*
│       │   ├── courts.ts         # GET /api/courts
│       │   └── intake.ts         # POST /api/intake
│       └── middleware/
│           └── error.ts          # Global error handler
```

---

## 4. Data Flow

### 4.1 Поиск (запрос от CRM)
```
CRM ──→ POST /api/search/by-number { courtId, caseNumber }
         │
         ├─→ core/courts.ts (разрешить courtId → subdomain)
         ├─→ search/adapters/district.ts (или appeal/cassation/magistrate)
         └─→ Response { success, data: SearchResult[] }
```

### 4.2 Мониторинг (добавление дела)
```
CRM ──→ POST /api/cases { url, courtId, courtType, caseNumber }
         │
         ├─→ store/cases (addCase)
         ├─→ store/events (addEvent с корректным caseUid)
         └─→ Response { success, data: WatchedCase }
```

### 4.3 Циклический прогон мониторинга
```
POST /api/parse/run { mode: 'full' | 'retry' | 'new' }
  → 202 Accepted
  → runFull() в фоне
       │
       ├─→ listCases({ status: 'monitoring' | 'decision' | 'error' })
       ├─→ processOne(case)
       │     ├─→ fetchHtml(url)         # await → event loop свободен
       │     ├─→ getCase(uid)           # NEW-002: перечитать перед записью
       │     ├─→ updateCase(...)        # обновить состояние
       │     └─→ addEvent(uid, makeEvent(uid, ...))  # NEW-001: caseUid корректен
       └─→ updateCase(uid, { status: 'error' })  # при исключении
```

### 4.4 Дашборд (Web UI)
```
Браузер ──→ GET /api/status
             → { monitoring, waiting, decision, enforcedToday, health }

Браузер ──→ GET /api/notifications
             → { data: Notification[] }

Браузер ──→ GET /api/cases?status=monitoring
             → { data: WatchedCase[] }
```

---

## 5. Типы (единые)

### 5.1 Общие
```typescript
export type CourtType = 'district' | 'appeal' | 'cassation' | 'magistrate';

// NEW-007: полный lifecycle дела
export type CaseStatus =
  | 'waiting'    // ожидается появление дела
  | 'monitoring' // активный мониторинг
  | 'decision'   // решение вынесено
  | 'enforced'   // решение вступило в силу
  | 'archived'   // заархивировано пользователем
  | 'error';     // ошибка последнего прогона
```

### 5.2 Поиск (из Sniffer)
```typescript
export interface SearchRequest {
  courtId: string;
  courtCode?: string;
  courtType: CourtType;
  caseNumber?: string;
  plaintiff?: string;
  defendant?: string;
  filingDateFrom?: string;
  filingDateTo?: string;
}

export interface SearchResult {
  caseNumber: string;
  caseUrl: string;
  uid: string;
  judge: string | null;
  result: string | null;
  legalForceDate: string | null;
  // ... (полный список в core/types.ts)
}
```

### 5.3 Хранилище
```typescript
export interface WatchedCase {
  uid: string;
  url: string;
  courtId: string;
  courtCode: string;
  courtType: CourtType;
  number: string;
  status: CaseStatus; // включает 'archived'
  result: string | null;
  legalForceDate: string | null;
  legalForceNotified: boolean;
  userId: string | null;
  lastChecked: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CaseHistoryEvent {
  uid: string;
  caseUid: string; // NEW-001: всегда заполнен
  type: string;
  message: string;
  data: Record<string, unknown>;
  createdAt: string;
}
```

### 5.4 API-запросы
```typescript
// NEW-006: mode синхронизирован с реальным switch
export interface ParseRunRequest {
  mode: 'full' | 'retry' | 'new';
}

export interface DashboardStatus {
  monitoring: number;
  waiting: number;
  decision: number;
  enforcedToday: number;
  health: 'ok' | 'degraded' | 'error';
}
```

---

## 6. API-контракты (для CRM)

### 6.1 Эндпоинты

| Метод | Путь | Назначение | Тело / Query |
|-------|------|-----------|--------------|
| `GET` | `/api/health` | Liveness probe | — |
| `GET` | `/api/status` | Счётчики дашборда + health | — |
| `GET` | `/api/notifications` | Уведомления о событиях | — |
| `GET` | `/api/cases` | Список дел | `?status=&userId=&courtId=&q=` |
| `GET` | `/api/cases/stats` | Детальная статистика | — |
| `GET` | `/api/cases/:uid` | Карточка дела | — |
| `POST` | `/api/cases` | Добавить в мониторинг | `{ url, courtId, courtType, caseNumber }` |
| `PATCH` | `/api/cases/:uid` | Обновить разрешённые поля | `{ status?, result?, ... }` |
| `DELETE` | `/api/cases/:uid` | Удалить дело | — |
| `POST` | `/api/cases/wait` | Отслеживать появление | `{ courtId, courtType, party, filingDate }` |
| `POST` | `/api/search/by-number` | Поиск по номеру | `{ courtId, courtType?, caseNumber }` |
| `POST` | `/api/search/by-party` | Поиск по участникам | `{ courtId, courtType?, defendant?, plaintiff? }` |
| `POST` | `/api/parse/url` | Парсинг карточки дела | `{ url, courtId?, courtType? }` |
| `POST` | `/api/parse/run` | Запуск прогона (202 Accepted) | `{ mode: 'full'\|'retry'\|'new' }` |
| `GET` | `/api/courts` | Поиск судов | `?q=` |
| `GET` | `/api/courts/:id` | Инфо о суде | — |
| `POST` | `/api/intake` | Классификация входного текста | `{ input: string }` |

### 6.2 Формат ответа
```typescript
interface ApiResponse<T> {
  success: true;
  data: T;
}
interface ApiError {
  success: false;
  error: string;
  code: string;
}
```

### 6.3 PATCH /api/cases/:uid — разрешённые поля
Только: `status`, `result`, `legalForceDate`, `legalForceNotified`, `userId`, `url`.
Нельзя менять: `uid`, `createdAt`, `courtId`, `courtType`, `number`.

---

## 7. Хранилище (store)

### 7.1 Формат файлов
```
data/
├── cases.json   # Record<string, WatchedCase>
└── events.json  # Record<string, CaseHistoryEvent[]>
```

### 7.2 Атомарность
Все записи через tmp + rename (как в CourtFlow):
```
cases.json → cases.tmp.XXXX → rename → cases.json
```

### 7.3 In-memory cache
Один `readFileSync` при старте. `_cache: Map<string, WatchedCase>` обновляется при каждом `addCase` / `updateCase` / `deleteCase`. Cache является единственным источником истины в runtime.

### 7.4 Race condition (известное ограничение)
Node.js однопоточен, но `await fetchHtml()` освобождает event loop. В окне между `await` HTTP-запрос может изменить `_cache`. Scheduler перечитывает `getCase()` перед каждым `updateCase` (NEW-002). При переходе на worker_threads — нужен proper mutex.

---

## 8. Captcha

**Стратегия:** один модуль `captcha/`, используемый и search, и parse (для magistrate).

**Как работает:**
1. Открыть страницу msudrf через Puppeteer
2. Обнаружить капчу (маркер `kcaptchaForm`)
3. Прочитать изображение через browser-context fetch с credentials:'include'
4. Отправить в RuCaptcha API v2
5. Заполнить ответ, отправить форму
6. Вернуть сессию (куки) для дальнейших запросов в том же browser context

**Timeout:** 120s polling RuCaptcha, 60s browser navigation.

---

## 9. Scheduler (оркестратор мониторинга)

### 9.1 Режимы запуска

| Режим | Когда | Что делает |
|-------|-------|-----------|
| **full** | Вручную / по расписанию | Перепарсить monitoring + decision + error дела |
| **retry** | После full (отложенно) | Только устаревшие monitoring + error дела |
| **new** | После добавления waiting-дел | Поиск по участнику через searchAdapter |

### 9.2 Обработка ошибок
- При исключении в `processOne` — `status` → `'error'`, `lastChecked` обновляется
- `runFull` и `runRetry` включают error-дела (NEW-004)
- `isStale()` определяет стратегию retry по `lastChecked`

### 9.3 Расписание
По умолчанию: полный прогон — `0 8 * * 1,3,5` (пн/ср/пт в 8:00)
Retry-прогон через 3 часа после полного.
Настраивается в `.env` или `config.json`.

---

## 10. Web UI

### 10.1 Принципы
- Одна HTML-страница
- Event delegation, data-* атрибуты, XSS-safe
- Тёмная тема
- Все запросы через fetch к `/api/*`
- Никаких сборщиков (webpack/vite) — только статика Express

### 10.2 Экраны

| Экран | Что показывает |
|-------|---------------|
| **Дашборд** | GET /api/status → счётчики; GET /api/notifications → события |
| **Поиск** | Подбор суда по названию, ввод code, номер дела / ФИО, таблица результатов |
| **Мониторинг** | Список отслеживаемых дел, статус, дата последней проверки |
| **Детали дела** | Карточка дела, история изменений, дата вступления в силу |
| **Даты вступления** | Список дел с ближайшими датами вступления |

---

## 11. Что наследуется из существующих проектов

| Из Sniffer | Из Flow | Из Desk |
|-----------|---------|---------|
| search/adapters (4 шт) | parse/adapters (4 шт) | intake/classify |
| core/encoding.ts | scheduler/orchestrator.ts | core/types.ts *(референс)* |
| core/courts.ts + unified-courts.json | — | api/server.ts *(референс)* |
| captcha/session.ts + rucaptcha.ts | — | — |

---

## 12. Стратегия миграции

### Фаза 1–4: Выполнено ✅
- Фундамент, поиск, парсинг, оркестрация, API, инфраструктура
- Code Review 2026-07-21 + 2026-07-22 применён

### Фаза 5: В работе
1. Тесты для новых роутов (`/api/status`, `/api/notifications`)
2. `POST /api/resolve` — суд + номер → ссылка
3. Viewer (Web UI дашборд)
4. Persistent уведомления (`store/notifications.ts`)
5. Smoke-тест magistrate
