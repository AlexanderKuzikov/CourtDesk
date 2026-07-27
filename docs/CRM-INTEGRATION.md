# Интеграция CourtDesk с 1С CRM — API-документация

> Дата: 2026-07-27
> Версия приложения: v0.5.2
> Всего тестов: 94 (passed)

---

## 1. Базовые сведения

| Свойство | Значение |
|----------|----------|
| Протокол | HTTP/1.1, REST |
| Формат | JSON (Content-Type: application/json) |
| Ответ (успех) | `{ success: true, data: <T> }` |
| Ответ (ошибка) | `{ success: false, error: "<msg>", code: "<CODE>" }` |
| Порт по умолчанию | 8767 |
| Bind по умолчанию | 127.0.0.1 (локальная сеть / reverse-proxy) |
| Rate limit | 1500ms между запросами к sudrf.ru (встроен в scheduler) |
| Аутентификация | Отсутствует (только loopback или VPN). Опционально: `COURTDESK_API_TOKEN` в `.env` |

## 2. Полный список эндпоинтов

| # | Метод | Путь | Назначение |
|---|-------|------|-----------|
| 1 | `GET` | `/api/health` | Liveness probe |
| 2 | `GET` | `/api/status` | Счётчики + здоровье системы |
| 3 | `GET` | `/api/notifications` | Уведомления о событиях по делам |
| 4 | `PATCH` | `/api/notifications/:uid/read` | Пометить уведомление прочитанным |
| 5 | `GET` | `/api/cases` | Список дел с фильтрацией (обогащён `courtName`) |
| 6 | `GET` | `/api/cases/stats` | Детальная статистика |
| 7 | `GET` | `/api/cases/:uid` | Карточка дела (с `courtName`) |
| 8 | `GET` | `/api/cases/:uid/events` | События дела (timeline) |
| 9 | `GET` | `/api/cases/:uid/card` | Полная карточка дела (CaseCard — сырые данные с сайта суда) |
| 10 | `POST` | `/api/cases` | Добавить дело в мониторинг (`?parse=true` — синхронный парсинг) |
| 11 | `PATCH` | `/api/cases/:uid` | Обновить поля дела (whitelist) |
| 12 | `DELETE` | `/api/cases/:uid` | Удалить дело (каскадно: events + notifications + card) |
| 13 | `POST` | `/api/cases/wait` | Отслеживать появление дела (по ФИО + дате) |
| 14 | `POST` | `/api/search/by-number` | Поиск по номеру дела |
| 15 | `POST` | `/api/search/by-party` | Поиск по участникам |
| 16 | `POST` | `/api/search/by-case-uid` | Поиск по УИД (уникальному идентификатору дела) |
| 17 | `POST` | `/api/parse/url` | Парсинг карточки дела по URL (с SSRF-защитой) |
| 18 | `POST` | `/api/parse/run` | Запуск циклического мониторинга (202 Accepted / 409 Conflict) |
| 19 | `GET` | `/api/parse/progress` | Прогресс текущего прогона мониторинга |
| 20 | `POST` | `/api/resolve` | Суд + номер дела → ссылка на карточку |
| 21 | `GET` | `/api/courts?q=` | Поиск судов по названию (лимит 30) |
| 22 | `GET` | `/api/courts/:id` | Информация о конкретном суде |
| 23 | `POST` | `/api/intake` | Классификация входного текста (URL/номер/ФИО) |
| 24 | `GET` | `/api/settings` | Настройки расписания мониторинга |
| 25 | `PUT` | `/api/settings` | Сохранить настройки расписания |

## 3. Ключевые объекты

### 3.1 WatchedCase — дело в мониторинге

