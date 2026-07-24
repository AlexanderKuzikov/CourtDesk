# CourtDesk для 1С-интегратора — материал к встрече

> 2026-07-24 · v0.4.0 · формат: обсуждение, не спецификация

---

## Что это

CourtDesk — REST-сервис (Node.js/Express, один процесс). Забирает данные с sudrf.ru/msudrf.ru, хранит у себя, отдаёт по API. 1С работает только с CourtDesk, с судами не взаимодействует напрямую.

**Зачем 1С это нужно:** не писать свой парсинг ГАС «Правосудие», не решать капчу мировых судов, не хранить URL-ы дел. Всё это делает CourtDesk. 1С получает готовые JSON-ы: статус дела, дата вступления, результат, история изменений.

---

## Что готово в API

18 эндпоинтов, все работают, 57 тестов зелёных.

| Группа | Эндпоинт | Что делает |
|--------|----------|------------|
| **Дела** | `GET /api/cases?status=&userId=&courtId=&q=` | Список дел с фильтрами |
| | `GET /api/cases/:uid` | Одно дело |
| | `POST /api/cases` | Добавить в мониторинг |
| | `PATCH /api/cases/:uid` | Обновить (whitelist: status, result, legalForceDate, userId, url, legalForceNotified) |
| | `DELETE /api/cases/:uid` | Удалить |
| | `POST /api/cases/wait` | Отслеживать появление (по ФИО + дате) |
| **Поиск** | `POST /api/search/by-number` | По номеру дела |
| | `POST /api/search/by-party` | По участникам |
| **Мониторинг** | `POST /api/parse/run { mode: full\|retry\|new }` | Запустить прогон (202 Accepted) |
| | `POST /api/parse/url` | Парсинг одного URL |
| **Справочники** | `GET /api/courts?q=` | Поиск судов (10 287 записей) |
| | `GET /api/courts/:id` | Один суд |
| | `POST /api/resolve` | Суд + номер → URL карточки |
| **Прочее** | `GET /api/status` | Счётчики: monitoring, waiting, decision, enforcedToday, health |
| | `GET /api/notifications` | Пул уведомлений |
| | `POST /api/intake` | Классификация ввода (URL / номер / ФИО → тип) |
| | `GET /api/health` | Liveness probe |

**Формат ответа:** `{ success: true, data: T }` или `{ success: false, error: "...", code: "..." }`.

**Жизненный цикл дела:**
```
waiting → monitoring → decision → enforced → archived
                        ↕
                     error (автоматический retry)
```

---

## API — подробное описание

### Формат обмена

**Базовый URL:** `http://<host>:8767`  
**Content-Type:** `application/json`  
**Кодировка:** UTF-8  
**Таймаут:** рекомендуется 60 секунд для search/parse, 10 секунд для CRUD

### Формат ответа — успех

```json
{
  "success": true,
  "data": { ... }
}
```

### Формат ответа — ошибка

```json
{
  "success": false,
  "error": "Case not found",
  "code": "NOT_FOUND"
}
```

**Коды ошибок:**

| HTTP | code | Когда |
|------|------|-------|
| 400 | `VALIDATION_ERROR` | Неверное тело запроса |
| 404 | `NOT_FOUND` | Дело / суд не найдены |
| 409 | `RUN_IN_PROGRESS` | Прогон уже запущен (повторный `POST /api/parse/run`) |
| 409 | `DUPLICATE_CASE` | Дело с таким номером + судом уже есть |
| 500 | `INTERNAL_ERROR` | Внутренняя ошибка |

---

### Ключевые объекты

#### WatchedCase — дело в мониторинге

