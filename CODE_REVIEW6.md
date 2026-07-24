# CODE REVIEW 6 — CourtDesk

> Дата: 2026-07-23  
> Ревьюер: Cursor Agent (Composer)  
> HEAD: `8774d95`  
> База: CODE_REVIEW5 «все FIXED» · 57/57 tests · `tsc --noEmit` clean

---

## Вердикт

Проект **выглядит** готовым в документации (CR1–CR5, 50 FIXED), но продуктово и по безопасности **не готов** к HOST≠loopback и к CRM-интеграции:

1. Search UI **сломан** (неверные пути API).
2. **SSRF** на `/api/parse/url` и `WatchedCase.url` без allowlist и без auth.
3. Store может **тихо стереть** все данные при битом JSON.
4. Scheduler **не восстанавливает** `error` и может **снять `archived`**.
5. Зелёные тесты частично проверяют **мёртвые** роутеры в изоляции.

Это не «ещё один CR с nitpicks» — это разрыв между docs-debt и eng-debt.

---

## Статус предыдущих ревью

| Ревью | Заявленный статус | Реальность на HEAD |
|-------|-------------------|--------------------|
| CR1–CR4 | ✅ Закрыт | Базовые баги действительно чинились |
| CR5 | ✅ Все CR5-001..012 FIXED/DOCUMENTED | Правки в коде есть и полезны; **не закрывают** SSRF/auth/store-wipe/UI/route-duplicates |

---

## Сводка severity

| Severity | Count | IDs |
|----------|-------|-----|
| CRITICAL | 3 | CR6-001..003 |
| HIGH | 11 | CR6-004..014 |
| MEDIUM | 4 | CR6-015..018 |
| LOW | 2 | CR6-019..020 |

---

## CRITICAL

### CR6-001 — Corrupt JSON → silent wipe
**Файл:** `packages/store/json-store.ts:13-20`  
`readJson` при parse error возвращает `fallback` (`{}`/`[]`). Следующий `save()` перезаписывает файл пустым состоянием → потеря всех дел/событий/уведомлений без алерта.

**Fix:** backup битого файла + throw/alert; никогда не silent-fallback на существующем файле.

### CR6-002 — SSRF via user-controlled URL
**Файлы:** `packages/api/routes/parse.ts:32-54`, `packages/scheduler/orchestrator.ts:224-228`, `packages/captcha/session.ts:34`  
`POST /api/parse/url` и мониторинг делают `fetch(url)` / `page.goto(url)` без allowlist (`*.sudrf.ru` / `*.msudrf.ru`, https only). Доступны `file://`, `127.0.0.1`, cloud metadata.

**Fix:** единый `assertCourtUrl(url)` на API boundary + scheduler + captcha.

### CR6-003 — Zero authentication
**Файл:** `packages/api/server.ts` + все mutating routes  
Bind по умолчанию `127.0.0.1` — ок для локалки. `HOST=0.0.0.0` + `CORS *` = публичный scrape/DoS/captcha-bill/store wipe. Нет shared secret.

**Fix:** `COURTDESK_API_TOKEN` (или loopback-only для `/api/parse/*` + search) до любого публичного bind.

---

## HIGH

### CR6-004 — archived race
`orchestrator.ts:152-220`: early `archived` check, затем awaits, финальный `updateCase` мержит `status: decision|enforced` поверх позднего PATCH→archived. NEW-002 не закрыт.

### CR6-005 — waiting → `results[0]`
`orchestrator.ts:124-135`: без матчинга party/date/score. Однофамилец → чужое дело в monitoring.

### CR6-006 — `error` не снимается
Успешный `processOne` не ставит `status: 'monitoring'`. Error-дела крутятся вечно в `runFull`/`runRetry`.

### CR6-007 — Search UI сломан
`search.html:270,280` → `/api/search/case-number` и `/party`.  
Реальные роуты: `/by-number`, `/by-party`.  
Unwrap: `data.results` vs top-level `results`. Страница поиска нерабочая.

### CR6-008 — Дубль `/api/status`
`health.ts:11` монтируется раньше `status.ts:8`. DashboardStatus с `health` мёртв. `status.test.ts` — false green.

### CR6-009 — Дубль `/api/resolve`
`search.ts:86` (live scrape) раньше `resolve.ts:13` (URL builder). `resolve.test.ts` — false green.

### CR6-010 — TLS off
`search/shared.ts:15` `rejectUnauthorized: false`; Puppeteer `--ignore-certificate-errors`. MITM → чужой статус дела.

### CR6-011 — RuCaptcha `softId`/`languagePool` внутри `task`
`rucaptcha.ts:37-48`: по API v2 поля top-level рядом с `clientKey`. Сейчас игнорируются.

### CR6-012 — Chromium leak + нет пула
`session.ts:21-31`: `newPage()` вне `try/finally` закрытия browser. Параллельные запросы = N Chromium.

### CR6-013 — `_isRunning` TOCTOU
`parse.ts:63-84`: check → 202 → потом `_isRunning=true`. Нет теста на 409.

### CR6-014 — Справочник судов
`courts.ts`: 56× `UD` → `'district'`; 3 коллизии subdomain (`22.mo`, `38.mo`, `52.mo`) — last-write-wins; 1914 судов без subdomain.

---

## MEDIUM

| ID | Проблема |
|----|----------|
| CR6-015 | `parsePublishInfo`: `` `${d}T${time}:00` `` ломает `HH:MM:SS` |
| CR6-016 | `deleteCase` не чистит events/notifications |
| CR6-017 | 0 HTML-фикстур search/parse, 0 тестов captcha, нет createApp() integration |
| CR6-018 | `captcha-debug/` не в `.gitignore`; `.env.example` без `HOST` |

---

## LOW

| ID | Проблема |
|----|----------|
| CR6-019 | Версия: `package.json`/`/api/health` = 0.1.0, README = v0.3.0 |
| CR6-020 | Intention vs Classification; `type: string` на events; dual ParseAdapter |

---

## Что CR5 реально починил (не отнимать)

- Rate-delay перед вторым search в `processOne`
- `listCases` multi-status / один проход в `runFull`
- `HOST` из env
- `/iu` на кириллических regex
- Retry network в RuCaptcha poll
- CORS: убран `Authorization` при `*`
- `legalForceDate.slice(0, 10)`
- Guard `_isRunning` (с TOCTOU, но идея верная)

---

## Порядок фикса (рекомендация)

1. CR6-001 store integrity  
2. CR6-002 + CR6-003 allowlist + auth gate  
3. CR6-007 search.html contract  
4. CR6-004 + CR6-006 scheduler lifecycle  
5. CR6-008 + CR6-009 удалить мёртвые роуты + `createApp()` tests  
6. CR6-010..013 TLS / captcha / browser pool / TOCTOU  
7. CR6-005, CR6-015, CR6-016, CR6-018, CR6-019  

---

## Метрики на момент ревью

| Метрика | Значение |
|---------|----------|
| Tests | 57/57 pass |
| tsc | clean |
| Prod `.ts` files | ~56 |
| Test files | 10 |
| Courts | 10 287 (3 subdomain dups, 1914 empty subdomain, 56 UD) |
| package version | 0.1.0 (docs: 0.3.0) |

Canvas: открыть рядом с чатом — `code-review-6.canvas.tsx` в canvases workspace.
