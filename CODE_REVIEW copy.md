# CODE REVIEW — CourtDesk
> Ревью выполнено: 2026-07-21  
> Охват: все пакеты (core, captcha, intake, store, scheduler, api, search/adapters)

---

## ОБЩАЯ ОЦЕНКА

Проект структурно грамотный. Архитектурные решения — единый процесс, JSON-хранилище, один `package.json` — адекватны масштабу. Но реализация содержит ряд серьёзных проблем, которые **сломают систему в продакшне**. Ниже — по пакетам, от критичного к минорному.

---

## 1. `packages/store` — КРИТИЧНО

### 1.1 N×2 чтений с диска на каждый вызов

Каждая экспортируемая функция (`getCase`, `listCases`, `addCase`, `updateCase`, `deleteCase`, `getStats`) вызывает `load()`, которая делает `readFileSync` + `JSON.parse`. `getStats()` вызывает `listCases` с 4 разными фильтрами — это **4 отдельных чтения файла** за один HTTP-запрос. ARCHITECTURE.md обещает in-memory Map, но её нет.

```
// Что происходит при GET /api/cases/stats:
getStats()
  listCases({ status: 'monitoring' })  → readFileSync #1
  listCases({ status: 'waiting' })     → readFileSync #2
  listCases({ status: 'decision' })    → readFileSync #3
  listCases({ status: 'enforced' })    → readFileSync #4
```

**Фикс:** добавить модульный singleton `let _cache: Map<string, WatchedCase> | null = null` с инвалидацией при каждой записи.

### 1.2 Race condition при конкурентных запросах

`writeFileSync` + `renameSync` атомарны на уровне ОС, но логика **read-modify-write не атомарна**:

```
Req A: load() → map_A
Req B: load() → map_B
Req A: save(map_A)   ← затирает изменения B
Req B: save(map_B)   ← затирает изменения A
```

Express async + scheduler вызываемый из `POST /api/parse/run` создают реальный сценарий. При одновременном добавлении дела пользователем и прогоне scheduler — данные теряются.

**Фикс:** синхронная очередь (`async-mutex` или собственный promise-lock перед каждым `load→save`).

### 1.3 `deleteCase` всегда пишет файл, даже если uid не существовал

```ts
export function deleteCase(uid: string): boolean {
  const map = load();
  const existed = map.has(uid);
  map.delete(uid);  // map.delete на несуществующем ключе — no-op
  save(map);        // ← запись происходит ВСЕГДА
  return existed;
}
```

Лишняя I/O операция при каждом `DELETE /api/cases/:uid` с несуществующим uid. Нужно `if (existed) save(map)`.

---

## 2. `packages/scheduler/orchestrator.ts` — КРИТИЧНО

### 2.1 `waiting`-кейс сломан логически

```ts
export async function runNew(): Promise<{ ok: number; fail: number }> {
  const cases = listCases({ status: 'waiting' });
  return processBatch(cases);
}

async function processOne(c: WatchedCase): Promise<void> {
  const adapter = getParseAdapter(c.courtType);
  const html = await fetchHtml(c.url);   // ← c.url = '' для waiting-кейса!
  // ...
}
```

Для `waiting`-дела `url` создаётся пустой строкой (`url: ''` в `cases.ts`). `fetchHtml('')` выбросит исключение до того как дойдёт до кода проверки статуса. Режим `runNew` / `mode: 'new'` **никогда не работает**.

### 2.2 Три `updateCase` за один `processOne` = три полных цикла read→write

```ts
async function processOne(c: WatchedCase): Promise<void> {
  // ...
  if (card.card.result && !prev.result) {
    updateCase(c.uid, { status: 'decision', ... });  // load→save #1
    addEvent(c.uid, makeEvent(...));                  // load→save events #2
  }
  if (c.status === 'decision' && !c.legalForceDate) {
    updateCase(c.uid, { status: 'enforced', ... });  // load→save #3
    addEvent(c.uid, makeEvent(...));                  // load→save events #4
  }
  updateCase(c.uid, { lastChecked: now() });          // load→save #5
}
```

При 100 делах в мониторинге `runFull()` = **500+ синхронных I/O** за один прогон. При этом каждое `updateCase` читает весь `cases.json` заново.

### 2.3 Нет лимита конкурентности