```json
{
  "uid": "550e8400-e29b-41d4-a716-446655440000",
  "url": "https://leninsky--perm.sudrf.ru/modules.php?name=sud_delo&srv_num=1&name_op=case&case_id=12345",
  "courtId": "leninsky--perm",
  "courtCode": "59RS0007",
  "courtType": "district",
  "number": "2-1234/2024",
  "status": "monitoring",
  "result": null,
  "legalForceDate": null,
  "legalForceNotified": false,
  "userId": "1c-001",
  "lastChecked": "2026-07-24T09:00:00.000Z",
  "createdAt": "2026-07-20T12:00:00.000Z",
  "updatedAt": "2026-07-24T09:00:00.000Z"
}
```

| Поле | Тип | Описание |
|------|-----|----------|
| `uid` | string | UUID дела (не меняется) |
| `url` | string | URL карточки на сайте суда |
| `courtId` | string | Subdomain суда (например `leninsky--perm`) |
| `courtCode` | string | Код из справочника (например `59RS0007`) |
| `courtType` | enum | `district` / `appeal` / `cassation` / `magistrate` |
| `number` | string | Номер дела |
| `status` | enum | `waiting` / `monitoring` / `decision` / `enforced` / `archived` / `error` |
| `result` | string\|null | Текст решения (появляется при status=decision) |
| `legalForceDate` | string\|null | Дата вступления в силу (YYYY-MM-DD) |
| `legalForceNotified` | boolean | Уведомление о вступлении отправлено |
| `userId` | string\|null | Идентификатор пользователя из 1С |
| `lastChecked` | string\|null | Последняя проверка (ISO) |
| `createdAt` | string | Создано (ISO) |
| `updatedAt` | string | Обновлено (ISO) |

#### SearchResult — результат поиска

```json
{
  "caseNumber": "2-1234/2024",
  "caseUrl": "https://leninsky--perm.sudrf.ru/modules.php?name=sud_delo&srv_num=1&name_op=case&case_id=12345",
  "uid": "uuid-генерируется-при-добавлении",
  "judge": "Иванова А.С.",
  "result": "Иск удовлетворён частично",
  "legalForceDate": "2026-08-15",
  "filingDate": "2024-03-10",
  "decisionDate": "2026-07-01",
  "parties": [
    { "role": "Истец", "name": "ООО Ромашка" },
    { "role": "Ответчик", "name": "Иванов И.И." }
  ],
  "courtId": "leninsky--perm",
  "courtType": "district"
}
```

#### Notification — уведомление

```json
{
  "uid": "uuid",
  "caseUid": "uuid-дела",
  "type": "found",
  "message": "Дело 2-1234/2024 появилось в системе",
  "read": false,
  "createdAt": "2026-07-24T10:00:00.000Z"
}
```

**Типы уведомлений:** `found` (дело появилось) / `decision` (решение вынесено) / `enforced` (вступило в силу).

#### CourtInfo — суд

```json
{
  "code": "59RS0007",
  "name": "Ленинский районный суд г. Перми",
  "courtType": "district",
  "subdomain": "leninsky--perm",
  "region": "Пермский край",
  "address": "614000, г. Пермь, ул. Ленина, д. 28",
  "website": "https://leninsky--perm.sudrf.ru",
  "phone": "+7 (342) 212-51-52",
  "oktmo": "57701000",
  "oktmoMethod": "57701"
}
```

---

### Типовые сценарии — примеры запросов

#### 1. Поиск дела по номеру

```http
POST /api/search/by-number HTTP/1.1
Content-Type: application/json

{
  "courtId": "59RS0007",
  "caseNumber": "2-1234/2024"
}
```

```json
{
  "success": true,
  "data": {
    "found": true,
    "count": 1,
    "results": [{
      "caseNumber": "2-1234/2024",
      "caseUrl": "https://leninsky--perm.sudrf.ru/...",
      "uid": "uuid",
      "judge": "Иванова А.С.",
      "result": "Иск удовлетворён",
      "legalForceDate": "2026-08-15",
      "courtType": "district"
    }],
    "court": {
      "code": "59RS0007",
      "name": "Ленинский районный суд г. Перми"
    }
  }
}
```

