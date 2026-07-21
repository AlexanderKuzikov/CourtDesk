# CODE REVIEW — CourtDesk
> Ревью выполнено: **2026-07-22**  
> Ревьюер: Perplexity (на основе реального кода в репозитории)  
> Охват: все пакеты — core, captcha, intake, store, scheduler, api, parse, search  
> Статус предыдущих находок верифицирован по фактическому коду.

---

## ОБЩАЯ ОЦЕНКА

Архитектура адекватна масштабу: монолит, JSON-хранилище, один package.json, ESM + tsx. Большинство критичных и серьёзных проблем из ревью 2026-07-21 **действительно исправлены** в коде. Ниже — только то, что осталось нефиксированным или было обнаружено при ревью фактического кода.

Оценка по-пакетно: зелёный = всё ок, жёлтый = minor issues, оранжевый = есть реальные проблемы.

---

## СТАТУС ПРЕДЫДУЩИХ НАХОДОК

| ID | Было | Статус по реальному коду |
|----|------|--------------------------|
| §1.1 | N×disk reads, нет in-memory cache | ✅ ИСПРАВЛЕНО — `_cache: Map` реализован, `getStats()` один проход |
| §1.2 | Race condition read-modify-write | ⚠️ ЧАСТИЧНО — in-memory cache убирает гонку при HTTP, но `runFull()` через `202 Accepted` запускает фоновый процесс, который пишет в store параллельно с HTTP-запросами. Один поток, но event loop не гарантирует порядок при `async save()` |
| §1.3 | `deleteCase` пишет файл при несуществующем uid | ✅ ИСПРАВЛЕНО — `if (!existed) return false` перед `save()` |
| §2.1 | `runNew()` сломан — `fetchHtml('')` | ✅ ИСПРАВЛЕНО — отдельный `processWaiting()` через `searchByParty` |
| §2.2 | 3× updateCase за processOne | ⚠️ ЧАСТИЧНО — теперь in-memory cache, но 3 вызова `save()` всё равно делают 3 `writeJson()` |
| §2.4 | Dynamic import iconv в hot path | ✅ ИСПРАВЛЕНО — `import iconv from 'iconv-lite'` на верхнем уровне |
| §3.1 | PATCH без whitelist | ✅ ИСПРАВЛЕНО — `PATCH_ALLOWED` Set реализован |
| §3.2 | `res: any` | ✅ ИСПРАВЛЕНО — `res: Response` из express |
| §4.1 | magistrate без captcha + CP1251 | ✅ ИСПРАВЛЕНО — `fetchMagistrateHtml` + `fetchWithIconv` |
| §5.2 | `findCourtsByName` — преждевременный `map` | ❌ НЕ ИСПРАВЛЕНО — в реальном коде: `.filter().map().slice()` |
| §6.2 | Нет `engines` в package.json | ✅ ИСПРАВЛЕНО — `"engines": { "node": ">=20.6.0" }` |
| §6.1 | Комментарий «CourtSniffer» в config.ts | ❌ НЕ ИСПРАВЛЕНО — по-прежнему `// Конфигурация CourtSniffer` |
| §7.1 | CRLF endings | ✅ ИСПРАВЛЕНО — `.gitattributes` добавлен |
| §9.1 | Нет CORS | ❌ НЕ ИСПРАВЛЕНО — в `server.ts` нет CORS middleware |
| §9.2 | monitor/legal-force роутеры не подключены | ❌ НЕ ИСПРАВЛЕНО — в `server.ts` подключены только 6 роутеров |

---

## 1. `packages/store/cases.ts` — 🟡 МИНОРНО

### 1.1 Три `writeJson()` на один `processOne()` — избыточный fsync

После введения in-memory cache `readFileSync` вызывается только один раз. Однако `save()` по-прежнему вызывает `writeJson()` синхронно. В `processOne()` это может происходить 3–5 раз за одну итерацию:

```ts
updateCase(c.uid, { status: 'decision', result })  // writeJson #1
addEvent(c.uid, makeEvent(...))                      // writeJson events.json #2
updateCase(c.uid, { status: 'enforced', ... })       // writeJson #3
addEvent(c.uid, ...)                                 // writeJson events.json #4
updateCase(c.uid, { lastChecked: now() })             // writeJson #5
```

На 100 делах — 500 `writeJson` за `runFull()`. При этом промежуточные состояния (status: 'decision' + status: 'enforced' в одном прогоне) писать бессмысленно — важно только финальное состояние.

