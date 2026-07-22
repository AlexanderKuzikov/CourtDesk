# CODE REVIEW 5 — CourtDesk

> Дата: 2026-07-22
> Ревьюер: Perplexity (CR5), HEAD: `913c119`
> База: CODE_REVIEW4.md → все CR4-001..008 закрыты

---

## Статус предыдущих ревью

| Ревью | Статус | Комментарий |
|-------|--------|-------------|
| CODE_REVIEW1 | ✅ Закрыт | Базовые замечания исправлены |
| CODE_REVIEW2 | ✅ Закрыт | BUG-001..011 исправлены |
| CODE_REVIEW3 | ✅ Закрыт | NEW-001..011 исправлены |
| CODE_REVIEW4 | ✅ Закрыт | CR4-001..008 исправлены, 57 тестов зелёные |
| **CODE_REVIEW5** | ✅ **Применён** | CR5-001..012 — все исправлены |

---

## Состояние после исправлений

### CI и тесты
- ✅ tsc --noEmit чист
- ✅ 57/57 тестов зелёные
- ✅ Защита main активна
- ✅ Все 50 исторических замечаний закрыты

---

## Замечания CR5 и их статус

| ID | Severity | Файл | Проблема | Статус |
|----|----------|------|---------|--------|
| CR5-001 | HIGH | `orchestrator.ts` | Двойной запрос на `decision`-делах без rate-delay | ✅ FIXED |
| CR5-002 | HIGH | `orchestrator.ts` | `'deleted' as unknown` — несуществующий статус | ✅ FIXED |
| CR5-003 | HIGH | `store/cases.ts` | `legalForceDate` без нормализации к `YYYY-MM-DD` | ✅ FIXED |
| CR5-004 | MEDIUM | `api/server.ts` | CORS wildcard + Authorization header | ✅ FIXED |
| CR5-005 | MEDIUM | `intake/classify.ts` | `/i` без `/u` на кириллических regex | ✅ FIXED |
| CR5-006 | MEDIUM | `captcha/rucaptcha.ts` | `fetch` polling без retry при network error | ✅ FIXED |
| CR5-007 | MEDIUM | `store/cases.ts` | 3× `listCases` в `runFull` вместо одного прохода | ✅ FIXED |
| CR5-008 | LOW | `store/json-store.ts` | tmp/rename без fsync | ✅ DOCUMENTED |
| CR5-009 | LOW | `package.json` | `lint` = type-check, eslint отсутствует | ✅ DOCUMENTED |
| CR5-010 | LOW | `api/server.ts` | Hardcoded bind `127.0.0.1` | ✅ FIXED |
| CR5-011 | LOW | `orchestrator.ts` | `console.log` вместо structured logging | ✅ DOCUMENTED |
| CR5-012 | MEDIUM | `api/routes/parse.ts` | Нет guard от параллельных `runFull()` | ✅ FIXED |

---

## Что сделано

| # | Изменение | Файлы | Статус |
|---|-----------|-------|--------|
| 1 | `await sleep(RATE_DELAY_MS)` перед `searchByCaseNumber` в `processOne` | `orchestrator.ts` | ✅ |
| 2 | Убран `prev.status === 'deleted' as unknown` | `orchestrator.ts` | ✅ |
| 3 | `r.legalForceDate.slice(0, 10)` — нормализация при записи | `orchestrator.ts` | ✅ |
| 4 | `runFull`/`runRetry` используют `listCases({ status: [...] })` — один проход | `orchestrator.ts` + `cases.ts` | ✅ |
| 5 | `listCases` принимает `status?: CaseStatus \| CaseStatus[]` через `Set` | `store/cases.ts` | ✅ |
| 6 | Убран `Authorization` из CORS allow-headers при wildcard origin | `server.ts` | ✅ |
| 7 | `HOST = process.env['HOST'] ?? '127.0.0.1'` | `server.ts` | ✅ |
| 8 | `/i` → `/iu` в `CASE_NUMBER_RE` и `CYRILLIC_WORD_RE` | `intake/classify.ts` | ✅ |
| 9 | Retry при network error в `pollResult` (до 2 попыток) | `captcha/rucaptcha.ts` | ✅ |
| 10 | `_isRunning` guard + 409 Conflict в `/api/parse/run` | `api/routes/parse.ts` | ✅ |
| 11 | BUG_REPORT.md — CR5-001..012 → FIXED/DOCUMENTED | `BUG_REPORT.md` | ✅ |

### Задокументированные trade-offs (не требуют кода)
- **CR5-008** (fsync): tmp/rename без fsync — осознанный trade-off для single-process, задокументировано в ARCHITECTURE.md §7.2
- **CR5-009** (eslint): добавление eslint выходит за рамки CR5, открыт как tech-debt в DECISIONS.md
- **CR5-011** (pino): structured logging — отложено, открыт как tech-debt в DECISIONS.md