#### 2. Добавление дела в мониторинг

```http
POST /api/cases HTTP/1.1
Content-Type: application/json

{
  "url": "https://leninsky--perm.sudrf.ru/modules.php?name=sud_delo&srv_num=1&name_op=case&case_id=12345",
  "courtId": "leninsky--perm",
  "courtType": "district",
  "caseNumber": "2-1234/2024",
  "userId": "1c-001"
}
```

```json
{
  "success": true,
  "data": {
    "uid": "550e8400-e29b-41d4-a716-446655440000",
    "status": "monitoring",
    "createdAt": "2026-07-24T10:00:00.000Z"
  }
}
```

#### 3. Отслеживание появления дела (номер ещё неизвестен)

```http
POST /api/cases/wait HTTP/1.1
Content-Type: application/json

{
  "courtId": "leninsky--perm",
  "courtType": "district",
  "party": "Иванов И.И.",
  "filingDate": "2026-07-20",
  "userId": "1c-001"
}
```

Система будет автоматически искать дело по ФИО + дате. Когда найдёт — статус сменится на `monitoring`, придёт уведомление `type: "found"`.

#### 4. Получение списка дел с фильтром

```http
GET /api/cases?status=decision&userId=1c-001 HTTP/1.1
```

```json
{
  "success": true,
  "data": [
    {
      "uid": "...",
      "number": "2-1234/2024",
      "status": "decision",
      "result": "Иск удовлетворён",
      "legalForceDate": null,
      "courtId": "leninsky--perm"
    }
  ]
}
```

#### 5. Получение счётчиков дашборда

```http
GET /api/status HTTP/1.1
```

```json
{
  "success": true,
  "data": {
    "monitoring": 45,
    "waiting": 12,
    "decision": 8,
    "enforcedToday": 2,
    "health": "ok"
  }
}
```

#### 6. Запуск проверки всех дел

```http
POST /api/parse/run HTTP/1.1
Content-Type: application/json

{ "mode": "full" }
```

```json
{
  "success": true,
  "data": { "status": "started", "mode": "full" }
}
```

Повторный запрос во время прогона → `409 { code: "RUN_IN_PROGRESS" }`.

#### 7. Получение уведомлений

```http
GET /api/notifications HTTP/1.1
```

```json
{
  "success": true,
  "data": [
    {
      "uid": "uuid",
      "caseUid": "uuid-дела",
      "type": "decision",
      "message": "По делу 2-1234/2024 вынесено решение: Иск удовлетворён",
      "read": false,
      "createdAt": "2026-07-24T10:00:00.000Z"
    }
  ]
}
```

#### 8. Поиск суда по названию

```http
GET /api/courts?q=ленинский%20пермь HTTP/1.1
```

```json
{
  "success": true,
  "data": [
    {
      "code": "59RS0007",
      "name": "Ленинский районный суд г. Перми",
      "courtType": "district",
      "subdomain": "leninsky--perm",
      "region": "Пермский край"
    }
  ]
}
```

---

### PATCH /api/cases/:uid — разрешённые поля

Можно обновлять: `status`, `result`, `legalForceDate`, `legalForceNotified`, `userId`, `url`.

**Нельзя менять** (400 VALIDATION_ERROR): `uid`, `createdAt`, `courtId`, `courtType`, `number`.

---

## Честно про ограничения

