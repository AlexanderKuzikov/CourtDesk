# CODE REVIEW — CourtDesk

> Consolidated: 2026-07-26
> All 10 rounds of review with progress for each finding.

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
| CR7 | 2026-07-25 | OpenCode Go | 10 | 9 fix + 1 doc | 0 |
| CR8 | 2026-07-25 | OpenCode Go | 9 | 9 fix | 0 |
| CR9 | 2026-07-25 | OpenCode Go | 10 | 10 fix | 0 |
| CR10 | 2026-07-26 | Perplexity | 14 | 10 fix (commit 79a607b) | 4 open |
| **Итого** | | | **113** | **101 fix + 6 doc** | **2** |
| v0.5.0 | 2026-07-26 | — | — | **4 tech-debt закрыто** (eslint, pino, party matching, Node) | — |

**CR10: 10 из 14 закрыто** в коммите `79a607b`. Открыты 4 пункта, требующие отдельного sprint.

| Метрика | Значение |
|---------|----------|
| Тестов | 57, все зелёные |
| tsc --noEmit | Чисто |
| CI | Зелёный |
| API-контракты | 22 реализованы (+progress, +settings, +parse) |
| Viewer | Дашборд (управление, прогресс-бар, настройки) + поиск (msudrf AJAX) |
| TUI | blessed-терминал (Linux ✅, Windows ⚠️ — CR10-001 open) |

---

## CR10 — Perplexity TUI + Arch Audit (14 замечаний) — 2026-07-26

**Статус:** ЧАСТИЧНО ЗАКРЫТ. 10 fix в коммите `79a607b`, 4 open.

### TUI — packages/tui/app.ts

