# CourtDesk — Архитектура

> CRM-оркестратор поиска и мониторинга судебных дел РФ.
> Единый API-сервис для интеграции с CRM (1С) и параллельного Web UI.
> Собирается из CourtSniffer (поиск), CourtFlow (мониторинг) и существующего скелета CourtDesk (intake).

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
- Retry-прогон для «устаревших» дел
- Хранение истории изменений

### 2.3 Отслеживание вступления в силу
- Извлечение `legalForceDate` из карточки (уже есть в поиске)
- Уведомление / отметка при наступлении даты
- Расчёт оставшихся сроков (до вступления / после вступления)

### 2.4 Классификация запросов (Intake)
- URL карточки дела → type: case_card
- Номер дела / ФИО → type: search
- Мусор → type: malformed
- Извлечение courtId, courtType, caseId из URL

### 2.5 Справочник судов
- 10 287 записей (unified-courts.json, OKTMO + телефоны)
- O(1)-lookup по code и subdomain
- AND-поиск по названию

---

## 3. Архитектура пакетов

```
courtdesk/
├── packages/
│   ├── core/                   # Фундамент: типы, справочник, encoding, config
│   │   ├── types.ts            #   Единые типы (CourtType, Case, SearchResult…)
│   │   ├── courts.ts           #   Справочник судов (unified-courts.json)
│   │   ├── encoding.ts         #   CP1251 percent-encoder
│   │   └── config.ts           #   .env + config.json
│   │
│   ├── captcha/                # Puppeteer + RuCaptcha (один экземпляр)
│   │   ├── session.ts          #   Browser-сессия: капча → решение → поиск
│   │   └── rucaptcha.ts        #   Клиент RuCaptcha API v2
│   │
│   ├── search/                 # Поиск дел (из CourtSniffer)
│   │   ├── adapters/           #   district, appeal, cassation, magistrate
│   │   ├── registry.ts         #   getSearchAdapter(courtType)
│   │   └── cli.ts              #   CLI-точка входа (search:case / search:party)
│   │
│   ├── parse/                  # Парсинг карточек дел (из CourtFlow)
│   │   ├── adapters/           #   district, appeal, cassation, magistrate
│   │   └── registry.ts         #   getParseAdapter(courtType)
│   │
│   ├── intake/                 # Классификатор запросов (из CourtDesk)
│   │   ├── classify.ts         #   classify(input) → Classification
│   │   └── types.ts            #   IntakeRequest, Classification
│   │
│   ├── scheduler/              # Оркестратор мониторинга (из CourtFlow)
│   │   ├── orchestrator.ts     #   Полный прогон + retry-прогон
│   │   └── smoke.ts            #   E2E smoke-тест
│   │
│   ├── store/                  # Хранилище состояния (JSON, tmp+rename)
│   │   ├── cases.ts            #   CRUD для дел
│   │   ├── events.ts           #   История изменений
│   │   ├── clients.ts          #   Клиенты (привязка дел к клиентам CRM)
│   │   └── index.ts            #   Barrel
│   │
│   ├── api/                    # Express-сервер (точка входа)
│   │   ├── server.ts           #   Запуск, middleware
│   │   ├── routes/             #   Роуты по функционалу
│   │   │   ├── search.ts       #     POST /api/search/case-number, /api/search/party
│   │   │   ├── monitor.ts      #     POST /api/monitor/add, GET /api/monitor/status
│   │   │   ├── intake.ts       #     POST /api/intake
│   │   │   ├── courts.ts       #     GET /api/courts
│   │   │   ├── legal-force.ts  #     GET /api/legal-force/:uid
│   │   │   └── health.ts       #     GET /api/health
│   │   └── middleware/         #   Валидация, ошибки, CORS
│   │
│   ├── viewer/                 # Web UI (параллельный интерфейс)
│   │   ├── public/             #   Single-file HTML (как в Sniffer)
│   │   └── server.ts           #   Express или встраивается в api/server.ts
│   │
│   └── cli/                    # CLI + TUI (опционально)
│       ├── search.ts           #   Поиск из командной строки
│       └── tui.ts              #   Терминальный дашборд (blessed, из Flow)
│
├── .env.example
├── package.json                # Один package, workspaces не нужны
└── tsconfig.json
```

---

## 4. Data Flow

### 4.1 Поиск (запрос от CRM)

```
CRM ──→ POST /api/search/case-number { courtId, caseNumber }
         │
         ├─→ core/courts.ts (разрешить courtId → subdomain)
         ├─→ search/adapters/district.ts (или appeal/cassation/magistrate)
         ├─→ ← SearchResult[]
         │
         └─→ Response { found, count, results, court }
```

### 4.2 Мониторинг (добавление дела)

```
CRM ──→ POST /api/monitor/add { url, courtId, courtType }
         │
         ├─→ intake/classify (валидация URL)
         ├─→ parse/adapters (парсинг карточки)
         ├─→ store/cases (сохранение)
         ├─→ scheduler (добавить в расписание)
         │
         └─→ Response { uid, status, suggested }
```