| Ограничение | Почему | Что делать |
|-------------|--------|-----------|
| **Нет аутентификации** | Предполагалась локальная сеть | `X-API-Key` — 2 часа работы, готовы сделать |
| **Нет пагинации** на `/api/cases` | До 10k дел JSON-хранилище отдаёт всё сразу | Пагинация + фильтры — готовы добавить |
| **Нет webhook-ов** | Push-уведомления в 1С не реализованы | 1С должна поллить `/api/notifications` или `/api/status` |
| **Scheduler ручной** | `POST /api/parse/run` запускается извне | Встроенный cron — в планах |
| **Нет batch-операций** | Массовое добавление 50+ дел — по одному запросу | Batch API — в планах |
| **Search UI сломан** (CR6-007) | Неверные пути в `search.html` | Для 1С не важно (1С работает с API, не с UI) |
| **JSON-хранилище** | Битый файл → тихая потеря данных (CR6-001) | Backup + alert — в работе |
| **SSRF** | `/api/parse/url` принимает любой URL | Allowlist `*.sudrf.ru`/`*.msudrf.ru` — в работе |

**Для 1С критично только:** отсутствие auth и webhook-ов. Остальное — UI и внутренние баги.

---

## Решения, которые нужно принять

Эти вопросы блокуют интеграцию. Хотим услышать мнение 1С-команды.

### Блок 1: Как 1С работает с CourtDesk

| # | Вопрос | Варианты | Наше мнение |
|---|--------|----------|-------------|
| **1** | **Pull или push?** 1С сама опрашивает API при открытии карточки юристом? Или CourtDesk должен стучаться в 1С при изменении? | A) Pull: 1С поллит `/api/notifications` каждые N секунд. B) Push: CourtDesk шлёт POST на URL 1С. | **A — проще, B — удобнее.** Можем сделать оба: pull по умолчанию, push опционально. |
| **2** | **Аутентификация.** Нужна? Если да — какой механизм? | A) Нет (локальная сеть, доверяем). B) `X-API-Key` в заголовке. C) Mutual TLS. | **B — оптимум.** Shared-secret в `.env`, 1С передаёт в заголовке. 2 часа работы. |
| **3** | **Идентификация пользователя 1С.** Поле `userId` — что в него класть? | A) GUID из 1С. B) Табельный номер. C) Не заполнять. | Не критично. Главное — **стабильный** идентификатор, чтобы можно было фильтровать дела по юристу. |
| **4** | **Workflow добавления дела.** Юрист в 1С нажимает «Найти» → ищет через CourtDesk → добавляет в мониторинг? Или 1С сама знает дела и массово пушит в CourtDesk? | A) On-demand из UI 1С. B) Пакетная синхронизация (1С → CourtDesk). | **Зависит от ответа на Q5.** |
| **5** | **Откат данных.** Нужен ли экспорт статусов/событий из CourtDesk обратно в 1С? Если да — как? | A) 1С сама тянет через `/api/cases/:uid` при открытии карточки. B) CourtDesk пушит при изменении (webhook). C) Еженочная выгрузка (batch). | **A — минимально.** C — для отчётов. B — опционально. |
| **6** | **Объём.** Сколько дел в 1С одновременно? | <100 / 100–1000 / 1000+ | Определяет: нужна ли пагинация, batch, SQLite vs JSON. |
| **7** | **Частота обновления.** Как часто 1С хочет видеть свежие данные? | При открытии карточки / раз в час / раз в день | Влияет на cron-расписание scheduler. |
| **8** | **Кто запускает мониторинг?** 1С шлёт `POST /api/parse/run`? Или это делает админ CourtDesk по cron? Или встроенный scheduler? | A) 1С по расписанию. B) Встроенный cron CourtDesk. C) Админ вручную. | **B — удобнее всех.** 1С не должна думать о scheduler. |
| **9** | **Обработка `legalForceDate`.** Когда решение вступило — что делает 1С? | A) Ничего (юрист сам видит в UI). B) 1С ставит задачу на исполнение. C) 1С меняет статус дела. | Влияет на формат webhook/notification. |
| **10** | **Массовые операции.** Нужно ли добавлять 50+ дел одним запросом? Импорт из CSV/Excel? | Да/нет, формат данных | Если да — сделаем batch endpoint. |

### Блок 2: Edge cases

