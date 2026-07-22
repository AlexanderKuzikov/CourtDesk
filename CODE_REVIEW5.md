# CODE REVIEW 5 — CourtDesk

> Дата: 2026-07-22
> Ревьюер: Perplexity (CR5), HEAD: `913c119`
> База: CODE_REVIEW4.md → все CR4-001..008 закрыты

---

## Статус предыдущих ревью

| Ревью | Статус | Комментарий |
|-------|--------|-------------|
| CODE_REVIEW1 | ✅ Закрыт | Базовые замечания исправлены |
| CODE_REVIEW2 | ✅ Закрыт | BUG-001..011 исправлены |
| CODE_REVIEW3 | ✅ Закрыт | NEW-001..011 исправлены |
| CODE_REVIEW4 | ✅ Закрыт | CR4-001..008 исправлены, 57 тестов зелёные |

---

## Состояние до изменений

### CI и тесты
- ✅ tsc --noEmit чист
- ✅ 57/57 тестов зелёные
- ✅ Защита main активна (CI обязателен, force-push запрещён)
- ✅ Все 38 предыдущих багов закрыты

---

## Новые замечания CR5

### 🔴 HIGH

#### CR5-001 — Двойной HTTP-запрос к sudrf.ru без rate-delay внутри processOne
**Файл:** `packages/scheduler/orchestrator.ts`

При `prev.status === 'decision'` `processOne` выполняет два сетевых запроса подряд: `fetchHtml` + `searchByCaseNumber`. `RATE_DELAY_MS` между вызовами `processOne` есть, но **внутри** одного вызова паузы нет. При 50 делах в статусе `decision` — 100 запросов к судебным серверам с интервалом ~0ms между парными запросами одного дела.

**Fix:** добавить `await sleep(RATE_DELAY_MS)` между `fetchHtml` и `searchByCaseNumber` внутри `processOne`, или перенести обогащение `legalForceDate` в отдельный батч-проход.

---

#### CR5-002 — `'deleted' as unknown` — несуществующий статус, убивает type safety
**Файл:** `packages/scheduler/orchestrator.ts`

```typescript
if (prev.status === 'archived' || prev.status === 'deleted' as unknown) return;
```

`'deleted'` не существует в `CaseStatus`. Каст `as unknown` — явный обход TypeScript. Мёртвый код, маскирующий ошибку: либо добавить `'deleted'` в `CaseStatus`, либо удалить ветку.

**Fix:** удалить `|| prev.status === 'deleted' as unknown`. Если нужно — добавить `'deleted'` в `CaseStatus`.

---

#### CR5-003 — `legalForceDate` без нормализации — `enforcedToday` всегда 0
**Файл:** `packages/store/cases.ts`

```typescript
enforcedToday: all.filter(c => c.status === 'enforced' && c.legalForceDate === today).length,
```

`legalForceDate` хранится как `string | null`. Если из парсера придёт ISO-строка (`2026-07-22T00:00:00.000Z`), сравнение `=== today` всегда `false`. Нет гарантии формата `YYYY-MM-DD` на уровне типов.

**Fix:** нормализовать при сохранении: `r.legalForceDate?.slice(0, 10)` в `orchestrator.ts`.

---

### 🟡 MEDIUM

#### CR5-004 — CORS wildcard + Authorization header — нерабочая комбинация
**Файл:** `packages/api/server.ts`

```typescript
res.header('Access-Control-Allow-Origin', '*');
res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
```

Браузеры блокируют `Authorization` при `wildcard origin` по спецификации CORS. Если CRM-интеграция идёт через браузер с токеном — запросы упадут с CORS-ошибкой.

**Fix:** убрать `Authorization` из allow-headers (если авторизации нет) или заменить wildcard на конкретный origin из `.env`.

---

#### CR5-005 — `/i` без `/u` на кириллических regex — undefined behaviour
**Файл:** `packages/intake/classify.ts`

```typescript
const CASE_NUMBER_RE = /^[А-ЯA-Z]?\d+[а-яa-z]?[-–]...$/i;
```

Флаг `/i` без `/u` для кириллицы работает только для ASCII-части. Unicode case-insensitive требует `/iu`. Строка `А56-12345/2024` (кириллическая А) может не матчить в зависимости от версии V8.

**Fix:** заменить `/i` на `/iu` во всех кириллических regex (`CASE_NUMBER_RE`, `CYRILLIC_WORD_RE`).

---

#### CR5-006 — `fetch` в polling без retry при network error
**Файл:** `packages/captcha/rucaptcha.ts`

`pollResult` ловит только `errorId !== 0` от API. При network-level сбое (`fetch` throws) вся captcha-сессия Puppeteer умирает без retry. Нестабильный интернет на VDS в РФ — типовой сценарий.

**Fix:** обернуть `fetch` в `pollResult` в try/catch с 1-2 retry при network error, без сброса общего таймаута.

---

#### CR5-007 — 3× `listCases` в `runFull` вместо одного прохода
**Файл:** `packages/store/cases.ts`

