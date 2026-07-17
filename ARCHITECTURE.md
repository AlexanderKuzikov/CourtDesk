# CourtDesk — Архитектура

## Роль

CourtDesk — CRM-оркестратор. Он не ищет дела (это делает CourtSniffer), не парсит карточки (это делает CourtFlow). Он **принимает intent, классифицирует его, маршрутизирует и хранит состояние**.

---

## Компоненты

```
                 User / CRM / TUI
                        │
                        ▼
┌─────────────────────────────────────┐
│           Intake                     │  ← packages/intake/
│                                     │
│  Классифицирует запрос:             │
│  - case_card (URL карточки дела)    │
│  - search_request (номер/ФИО)      │
│  - malformed (не пойми что)        │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│           Dispatcher                 │  ← packages/api/ + packages/services/
│                                     │
│  Маршрутизирует:                    │
│  - case_card  ──→ CourtFlow         │
│  - search     ──→ CourtSniffer      │
│  - malformed  ──→ отказ с причиной  │
└──────────┬──────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│           CaseStore                  │  ← packages/exporter/
│                                     │
│  Хранит состояние:                  │
│  - дела (case)                      │
│  - клиенты (client)                 │
│  - события (event)                  │
│  - сценарии (scenario)              │
└─────────────────────────────────────┘
```

---

## Intake (классификатор)

### Вход

```typescript
interface IntakeRequest {
  input: string;  // URL или номер дела / ФИО
  mode?: 'auto' | 'url' | 'text';
}
```

### Классификация

Функция `classify(input: string): Classification`

```typescript
type Classification =
  | { type: 'case_card'; url: string; courtId: string; courtType: CourtType; caseId: string }
  | { type: 'search'; courtId?: string; courtType?: CourtType; caseNumber?: string; defendant?: string }
  | { type: 'malformed'; error: string };
```

### Правила классификации

**case_card** (URL карточки дела):
- Домен `.sudrf.ru` или `.msudrf.ru`
- Есть `case_id` (только digits)
- Для `.sudrf.ru`: `name_op === 'case'`
- Для `.msudrf.ru`: `op === 'cs'`

**search** (текстовый запрос на поиск):
- Не является URL
- Содержит номер дела (формат `X-XXXX/XXXX`) или ФИО (2-3 слова)
- Или полный URL суда с номером дела

**malformed** (всё остальное):
- URL не sudrf/msudrf
- URL без `case_id`
- Пустая строка
- Неразборчивый текст

### Почему Intake — глубокий модуль

Интерфейс — одна функция `classify`. Реализация включает:
- Парсинг URL (sudrf.ru / msudrf.ru)
- Извлечение параметров (case_id, case_uid, delo_id, name_op, op)
- Определение типа суда (district/appeal/cassation/magistrate)
- Извлечение courtId из домена
- Детект формата номера дела
- Разбор ФИО

---

## API-контракты

### CourtDesk → CourtSniffer

```http
POST /api/search/case-number
Content-Type: application/json

{
  "courtId": "sverdlov--perm",
  "courtType": "district",
  "caseNumber": "2-4160/2026"
}
```

```http
POST /api/search/party
Content-Type: application/json

{
  "courtId": "sverdlov--perm",
  "courtType": "district",
  "defendant": "Иванов И.И."
}
```

### CourtDesk → CourtFlow (предлагаемый API)

```http
POST /api/parse
Content-Type: application/json

{
  "url": "https://sverdlov--perm.sudrf.ru/modules.php?...",
  "courtId": "sverdlov--perm",
  "courtType": "district"
}
```

```http
GET /api/case/:uid
→ Case object
```

```http
GET /api/status/:jobId
→ { status: 'pending' | 'running' | 'done' | 'error' }
```

---

## Data Flow

### Сценарий: юрист нашёл дело и хочет отслеживать

```
1. POST /api/intake { input: "https://sverdlov--perm.sudrf.ru/...case_id=..." }
2. Intake.classify → { type: 'case_card', courtId, courtType, caseId }
3. Dispatcher → POST CourtFlow /api/parse
4. CourtFlow → парсит, сохраняет JSON, возвращает uid
5. CaseStore → сохраняет { url, courtId, uid, status: 'monitoring' }
6. Response → { uid, status, suggested: ['monitor', 'notify_on_force'] }
```

### Сценарий: юрист ищет дело по номеру

```
1. POST /api/intake { input: "2-4160/2026" }
2. Intake.classify → { type: 'search', caseNumber: '2-4160/2026' }
   (не хватает courtId — нужно уточнение)
3. Response → { type: 'search', missing: ['courtId'], suggested: ['выберите суд'] }

   (или если courtId указан:)
1. POST /api/intake { input: "2-4160/2026", courtId: "sverdlov--perm" }
2. Intake.classify → { type: 'search', courtId: 'sverdlov--perm', caseNumber: '2-4160/2026' }
3. Dispatcher → POST CourtSniffer /api/search/case-number
4. CourtSniffer → возвращает результаты поиска
5. Response → { results: [...], suggested: ['monitor_found'] }
```

---

## Storage (JSON)

Файлы в `data/`:

```
data/
├── cases.json        # Record<string, Case>
├── clients.json      # Record<string, Client>
├── events.json       # Record<string, Event[]>
└── scenarios.json    # Scenario[]
```

Формат `Case`:

```typescript
interface Case {
  uid: string;
  url: string;
  courtId: string;
  courtType: CourtType;
  number: string;
  status: CaseStatus;
  lastChecked: string | null;
  lastEvent: string | null;
  createdAt: string;
  updatedAt: string;
}
```

Атомарность записи — tmp + rename (как в CourtFlow).