```json
{
  "uid": "550e8400-e29b-41d4-a716-446655440000",
  "url": "https://leninsky--perm.sudrf.ru/modules.php?name=sud_delo&srv_num=1&name_op=case&case_id=12345",
  "courtId": "leninsky--perm",
  "courtCode": "59RS0007",
  "courtType": "district",
  "number": "2-1234/2024",
  "caseUid": "59RS0007-01-2024-000123-45",
  "status": "monitoring",
  "result": null,
  "legalForceDate": null,
  "legalForceNotified": false,
  "enforcedAt": null,
  "userId": "1c-001",
  "lastChecked": "2026-07-26T09:00:00.000Z",
  "createdAt": "2026-07-24T12:00:00.000Z",
  "updatedAt": "2026-07-26T09:00:00.000Z",
  "errorCount": 0,
  "lastError": null,
  "courtName": "Ленинский районный суд г. Перми"
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
| `caseUid` | string\|null | УИД (XXWWXXXX-XX-XXXX-XXXXXX-XX) |
| `status` | enum | `waiting` / `monitoring` / `decision` / `enforced` / `archived` / `error` |
| `result` | string\|null | Текст решения (появляется при status=decision) |
| `legalForceDate` | string\|null | Дата вступления в силу (YYYY-MM-DD) |
| `legalForceNotified` | boolean | Уведомление о вступлении отправлено |
| `enforcedAt` | string\|null | ISO-дата первого перехода в enforced (для grace period) |
| `userId` | string\|null | Идентификатор пользователя из 1С |
| `lastChecked` | string\|null | Последняя проверка (ISO) |
| `createdAt` | string | Создано (ISO) |
| `updatedAt` | string | Обновлено (ISO) |
| `errorCount` | number | Сколько раз подряд ошибка (сбрасывается при успехе) |
| `lastError` | string\|null | Последнее сообщение об ошибке |
| `courtName` | string | Название суда (обогащается сервером, не хранится) |

### 3.2 Жизненный цикл статуса

```
waiting → monitoring → decision → enforced → archived
                ↑            |
                └── error ───┘  (авто-recovery при успешном прогоне)
```

| Статус | Когда | Что происходит |
|--------|-------|---------------|
| `waiting` | Дело ещё не появилось на сайте суда | Scheduler ищет по ФИО + дате через `searchByParty` |
| `monitoring` | Дело найдено, отслеживаем изменения | Scheduler парсит карточку, фиксирует события |
| `decision` | В карточке появился результат | Дополнительно ищем дату вступления через поиск |
| `enforced` | Решение вступило в законную силу | Grace period 90 дней (поиск апелляции) |
| `archived` | Пользователь завершил работу | Дело исключается из прогонов |
| `error` | Последний прогон упал | Автоматический retry; при успехе → monitoring |

**PATCH whitelist:** `status`, `result`, `legalForceDate`, `legalForceNotified`, `userId`, `url`, `errorCount`, `lastError`
**Нельзя менять:** `uid`, `createdAt`, `courtId`, `courtCode`, `courtType`, `number`

### 3.3 SearchResult — результат поиска

```json
{
  "caseNumber": "2-1234/2024",
  "caseUrl": "https://leninsky--perm.sudrf.ru/modules.php?name=sud_delo&srv_num=1&name_op=case&case_id=12345",
  "uid": "uuid",
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
  "courtCode": "59RS0007",
  "courtType": "district",
  "caseUid": "59RS0007-01-2024-000123-45",
  "matchScore": 95
}
```

### 3.4 Notification — уведомление

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

**Типы:** `found` (дело появилось) / `decision` (решение вынесено) / `enforced` (вступило в силу).

### 3.5 DashboardStatus — счётчики

```json
{
  "monitoring": 45,
  "waiting": 12,
  "decision": 8,
  "enforcedToday": 2,
  "health": "ok"
}
```

### 3.6 ScanProgress — прогресс мониторинга

```json
{
  "running": true,
  "total": 50,
  "processed": 23,
  "errors": 1
}
```

### 3.7 AppSettings — настройки расписания

```json
{
  "scheduleFull": "03:00",
  "retryIntervalHours": 3,
  "retryStaleHours": 6,
  "scheduleEnabled": true
}
```

| Поле | Тип | Описание |
|------|-----|----------|
| `scheduleFull` | string | Время полного прогона (HH:mm) |
| `retryIntervalHours` | number | Интервал retry-прогонов (часы) |
| `retryStaleHours` | number | Порог stale-дел (часы) |
| `scheduleEnabled` | boolean | Вкл/выкл авторасписание |

### 3.8 CourtInfo — суд

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

## 4. Примеры запросов для 1С

### 4.1 Поиск дела по номеру

```http
POST /api/search/by-number HTTP/1.1
Content-Type: application/json

{ "courtId": "59RS0007", "caseNumber": "2-1234/2024" }

→ 200
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
      "result": "Иск удовлетворён частично",
      "legalForceDate": "2026-08-15",
      "courtType": "district",
      "parties": [{ "role": "Истец", "name": "ООО Ромашка" }]
    }],
    "court": { "code": "59RS0007", "name": "Ленинский районный суд г. Перми" }
  }
}
```

`courtId` принимает как code (`59RS0007`), так и subdomain (`leninsky--perm`). При неверном courtId — `404 COURT_NOT_FOUND`.

### 4.2 Поиск по участникам

```http
POST /api/search/by-party HTTP/1.1
Content-Type: application/json

