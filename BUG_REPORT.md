# BUG REPORT — CourtDesk
> Дата создания: 2026-07-21  
> Дата обновления: **2026-07-22** (верификация по реальному коду + новые находки)  
> Ревьюер: Perplexity

---

## СТАТУС ПРЕДЫДУЩИХ БАГОВ

| ID | Severity | Описание | Статус | Коммит |
|----|----------|----------|--------|--------|
| BUG-001 | CRITICAL | Race condition, потеря данных | ✅ CLOSED (не воспроизводится — in-memory cache) | — |
| BUG-002 | CRITICAL | `runNew()` не работает, URL='' | ✅ FIXED — `processWaiting()` через `searchByParty` | `67173ba` |
| BUG-003 | HIGH | `parse/url` сломан для magistrate | ✅ FIXED — `fetchMagistrateHtml` + `fetchWithIconv` | `89570af` |
| BUG-004 | HIGH | PATCH без whitelist | ✅ FIXED — `PATCH_ALLOWED` Set | `219e1ac` |
| BUG-005 | HIGH | magistrate caseUrl с `.sudrf.ru` | ✅ CLOSED (district-адаптер недостижим для magistrate) | — |
| BUG-006 | MEDIUM | deleteCase лишняя I/O | ✅ FIXED — `if (!existed) return false` | `5932ff8` |
| BUG-007 | MEDIUM | Node < 20.6 падает | ✅ FIXED — `engines` добавлен | `fd7fa7e` |
| BUG-008 | MEDIUM | runFull блокирует event loop | ✅ FIXED — 202 Accepted, фоновый runner | `89570af` |
| BUG-009 | MEDIUM | N×disk reads, нет cache | ✅ FIXED — `_cache: Map` singleton | `5932ff8` |
| BUG-010 | LOW | CRLF в rucaptcha.ts | ✅ FIXED — `.gitattributes` | `fd7fa7e` |
| BUG-011 | LOW | Dynamic import iconv hot path | ✅ FIXED — static import | `67173ba` |

---

## НОВЫЕ БАГИ (2026-07-22)

---

## NEW-001 — HIGH: `makeEvent()` всегда создаёт событие с `caseUid: ''`

**Файл:** `packages/scheduler/orchestrator.ts`  
**Тип:** логическая ошибка — data corruption  
**Статус:** 🔴 OPEN

**Описание:**

```ts
function makeEvent(type: string, message: string, data?: Record<string, unknown>): CaseHistoryEvent {
  return {
    uid: crypto.randomUUID(),
    caseUid: '',          // ← ЗАХАРДКОДЕН как пустая строка
    type,
    message,
    data: data ?? {},
    createdAt: now(),
  };
}
```

Все события, создаваемые `processOne()` и `processWaiting()`, записываются с `caseUid = ''`. При последующем запросе `GET /api/cases/:uid` (история событий) — поиск по `caseUid === uid` вернёт пустой массив. История изменений дела **недоступна**.

**Репро:**
1. Добавить дело `POST /api/cases`
2. Запустить `POST /api/parse/run { mode: 'full' }`
3. `GET /api/cases/:uid` — история событий пуста

**Фикс:**
```ts
// Вариант 1: передавать caseUid в makeEvent
function makeEvent(caseUid: string, type: string, message: string, data?: Record<string, unknown>): CaseHistoryEvent {
  return { uid: crypto.randomUUID(), caseUid, type, message, data: data ?? {}, createdAt: now() };
}

// Вариант 2: заполнять в addEvent() если пусто
// addEvent(c.uid, makeEvent('decision', 'Вынесено решение'))
// → addEvent сам подставляет caseUid перед записью
```

---

## NEW-002 — HIGH: Race condition между `processOne()` и HTTP PATCH

**Файл:** `packages/scheduler/orchestrator.ts`, `packages/api/routes/cases.ts`  
**Тип:** data corruption (логическая гонка)  
**Статус:** 🔴 OPEN

**Описание:**

`POST /api/parse/run` запускает `runFull()` в фоне через `.then()`. В `processOne()` есть несколько `await fetchHtml()` — в эти моменты event loop освобождается. Если между `await` приходит `PATCH /api/cases/:uid`, то:

