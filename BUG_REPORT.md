# BUG REPORT — CourtDesk

> Последнее обновление: 2026-07-25
> Все 80 замечаний из 7 раундов ревью закрыты.

---

## Открытых багов нет

**Все 80 замечаний исправлены, закрыты или задокументированы как tech-debt.**

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
| CR7-008 | MEDIUM | `core/config.ts` | `process.loadEnvFile()` требует Node ≥21; на 18–20 упадёт с TypeError, но `package.json` декларирует `>=20.6.0` | ✅ DOCUMENTED |
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
| CR6-005 | HIGH | `orchestrator.ts` | waiting → results[0] | ✅ DOCUMENTED |
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
| CR5 (CR5-001..012) | 12 | ✅ 9 fixed, 3 documented |
| CR7 (CR7-001..010) | 10 | ✅ 9 fixed, 1 documented |

**Итого: 80 замечаний, 80 закрыто.**