### 4.3 Циклический прогон мониторинга

```
scheduler/orchestrator (по расписанию или вручную)
         │
         ├─→ store/cases → список активных дел
         ├─→ parse/adapters (для каждого дела)
         ├─→ store/events (сохранить изменения)
         └─→ store/cases (обновить lastChecked)
```

### 4.4 Web UI

```
Браузер ──→ viewer/public/index.html
              │
              ├──→ GET /api/courts (справочник)
              ├──→ POST /api/search/... (поиск)
              ├──→ POST /api/monitor/add (добавить)
              └──→ GET /api/monitor/status (проверить)
```

Web UI использует **те же API-эндпоинты**, что и CRM. Разница только в клиенте (браузерный JS vs HTTP-запросы из 1С).

---

## 5. Типы (единые)

### 5.1 Общие

```typescript
export type CourtType = 'district' | 'appeal' | 'cassation' | 'magistrate';

export type CaseStatus = 'searching' | 'monitoring' | 'completed' | 'archived' | 'error';

export interface CourtInfo {
  code: string;
  name: string;
  courtType: CourtType;
  subdomain: string;
  region: string;
  address: string;
  website: string;
  phone: string;
  oktmo: string;
  oktmoMethod: string;
}
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
  filingDate: string | null;
  decisionDate: string | null;
  parties: { role: string; name: string }[];
  courtId: string;
  courtCode?: string;
  courtType: CourtType;
}
```

### 5.3 Парсинг карточки (из Flow, упрощён)

```typescript
export interface CaseCard {
  uid: string;
  number: string;
  court: string;        // subdomain
  courtType: CourtType;
  filingDate: string | null;
  judge: string | null;
  result: string | null;
  legalForceDate: string | null;
  hearingDate: string | null;
  category: string[];
  events: CaseEvent[];
  parties: CaseParty[];
}

export interface CaseEvent {
  eventName: string | null;
  eventDate: string | null;
  result: string | null;
  judge: string | null;
}

export interface CaseParty {
  role: string;
  name: string;
}
```

### 5.4 Хранилище

```typescript
export interface WatchedCase {
  uid: string;
  url: string;
  courtId: string;
  courtCode: string;
  courtType: CourtType;
  number: string;
  status: CaseStatus;
  legalForceDate: string | null;
  legalForceNotified: boolean;
  clientId?: string;
  lastChecked: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CaseEventLog {
  uid: string;
  caseUid: string;
  type: string;
  date: string;
  data: Record<string, unknown>;
  createdAt: string;
}
```

---

## 6. API-контракты (для CRM)

### 6.1 Эндпоинты

| Метод | Путь | Назначение | Тело / Query |
|-------|------|-----------|--------------|
| `POST` | `/api/intake` | Классификация запроса | `{ input: string }` |
| `POST` | `/api/search/case-number` | Поиск по номеру дела | `{ courtId, courtType?, caseNumber }` |
| `POST` | `/api/search/party` | Поиск по участникам | `{ courtId, courtType?, defendant?, plaintiff?, from?, to? }` |
| `POST` | `/api/parse/url` | Парсинг карточки дела | `{ url, courtId?, courtType? }` |
| `POST` | `/api/monitor/add` | Добавить дело в мониторинг | `{ url, courtId?, courtType?, clientId? }` |
| `DELETE` | `/api/monitor/:uid` | Удалить из мониторинга | — |
| `GET` | `/api/monitor/status` | Список дел в мониторинге | `?clientId=&status=` |
| `GET` | `/api/monitor/status/:uid` | Статус и история по делу | — |
| `GET` | `/api/legal-force/:uid` | Статус вступления в силу | — |
| `GET` | `/api/legal-force/reminders` | Дела, где скоро/уже наступило | `?days=7` |
| `GET` | `/api/courts` | Поиск судов | `?q=` или пусто |
| `GET` | `/api/courts/:id` | Инфо о суде | — |
| `GET` | `/api/health` | Статус сервиса | — |

### 6.2 Формат ответа

```typescript
// Успех
interface ApiResponse<T> {
  success: true;
  data: T;
  suggested?: string[];   // Подсказки сценариев (как в CourtDesk)
}

// Ошибка
interface ApiError {
  success: false;
  error: string;
  code?: string;          // 'COURT_NOT_FOUND' | 'PARSE_ERROR' | 'CAPTCHA_REQUIRED' | ...
}
```

### 6.3 1С-интеграция

Формат: HTTP POST/GET, Content-Type: application/json, тела запросов/ответов — UTF-8.
1С умеет работать с REST из коробки (HTTPСоединение, ЧтениеJSON).

---

## 7. Хранилище (store)

### 7.1 Формат файлов

```
data/
├── cases.json            # Record<string, WatchedCase>
├── events.json           # Record<string, CaseEventLog[]>
└── clients.json          # Record<string, Client> (если нужно)
```