```
t=0ms: processOne(abc) читает getCase(abc) → { status: 'monitoring' }
t=50ms: await fetchHtml(url)  ← event loop свободен
t=55ms: PATCH /api/cases/abc { status: 'archived' } → updateCase → _cache updated
t=3000ms: fetchHtml завершился
t=3001ms: processOne: updateCase(abc, { lastChecked: now() })  ← затирает 'archived'!
```

Дело возвращается в `monitoring` несмотря на явный `PATCH` с `archived`.

**Фикс:** перед каждым `updateCase` в `processOne` проверять актуальный статус:
```ts
const latest = getCase(c.uid);
if (!latest || latest.status === 'archived') return; // пропустить если изменили
```

---

## NEW-003 — HIGH: Эндпоинты из API-контракта не реализованы

**Файл:** `packages/api/server.ts`  
**Тип:** feature gap  
**Статус:** 🔴 OPEN

**Описание:**

CONTEXT.md §API-контракты определяет 15 эндпоинтов. Фактически подключено 6 роутеров. Отсутствуют:

| Эндпоинт | Назначение | Используется в |
|----------|-----------|----------------|
| `GET /api/status` | Счётчики + health | UC-0 Дашборд |
| `GET /api/notifications` | Уведомления | UC-4 |
| `POST /api/resolve` | Суд + номер → ссылка | UC-1 |

`GET /api/cases/stats` частично покрывает `/api/status`, но не содержит `health` поля. Web UI дашборд (UC-0) не может получить нужные данные.

**Фикс:** создать `routes/status.ts` с `GET /api/status` → `{ ...getStats(), health: 'ok' }` и `routes/notifications.ts`.

---

## NEW-004 — MEDIUM: Дела со статусом `'error'` не ретраются

**Файл:** `packages/scheduler/orchestrator.ts`  
**Тип:** логическая ошибка  
**Статус:** 🟠 OPEN

**Описание:**

```ts
export async function runFull(): Promise<{ ok: number; fail: number }> {
  const cases = listCases({ status: 'monitoring' })
    .concat(listCases({ status: 'decision' }));
  // status: 'error' — не включён
}

export async function runRetry(): Promise<{ ok: number; fail: number }> {
  const cases = listCases({ status: 'monitoring' }).filter(isStale);
  // status: 'error' — не включён
}
```

Если `processOne` выбрасывает исключение — `processBatch` ловит его, инкрементирует `fail`, но **не меняет статус дела** на `'error'`. При следующем `runFull` дело снова попадёт в прогон и снова упадёт. Бесконечный цикл падений.

Если где-то статус всё же выставляется в `'error'` — то `runFull` его игнорирует, и дело застревает навсегда.

**Фикс:** явная стратегия для `error`-дел: либо включить в `runRetry` с backoff, либо в `processBatch` при ошибке выставлять `status: 'error'` и включать в retry с экспоненциальной задержкой.

---

## NEW-005 — MEDIUM: `processWaiting()` не обновляет `lastChecked` при `!party`

**Файл:** `packages/scheduler/orchestrator.ts`  
**Тип:** логическая ошибка  
**Статус:** 🟠 OPEN

**Описание:**

```ts
async function processWaiting(c: WatchedCase): Promise<void> {
  const events = getEvents(c.uid);
  const waitEvent = events.find(e => e.type === 'waiting');
  if (!waitEvent) { console.warn(...); return; }  // ← нет lastChecked update

  const party = String(waitEvent.data['party'] ?? '');
  if (!party) return;  // ← нет lastChecked update
  ...
}
```

`isStale()` определяется по `lastChecked`. Если `!waitEvent` или `!party` — `lastChecked` не обновляется, дело всегда `isStale`, и `runRetry()` будет пытаться обработать его при каждом запуске.

**Фикс:** добавить `updateCase(c.uid, { lastChecked: now() })` при выходе из-за `!waitEvent` или `!party`.

---

## NEW-006 — MEDIUM: `ParseRunRequest.mode` в types.ts не совпадает с реальным switch

**Файл:** `packages/core/types.ts`, `packages/api/routes/parse.ts`  
**Тип:** type/runtime mismatch  
**Статус:** 🟠 OPEN

**Описание:**