{
  "courtId": "leninsky--perm",
  "defendant": "Иванов Иван",
  "from": "2026-03-01",
  "to": "2026-03-31"
}
```

### 4.3 Поиск по УИД

```http
POST /api/search/by-case-uid HTTP/1.1
Content-Type: application/json

{
  "courtId": "59RS0007",
  "caseUid": "59RS0007-01-2024-000123-45"
}
```

### 4.4 Добавление дела в мониторинг

```http
POST /api/cases HTTP/1.1
Content-Type: application/json

{
  "url": "https://leninsky--perm.sudrf.ru/modules.php?name_op=case&case_id=12345",
  "courtId": "leninsky--perm",
  "courtType": "district",
  "caseNumber": "2-1234/2024",
  "userId": "1c-001"
}

→ 200
{
  "success": true,
  "data": {
    "uid": "550e8400-e29b-41d4-a716-446655440000",
    "status": "monitoring",
    "createdAt": "2026-07-24T10:00:00.000Z"
  }
}
```

**Синхронный парсинг:** добавьте `?parse=true` — сервер сразу загрузит и распарсит карточку:

```http
POST /api/cases?parse=true HTTP/1.1
...
```

Ответ будет содержать поле `card` (CaseCard) или `parseError` при ошибке парсинга (дело всё равно добавится).

### 4.5 Отслеживание появления дела (номер ещё неизвестен)

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

Система будет автоматически искать дело по ФИО + дате (через `pickBestMatch` — скоринг совпадения имён). Когда найдёт — статус сменится на `monitoring`, появится уведомление `type: "found"`.

### 4.6 Получение списка дел с фильтрами

```http
GET /api/cases?status=decision&userId=1c-001 HTTP/1.1

→ 200
{
  "success": true,
  "data": [{
    "uid": "...",
    "number": "2-1234/2024",
    "status": "decision",
    "result": "Иск удовлетворён",
    "legalForceDate": null,
    "courtId": "leninsky--perm",
    "courtName": "Ленинский районный суд г. Перми"
  }]
}
```

Доступные фильтры: `?status=`, `?userId=`, `?courtId=`, `?q=` (поиск по номеру и courtId).

### 4.7 Получение счётчиков дашборда

```http
GET /api/status HTTP/1.1

→ 200
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

### 4.8 Запуск мониторинга

```http
POST /api/parse/run HTTP/1.1
Content-Type: application/json

{ "mode": "full" }

→ 202
{ "success": true, "data": { "status": "started", "mode": "full" } }
```

Моды: `full` (все дела), `retry` (устаревшие + error), `new` (waiting-дела). Повторный запрос во время прогона → `409 { code: "RUN_IN_PROGRESS" }`.

### 4.9 Прогресс мониторинга

```http
GET /api/parse/progress HTTP/1.1

→ 200
{ "success": true, "data": { "running": true, "total": 50, "processed": 23, "errors": 1 } }
```

При завершении прогона `running: false`. Поллинг каждые 5 секунд.

### 4.10 Получение деталей дела

```http
GET /api/cases/:uid HTTP/1.1
GET /api/cases/:uid/events HTTP/1.1   # timeline изменений
GET /api/cases/:uid/card HTTP/1.1     # полная карточка с сайта суда (CaseCard)
```

### 4.11 Настройки расписания

```http
GET /api/settings HTTP/1.1

→ 200
{ "success": true, "data": { "scheduleFull": "03:00", "retryIntervalHours": 3, ... } }

PUT /api/settings HTTP/1.1
Content-Type: application/json

{ "scheduleFull": "06:00", "retryIntervalHours": 6 }

→ 200
{ "success": true, "data": { "scheduleFull": "06:00", ... } }
```

Разрешённые поля: `scheduleFull`, `retryIntervalHours`, `retryStaleHours`, `scheduleEnabled`. Остальные игнорируются.

### 4.12 Уведомления

```http
GET /api/notifications HTTP/1.1

→ 200
{
  "success": true,
  "data": [{
    "uid": "uuid",
    "caseUid": "uuid-дела",
    "type": "decision",
    "message": "По делу 2-1234/2024 вынесено решение: Иск удовлетворён",
    "read": false,
    "createdAt": "2026-07-24T10:00:00.000Z"
  }]
}

PATCH /api/notifications/:uid/read HTTP/1.1   # пометить прочитанным
```

### 4.13 Поиск суда

