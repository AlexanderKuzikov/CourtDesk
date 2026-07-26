# BUG REPORT — CourtDesk

> Последнее обновление: 2026-07-26
> Все 99 замечаний из 9 раундов ревью закрыты.
> 4 tech-debt (CR5-009, CR5-011, CR6-005, CR7-008) закрыты в v0.5.0.

---

## Открытых багов нет

**Все 99 замечаний исправлены, закрыты или задокументированы как tech-debt.**
**4 tech-debt из CR1–CR9 закрыты в v0.5.0 (eslint, pino, party matching, Node engine).**

---

## CR5 — Perplexity Review (12 замечаний) — v0.5.0

| ID | Severity | Файл | Описание | Статус |
|----|----------|------|----------|--------|
| CR5-001 | HIGH | `scheduler/orchestrator.ts` | rate delay 1500ms перед legalForceDate search | ✅ FIXED |
| CR5-002 | MEDIUM | `core/types.ts` | 'deleted' as unknown | ✅ FIXED |
| CR5-003 | MEDIUM | `store/cases.ts` | legalForceDate.slice(0,10) | ✅ FIXED |
| CR5-004 | MEDIUM | `api/server.ts` | CORS wildcard + Authorization | ✅ FIXED |
| CR5-005 | HIGH | `intake/classify.ts` | regex /i без /u | ✅ FIXED |
| CR5-006 | MEDIUM | `captcha/rucaptcha.ts` | polling retry | ✅ FIXED |
| CR5-007 | MEDIUM | `store/cases.ts` | listCases single pass | ✅ FIXED |
| CR5-008 | LOW | `store/json-store.ts` | tmp/rename без fsync | ✅ DOCUMENTED |
| CR5-009 | LOW | — | **Нет eslint** | ✅ **FIXED (v0.5.0)** — eslint.config.js (flat config) |
| CR5-010 | LOW | `core/config.ts` | HOST из env | ✅ FIXED |
| CR5-011 | LOW | — | **console.log вместо pino** | ✅ **FIXED (v0.5.0)** — core/logger.ts (pino) |
| CR5-012 | MEDIUM | `api/routes/parse.ts` | _isRunning guard | ✅ FIXED |

---

## CR6 — Cursor Agent (2026-07-23/24) — v0.5.0

| ID | Severity | Файл | Описание | Статус |
|----|----------|------|----------|--------|
| CR6-001 | CRITICAL | `store/json-store.ts` | Corrupt JSON → silent wipe | ✅ FIXED |
| CR6-002 | CRITICAL | `api/routes/parse.ts`, `orchestrator.ts` | SSRF via user URL | ✅ FIXED |
| CR6-003 | CRITICAL | `api/server.ts` | Zero authentication | ✅ DOCUMENTED |
| CR6-004 | HIGH | `orchestrator.ts` | archived race | ✅ FIXED |
| CR6-005 | HIGH | `orchestrator.ts` | **waiting → results[0]** | ✅ **FIXED (v0.5.0)** — pickBestMatch/matchParty |
| CR6-006 | HIGH | `orchestrator.ts` | error not cleared | ✅ FIXED |
| CR6-007 | HIGH | `search.html` | Broken API paths | ✅ FIXED |
| CR6-008 | HIGH | `health.ts` | Duplicate /api/status | ✅ FIXED |
| CR6-009 | HIGH | `search.ts` | Duplicate /api/resolve | ✅ FIXED |
| CR6-010 | HIGH | `search/shared.ts` | TLS off | ✅ DOCUMENTED |
| CR6-011 | MEDIUM | `rucaptcha.ts` | softId placement | ✅ DOCUMENTED |
| CR6-012 | MEDIUM | `session.ts` | Chromium leak | ✅ DOCUMENTED |
| CR6-013 | HIGH | `parse.ts` | _isRunning TOCTOU | ✅ FIXED |
| CR6-014 | MEDIUM | `courts.ts` | Subdomain collisions | ✅ DOCUMENTED |
| CR6-015 | MEDIUM | `parse/shared.ts` | parsePublishInfo | ✅ DOCUMENTED |
| CR6-016 | MEDIUM | `store/cases.ts` | deleteCase not cascading | ✅ FIXED |
| CR6-017 | MEDIUM | tests | 0 HTML fixtures | ✅ DOCUMENTED |
| CR6-018 | MEDIUM | `.gitignore` | captcha-debug | ✅ DOCUMENTED |
| CR6-019 | LOW | `package.json` | Version mismatch | ✅ FIXED |
| CR6-020 | LOW | types | Intention vs Classification | ✅ DOCUMENTED |