```ts
// types.ts
export interface ParseRunRequest {
  mode: 'full' | 'new' | 'errors';  // ← 'errors'
}

// parse.ts routes
switch (mode) {
  case 'full':  runner = runFull; break;
  case 'retry': runner = runRetry; break;  // ← 'retry'
  case 'new':   runner = runNew; break;
  default:      runner = runFull; break;   // ← 'errors' попадёт сюда молча!
}
```

`mode: 'errors'` из типов не обрабатывается в switch — молча запускает `runFull`.  
`mode: 'retry'` из switch не задокументирован в типах.

**Фикс:** привести `ParseRunRequest.mode` к `'full' | 'retry' | 'new'`.

---

## NEW-007 — MEDIUM: `CaseStatus` не содержит `'archived'` из ARCHITECTURE.md

**Файл:** `packages/core/types.ts`  
**Тип:** type incompleteness  
**Статус:** 🟠 OPEN

**Описание:**

ARCHITECTURE.md §5.4 определяет `CaseStatus` как `'searching' | 'monitoring' | 'completed' | 'archived' | 'error'`.  
В `types.ts`: `'waiting' | 'monitoring' | 'decision' | 'enforced' | 'error'`.

Расхождение тройное:
- `'archived'` — есть в архитектуре, нет в типах → нельзя архивировать дело
- `'searching'` / `'completed'` — в архитектуре, но не в коде
- `'waiting'` / `'decision'` / `'enforced'` — в коде, но не в архитектуре

Если `PATCH /api/cases/:uid { status: 'archived' }` — TypeScript не запрещает (строка в `Partial<WatchedCase>`), но semantics не определены нигде.

**Фикс:** привести ARCHITECTURE.md в соответствие с реальными типами или наоборот. Решить — нужен ли `'archived'`.

---

## NEW-008 — LOW: `findCourtsByName` — `map` перед `slice`

**Файл:** `packages/core/courts.ts`  
**Тип:** performance  
**Статус:** 🟡 OPEN

**Описание:**

```ts
return entries
  .filter(e => words.every(w => e.name.toLowerCase().includes(w)))
  .map(toCourtInfo)   // ← создаёт объекты для всех matching (может быть 5000+)
  .slice(0, 50);
```

Для широких запросов («суд», «районный») `filter` может вернуть тысячи записей. `toCourtInfo` создаёт новый объект для каждой — лишняя аллокация.

**Фикс:**
```ts
return entries
  .filter(e => words.every(w => e.name.toLowerCase().includes(w)))
  .slice(0, 50)
  .map(toCourtInfo);
```

---

## NEW-009 — LOW: `core/config.ts` — `EACCES` не обрабатывается

**Файл:** `packages/core/config.ts`  
**Тип:** robustness  
**Статус:** 🟡 OPEN

**Описание:**

```ts
try {
  process.loadEnvFile(resolve(process.cwd(), '.env'));
} catch (e: unknown) {
  if (!(e instanceof Error && 'code' in e && (e as NodeJS.ErrnoException).code === 'ENOENT')) throw e;
  // ↑ только ENOENT silent. EACCES — re-throw, процесс падает.
}
```

На серверах с `chmod 600 .env` и процессом без прав на чтение — упадёт при старте. Опционально обрабатывать `EACCES` как warning.

**Фикс:**
```ts
const SILENT_CODES = new Set(['ENOENT', 'EACCES']);
if (!(e instanceof Error && 'code' in e && SILENT_CODES.has((e as NodeJS.ErrnoException).code!))) throw e;
console.warn('[config] .env не загружен:', (e as NodeJS.ErrnoException).code);
```

---

## NEW-010 — LOW: `CASE_NUMBER_RE` не покрывает арбитражные и кассационные номера

**Файл:** `packages/intake/classify.ts`  
**Тип:** false negative  
**Статус:** 🟡 OPEN

**Описание:**

```ts
const CASE_NUMBER_RE = /^\d+-[а-яА-Я\d]+\/\d{4}$/;
```

Не покрывает:
- `А56-12345/2024` — арбитраж (кириллическая «А» в начале)
- `88-КГ24-1-К8` — кассация ВС
- `33-1234/2024` — апелляция без буквенного суффикса
- `2а-123/2024` — административные дела

Результат: эти номера классифицируются как ФИО или `malformed`.

