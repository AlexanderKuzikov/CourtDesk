# Интеграция CourtDesk с 1С CRM — функционал, вопросы, предложения

> Дата: 2026-07-24
> Аудитория: программист 1С, разрабатывающий CRM-модуль судебных дел
> Версия приложения: v0.4.0 (HEAD 8774d95)

---

## 1. Текущий API — что уже можно использовать

### 1.1 Базовые сведения

| Свойство | Значение |
|----------|----------|
| Протокол | HTTP/1.1, REST |
| Формат | JSON (Content-Type: application/json) |
| Ответ (успех) | `{ success: true, data: <T> }` |
| Ответ (ошибка) | `{ success: false, error: "<msg>", code: "<CODE>" }` |
| Порт по умолчанию | 8767 |
| Bind по умолчанию | 127.0.0.1 (локальная сеть / reverse-proxy) |
| Rate limit | 1500ms между запросами к одному хосту sudrf.ru |
| Аутентификация | Отсутствует (только loopback или VPN) |
| CORS | `Access-Control-Allow-Origin: *` (без Authorization) |

### 1.2 Эндпоинты — таблица для 1С

| # | Метод | Путь | Назначение | Статус |
|---|-------|------|-----------|--------|
| 1 | `GET` | `/api/health` | Liveness probe | ✅ |
| 2 | `GET` | `/api/status` | Счётчики + здоровье системы | ✅ |
| 3 | `GET` | `/api/notifications` | Уведомления о событиях по делам | ✅ |
| 4 | `GET` | `/api/cases` | Список дел с фильтрацией | ✅ |
| 5 | `GET` | `/api/cases/stats` | Детальная статистика | ✅ |
| 6 | `GET` | `/api/cases/:uid` | Карточка дела | ✅ |
| 7 | `POST` | `/api/cases` | Добавить дело в мониторинг | ✅ |
| 8 | `PATCH` | `/api/cases/:uid` | Обновить поля дела | ✅ |
| 9 | `DELETE` | `/api/cases/:uid` | Удалить дело | ✅ |
| 10 | `POST` | `/api/cases/wait` | Отслеживать появление дела | ✅ |
| 11 | `POST` | `/api/search/by-number` | Поиск по номеру дела | ✅ |
| 12 | `POST` | `/api/search/by-party` | Поиск по участникам | ✅ |
| 13 | `POST` | `/api/parse/url` | Парсинг карточки дела по URL | ✅ |
| 14 | `POST` | `/api/parse/run` | Запуск циклического мониторинга | ✅ |
| 15 | `POST` | `/api/resolve` | Суд + номер → ссылка на карточку | ✅ |
| 16 | `GET` | `/api/courts?q=` | Поиск судов по названию | ✅ |
| 17 | `GET` | `/api/courts/:id` | Информация о конкретном суде | ✅ |
| 18 | `POST` | `/api/intake` | Классификация входного текста | ✅ |

### 1.3 Ключевые контракты — что важно для 1С

#### WatchedCase (основной объект)
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

**Жизненный цикл статуса:**
```
waiting → monitoring → decision → enforced → archived
                          ↓
                       error (из любого статуса)
```

#### Назначение status-ов для CRM

| Статус | Когда | Что происходит |
|--------|-------|---------------|
| `waiting` | Дело ещё не появилось на сайте суда | Scheduler периодически ищет по ФИО + дате |
| `monitoring` | Дело найдено, отслеживаем изменения | Scheduler парсит карточку, фиксирует события |
| `decision` | В карточке появился результат | Отслеживаем дату вступления в силу |
| `enforced` | Решение вступило в законную силу | Финальная стадия мониторинга |
| `archived` | Пользователь завершил работу | Дело больше не обрабатывается |
| `error` | Последний прогон упал | Автоматически повторяется при следующих прогонах |

#### Что можно менять через PATCH (whitelist)
`status`, `result`, `legalForceDate`, `legalForceNotified`, `userId`, `url`
**Нельзя менять:** `uid`, `createdAt`, `courtId`, `courtType`, `number`

#### Пул уведомлений (Notification)
```json
{
  "uid": "uuid",
  "caseUid": "uuid дела",
  "type": "found|decision|enforced",
  "message": "По делу 2-1234/2024 вынесено решение: Иск удовлетворён",
  "read": false,
  "createdAt": "2026-07-24T10:00:00.000Z"
}
```

---

## 2. Вопросы к программисту 1С

### 2.1 Интеграция (Critical)

1. **Как 1С будет вызывать API?**
   - HTTP-запросы из встроенного языка (HTTPСоединение / ОтправкаHTTPЗапроса)?
   - Через внешнюю компоненту?
   - Нужна ли поддержка SOAP или только REST?

2. **Сценарий использования — какой workflow?**
   - Юрист в 1С нажимает «Найти дело» → CourtDesk → результат обратно в 1С?
   - Или 1С просто запускает мониторинг, а юрист смотрит в Web UI?
   - Нужен ли экспорт данных из CourtDesk обратно в 1С (статусы, даты, события)?