`processBatch` — последовательный `for...of` с `await`. Для magistrate с капчей (2+ минуты на дело) при 50 делах `runFull` будет висеть **1.5+ часа**, блокируя event loop для всех HTTP-запросов сервера.

### 2.4 Dynamic import iconv-lite в hot path

```ts
// В fetchHtml, вызывается для каждого дела:
const { default: iconv } = await import('iconv-lite');
```

`iconv-lite` — статическая зависимость, используется везде. Dynamic import здесь — лишний overhead. Вынести на уровень модуля: `import iconv from 'iconv-lite'`.

---

## 3. `packages/api/routes/cases.ts` — СЕРЬЁЗНО

### 3.1 `PATCH /api/cases/:uid` — нет whitelist полей

```ts
router.patch('/api/cases/:uid', (req, res) => {
  const updated = updateCase(req.params.uid, req.body ?? {});
});
```

`updateCase` делает `{ ...existing, ...updates }` без фильтрации. Клиент может передать:
- `{ uid: 'другой_uid' }` — изменить ключ записи (несогласованность Map)
- `{ createdAt: '...' }` — перезаписать системные поля
- `{ status: 'enforced' }` — обойти бизнес-логику перехода статусов

Нужен явный whitelist: `{ status, result, legalForceDate, legalForceNotified, userId, url }`.

### 3.2 `res: any` — типизация выброшена

```ts
function ok(res: any, data: unknown) { res.json({ success: true, data }); }
function fail(res: any, code: string, msg: string, status = 400) { ... }
```

TypeScript-проект, `res` должен быть `Response` из express.

### 3.3 Порядок маршрутов — потенциальная ловушка

`GET /api/cases/stats` объявлен перед `GET /api/cases/:uid` — правильно. Но `POST /api/cases/wait` объявлен **после** `POST /api/cases` — нужно верифицировать тестом. Визуально работает, но легко сломать при рефакторинге.

---

## 4. `packages/api/routes/parse.ts` — СЕРЬЁЗНО

### 4.1 `POST /api/parse/url` сломан для magistrate

```ts
const html = await fetch(url, {
  headers: { 'User-Agent': 'CourtDesk/0.1' },
}).then(r => r.text());
```

Две проблемы:
1. `msudrf.ru` отдаёт страницу с капчей — `captcha/session.ts` здесь не используется.
2. Node.js `fetch` (undici) не поддерживает `windows-1251` декодирование нативно. `r.text()` вернёт кракозябры для CP1251-ответов.

Для magistrate этот эндпоинт **гарантированно не работает**.

### 4.2 `mode: 'incremental'` из ARCHITECTURE.md упадёт в `runFull`

```ts
switch (mode) {
  case 'full':  result = await runFull(); break;
  case 'retry': result = await runRetry(); break;
  case 'new':   result = await runNew(); break;
  default:      result = await runFull(); break;  // ← ловит любой неизвестный mode
}
```

ARCHITECTURE.md описывает режим `incremental`, но его нет в switch. Передача `mode: 'incremental'` молча запускает полный прогон.

---

## 5. `packages/core/courts.ts` — СЕРЬЁЗНО

### 5.1 Magistrate URL строится неправильно в district-адаптере

`extractSubdomain` для `http://2.perm.msudrf.ru` возвращает `2.perm`.
`extractCourtId` в `intake/classify.ts` для того же URL возвращает `2.perm`.

Таким образом, `courtId = '2.perm'` — это корректно. Но `district.ts` строит URL как:

```ts
`https://${req.courtId}.sudrf.ru${href}`
// → https://2.perm.sudrf.ru/...  ← НЕПРАВИЛЬНЫЙ ДОМЕН
```

Domain должен быть `2.perm.msudrf.ru`. District-адаптер не знает о типе суда при сборке URL из relative href. Проблема проявится при попытке перейти по ссылке из результатов поиска для magistrate.

### 5.2 `findCourtsByName` — 10287 объектов в памяти при каждом вызове

```ts
return entries
  .filter(e => words.every(w => e.name.toLowerCase().includes(w)))
  .map(toCourtInfo)   // ← новый объект на каждый из 10287 элементов
  .slice(0, 50);
