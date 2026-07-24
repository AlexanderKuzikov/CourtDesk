# BUG REPORT — CourtDesk

> Последнее обновление: 2026-07-24
> Все 70 замечаний из 6 раундов ревью закрыты.

---

## Открытых багов нет

**Все 70 замечаний исправлены, закрыты или задокументированы как tech-debt.**

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

**Итого: 70 замечаний, 70 закрыто.**