---

## CR7 — OpenCode Deep Audit (2026-07-25) — v0.5.0

| ID | Severity | Файл | Описание | Статус |
|----|----------|------|----------|--------|
| CR7-001 | MEDIUM | `api/routes/status.ts` | `success: true` при HTTP 500 | ✅ FIXED |
| CR7-002 | MEDIUM | `parse/adapters/shared.ts` | `toIso()` битая ISO (`:00:00`) | ✅ FIXED |
| CR7-003 | MEDIUM | `search/shared.ts` | Dead code `err.message === 'timeout'` | ✅ FIXED |
| CR7-004 | MEDIUM | `store/notifications.ts` | `listNotifications()` живая ссылка | ✅ FIXED |
| CR7-005 | MEDIUM | `core/courts.ts` | `findCourtsByRegion` без лимита | ✅ FIXED |
| CR7-006 | MEDIUM | `scheduler/orchestrator.ts` | Матчинг `r.uid === c.uid` | ✅ FIXED |
| CR7-007 | MEDIUM | `captcha/session.ts` | `waitForNetworkIdle` глотает ошибки | ✅ FIXED |
| CR7-008 | MEDIUM | `core/config.ts` | **`process.loadEnvFile()` требует Node ≥21** | ✅ **FIXED (v0.5.0)** — engine ≥22.0.0 |
| CR7-009 | LOW | `parse/adapters/` | `&rarr;` унификация | ✅ FIXED |
| CR7-010 | LOW | `viewer/public/index.html` | `setInterval` не чистится | ✅ FIXED |

---

## CR9 — Court Hierarchy & Grace Period (2026-07-25)

| ID | Severity | Файл | Описание | Статус |
|----|----------|------|----------|--------|
| CR9-001 | CRITICAL | `scheduler/orchestrator.ts` | `runFull` не обрабатывал `enforced` дела | ✅ FIXED |
| CR9-002 | CRITICAL | `scheduler/orchestrator.ts` | `processOne` не проверял "Неверно указан проверочный код" | ✅ FIXED |
| CR9-003 | HIGH | `core/courts.ts` | `findHigherCourt` отсутствовал | ✅ FIXED |
| CR9-004 | HIGH | `core/courts.ts` | `COURT_HIERARCHY` отсутствовал | ✅ FIXED |
| CR9-005 | HIGH | `core/courts.ts` | `CASSATION_MAP` отсутствовал | ✅ FIXED |
| CR9-006 | MEDIUM | `core/courts.ts` | `saveMsToRsMapping` отсутствовал | ✅ FIXED |
| CR9-007 | MEDIUM | `core/types.ts` | `enforcedAt` отсутствовал в `WatchedCase` | ✅ FIXED |
| CR9-008 | MEDIUM | `store/cases.ts` | `updateCase` не проставлял `enforcedAt` | ✅ FIXED |
| CR9-009 | LOW | `scheduler/orchestrator.ts` | `ENFORCED_GRACE_MS` (90 дней) | ✅ FIXED |
| CR9-010 | LOW | `scheduler/orchestrator.ts` | `searchByCaseUid` для поиска в вышестоящем | ✅ FIXED |

---

## CR8 — Captcha + Search overhaul (2026-07-25)