| # | Вопрос | Контекст |
|---|--------|----------|
| **11** | Что делать при ошибке парсинга (суд поменял дизайн)? 1С видит `status: 'error'` и ждёт? Или нужна явная нотификация? |
| **12** | Нужен ли 1С доступ к истории изменений (`CaseHistoryEvent[]`)? API сейчас отдаёт только текущее состояние дела. |
| **13** | Как 1С различает наших `courtId` (subdomain вида `leninsky--perm`) и свои справочники судов? Нужна ли таблица соответствий? |
| **14** | Если дело архивировано (`archived`), 1С всё равно может его запросить через `GET /api/cases/:uid`? Или скрыть? |
| **15** | Дубликат: если 1С два раза добавляет одно и то же дело (один номер + суд) — что ожидаемо? 409? Или idempotent 200? |

---

## Наши предложения (trade-offs)

### HIGH priority

| Предложение | Что даёт 1С | Что стоит нам | Recommendation |
|-------------|-------------|---------------|----------------|
| **API Token** (`X-API-Key`) | Безопасность при выходе за loopback | 2 часа + документация | **Да, до prod** |
| **Webhooks** (POST на URL 1С при `found`/`decision`/`enforced`) | 1С не поллит, реакция мгновенная | 1 день + настройка retry | **Да, если push-сценарий** |
| **Batch API** (`POST /api/cases/batch` — до 100 дел) | Массовая синхронизация | 4 часа + валидация | **Да, если >50 дел** |

### MEDIUM priority

| Предложение | Что даёт | Что стоит | Recommendation |
|-------------|----------|-----------|----------------|
| **Пагинация** (`?offset=&limit=&sort=`) | Работает при 500+ дел | 2 часа | **Да, если >100 дел** |
| **Расширенные фильтры** (`?legalForceDateFrom=&createdAtFrom=&hasResult=true`) | Точечные выборки | 3 часа | **Да, после пагинации** |
| **Встроенный cron** (автоматический `runFull` по расписанию) | 1С не думает о scheduler | 3 часа (`node-cron`) | **Да, снимает нагрузку с 1С** |
| **Docker-образ** | Простой деплой на сервере заказчика | 2 часа (Dockerfile + compose) | **Да, для prod** |

### LOW priority

| Предложение | Что даёт | Что стоит | Recommendation |
|-------------|----------|-----------|----------------|
| **Экспорт CSV** (`GET /api/cases/export?format=csv`) | Для отчётов 1С | 2 часа | Только если попросят |
| **Structured logging (pino)** | Для prod-мониторинга | 3 часа | Только при log aggregator |
| **HTTP/2** | Скорость | Reverse-proxy (nginx) | Не сейчас |

---

## Что НЕ будет (границы)

- **SOAP / XML** — только REST/JSON. 1С умеет.
- **Двусторонняя синхронизация** (1С ↔ CourtDesk с разрешением конфликтов) — не делаем. CourtDesk — источник истины по данным с судов. 1С — источник по клиентам и договорам.
- **Авторизация пользователей** (роли, права) — в v1.0 нет. `userId` — просто поле фильтрации.
- **Изменение данных суда** — CourtDesk только читает sudrf.ru. Писать туда не умеет и не будет.

---

## План (предлагаемый)

| Фаза | Срок | Что | Зависит от |
|------|------|-----|-----------|
| **0** (сейчас) | — | API работает, 18 эндпоинтов, тесты. UI частичный. | — |
| **1** (CRITICAL) | 2–3 дня | SSRF fix + store integrity + API token | Решения Q2 |
| **2** (интеграция) | 1 неделя | Webhooks + batch API + пагинация | Решения Q1, Q5, Q10 |
| **3** (автоматизация) | 3–5 дней | Встроенный cron + Docker | Решения Q8 |
| **4** (production) | по запросу | Auth users, structured logging, SQLite | Рост >10k дел |

---

*Цель встречи: закрыть вопросы Q1–Q15, чтобы двигаться в фазу 2 без догадок.*
