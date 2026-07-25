# BUG REPORT — CourtDesk

> Последнее обновление: 2026-07-25
> Все 89 замечаний из 8 раундов ревью закрыты.

---

## Открытых багов нет

**Все 89 замечаний исправлены, закрыты или задокументированы как tech-debt.**

---

## CR8 — Captcha + Search overhaul (2026-07-25)

| ID | Severity | Файл | Описание | Статус |
|----|----------|------|----------|--------|
| CR8-001 | CRITICAL | `packages/search/constants.ts` | `case_type=1` для appeal — поиск шёл в кассацию, а не апелляцию. Реальный `case_type` для апелляции = `0` | ✅ FIXED |
| CR8-002 | CRITICAL | `packages/search/constants.ts` | `new=0` для appeal — форма показывала кассацию. Апелляция требует `new=5` | ✅ FIXED |
| CR8-003 | CRITICAL | `packages/captcha/session.ts` | `decodeURIComponent()` падает на CP1251-encoded байтах (`%CA%F3...`). Ручной percent-декодер без UTF-8 валидации | ✅ FIXED |
| CR8-004 | HIGH | `packages/captcha/session.ts` | `waitForNetworkIdle` на sudrf страницах таймаутится из-за фоновых счетчиков. Заменён на `waitForNavigation` | ✅ FIXED |
| CR8-005 | HIGH | `packages/captcha/session.ts` | Double-encoding CP1251 через `page.goto()`. Переход на DOM-заполнение + `checkForm` submit | ✅ FIXED |
| CR8-006 | HIGH | `packages/captcha/session.ts` | Regex base64 не обрабатывал пробел после `base64,` в data URI (`data: image/png;base64, iVBOR...`) | ✅ FIXED |
| CR8-007 | MEDIUM | `packages/search/shared.ts` | `parseResults` не проверял `<div id="error">` — silent empty result вместо ошибки | ✅ FIXED |
| CR8-008 | MEDIUM | `packages/core/errors.ts` | `isCaptchaPage` не включал маркер `"Неверно указан проверочный код"` — страница с ошибкой капчи не детектилась | ✅ FIXED |
| CR8-009 | LOW | `packages/search/constants.ts` | `SEARCH_PARAMS` не содержал `new` — параметр, влияющий на выбор картотеки (0/5) | ✅ FIXED |

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
| CR8 (CR8-001..009) | 9 | ✅ 9 fixed |

**Итого: 89 замечаний, 89 закрыто.**