| ID | Severity | Файл | Описание | Статус |
|----|----------|------|----------|--------|
| CR8-001 | CRITICAL | `packages/search/constants.ts` | `case_type=1` для appeal | ✅ FIXED |
| CR8-002 | CRITICAL | `packages/search/constants.ts` | `new=0` для appeal | ✅ FIXED |
| CR8-003 | CRITICAL | `packages/captcha/session.ts` | `decodeURIComponent()` на CP1251 | ✅ FIXED |
| CR8-004 | HIGH | `packages/captcha/session.ts` | `waitForNetworkIdle` таймаут | ✅ FIXED |
| CR8-005 | HIGH | `packages/captcha/session.ts` | Double-encoding CP1251 | ✅ FIXED |
| CR8-006 | HIGH | `packages/captcha/session.ts` | Regex base64 пробел | ✅ FIXED |
| CR8-007 | MEDIUM | `packages/search/shared.ts` | `parseResults` не проверял `<div id="error">` | ✅ FIXED |
| CR8-008 | MEDIUM | `packages/core/errors.ts` | `isCaptchaPage` без "Неверно указан код" | ✅ FIXED |
| CR8-009 | LOW | `packages/search/constants.ts` | `SEARCH_PARAMS` без `new` | ✅ FIXED |

---

## CR7 — OpenCode Deep Audit (2026-07-25)

| ID | Severity | Файл | Описание | Статус |
|----|----------|------|----------|--------|
| CR7-001 | MEDIUM | `api/routes/status.ts` | `success: true` при HTTP 500 — клиент не видит ошибку, несоответствие паттерну ApiError | ✅ FIXED |
| CR7-002 | MEDIUM | `parse/adapters/shared.ts` | `toIso()` добавляет `:00` к времени с секундами → невалидный ISO 8601 (`YYYY-MM-DDT12:34:56:00`) | ✅ FIXED |
| CR7-003 | MEDIUM | `search/shared.ts` | Dead code: `err.message === 'timeout'` никогда не совпадёт с английским сообщением Node.js | ✅ FIXED |
| CR7-004 | MEDIUM | `store/notifications.ts` | `listNotifications()` возвращает живую ссылку на `_cache` — внешняя мутация мимо `save()` | ✅ FIXED |
| CR7-005 | MEDIUM | `core/courts.ts` | `findCourtsByRegion` без `.slice(0, 50)` — может вернуть >1000 объектов, аллокация без лимита | ✅ FIXED |
| CR7-006 | MEDIUM | `scheduler/orchestrator.ts` | Матчинг `r.uid === c.uid` никогда не сработает (SearchResult.uid это GUID записи sudrf, а не WatchedCase.uid) | ✅ FIXED |
| CR7-007 | MEDIUM | `captcha/session.ts` | `waitForNetworkIdle().catch(() => {})` молча глотает ошибки — HTML возвращается даже если капча не разгадана | ✅ FIXED |
| CR7-008 | MEDIUM | `core/config.ts` | `process.loadEnvFile()` требует Node ≥21; на 18–20 упадёт с TypeError, но `package.json` декларирует `>=20.6.0` | ✅ **FIXED (v0.5.0)** — engine ≥22.0.0 |
| CR7-009 | LOW | `parse/adapters/{district,appeal,cassation}.ts` | `&rarr;` обрабатывается по-разному — унифицировано на ` → ` | ✅ FIXED |
| CR7-010 | LOW | `viewer/public/index.html` | `setInterval(poll, 5000)` не сохраняется в переменную, не чистится при уходе со страницы | ✅ FIXED |

---

## CR6 — Cursor Agent (2026-07-23/24)