### 7.2 Атомарность

Все записи через tmp + rename (как в CourtFlow):
```
cases.json → cases.tmp.XXXX → rename → cases.json
```

### 7.3 Индексы

Для быстрого поиска по `clientId`, `status`, `legalForceDate` — держать в памяти Map,
восстанавливаемые при старте из JSON.

---

## 8. Captcha

**Стратегия:** один модуль `captcha/`, используемый и search, и parse (для magistrate).
Копипаста из Sniffer + Flow устраняется.

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
| **full** | Вручную / по расписанию | Перепарсить все активные дела |
| **retry** | После full (отложенно) | Только дела, где lastChecked > staleThresholdH |
| **incremental** | После добавления нового дела | Парсинг только нового дела |

### 9.2 Расписание

По умолчанию: полный прогон — `0 8 * * 1,3,5` (пн/ср/пт в 8:00)
Retry-прогон через 3 часа после полного.
Настраивается в `.env` или `config.json`.

---

## 10. Web UI

### 10.1 Принципы
- Одна HTML-страница (как в CourtSniffer viewer)
- Event delegation, data-* атрибуты, XSS-safe
- Тёмная тема
- Все запросы через fetch к `/api/*`
- Никаких сборщиков (webpack/vite) — только статика Express

### 10.2 Экраны

| Экран | Что показывает |
|-------|---------------|
| **Поиск** | Подбор суда по названию, ввод code, номер дела / ФИО, таблица результатов |
| **Мониторинг** | Список отслеживаемых дел, статус, дата последней проверки |
| **Детали дела** | Карточка дела, история изменений, дата вступления в силу |
| **Даты вступления** | Календарь/список дел с ближайшими датами вступления |

---

## 11. Что наследуется из существующих проектов

| Из Sniffer | Из Flow | Из Desk |
|-----------|---------|---------|
| search/adapters (4 шт) | parse/adapters (4 шт) | intake/classify |
| core/encoding.ts | core/urls.ts (извлечение case_id) | core/types.ts *(референс)* |
| core/courts.ts + unified-courts.json | scheduler/orchestrator.ts | api/server.ts *(референс)* |
| captcha/session.ts + rucaptcha.ts | exporter/json.ts | — |
| viewer/public/index.html | viewer/public/index.html *(референс)* | — |
| cli.ts (search) | cli/tui.ts, client.ts | — |
| config.ts | core/config.ts | — |
| smoke.ts | scheduler/smoke.ts | — |

Каждый модуль не копируется вслепую, а адаптируется под единые типы и структуру.

---

## 12. Стратегия миграции

### Фаза 1: Фундамент
1. Создать структуру проекта (package.json, tsconfig, eslint)
2. `core/` — единые типы, справочник судов, encoding, config
3. `captcha/` — Puppeteer + RuCaptcha (один раз)
4. Проверить: `tsc --noEmit`, smoke-тест

### Фаза 2: Поиск + Парсинг
5. `search/` — адаптеры поиска (из Sniffer)
6. `parse/` — адаптеры парсинга (из Flow)
7. `intake/` — классификатор (из Desk)

### Фаза 3: Оркестрация
8. `store/` — JSON-хранилище
9. `scheduler/` — оркестратор мониторинга

### Фаза 4: Интерфейсы
10. `api/` — Express API (все эндпоинты)
11. `viewer/` — Web UI
12. Интеграционное тестирование (CRM + UI)
13. Заморозка старых репозиториев

---

## 13. Решения (ADR)

| Дата | Решение | Обоснование |
|------|---------|-------------|
| 2026-07-21 | Единый проект (не микросервисы) | Одна кодовая база, один деплой, нет накладных расходов на сеть. Разнести можно потом, собрать сейчас — сложнее. |
| 2026-07-21 | Один package.json, не workspaces | Все пакеты в одном процессе, одна версия зависимостей, npm install — один раз. |
| 2026-07-21 | JSON-хранилище (не SQL) | Объём данных небольшой (< 10 000 дел). SQLite даёт транзакции, но tmp+rename достаточно. При росте — миграция на SQLite без смены интерфейса store/. |
| 2026-07-21 | REST API (не GraphQL) | 1С умеет REST. GraphQL — overkill для 5-10 эндпоинтов. |
| 2026-07-21 | API и UI — один Express-процесс | Экономия портов, нет CORS при разработке. Если понадобится — UI выносится за reverse-proxy. |
| 2026-07-21 | Search ≠ Parse (разные адаптеры) | Sniffer ищет (name_op=r), Flow разбирает карточку (name_op=case). Разные URL, разный парсинг. Один интерфейс — разные реализации. |
| 2026-07-21 | Core — единый источник типов | CourtType, SearchResult, CaseCard — в одном файле. Никаких копий по пакетам. |
| 2026-07-21 | Intake — глубокий модуль (один `classify`) | Весь разбор URL/текста внутри. Адаптеры поиска и парсинга не занимаются классификацией. |
