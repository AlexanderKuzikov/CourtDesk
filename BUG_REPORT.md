# BUG REPORT — CourtDesk
> Дата: 2026-07-21  
> Охват: все пакеты

---

## BUG-001 — CRITICAL: Race condition в store приводит к потере данных

**Файл:** `packages/store/json-store.ts`, `packages/store/cases.ts`  
**Тип:** data corruption  
**Воспроизводимость:** 100% при одновременном `POST /api/cases` + `POST /api/parse/run`

**Описание:**  
Все операции записи реализованы по схеме `load() → modify → save()`. Хотя `renameSync` делает запись атомарной на уровне ОС, сама операция read-modify-write не защищена от состояния гонки.

**Сценарий:**
```
1. POST /api/cases        → addCase() → load()  → map_A
2. POST /api/parse/run    → runFull() → updateCase() → load() → map_B
3. addCase    save(map_A) → cases.json [version A]
4. updateCase save(map_B) → cases.json [version B, новое дело из шага 1 потеряно]
```

**Фикс:**  
Добавить promise-based mutex перед каждым циклом load→save. Пример:
```ts
let _lock: Promise<void> = Promise.resolve();

function withLock<T>(fn: () => T): T {
  // для sync операций — synchronous, Node.js однопоточный
  // при async операциях — async-mutex или p-limit
  return fn();
}
```
Наиболее надёжно: in-memory Map как singleton + запись только из памяти.

---

## BUG-002 — CRITICAL: `runNew()` / mode `'new'` никогда не работает

**Файл:** `packages/scheduler/orchestrator.ts`, `packages/api/routes/cases.ts`  
**Тип:** логическая ошибка  
**Воспроизводимость:** 100%

**Описание:**  
Пользователь добавляет дело через `POST /api/cases/wait`. Дело создаётся со статусом `waiting` и `url: ''`. Затем `runNew()` → `processBatch()` → `processOne()` → `fetchHtml('')` выбрасывает `TypeError: Failed to parse URL ''`. Дело навсегда остаётся в статусе `waiting`.

**Недостающий функционал:** весь сценарий «отслеживать появление дела» неработоспособен.

**Фикс:**  
`runNew` — это поиск дела по участникам, а не парсинг по URL. Должен вызывать `search/adapter` с `party + filingDate` из `CaseHistoryEvent.data`, а не `parse/adapter` с пустым URL. Полная переработка `processOne` для `waiting`-кейсов.

---

## BUG-003 — HIGH: `POST /api/parse/url` не работает для magistrate

**Файл:** `packages/api/routes/parse.ts`  
**Тип:** неправильное поведение  
**Воспроизводимость:** 100% для любого magistrate URL

**Описание:**  

Проблема 1 — CP1251:  
`fetch(url).then(r => r.text())` — Node.js fetch (undici) не поддерживает декодирование `windows-1251` charset. Возвращает кракозябры, парсер получает мусор вместо HTML.

Проблема 2 — captcha:  
`msudrf.ru` при первом запросе вернёт страницу капчи (`kcaptchaForm`). `captcha/session.ts` используется только в `search/adapters/magistrate.ts`. Здесь его нет.

Результат: `parse/adapter` получает HTML капчи вместо карточки дела, возвращает пустой `CaseCard` или бросает ошибку.

**Фикс:**  
Iso детекция `courtType === 'magistrate'` → использовать `captcha/session.ts` (`fetchMagistrateHtml`) вместо `fetch`. Для non-magistrate использовать `fetchHtml` из `scheduler/orchestrator.ts` (с iconv).

---

## BUG-004 — HIGH: `PATCH /api/cases/:uid` позволяет перезапись системных полей

**Файл:** `packages/api/routes/cases.ts`  
**Тип:** недостаточная валидация входа  
**Воспроизводимость:** намеренная