```http
GET /api/courts?q=ленинский%20пермь HTTP/1.1

→ 200
{
  "success": true,
  "data": [{
    "code": "59RS0007",
    "name": "Ленинский районный суд г. Перми",
    "courtType": "district",
    "subdomain": "leninsky--perm",
    "region": "Пермский край"
  }]
}
```

### 4.14 URL builder

```http
POST /api/resolve HTTP/1.1
Content-Type: application/json

{ "courtId": "kirov--perm", "courtType": "district", "caseNumber": "2-100/2026" }

→ 200
{ "success": true, "data": { "url": "https://kirov--perm.sudrf.ru/..." } }
```

### 4.15 Парсинг одного URL

```http
POST /api/parse/url HTTP/1.1
Content-Type: application/json

{ "url": "https://leninsky--perm.sudrf.ru/modules.php?name_op=case&case_id=12345" }

→ 200
{ "success": true, "data": { "uid": "...", "card": { "result": "Удовлетворено", ... } } }
```

URL проверяется через `assertCourtUrl`: только `https://*.sudrf.ru` или `https://*.msudrf.ru`. Иначе `400 INVALID_URL`. При капче — автоматическое решение через RuCaptcha (если ключ задан).

### 4.16 Классификация текста (intake)

```http
POST /api/intake HTTP/1.1
Content-Type: application/json

{ "input": "2-1234/2024" }

→ 200
{ "success": true, "data": { "type": "search", "caseNumber": "2-1234/2024", "courtType": "district" } }
```

## 5. Коды ошибок

| HTTP | code | Когда |
|------|------|-------|
| 400 | `BAD_REQUEST` | Неверное тело запроса (отсутствуют обязательные поля) |
| 400 | `INVALID_URL` | URL не принадлежит судовой системе РФ |
| 404 | `NOT_FOUND` | Дело / суд / уведомление не найдены |
| 404 | `COURT_NOT_FOUND` | Суд не найден (поиск) |
| 409 | `RUN_IN_PROGRESS` | Прогон уже запущен (повторный `POST /api/parse/run`) |
| 500 | `STORE_ERROR` | Ошибка хранилища |
| 500 | `PARSE_ERROR` | Ошибка парсинга |
| 500 | `SEARCH_ERROR` | Ошибка поиска |
| 503 | `CAPTCHA_KEY_MISSING` | RuCaptcha не настроен (требуется для капчи) |

## 6. Безопасность

### 6.1 SSRF-защита (assertCourtUrl)
`POST /api/parse/url` и `orchestrator.fetchHtml` проверяют URL через `assertCourtUrl()`:
- Protocol: `https:` только
- Hostname: `*.sudrf.ru` или `*.msudrf.ru`
- Блокируется: `file://`, `http://`, `localhost`, IP-адреса, cloud metadata

### 6.2 Store integrity (CR6-001)
При коррупции JSON-файла — backup в `.corrupt.<timestamp>` + throw. Silent-wipe исключён.

### 6.3 PATCH whitelist
PATCH разрешает только: `status`, `result`, `legalForceDate`, `legalForceNotified`, `userId`, `url`, `errorCount`, `lastError`.
`uid`, `createdAt`, `courtId`, `courtCode`, `courtType`, `number` — immutable.

## 7. Интеграционные риски

| Риск | Вероятность | Комментарий |
|------|------------|-------------|
| sudrf.ru/msudrf.ru меняют HTML | Высокая | Адаптеры парсинга могут сломаться при редизайне ГАС «Правосудие» |
| RuCaptcha timeout | Средняя | Fallback на 2captcha (в конфиге) или ручное решение |
| Rate-limit sudrf.ru | Низкая | 1500ms между запросами = ~57 запросов/минуту |
| JSON-хранилище >10k дел | Средняя | При росте — миграция на SQLite |
| Изменение TLS-сертификатов судов | Низкая | `rejectUnauthorized: false` — осознанный trade-off |

## 8. Типовые сценарии

### Поиск → добавление в мониторинг → отслеживание

```
1. POST /api/search/by-number  →  results[0].caseUrl, uid
2. POST /api/cases             →  WatchedCase (status=monitoring)
3. scheduler (автоматически)   →  processOne() каждые N часов
4. GET /api/notifications      →  увидеть decision / enforced
5. GET /api/cases/:uid/events  →  полная хронология
```

### Отслеживание появления (номер неизвестен)

```
1. POST /api/cases/wait        →  WatchedCase (status=waiting)
2. scheduler runNew()          →  searchByParty + pickBestMatch
3. найдено → status=monitoring, notification type=found
4. далее стандартный мониторинг
```

---

*Документ актуален для CourtDesk v0.5.2 (94 теста).*