3. **Требуется ли аутентификация между 1С и CourtDesk?**
   - Сейчас API открытый (CORS \*, без авторизации)
   - Нужен shared-token, Basic Auth или IP-белый список?
   - Как к этому привыкла 1С-команда?

4. **Как часто 1С будет дёргать API?**
   - При каждом открытии карточки дела юристом (pull)?
   - Нужен push-механизм (вебхуки)? CourtDesk → 1С при смене статуса дела?

### 2.2 Функциональные вопросы

5. **Поле `userId` — какой идентификатор передавать?**
   - GUID пользователя из 1С? Табельный номер? ФИО?
   - Нужна ли привязка к ролям?

6. **Нужен ли импорт данных из 1С в CourtDesk?**
   - Например: список уже известных дел (номер + суд) для массового запуска мониторинга
   - Загрузка справочника судов (у нас есть 10 287 записей)

7. **Как 1С хочет получать `legalForceDate`?**
   - Отдельный реквизит в карточке дела 1С?
   - Событие/уведомление при наступлении даты?
   - Нужен ли расчёт оставшихся дней до вступления?

8. **Как обрабатывать ошибки интеграции?**
   - Timeout? Retry-политика?
   - Нужен ли эндпоинт `/api/cases/batch` для массовой загрузки?

### 2.3 UI/UX для юриста

9. **Нужен ли наш Web UI юристам или весь функционал идёт через 1С?**
   - Если только 1С — тогда API должен покрывать 100% потребностей поиска и мониторинга
   - Если Web UI тоже нужен — какие экраны критичны?

10. **Есть ли у 1С свои механизмы уведомлений?**
    - Нужны ли наши уведомления (type: found/decision/enforced) в 1С?
    - Или 1С сама опрашивает `/api/status` и `/api/notifications`?

---

## 3. Предложения со стороны разработки

### 3.1 API — что стоит добавить (предлагаем)

| Предложение | Приоритет | Суть |
|------------|-----------|------|
| **Batch API** | HIGH | `POST /api/cases/batch` — добавление 10–100 дел за 1 запрос; `GET /api/cases/batch-status` — статус массовой загрузки |
| **Webhooks** | HIGH | CourtDesk → 1С: POST на URL 1С при `decision`, `enforced`, `found` (настраивается через `.env` или `PATCH /api/settings`) |
| **API Token** | HIGH | `X-API-Key` header, простой shared-secret. Если `TOKEN=...` в .env — все запросы без токена возвращают 401. Если не задан — доступ открыт (обратная совместимость) |
| **Пагинация списка дел** | MEDIUM | `?offset=&limit=&sort=updatedAt:desc` — `/api/cases` сейчас возвращает все дела сразу |
| **Фильтры для /api/cases** | MEDIUM | `?legalForceDateFrom=&legalForceDateTo=&createdAtFrom=&hasResult=true` |
| **Расширенный поиск /api/search** | MEDIUM | `?mode=strict` — точное совпадение номера дела (сейчас results[0] без скоринга) |
| **Экспорт результатов поиска** | MEDIUM | `GET /api/search/export?format=csv` — для 1С: загрузка найденных дел таблицей |
| **HTTP/2 + keep-alive** | LOW | Для prod: настроить reverse-proxy (nginx/Caddy) перед CourtDesk |

### 3.2 Безопасность (предлагаем)

| Предложение | Приоритет | Суть |
|------------|-----------|------|
| **SSRF-защита** | CRITICAL | `POST /api/parse/url` принимает любой URL → fetch без allowlist. Нужен `assertCourtUrl()` — только `*.sudrf.ru`, `*.msudrf.ru`, https-only |
| **Валидация URL при добавлении дела** | HIGH | `POST /api/cases`, `POST /api/cases/wait` — проверять, что `url` (если передан) ведёт на sudrf.ru |
| **Rate-limit на уровне API** | MEDIUM | Защита от случайного/намеренного спама: N запросов/минуту на IP |
| **Логирование запросов 1С** | MEDIUM | `X-Request-Id` + `X-User-Id` кастомные заголовки для трейсинга |

### 3.3 Инфраструктура (предлагаем)

| Предложение | Приоритет | Суть |
|------------|-----------|------|
| **Docker-контейнер** | MEDIUM | Готовый `Dockerfile` + `docker-compose.yml` для единообразного деплоя на сервере заказчика |
| **SQLite вместо JSON** | MEDIUM | При >10 000 дел — миграция на SQLite для атомарности, конкурентности и производительности. JSON-хранилище не имеет proper locking |
| **Pino structured logging** | LOW | Замена `console.log` на pino с JSON-выводом — при появлении prod-мониторинга |
| **Health check с зависимостями** | LOW | `/api/health` сейчас всегда `ok`. Добавить: проверка JSON-файлов (битые?), RuCaptcha API (доступен?), диск (место?) |