**Описание:**  
```ts
router.patch('/api/cases/:uid', (req, res) => {
  const updated = updateCase(req.params.uid, req.body ?? {});
});
// updateCase: { ...existing, ...updates } — без фильтрации
```

Тело запроса не фильтруется. Можно:
- `{ uid: 'other-uid' }` — перезаписать uid, в map создастся несогласованность
- `{ createdAt: '1970-01-01' }` — перезаписать аудит-поле
- `{ status: 'enforced', legalForceDate: null }` — обойти бизнес-логику

**Фикс:**
```ts
const ALLOWED_PATCH_FIELDS = new Set(['status','result','legalForceDate','legalForceNotified','userId','url']);
const safeUpdates = Object.fromEntries(
  Object.entries(req.body ?? {}).filter(([k]) => ALLOWED_PATCH_FIELDS.has(k))
);
const updated = updateCase(req.params.uid, safeUpdates);
```

---

## BUG-005 — HIGH: Magistrate `caseUrl` строится с неправильным доменом

**Файл:** `packages/search/adapters/district.ts`  
**Тип:** неправильный вывод  
**Воспроизводимость:** не воспроизводится (не должно происходить: district-адаптер не должен вызываться для magistrate)

**Описание:**  
`district.ts` при сборке `caseUrl` из relative `href`:
```ts
caseUrl: href.startsWith('http') ? href : `https://${req.courtId}.sudrf.ru${href}`,
```

Если `req.courtId = '2.perm'` (magistrate), то URL будет:
```
https://2.perm.sudrf.ru/modules.php?...
```
Вместо:
```
https://2.perm.msudrf.ru/modules.php?...
```

Причина: `SearchRequest.courtId` не хранит тип домена (`.sudrf.ru` vs `.msudrf.ru`). Адаптер знает `courtType`, но не использует его при сборке URL.

**Фикс:**
```ts
const domain = req.courtType === 'magistrate' ? 'msudrf.ru' : 'sudrf.ru';
caseUrl: href.startsWith('http') ? href : `https://${req.courtId}.${domain}${href}`
```

---

## BUG-006 — MEDIUM: `deleteCase` всегда делает лишнюю запись

**Файл:** `packages/store/cases.ts`  
**Тип:** лишний I/O  
**Воспроизводимость:** 100% при `DELETE /api/cases/nonexistent-uid`

**Описание:**  
```ts
export function deleteCase(uid: string): boolean {
  const map = load();
  const existed = map.has(uid);
  map.delete(uid);   // no-op если uid нет
  save(map);          // ← запись происходит ВСЕГДА
  return existed;
}
```

Каждый `DELETE`-запрос с несуществующим uid выполняет `writeFileSync + renameSync` без необходимости.

**Фикс:**
```ts
if (existed) save(map);
```

---

## BUG-007 — MEDIUM: `process.loadEnvFile` падает на Node < 20.6

**Файл:** `packages/core/config.ts`  
**Тип:** incompatibility  
**Воспроизводимость:** 100% на Node 18 LTS

**Описание:**  
```ts
process.loadEnvFile(resolve(process.cwd(), '.env'));
```
`process.loadEnvFile` добавлен в Node.js 20.6.0. На Node 18 (LTS до апреля 2025) падает с `TypeError: process.loadEnvFile is not a function`. В `package.json` отсутствует `engines: { node: '>=20.6' }`.

**Фикс:** Добавить в `package.json`:
```json
"engines": { "node": ">=20.6.0" }
```
Или заменить `process.loadEnvFile` на `dotenv.config()` для обратной совместимости.

---

## BUG-008 — MEDIUM: `runFull()` / `runRetry()` блокируют event loop

**Файл:** `packages/scheduler/orchestrator.ts`  
**Тип:** performance / reliability  
**Воспроизводимость:** при magistrate-делах

**Описание:**  
```ts
async function processBatch(cases: WatchedCase[]): Promise<{ ok: number; fail: number }> {
  for (const c of cases) {
    await processOne(c);   // полностью последовательно
  }
}
```

С magistrate: Puppeteer открывает браузер, решает капчу (ожидание RuCaptcha 15-120 сек) — всё это время HTTP-запросы к серверу обрабатываются с timeout. При 50 magistrate-делах `runFull` висит **1+ час**, заросши ожидания HTTP-запросов накапливаются, Express отвечает за пределами (60s timeout).

**Фикс:**  
Вынести `runFull` / `runRetry` в дочерний worker (через `worker_threads` или отдельный процесс). `POST /api/parse/run` отвечает `202 Accepted` сразу, прогон идёт в фоне.

---

## BUG-009 — MEDIUM: N×disk reads в `store/cases.ts` — отсутствует in-memory cache

**Файл:** `packages/store/cases.ts`  
**Тип:** performance  
**Воспроизводимость:** при каждом `GET /api/cases/stats`

**Описание:**  
See CODE_REVIEW §1.1. `getStats()` вызывает `listCases` 4 раза с разными фильтрами — 4 чтения файла. ARCHITECTURE.md обещает in-memory Map, но её нет. Очевидное отклонение от задокументированной архитектуры.

**Фикс:**  
```ts
let _casesCache: Map<string, WatchedCase> | null = null;

