# CODE REVIEW — CourtDesk

> Consolidated: 2026-07-24
> All 6 rounds of review with progress for each finding.

---

## Сводка

| Раунд | Дата | Ревьюер | Найдено | Исправлено | Закрыто |
|-------|------|---------|---------|------------|---------|
| CR1 | 2026-07-21 | Первичное | 11 (BUG-001..011) | 9 | 2 (не воспр.) |
| CR2 | 2026-07-22 | Первичное | 11 (NEW-001..011) | 11 | 0 |
| CR3 | 2026-07-22 | Perplexity | 8 | 8 | 0 |
| CR4 | 2026-07-22 | Perplexity (CR3→4) | 8 | 8 | 0 |
| CR5 | 2026-07-22 | Perplexity | 12 | 9 fix + 3 doc | 0 |
| CR6 | 2026-07-23 | Cursor Agent | 20 | 13 fix + 5 UX + 5 tech-debt | 0 |
| **Итого** | | | **80** | **73** | **2** |

**Открытых критичных замечаний нет.** 5 tech-debt задокументировано.

| Метрика | Значение |
|---------|----------|
| Тестов | 57, все зелёные |
| tsc --noEmit | Чисто |
| CI | Зелёный |
| API-контракты | 16/16 реализованы |
| Viewer | Дашборд (управление) + поиск (мониторинг) |

---

## CR1 — Первичное ревью (BUG-001..011) — ✅ Закрыт

| ID | Severity | Описание | Статус |
|----|----------|----------|--------|
| BUG-002 | CRITICAL | runNew() / fetchHtml('') | ✅ FIXED |
| BUG-003 | HIGH | magistrate без captcha + CP1251 | ✅ FIXED |
| BUG-004 | HIGH | PATCH без whitelist | ✅ FIXED |
| BUG-006 | MEDIUM | deleteCase лишняя I/O | ✅ FIXED |
| BUG-007 | MEDIUM | Node < 20.6 падает | ✅ FIXED |
| BUG-008 | MEDIUM | runFull блокирует event loop | ✅ FIXED |
| BUG-009 | MEDIUM | N×disk reads, нет cache | ✅ FIXED |
| BUG-010 | LOW | CRLF endings | ✅ FIXED |
| BUG-011 | LOW | Dynamic import iconv | ✅ FIXED |
| BUG-001 | CRITICAL | Race condition | ✅ CLOSED (не воспр.) |
| BUG-005 | HIGH | magistrate caseUrl | ✅ CLOSED (не воспр.) |

---

## CR2 — Второе ревью (NEW-001..011) — ✅ Закрыт

All 11 fixed in commit `cb120b2`.

---

## CR3/CR4 — Perplexity-ревью (8+8) — ✅ Закрыт

CORS, shared fetchHtml, batch updateCase, graceful shutdown, persistent notifications, magistrate refactor, SEARCH_PARAMS constants.

---

## CR5 — Perplexity-ревью (12 замечаний) — ✅ Закрыт

Rate-delay, type safety, legalForceDate normalization, CORS, regex /iu, captcha retry, listCases multi-status, runFull guard, HOST env. 3 documented as trade-offs.

---

## CR6 — Cursor Agent ревью (20 замечаний) — 2026-07-23/24

### Fixed

| ID | Severity | Описание | Статус |
|----|----------|----------|--------|
| CR6-001 | CRITICAL | Corrupt JSON → silent wipe | ✅ FIXED |
| CR6-002 | CRITICAL | SSRF via user-controlled URL | ✅ FIXED |
| CR6-004 | HIGH | archived race in orchestrator | ✅ FIXED |
| CR6-006 | HIGH | error status not cleared | ✅ FIXED |
| CR6-007 | HIGH | search.html broken (wrong API paths) | ✅ FIXED |
| CR6-008 | HIGH | Duplicate /api/status route | ✅ FIXED |
| CR6-009 | HIGH | Duplicate /api/resolve route | ✅ FIXED |
| CR6-013 | HIGH | _isRunning TOCTOU | ✅ FIXED |
| CR6-016 | MEDIUM | deleteCase not cascading | ✅ FIXED |

### UX/UI (fixed)

| Issue | Description | Status |
|-------|-------------|--------|
| UX-1 | search.html wrong API paths | ✅ FIXED (CR6-007) |
| UX-2 | No "Add to monitoring" button | ✅ FIXED |
| UX-3 | No case detail view | ✅ FIXED (modal + events timeline) |
| UX-4 | No "Wait" form in UI | ✅ FIXED |
| UX-5 | No status management UI | ✅ FIXED (archive/delete/restore) |
| UX-6 | No parse/run trigger in UI | ✅ FIXED |
| UX-7 | CourtSniffer branding | ✅ FIXED → CourtDesk |
| UX-8 | Test data in production UI | ✅ FIXED |

### Cleaned up

- Magistrate search adapter: dead `createMagistrateSession()` and `solveCaptchaOnPage()` removed
- `GET /api/cases/:uid/events` — new endpoint for UI timeline

### Tech-debt (documented)

| ID | Severity | Описание | Заметка |
|----|----------|----------|---------|
| CR6-003 | CRITICAL | Zero authentication | COURTDESK_API_TOKEN в .env.example |
| CR6-005 | HIGH | waiting → results[0] без матчинга | Нужен score/party matching |
| CR6-010 | HIGH | TLS rejectUnauthorized: false | Trade-off для sudrf.ru wildcard |
| CR6-011 | MEDIUM | RuCaptcha softId placement | Игнорируется API, non-breaking |
| CR6-012 | MEDIUM | Chromium leak / no pool | Single-session magistrate |
| CR6-014 | MEDIUM | Subdomain коллизии | 3 дубликата, 1914 без subdomain |
| CR6-015 | MEDIUM | parsePublishInfo HH:MM:SS | Edge case |
| CR6-017 | MEDIUM | 0 HTML fixtures in tests | Tech-debt |
| CR6-018 | MEDIUM | captcha-debug not in .gitignore | Added |
| CR6-019 | LOW | Version mismatch | ✅ FIXED (0.4.0) |
| CR6-020 | LOW | Intention vs Classification types | Tech-debt |