### 3.4 Уведомления и мониторинг (предлагаем)

| Предложение | Приоритет | Суть |
|------------|-----------|------|
| **Telegram-уведомления** | MEDIUM | Опциональный канал: бот шлёт `found`/`decision`/`enforced` в чат юриста |
| **Email-уведомления** | LOW | При достижении `enforced` — письмо на почту юриста |
| **Scheduler cron из коробки** | MEDIUM | Сейчас `runFull()` запускается вручную через `POST /api/parse/run` или извне (cron/systemd timer). Добавить встроенный cron (node-cron: `0 8 * * 1,3,5`) |
| **Прогресс выполнения runFull** | LOW | SSE-эндпоинт `GET /api/parse/run/progress` — отдаёт `{ done: 5, total: 50 }` во время прогона |

---

## 4. Примеры HTTP-запросов для 1С

### 4.1 Поиск дела по номеру
```http
POST /api/search/by-number HTTP/1.1
Content-Type: application/json

{
  "courtId": "59RS0007",
  "caseNumber": "2-1234/2024"
}

→ 200
{
  "success": true,
  "data": {
    "found": true,
    "count": 1,
    "results": [{
      "caseNumber": "2-1234/2024",
      "caseUrl": "https://leninsky--perm.sudrf.ru/modules.php?name=sud_delo&srv_num=1&name_op=case&case_id=12345&delo_id=1540005",
      "uid": "uuid",
      "judge": "Иванова А.С.",
      "result": "Иск удовлетворён частично",
      "legalForceDate": "2026-08-15",
      "filingDate": "2024-03-10",
      "courtType": "district"
    }],
    "court": {
      "code": "59RS0007",
      "name": "Ленинский районный суд г. Перми"
    }
  }
}
```

### 4.2 Добавление дела в мониторинг
```http
POST /api/cases HTTP/1.1
Content-Type: application/json

{
  "url": "https://leninsky--perm.sudrf.ru/modules.php?name=sud_delo&srv_num=1&name_op=case&case_id=12345",
  "courtId": "59RS0007",
  "courtType": "district",
  "caseNumber": "2-1234/2024",
  "userId": "1c-001"
}

→ 200
{
  "success": true,
  "data": {
    "uid": "550e8400-e29b-41d4-a716-446655440000",
    "url": "https://...",
    "courtId": "leninsky--perm",
    "courtType": "district",
    "number": "2-1234/2024",
    "status": "monitoring",
    "result": null,
    "legalForceDate": null,
    "userId": "1c-001",
    "createdAt": "2026-07-24T10:00:00.000Z",
    "updatedAt": "2026-07-24T10:00:00.000Z"
  }
}
```

### 4.3 Получение дел со статусом "решение вынесено"
```http
GET /api/cases?status=decision&userId=1c-001 HTTP/1.1
```

### 4.4 Получение вступивших сегодня
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

### 4.5 Запуск проверки
```http
POST /api/parse/run HTTP/1.1
Content-Type: application/json

{ "mode": "full" }

→ 202
{
  "success": true,
  "data": { "status": "started", "mode": "full" }
}

(повторный запрос пока прогон идёт → 409 Conflict)
```

---

## 5. Интеграционные риски (осознанные)

| Риск | Вероятность | Комментарий |
|------|------------|-------------|
| sudrf.ru/msudrf.ru меняют HTML | Высокая | Адаптеры парсинга могут сломаться при редизайне ГАС «Правосудие». Нужен автоматический smoke-тест раз в сутки для каждого типа суда |
| RuCaptcha timeout/недоступность | Средняя | Мировые суды без капчи не работают. Нужен fallback на 2captcha (уже в конфиге) или ручное решение |
| Rate-limit блокировка sudrf.ru | Низкая | При 1500ms между запросами ~57 запросов/минуту. Рекомендуем не превышать 60/мин |
| Изменение формата судебных номеров | Низкая | Паттерн в `intake/classify.ts` — нужно периодически сверять с реальными делами |
| JSON-хранилище `cases.json` — потеря данных при битом файле | Средняя | Сейчас при битом JSON — тихий fallback на `{}`. Нужно: backup битого файла + алерт. **CRITICAL по CR6** |

---

## 6. План ближайших доработок (предлагаемый порядок)

1. **SSRF-защита** (`assertCourtUrl`) + **API Token** — чтобы продукт можно было выкатить за периметр локалхоста
2. **Целостность store** — backup битого JSON, alert
3. **Webhooks** (found/decision/enforced → POST на URL 1С)
4. **Batch API** для массового добавления дел
5. **Пагинация + фильтры** на `/api/cases`
6. **Dockerfile** для контейнеризации
7. **Scheduler cron** (встроенный, без внешнего crond)

---

*Документ подготовлен для обсуждения с командой 1С. Все пункты открыты к дискуссии.*
