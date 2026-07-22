# CODE REVIEW 4 — CourtDesk

> Дата: 2026-07-22
> Ревьюер: Perplexity (CODE_REVIEW3.md) → верификация и имплементация

---

## Статус предыдущих ревью

| Ревью | Статус | Комментарий |
|-------|--------|-------------|
| CODE_REVIEW1 (06-21) | ✅ Применён | Базовые замечания исправлены |
| CODE_REVIEW2 (06-21) | ✅ Применён | BUG-001..011 исправлены |
| CODE_REVIEW3 (06-22) | 🟡 В работе | Perplexity (954fa5c). NEW-001..011 уже исправлены (cb120b2). Оставшиеся замечания — в плане ниже |

---

## Состояние до изменений

### CI и тесты
- ✅ tsc --noEmit чист
- ✅ 42/42 тестов зелёные
- ✅ Защита main (CI обязателен, force-push запрещён)
- 🔒 master заблокирован ruleset-ом

### Известные баги (BUG_REPORT.md)
- BUG-001..011 — ✅ Все закрыты
- NEW-001..011 — ✅ Все исправлены (коммит `cb120b2`), BUG_REPORT.md устарел
- Открытых багов нет

### Что CODE_REVIEW3 нашёл и что ещё не сделано

| # | Замечание | Severity | Статус |
|---|-----------|----------|--------|
| 1 | Дублирование fetchHtml/parseResults ×4 в search-адаптерах | HIGH | 🔴 Не исправлено |
| 2 | Нет CORS | MEDIUM | 🔴 Не исправлено |
| 3 | 3 updateCase в processOne вместо одного батча | MEDIUM | 🔴 Не исправлено |
| 4 | GET /api/courts без q= → только total | LOW | 🔴 Не исправлено |
| 5 | Нет graceful shutdown | LOW | 🔴 Не исправлено |
| 6 | Notifications — синтетика, нет persistent-хранилища | MEDIUM | 🟡 Отложено (нужен дизайн) |
| 7 | Magistrate два пути в searchByCaseNumber | MEDIUM | 🟡 Отложено (captcha-рефакторинг) |
| 8 | Hardcoded delo_id | LOW | 🟡 Отложено (связано с п.1) |

---

## Что сделано

| # | Изменение | Файлы | Статус |
|---|-----------|-------|--------|
| 1 | CORS middleware (inline, без зависимостей) | `server.ts` | ✅ |
| 2 | Shared `fetchHtml()` + `parseResults()` | `search/shared.ts` — новый, district/appeal/cassation переписаны | ✅ |
| 3 | Batch updateCase — один вызов в конце processOne | `orchestrator.ts` | ✅ |
| 4 | GET /api/courts без q= → `getAllCourts()` | `courts.ts` | ✅ |
| 5 | Graceful shutdown (SIGTERM/SIGINT) | `server.ts` | ✅ |
| 6 | BUG_REPORT.md — статусы NEW-001..011 → FIXED | `BUG_REPORT.md` | ✅ |
| 7 | CONTEXT.md, CHANGELOG.md обновлены | — | ✅ |

### Результат
- ✅ tsc --noEmit: чист
- ✅ Тесты: 42/42 зелёные
- ✅ CI: будет зелёный после пуша

---

## План изменений

### 1. CORS middleware
**Файл:** `packages/api/server.ts`
Inline middleware без внешних зависимостей.

### 2. Shared fetchHtml/parseResults
**Новый файл:** `packages/search/shared.ts`
- `fetchHtml(url)` — HTTP-клиент с iconv-декодингом (из district/appeal/cassation)
- `parseResults(html, req)` — парсер таблицы sudrf.ru

**Изменяемые:** `district.ts`, `appeal.ts`, `cassation.ts` — удалить дублированный код, импортировать из shared.
`magistrate.ts` — может импортировать parseResults, но fetchHtml остаётся своим (Puppeteer).

### 3. Batch updateCase в processOne
**Файл:** `packages/scheduler/orchestrator.ts`
Накопить изменения в `Partial<WatchedCase>` → один `updateCase` в конце.
Логика NEW-002 (getCase перед записью) сохраняется.

### 4. GET /api/courts без q=
**Файл:** `packages/api/routes/courts.ts`
Возвращать `getAllCourts()` вместо `{ total }`.

### 5. Graceful shutdown
**Файл:** `packages/api/server.ts`
`process.on('SIGTERM', ...)` + `process.on('SIGINT', ...)`.

---