**Фикс:** батчить изменения в `processOne` через один `updateCase` с объединёнными updates в конце обработки.

### 1.2 `listCases` не поддерживает фильтрацию по `number` — только по `q`

```ts
if (filter.q) {
  const q = filter.q.toLowerCase();
  if (!c.number.toLowerCase().includes(q) && !c.courtId.toLowerCase().includes(q)) return false;
}
```

Эндпоинт `GET /api/cases?q=` ищет по `number` и `courtId`. Поиск по `userId` и `status` — отдельные параметры. Нет поиска по `number` как точному совпадению — при дублировании дел в разных судах невозможно получить конкретное дело по номеру без перебора.

---

## 2. `packages/scheduler/orchestrator.ts` — 🟠 СЕРЬЁЗНО

### 2.1 `processOne()` — race condition с фоновым `runFull()`

`POST /api/parse/run` отвечает 202 и запускает `runFull()` в фоне (`.then().catch()`). При этом `processOne()` читает состояние кейса через `getCase()` **до** начала обработки, а записывает через `updateCase()` — после (несколько раз). Если параллельно пришёл `PATCH /api/cases/:uid` — `updateCase` из HTTP-запроса перезапишет in-memory Map, а следующий `updateCase` из `processOne` перезапишет его обратно.

```
200ms: HTTP PATCH /api/cases/abc → updateCase(abc, { status: 'archived' })
210ms: processOne(abc) → updateCase(abc, { lastChecked: now() }) ← перезапишет status!
```

Node.js однопоточен, но `await fetchHtml()` освобождает event loop и позволяет HTTP-обработчикам выполняться между `await`.

**Фикс:** read-modify-write для `processOne` должен быть атомарным. Минимум: перечитать состояние кейса непосредственно перед записью: `const latest = getCase(c.uid)` перед каждым `updateCase`, чтобы не затирать изменения, внесённые через API.

### 2.2 `makeEvent()` не проставляет `caseUid`

```ts
function makeEvent(type: string, message: string, data?: Record<string, unknown>): CaseHistoryEvent {
  return {
    uid: crypto.randomUUID(),
    caseUid: '',          // ← ВСЕГДА пустая строка!
    type,
    message,
    ...
  };
}
```

Создаваемые события **не привязаны к делу** — `caseUid = ''`. Функция `addEvent(c.uid, makeEvent(...))` передаёт uid первым аргументом, но `makeEvent` не получает его. При поиске событий по `caseUid` — возвращается пустой массив.

**Фикс:** `makeEvent(caseUid: string, type: string, ...)` — добавить первый параметр, или заполнять `caseUid` в `addEvent()`.

### 2.3 `processWaiting()` — нет обновления `lastChecked` при пустом результате поиска

```ts
if (results.length === 0) {
  updateCase(c.uid, { lastChecked: now() });
  return;
}
```

Есть — `lastChecked` обновляется. Но нет обновления при `!party` (выход раньше):

```ts
if (!party) return;  // ← lastChecked не обновляется
```

Дело «зависает» без обновления `lastChecked`, `isStale()` будет возвращать `true` при каждом `runRetry`, и каждый `runRetry` будет пытаться обработать это дело снова.

### 2.4 `runFull()` не обрабатывает `error`-статус

```ts
export async function runFull(): Promise<{ ok: number; fail: number }> {
  const cases = listCases({ status: 'monitoring' }).concat(listCases({ status: 'decision' }));
  return processBatch(cases);
}
```

Дела со статусом `'error'` не включены в `runFull()` и не включены в `runRetry()`. После ошибки дело навсегда «застревает» в `error`-статусе без повторных попыток. CONTEXT.md не описывает стратегию retry для `error`-дел.

---

## 3. `packages/api/server.ts` — 🟠 СЕРЬЁЗНО

### 3.1 Роутеры по CONTEXT.md §API-контракты не подключены

CONTEXT.md определяет 15 эндпоинтов. В `server.ts` подключено 6 роутеров. Отсутствуют:

| Эндпоинт | Статус |
|----------|--------|
| `GET /api/status` | ❌ Нет роутера |
| `GET /api/notifications` | ❌ Нет роутера |
| `POST /api/resolve` | ❌ Нет роутера |

`GET /api/cases/stats` есть в `cases.ts`, но не эквивалентен `/api/status` из CONTEXT.md (тот должен включать `health`).

### 3.2 Нет CORS middleware