**Фикс:**
```ts
// Покрывает: 2-123/2024, А56-123/2024, 2а-123/2024, 33-123/2024, 88-КГ24-1-К8
const CASE_NUMBER_RE = /^[А-Яа-я\d]+[-–][а-яА-Я\d]+(\/\d{4})?(-[А-Яа-я\d-]+)?$/;
```

---

## NEW-011 — LOW: ФИО-эвристика не проверяет алфавит слов

**Файл:** `packages/intake/classify.ts`  
**Тип:** false positive  
**Статус:** 🟡 OPEN

**Описание:**

```ts
const words = trimmed.split(/\s+/).filter(w => w.length >= 2);
if (words.length >= 2 && words.length <= 4) {
  return { type: 'search', defendant: trimmed };
}
```

`"GET /api"`, `"status 200 ok"`, `"POST cases wait"` → `type: 'search'`. Любые 2–4 слова длиной ≥ 2 символа интерпретируются как ФИО. Через Web UI пользователь может случайно вызвать поиск по мусору.

**Фикс:** добавить проверку на кириллицу:
```ts
const CYRILLIC_WORD = /^[А-ЯЁа-яё]+$/;
if (words.length >= 2 && words.length <= 4 && words.every(w => CYRILLIC_WORD.test(w))) {
  return { type: 'search', defendant: trimmed };
}
```

---

## СВОДНАЯ ТАБЛИЦА ВСЕХ БАГОВ

| ID | Severity | Файл | Описание | Статус |
|----|----------|------|----------|--------|
| BUG-001 | CRITICAL | `store/cases.ts` | Race condition, потеря данных | ✅ CLOSED |
| BUG-002 | CRITICAL | `scheduler/orchestrator.ts` | `runNew()` / `fetchHtml('')` | ✅ FIXED |
| BUG-003 | HIGH | `api/routes/parse.ts` | magistrate без captcha + CP1251 | ✅ FIXED |
| BUG-004 | HIGH | `api/routes/cases.ts` | PATCH без whitelist | ✅ FIXED |
| BUG-005 | HIGH | `search/adapters/district.ts` | magistrate caseUrl с `.sudrf.ru` | ✅ CLOSED |
| BUG-006 | MEDIUM | `store/cases.ts` | deleteCase лишняя I/O | ✅ FIXED |
| BUG-007 | MEDIUM | `package.json` | Node < 20.6 падает | ✅ FIXED |
| BUG-008 | MEDIUM | `scheduler/orchestrator.ts` | runFull блокирует event loop | ✅ FIXED |
| BUG-009 | MEDIUM | `store/cases.ts` | N×disk reads, нет cache | ✅ FIXED |
| BUG-010 | LOW | `captcha/rucaptcha.ts` | CRLF endings | ✅ FIXED |
| BUG-011 | LOW | `scheduler/orchestrator.ts` | Dynamic import iconv hot path | ✅ FIXED |
| NEW-001 | HIGH | `scheduler/orchestrator.ts` | `makeEvent()` caseUid='' | 🔴 OPEN |
| NEW-002 | HIGH | `scheduler/orchestrator.ts` | Race condition processOne vs PATCH | 🔴 OPEN |
| NEW-003 | HIGH | `api/server.ts` | `/api/status`, `/api/notifications` не реализованы | 🔴 OPEN |
| NEW-004 | MEDIUM | `scheduler/orchestrator.ts` | `error`-дела не ретраются | 🟠 OPEN |
| NEW-005 | MEDIUM | `scheduler/orchestrator.ts` | processWaiting: нет lastChecked при !party | 🟠 OPEN |
| NEW-006 | MEDIUM | `core/types.ts` | ParseRunRequest.mode != switch | 🟠 OPEN |
| NEW-007 | MEDIUM | `core/types.ts` | CaseStatus нет 'archived' | 🟠 OPEN |
| NEW-008 | LOW | `core/courts.ts` | findCourtsByName: map перед slice | 🟡 OPEN |
| NEW-009 | LOW | `core/config.ts` | EACCES не обрабатывается | 🟡 OPEN |
| NEW-010 | LOW | `intake/classify.ts` | CASE_NUMBER_RE — арбитраж/кассация | 🟡 OPEN |
| NEW-011 | LOW | `intake/classify.ts` | ФИО-эвристика без проверки алфавита | 🟡 OPEN |