```

`toCourtInfo` вызывается для всех отфильтрованных элементов до `slice`. При широком поиске («суд») создаётся 10287 объектов. Нужно `filter` → `slice` → `map`.

---

## 6. `packages/core/config.ts` — МИНОРНО

### 6.1 Комментарий «CourtSniffer» — не обновлён после копирования

```ts
// Конфигурация CourtSniffer — загрузка секретов из .env
```

Копипаста из другого репозитория. Технически не влияет.

### 6.2 `process.loadEnvFile` требует Node >= 20.6.0

Non-standard API, добавленный в Node 20.6. Нет `engines` field в `package.json` — запуск на Node 18 LTS упадёт с `TypeError: process.loadEnvFile is not a function`.

---

## 7. `packages/captcha/rucaptcha.ts` — МИНОРНО

### 7.1 CRLF line endings

Файл использует `\r\n` в отличие от всех остальных файлов (LF). `.gitattributes` отсутствует. При работе на Linux/CI будут проблемы с diff и potentially с ESLint (`eol-last`).

### 7.2 Комментарий к `numeric: 4` вводит в заблуждение

```ts
numeric: 4,  // msudrf captcha: буквы + цифры
```

В RuCaptcha API `numeric` — это enum: `0`=any, `1`=digits, `2`=letters, `3`=digits_or_letters, `4`=mixed. Значение `4` корректное, но комментарий не объясняет что это enum-значение, а не количество символов.

---

## 8. `packages/intake/classify.ts` — МИНОРНО

### 8.1 ФИО-эвристика слишком широкая

```ts
const words = trimmed.split(/\s+/).filter(w => w.length >= 2);
if (words.length >= 2 && words.length <= 4) {
  return { type: 'search', defendant: trimmed };
}
```

Любые 2-4 слова длиннее 1 символа распознаются как ФИО. `"POST /api"` → `search`. `"GET status ok"` → `search`. Нет проверки на кириллицу/латиницу как алфавит имён. Через CRM проблем нет (структурированные данные), но Web UI пользователь получит неожиданный результат.

### 8.2 `CASE_NUMBER_RE` не покрывает арбитражные и кассационные номера

```ts
const CASE_NUMBER_RE = /^\d+-[а-яА-Я\d]+\/\d{4}$/;
```

Реальные форматы: `А56-12345/2024` (арбитраж), `88-КГ24-1-К8` (кассация ВС). Паттерн не покрывает.

---

## 9. `packages/api/server.ts` — МИНОРНО

### 9.1 Нет CORS middleware

Сервер слушает `127.0.0.1` — для production за reverse proxy это нормально. Но при разработке (фронт на `localhost:3000`, API на `localhost:8767`) fetch упадёт. ARCHITECTURE.md упоминает CORS как существующую возможность, но его нет.

### 9.2 Роутеры `/api/monitor/*` и `/api/legal-force/*` не подключены

В `server.ts` подключены: `health`, `cases`, `search`, `parse`, `courts`, `intake`. Из ARCHITECTURE.md §6.1 — `/api/monitor/*` и `/api/legal-force/*` задокументированы как публичные контракты для CRM. Эти роутеры **не созданы и не подключены** — CRM-интеграция по этим путям невозможна.

---

## ИТОГО

| Приоритет | Файл | Проблема |
|---|---|---|
| 🔴 КРИТИЧНО | `store/cases.ts` | Race condition + N×disk reads, нет in-memory cache |
| 🔴 КРИТИЧНО | `scheduler/orchestrator.ts` | `waiting`-кейс сломан, 3×updateCase на дело |
| 🟠 СЕРЬЁЗНО | `api/routes/cases.ts` | PATCH без whitelist — data tamper возможен |
| 🟠 СЕРЬЁЗНО | `api/routes/parse.ts` | magistrate сломан (нет captcha + CP1251) |
| 🟠 СЕРЬЁЗНО | `core/courts.ts` | magistrate URL строится с неправильным доменом |
| 🟡 МИНОРНО | `core/config.ts` | `loadEnvFile` требует Node ≥ 20.6, нет `engines` |
| 🟡 МИНОРНО | `captcha/rucaptcha.ts` | CRLF endings, misleading комментарий |
| 🟡 МИНОРНО | `intake/classify.ts` | ФИО-эвристика слишком широкая |
| 🟡 МИНОРНО | `api/server.ts` | Нет CORS, нет monitor/legal-force роутеров |