Web UI из `viewer/` работает на том же origin (статика через Express). Но при разработке (Vite dev server на `:5173`, API на `:8767`) или при внешнем клиенте — fetch упадёт с CORS error. Нет ни `cors()` middleware, ни `Access-Control-Allow-Origin` заголовка. ARCHITECTURE.md §10 упоминает CORS как «существующую возможность».

### 3.3 `app.listen()` на верхнем уровне модуля — проблема для тестов

```ts
const app = createApp();
app.listen(PORT, '127.0.0.1', () => { ... });
```

`createApp()` вынесен отдельно (INFRA-004 fix). Но `app.listen()` всё равно вызывается при `import './server.js'` — в тестах с `supertest(createApp())` это не страшно, но при множественных import — порт занят. Стандартный паттерн: `if (import.meta.url === pathToFileURL(process.argv[1]).href) app.listen(...)` или выделить `main.ts`.

---

## 4. `packages/core/courts.ts` — 🟡 МИНОРНО

### 4.1 `findCourtsByName` — `map` перед `slice`

```ts
return entries
  .filter(e => words.every(w => e.name.toLowerCase().includes(w)))
  .map(toCourtInfo)   // ← все matching entries, до slice
  .slice(0, 50);
```

При запросе «суд» потенциально 5000+ записей проходят через `toCourtInfo()` (создание нового объекта) до того как `slice(0, 50)` их отбросит. Порядок должен быть: `filter → slice → map`.

### 4.2 `getAllCourts()` — 10287 новых объектов на каждый вызов

```ts
export function getAllCourts(): CourtInfo[] {
  return entries.map(toCourtInfo);
}
```

Если `GET /api/courts` (без `q=`) вызывает `getAllCourts()` — это 10287 объектов при каждом запросе. Для справочника лучше вернуть `entries` напрямую или кэшировать результат `map` при инициализации модуля.

### 4.3 `COURT_TYPE_CODE` — `'GV'`, `'KV'` маппятся в `'district'`

```ts
GV: 'district',   // Гарнизонный военный суд
KV: 'district',   // Кассационный военный суд?
```

Военные суды (`GV`, `OV`, `KV`) используют `sudrf.ru` субдомен, но их API-параметры могут отличаться от обычных районных судов. Маппинг в `'district'` технически работает для текущих адаптеров, но документально не обоснован.

---

## 5. `packages/intake/classify.ts` — 🟡 МИНОРНО

### 5.1 `CASE_NUMBER_RE` не покрывает реальные форматы

```ts
const CASE_NUMBER_RE = /^\d+-[а-яА-Я\d]+\/\d{4}$/;
```

Не покрывает:
- Арбитражные: `А56-12345/2024` (кирилл. «А» в начале)
- Кассация ВС: `88-КГ24-1-К8`
- Апелляция: `33-1234/2024` (нет буквенного суффикса в некоторых судах)
- Административные: `2а-123/2024`

Паттерн слишком узкий — валидные номера дел будут класcифицированы как ФИО или `malformed`.

### 5.2 ФИО-эвристика не проверяет алфавит

```ts
const words = trimmed.split(/\s+/).filter(w => w.length >= 2);
if (words.length >= 2 && words.length <= 4) {
  return { type: 'search', defendant: trimmed };
}
```

`"GET /api status"` (3 слова) → `type: 'search', defendant: 'GET /api status'`. Нет проверки на кириллицу. Это ломает intake для Web UI при случайном вводе.

### 5.3 `detectCourtTypeFromHost` — appeal определяется только по `deloId`

```ts
if (deloId === '2800001') return 'cassation';
if (deloId === '5') return 'appeal';
return 'district';
```

`deloId` — нестабильный идентификатор, может измениться при обновлении СУДРФ. Для апелляционных судов надёжнее определять тип по субдомену (`oblsud`, `appl`) или по code из справочника судов.

---

## 6. `packages/core/config.ts` — 🟡 МИНОРНО

### 6.1 Комментарий «CourtSniffer» не обновлён

```ts
// Конфигурация CourtSniffer — загрузка секретов из .env
```

Копипаста из другого репозитория. Должно быть «CourtDesk».

### 6.2 `process.loadEnvFile` — нет обработки `EACCES`

```ts
try {
  process.loadEnvFile(resolve(process.cwd(), '.env'));
} catch (e: unknown) {
  if (!(e instanceof Error && 'code' in e && (e as NodeJS.ErrnoException).code === 'ENOENT')) throw e;
}
```

Обрабатывается только `ENOENT`. Если `.env` существует, но нет прав на чтение (`EACCES`) — процесс упадёт с необработанной ошибкой. На prod-серверах с жёсткими правами файловой системы это реально.