| ID | Severity | Описание | Статус |
|----|----------|----------|--------|
| CR10-001 | CRITICAL | `blessed` dead-end: мёртвая библиотека (2015), `blessed.list` не рендерит `tags:true` (upstream bug #400), Windows ConPTY несовместимость. Единственный fix — миграция на `ink` или `@clack/prompts` | 🔴 OPEN (отдельный sprint) |
| CR10-002 | HIGH | `tags: true` в `blessed.list` не работает — raw `{red-fg}` как текст. Workaround: теги убраны из `setItems()` | ✅ FIXED 79a607b |
| CR10-003 | HIGH | `detail` не обновляется при авто-refresh. Добавлен флаг `isDetailOpen`, `render()` не перерисовывает `list` под открытой карточкой | ✅ FIXED 79a607b |
| CR10-004 | HIGH | Вкладка «ЗАПУСК» — заглушка: нет `getProgress()`, нет обратной связи, hardcode 1.5 сек | 🔴 OPEN (требует progress polling) |
| CR10-005 | MEDIUM | Ширины колонок хардкодом. Добавлен `getColWidths(screen.width)` + `screen.on('resize', render)` | ✅ FIXED 79a607b |
| CR10-006 | MEDIUM | Ручной ANSI `\x1b[?25l` конфликтует с `screen.program`. Заменён на `screen.program.hideCursor()/showCursor()` | ✅ FIXED 79a607b |
| CR10-007 | MEDIUM | `setInterval` без `clearInterval` при выходе. Добавлен `refreshTimer` ref + `clearInterval` в обработчике выхода | ✅ FIXED 79a607b |
| CR10-008 | MEDIUM | `any[]` вместо `WatchedCase[]`. Импорт добавлен, тип проставлен везде | ✅ FIXED 79a607b |

### API — packages/api/

| ID | Severity | Описание | Статус |
|----|----------|----------|--------|
| CR10-009 | MEDIUM | Dynamic `import()` в hot-path handler `cases.ts`. Перенесено в static imports наверх файла | ✅ FIXED 79a607b |
| CR10-010 | MEDIUM | `POST /api/cases?parse=true` запускает Puppeteer без очереди и лимита. 10 параллельных = 10 Chromium | 🔴 OPEN (нужна очередь p-limit) |

### Scheduler — packages/scheduler/cron.ts

| ID | Severity | Описание | Статус |
|----|----------|----------|--------|
| CR10-011 | MEDIUM | `shouldRunFull` без `_lastFullRunDate` guard — double-fire при задержке event loop | ✅ FIXED 79a607b |
| CR10-012 | LOW | `_retryTimer` — dead variable, нигде не присваивался | ✅ FIXED 79a607b |

### Репозиторий / Инфраструктура

| ID | Severity | Описание | Статус |
|----|----------|----------|--------|
| CR10-013 | LOW | `tui.log` / `tui-err.log` закоммичены в git. Добавлены в `.gitignore` (`*.log`) | ✅ FIXED 79a607b |
| CR10-014 | LOW | Monorepo без npm/pnpm workspaces — нет изоляции зависимостей | 🔴 OPEN (отдельный sprint) |

---

## CR9 — Court Hierarchy & Grace Period (10 замечаний) — 2026-07-25

**Результат:** 10 замечаний исправлено. Иерархия судов (MS→RS→OS→KJ), карта 89 регионов → 9 кассационных судов, кэш MS→RS, grace period 90 дней, поиск по УИД.

| ID | Severity | Описание | Статус |
|----|----------|----------|--------|
| CR9-001 | CRITICAL | `runFull` не обрабатывал `enforced` дела | ✅ FIXED |
| CR9-002 | CRITICAL | `fetchHtml` не детектил «Неверно указан проверочный код» | ✅ FIXED |
| CR9-003 | HIGH | Отсутствовала `findHigherCourt` | ✅ FIXED |
| CR9-004 | HIGH | Не описана иерархия судов (MS→RS→OS→KJ) | ✅ FIXED |
| CR9-005 | HIGH | Не задана привязка регионов к кассационным судам | ✅ FIXED |
| CR9-006 | MEDIUM | MS→RS привязки не кэшировались на диск | ✅ FIXED |
| CR9-007 | MEDIUM | `enforcedAt` не было в `WatchedCase` | ✅ FIXED |
| CR9-008 | MEDIUM | `updateCase` не проставлял `enforcedAt` автоматом | ✅ FIXED |
| CR9-009 | LOW | Grace period 90 дней для `enforced` дел | ✅ FIXED |
| CR9-010 | LOW | Поиск в вышестоящей инстанции по УИД через `searchByCaseUid` | ✅ FIXED |

---

## CR8 — Captcha + Search overhaul (9 замечаний) — 2026-07-25

**Результат:** 9 замечаний исправлено.

| ID | Severity | Описание | Статус |
|----|----------|----------|--------|
| CR8-001 | CRITICAL | `case_type=0` для appeal — искал в кассации | ✅ FIXED |
| CR8-002 | CRITICAL | `new=5` для appeal — форма показывала кассацию | ✅ FIXED |
| CR8-003 | CRITICAL | `decodeURIComponent` падает на CP1251 | ✅ FIXED |
| CR8-004 | HIGH | `waitForNetworkIdle` таймаутится | ✅ FIXED |
| CR8-005 | HIGH | Double-encoding CP1251 через `page.goto()` | ✅ FIXED |
| CR8-006 | HIGH | Regex base64 не обрабатывал пробел в data URI | ✅ FIXED |
| CR8-007 | MEDIUM | `parseResults` не проверял `<div id="error">` | ✅ FIXED |
| CR8-008 | MEDIUM | `isCaptchaPage` не детектил страницу с ошибкой капчи | ✅ FIXED |
| CR8-009 | LOW | `SEARCH_PARAMS` не содержал `new` | ✅ FIXED |

---

## CR7 — OpenCode Go Deep Audit (10 замечаний) — 2026-07-25

| ID | Severity | Описание | Статус |
|----|----------|----------|--------|
| CR7-001 | MEDIUM | `success: true` при HTTP 500 | ✅ FIXED |
| CR7-002 | MEDIUM | `toIso()` битая ISO дата | ✅ FIXED |
| CR7-003 | MEDIUM | Dead code: `err.message === 'timeout'` | ✅ FIXED |
| CR7-004 | MEDIUM | `listNotifications()` живая ссылка на кэш | ✅ FIXED |
| CR7-005 | MEDIUM | `findCourtsByRegion` без лимита | ✅ FIXED |
| CR7-006 | MEDIUM | Матчинг `r.uid === c.uid` никогда не срабатывал | ✅ FIXED |
| CR7-007 | MEDIUM | `waitForNetworkIdle().catch(() => {})` глотает ошибки | ✅ FIXED |
| CR7-008 | MEDIUM | `process.loadEnvFile()` требует Node ≥21 | ✅ DOCUMENTED |
| CR7-009 | LOW | `&rarr;` обрабатывается по-разному | ✅ FIXED |
| CR7-010 | LOW | `setInterval` не чистится при уходе со страницы | ✅ FIXED |

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

### Tech-debt (documented)

| ID | Severity | Описание | Заметка |
|----|----------|----------|--------|
| CR6-003 | CRITICAL | Zero authentication | COURTDESK_API_TOKEN в .env.example |
| CR6-005 | HIGH | waiting → results[0] без матчинга | Закрыто в v0.5.0 (pickBestMatch) |
| CR6-010 | HIGH | TLS rejectUnauthorized: false | Trade-off для sudrf.ru wildcard |
| CR6-011 | MEDIUM | RuCaptcha softId placement | Non-breaking |
| CR6-012 | MEDIUM | Chromium leak / no pool | Single-session magistrate |
| CR6-014 | MEDIUM | Subdomain коллизии | 3 дубликата, 1914 без subdomain |
| CR6-015 | MEDIUM | parsePublishInfo HH:MM:SS | Edge case |
| CR6-017 | MEDIUM | 0 HTML fixtures in tests | Tech-debt |
| CR6-018 | MEDIUM | captcha-debug not in .gitignore | Added |
| CR6-019 | LOW | Version mismatch | ✅ FIXED (0.4.0) |
| CR6-020 | LOW | Intention vs Classification types | Tech-debt |

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