| ID | Severity | Файл | Описание | Статус |
|----|----------|------|----------|--------|
| CR6-001 | CRITICAL | `store/json-store.ts` | Corrupt JSON → silent wipe | ✅ FIXED |
| CR6-002 | CRITICAL | `api/routes/parse.ts`, `orchestrator.ts` | SSRF via user URL | ✅ FIXED |
| CR6-003 | CRITICAL | `api/server.ts` | Zero authentication | ✅ DOCUMENTED |
| CR6-004 | HIGH | `orchestrator.ts` | archived race | ✅ FIXED |
| CR6-005 | HIGH | `orchestrator.ts` | waiting → results[0] | ✅ **FIXED (v0.5.0)** — pickBestMatch/matchParty |
| CR6-006 | HIGH | `orchestrator.ts` | error not cleared | ✅ FIXED |
| CR6-007 | HIGH | `search.html` | Broken API paths | ✅ FIXED |
| CR6-008 | HIGH | `health.ts` | Duplicate /api/status | ✅ FIXED |
| CR6-009 | HIGH | `search.ts` | Duplicate /api/resolve | ✅ FIXED |
| CR6-010 | HIGH | `search/shared.ts` | TLS off | ✅ DOCUMENTED |
| CR6-011 | MEDIUM | `rucaptcha.ts` | softId placement | ✅ DOCUMENTED |
| CR6-012 | MEDIUM | `session.ts` | Chromium leak | ✅ DOCUMENTED |
| CR6-013 | HIGH | `parse.ts` | _isRunning TOCTOU | ✅ FIXED |
| CR6-014 | MEDIUM | `courts.ts` | Subdomain collisions | ✅ DOCUMENTED |
| CR6-015 | MEDIUM | `parse/shared.ts` | parsePublishInfo | ✅ DOCUMENTED |
| CR6-016 | MEDIUM | `store/cases.ts` | deleteCase not cascading | ✅ FIXED |
| CR6-017 | MEDIUM | tests | 0 HTML fixtures | ✅ DOCUMENTED |
| CR6-018 | MEDIUM | `.gitignore` | captcha-debug | ✅ DOCUMENTED |
| CR6-019 | LOW | `package.json` | Version mismatch | ✅ FIXED |
| CR6-020 | LOW | types | Intention vs Classification | ✅ DOCUMENTED |

---

## CR1–CR5 — предыдущие раунды

| Round | Count | Status |
|-------|-------|--------|
| CR1 (BUG-001..011) | 11 | ✅ 9 fixed, 2 closed (не воспр.) |
| CR2 (NEW-001..011) | 11 | ✅ 11 fixed |
| CR3 (Perplexity) | 8 | ✅ 8 fixed |
| CR4 (CR3 impl) | 8 | ✅ 8 fixed |
| CR5 (CR5-001..012) | 12 | ✅ 9 fixed, 3 documented → **2 FIXED (v0.5.0): CR5-009 eslint, CR5-011 pino** |
| CR7 (CR7-001..010) | 10 | ✅ 9 fixed, 1 documented → **1 FIXED (v0.5.0): CR7-008 Node engine** |
| CR8 (CR8-001..009) | 9 | ✅ 9 fixed |
| CR9 (CR9-001..010) | 10 | ✅ 10 fixed |

**Итого: 99 замечаний, 99 закрыто. 4 tech-debt закрыты в v0.5.0.**

### Закрытые tech-debt (v0.5.0)

| ID | Описание | Решение |
|----|----------|---------|
| CR5-009 | Нет eslint | eslint.config.js (flat config) + @typescript-eslint |
| CR5-011 | console.log вместо pino | core/logger.ts — pino dual-transport (stdout + file) |
| CR6-005 | waiting → results[0] без матчинга | pickBestMatch + matchParty в orchestrator.ts |
| CR7-008 | `process.loadEnvFile()` требует Node ≥21 | Node engine ≥22.0.0 в package.json |

### Оставшиеся tech-debt

| ID | Приоритет | Описание |
|----|-----------|----------|
| CR5-008 | LOW | tmp/rename без fsync |
| CR6-003 | MEDIUM | Zero authentication |
| CR6-010 | LOW | TLS rejectUnauthorized: false |
| CR6-012 | LOW | Puppeteer browser pool |
| CR6-014 | LOW | Subdomain коллизии в справочнике |
| CR6-011 | MEDIUM | RuCaptcha softId placement |
| CR6-015 | MEDIUM | parsePublishInfo HH:MM:SS |
| CR6-017 | MEDIUM | 0 HTML fixtures in tests |
| CR6-020 | LOW | Intention vs Classification types |