**Фикс:** добавить `'EACCES'` в условие или логировать warning вместо throw.

---

## 7. `packages/core/types.ts` — 🟡 МИНОРНО

### 7.1 `ParseRunRequest.mode` не включает `'retry'`

```ts
export interface ParseRunRequest {
  mode: 'full' | 'new' | 'errors';
}
```

В `parse.ts` switch обрабатывает `'full' | 'retry' | 'new'`. Тип говорит `'errors'`, роутер принимает `'retry'`. Несоответствие: `mode: 'errors'` упадёт в `default: runFull()`, `mode: 'retry'` не задокументирован в типах.

### 7.2 `CaseStatus` не включает `'archived'`

```ts
export type CaseStatus = 'waiting' | 'monitoring' | 'decision' | 'enforced' | 'error';
```

ARCHITECTURE.md §5.4 перечисляет `CaseStatus` как `'searching' | 'monitoring' | 'completed' | 'archived' | 'error'`. Типы в коде и типы в архитектуре не совпадают. `'archived'` статус упоминается в ARCHITECTURE.md но отсутствует в `types.ts` — нельзя архивировать дело через типизированный API.

---

## 8. `packages/api/routes/cases.ts` — 🟡 МИНОРНО

### 8.1 `POST /api/cases` не валидирует формат `caseNumber`

```ts
const { url, courtId, courtCode, courtType, caseNumber, userId } = req.body ?? {};
if (!url || !courtId || !courtType || !caseNumber) { ... }
```

Только проверка на truthy. Никаких проверок формата: `caseNumber: 123` (number), `caseNumber: 'garbage'` — всё пройдёт. В `WatchedCase.number` попадёт мусор, который потом сломает поиск дела.

### 8.2 `POST /api/cases/wait` объявлен ПОСЛЕ `POST /api/cases`

```ts
router.post('/api/cases', ...)      // строка ~60
router.post('/api/cases/wait', ...) // строка ~95
```

Express 5 правильно обрабатывает `/api/cases/wait` vs `/api/cases` — статический сегмент `wait` имеет приоритет над динамическим. Но это хрупко: если кто-то добавит `router.post('/api/cases/:uid', ...)` — порядок станет критичен. Лучше разместить специфичные роуты перед общим.

---

## ИТОГО

| Приоритет | Пакет/Файл | Проблема | BUG-ID |
|-----------|-----------|----------|--------|
| 🟠 СЕРЬЁЗНО | `scheduler/orchestrator.ts` | `makeEvent()` — `caseUid: ''` всегда | NEW-001 |
| 🟠 СЕРЬЁЗНО | `scheduler/orchestrator.ts` | Race condition processOne vs PATCH API | NEW-002 |
| 🟠 СЕРЬЁЗНО | `api/server.ts` | Нет CORS, нет `/api/status`, `/api/notifications` | NEW-003 |
| 🟡 МИНОРНО | `scheduler/orchestrator.ts` | `error`-дела не ретраются в runFull/runRetry | NEW-004 |
| 🟡 МИНОРНО | `scheduler/orchestrator.ts` | processWaiting: нет `lastChecked` при `!party` | NEW-005 |
| 🟡 МИНОРНО | `core/courts.ts` | `findCourtsByName` — `map` перед `slice` | NEW-006 |
| 🟡 МИНОРНО | `core/courts.ts` | `getAllCourts()` — 10287 объектов на каждый вызов | NEW-007 |
| 🟡 МИНОРНО | `core/types.ts` | `ParseRunRequest.mode` != реальный switch | NEW-008 |
| 🟡 МИНОРНО | `core/types.ts` | `CaseStatus` нет `'archived'` из ARCHITECTURE.md | NEW-009 |
| 🟡 МИНОРНО | `intake/classify.ts` | `CASE_NUMBER_RE` не покрывает арбитраж/кассацию | NEW-010 |
| 🟡 МИНОРНО | `intake/classify.ts` | ФИО-эвристика без проверки алфавита | NEW-011 |
| 🟡 МИНОРНО | `core/config.ts` | `EACCES` не обрабатывается в loadEnvFile try/catch | NEW-012 |
| 🟡 МИНОРНО | `api/routes/cases.ts` | `POST /api/cases` — нет валидации формата caseNumber | NEW-013 |
| 🟢 INFO | `api/server.ts` | `app.listen()` на верхнем уровне модуля | NEW-014 |
| 🟢 INFO | `core/config.ts` | Комментарий «CourtSniffer» не обновлён | NEW-015 |