```typescript
listCases({ status: 'monitoring' })
  .concat(listCases({ status: 'decision' }))
  .concat(listCases({ status: 'error' }))
```

Три прохода по одному Map-у. При 10k делах — 30k итераций.

**Fix:** расширить сигнатуру: `status?: CaseStatus | CaseStatus[]`, фильтровать через `Set`.

---

#### CR5-012 — Нет guard от параллельных `runFull()` → потенциальный DoS
**Файл:** `packages/api/routes/parse.ts` (предположительно)

`POST /api/parse/run` запускает `runFull()` в фоне без проверки, идёт ли уже прогон. Два параллельных `runFull()` = двойная нагрузка + race condition на `updateCase`.

**Fix:**
```typescript
let isRunning = false;
// в handler:
if (isRunning) return res.status(409).json({ error: 'Run already in progress' });
isRunning = true;
runFull().finally(() => { isRunning = false; });
```

---

### 🔵 LOW

#### CR5-008 — tmp/rename без fsync — недокументированный trade-off
**Файл:** `packages/store/json-store.ts` (предположительно)

Атомарность `tmp → rename` не гарантирует durability на Windows без `fsync()` перед rename. Данные могут не попасть на диск при аварийном завершении. Осознанный trade-off, но не задокументирован в ARCHITECTURE.md §7.2.

---

#### CR5-009 — `"lint"` = type-check, eslint отсутствует
**Файл:** `package.json`

```json
"lint": "npx tsc --noEmit"
```

Не линтинг, а type-check. Без `@typescript-eslint` каст `as unknown` (CR5-002) и `await res.json() as { ... }` в `rucaptcha.ts` проходят незамеченными.

**Fix:** добавить `eslint` + `@typescript-eslint/no-unsafe-type-assertion`, `@typescript-eslint/no-floating-promises`.

---

#### CR5-010 — Hardcoded bind-адрес `127.0.0.1`
**Файл:** `packages/api/server.ts`

```typescript
const server = app.listen(PORT, '127.0.0.1', () => { ... });
```

`PORT` из env, а хост захардкожен. При деплое в контейнер или с reverse-proxy потребуется менять код.

**Fix:** `process.env['HOST'] ?? '127.0.0.1'`.

---

#### CR5-011 — `console.log`/`console.error` вместо structured logging
**Файл:** `packages/scheduler/orchestrator.ts`

Упоминалось в CR4 как "что дальше", но не закрыто. `pino` — 2 строки инициализации, JSON-логи, уровни, подключается к любому log aggregator.

---

## Сводная таблица CR5

| ID | Severity | Файл | Проблема | Статус |
|----|----------|------|---------|--------|
| CR5-001 | HIGH | `orchestrator.ts` | Двойной запрос на `decision`-делах без rate-delay | 🔴 Открыт |
| CR5-002 | HIGH | `orchestrator.ts` | `'deleted' as unknown` — несуществующий статус | 🔴 Открыт |
| CR5-003 | HIGH | `store/cases.ts` | `legalForceDate` без нормализации к `YYYY-MM-DD` | 🔴 Открыт |
| CR5-004 | MEDIUM | `api/server.ts` | CORS wildcard + Authorization — нерабочая комбинация | 🔴 Открыт |
| CR5-005 | MEDIUM | `intake/classify.ts` | `/i` без `/u` на кириллических regex | 🔴 Открыт |
| CR5-006 | MEDIUM | `captcha/rucaptcha.ts` | `fetch` polling без retry при network error | 🔴 Открыт |
| CR5-007 | MEDIUM | `store/cases.ts` | 3× `listCases` в `runFull` вместо одного прохода | 🔴 Открыт |
| CR5-008 | LOW | `store/json-store.ts` | tmp/rename без fsync — недокументированный trade-off | 🔴 Открыт |
| CR5-009 | LOW | `package.json` | `lint` = type-check, eslint отсутствует | 🔴 Открыт |
| CR5-010 | LOW | `api/server.ts` | Hardcoded bind `127.0.0.1` | 🔴 Открыт |
| CR5-011 | LOW | `orchestrator.ts` | `console.log` вместо structured logging | 🔴 Открыт |
| CR5-012 | MEDIUM | `api/routes/parse.ts` | Нет guard от параллельных `runFull()` | 🔴 Открыт |

**Итого CR5: 12 новых замечаний (3 HIGH, 5 MEDIUM, 4 LOW)**

---

## Приоритет исправлений

1. **CR5-002** — 1 строка, убирает silent type-safety hole
2. **CR5-003** — 1 строка (`?.slice(0, 10)`), фиксит `enforcedToday`
3. **CR5-012** — 3 строки, предотвращает race condition
4. **CR5-001** — 1 строка (`await sleep`), защищает от ban на sudrf.ru
5. **CR5-005** — замена `/i` → `/iu` во всех кириллических regex
6. **CR5-004** — уточнение CORS-политики
7. **CR5-006** — retry в captcha polling
8. **CR5-007** — рефакторинг `listCases` signature
9. CR5-008..011 — LOW, можно в отдельный технический sprint