function load(): Map<string, WatchedCase> {
  if (_casesCache) return _casesCache;
  const raw = readJson<Record<string, WatchedCase>>(FILE, {});
  _casesCache = new Map(Object.entries(raw));
  return _casesCache;
}

function save(map: Map<string, WatchedCase>): void {
  _casesCache = map;  // обновляем кэш
  const obj = Object.fromEntries(map);
  writeJson(FILE, obj);
}
```

---

## BUG-010 — LOW: CRLF endings в `captcha/rucaptcha.ts`

**Файл:** `packages/captcha/rucaptcha.ts`  
**Тип:** code style / CI  
**Воспроизводимость:** CI с ESLint `eol-last` / `linebreak-style`

**Описание:**  
Файл содержит `\r\n` (CRLF). Все остальные файлы используют LF. `.gitattributes` отсутствует.

**Фикс:**  
```
# .gitattributes
* text=auto eol=lf
*.ts text eol=lf
```

---

## BUG-011 — LOW: Dynamic import `iconv-lite` в hot path

**Файл:** `packages/scheduler/orchestrator.ts`  
**Тип:** performance  
**Воспроизводимость:** при каждом fetch CP1251-страницы

**Описание:**  
```ts
const { default: iconv } = await import('iconv-lite');  // в fetchHtml()
```
`import()` — полный dynamic module load на каждый fetch. Node.js кэширует модули после первого загрузки, но время promise-resolution всё равно запускается. Ненужный overhead.

**Фикс:**  
Перенести `import iconv from 'iconv-lite'` в top-level модуля.

---

## СТАТУС

| ID | Северити | Описание | Статус |
|---|---|---|---|
| BUG-001 | CRITICAL | Race condition, потеря данных | OPEN |
| BUG-002 | CRITICAL | `runNew()` не работает, URL='' | OPEN |
| BUG-003 | HIGH | `parse/url` сломан для magistrate | OPEN |
| BUG-004 | HIGH | PATCH без whitelist | OPEN |
| BUG-005 | HIGH | magistrate caseUrl с `.sudrf.ru` | OPEN |
| BUG-006 | MEDIUM | deleteCase лишняя I/O | OPEN |
| BUG-007 | MEDIUM | Node < 20.6 падает | OPEN |
| BUG-008 | MEDIUM | runFull блокирует event loop | OPEN |
| BUG-009 | MEDIUM | N×disk reads, нет cache | OPEN |
| BUG-010 | LOW | CRLF в rucaptcha.ts | OPEN |
| BUG-011 | LOW | Dynamic import iconv hot path | OPEN |
