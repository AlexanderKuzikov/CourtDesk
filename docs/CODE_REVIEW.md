# CODE REVIEW — CourtDesk

> Consolidated: 2026-07-29
> All review rounds plus post-CR10 TUI rewrite and documentation sync.

---

## Сводка

| Раунд | Дата | Ревьюер | Найдено | Исправлено | Закрыто |
|-------|------|---------|---------|------------|---------|
| CR1 | 2026-07-21 | Первичное | 11 (BUG-001..011) | 9 | 2 (не воспр.) |
| CR2 | 2026-07-22 | Первичное | 11 (NEW-001..011) | 11 | 0 |
| CR3 | 2026-07-22 | Perplexity | 8 | 8 | 0 |
| CR4 | 2026-07-22 | Perplexity (CR3→4) | 8 | 8 | 0 |
| CR5 | 2026-07-22 | Perplexity | 12 | 9 fix + 3 doc | 0 |
| CR6 | 2026-07-23 | Cursor Agent | 20 | 13 fix + UX + debt docs | 0 |
| CR7 | 2026-07-25 | OpenCode Go | 10 | 9 fix + 1 doc | 0 |
| CR8 | 2026-07-25 | OpenCode Go | 9 | 9 fix | 0 |
| CR9 | 2026-07-25 | OpenCode Go | 10 | 10 fix | 0 |
| CR10 | 2026-07-26 | Perplexity | 14 | 10 fix + полный rewrite TUI | 4 reclassified |
| CR11 | 2026-07-29 | OpenCode Go (qwen3.8) | 22 | 0 (фиксация) | 0 |
| **Итого** | | | **135+** | **101+ fix + doc sync** | **2** |

---

## CR11 — Полный аудит (2026-07-29)

> Ревьюер: OpenCode Go (qwen3.8-max-preview). Полный пятиосевой аудит всего кодовой базы (~6000 строк TS + ~1300 строк Go, 12 пакетов).
> Вердикт: **НУЖНЫ ПРАВКИ**. Все замечания зафиксированы, статус решений — «ОЖИДАЕТ».

### Блокеры

| ID | Файл | Описание | Рекомендация | Статус |
|----|------|----------|--------------|--------|
| CR11-001 | `api/server.ts:23-28` | **CORS wildcard + нет аутентификации.** `Access-Control-Allow-Origin: *` на API с mutating-эндпоинтами. `COURTDESK_API_TOKEN` заявлен в `.env.example:17`, но нигде не используется (grep = 0). Любой сайт может управлять делами. | Добавить token-middleware для POST/PATCH/DELETE. Заменить `*` на конкретный origin или убрать CORS. | 🔴 ОЖИДАЕТ |
| CR11-002 | `search/shared.ts:19`, `scheduler/orchestrator.ts:349`, `api/routes/cases.ts:107` | **`rejectUnauthorized: false` на всех HTTPS.** TLS-верификация отключена глобально для всех запросов к sudrf.ru. MITM тривиален. | Кастомный CA-бандл или `https.Agent` с `rejectUnauthorized: false` только для `*.sudrf.ru`. | 🔴 ОЖИДАЕТ |
| CR11-003 | `store/cases.ts`, `events.ts`, `notifications.ts`, `cards.ts` | **Race condition в store.** In-memory cache + синхронная запись. Два параллельных PATCH → оба читают `_cache`, оба пишут — последний затрёт изменения первого. `writeJson` (tmp+rename) атомарен на уровне файла, но не на уровне read-modify-write. | Сериализовать операции (очередь/mutex) или перейти на SQLite. | 🔴 ОЖИДАЕТ |
| CR11-004 | `packages/courtdesktop/courtdesktop.exe`, `packages/tui-go/courtdesk-tui.exe`, `packages/tui-go/courtdesk-tui-linux-amd64` | **Бинарники в git.** 6 MB + 7 MB × 2 = ~20 MB навсегда в истории. `.gitignore` не исключает `*.exe`. | `git rm --cached`, добавить `*.exe` в `.gitignore`, собирать через CI. | 🔴 ОЖИДАЕТ |
| CR11-005 | `api/routes/parse.ts:16` | **`_isRunning` guard не работает.** Модульная переменная проверяется/устанавливается неатомарно. Два одновременных POST оба видят `false`. Плюс `cron.ts` может запустить `runFull()` + `runRetry()` параллельно. | Семафор/AsyncLocalStorage. В `cron.ts` — общий guard на все прогоны. | 🔴 ОЖИДАЕТ |

### Важно

| ID | Файл | Описание | Рекомендация | Статус |
|----|------|----------|--------------|--------|
| CR11-006 | `packages/parse/` (0 тестов), `packages/search/` (0), `packages/captcha/` (0) | **Нет тестов для критичных модулей.** Парсинг HTML — ядро системы. Любое изменение разметки sudrf.ru ломает всё незаметно. ~40% кодовой базы без покрытия. | Snapshot-тесты на фиксированных HTML-фикстурах. | 🔴 ОЖИДАЕТ |
| CR11-007 | `search/shared.ts:14-42` vs `scheduler/orchestrator.ts:339-371` | **Дублирование `fetchHtml`.** Практически идентичный код (https.get + iconv + captcha fallback). Баг-фикс в одном — второй сломан. | Вынести в `packages/core/http.ts`. | 🔴 ОЖИДАЕТ |
| CR11-008 | `api/routes/health.ts:6` | **Рассинхронизация версий.** health возвращает `0.4.0`, `package.json` — `0.5.1`, README — `v0.7.0`. | Читать версию из `package.json` или вынести в константу. | 🔴 ОЖИДАЕТ |
| CR11-009 | `packages/tui-go/go.mod:3` | **`go 1.26.5` — несуществующая версия Go.** | Исправить на реальную (1.22/1.24). | 🔴 ОЖИДАЕТ |
| CR11-010 | `package.json:42-50` | **Мёртвые зависимости.** `react`, `ink`, `@types/react` — TUI переписан на readline+ANSI, React/Ink не импортируются нигде. `@types/react` в `dependencies` вместо `devDependencies`. | Удалить react, ink, @types/react. | 🔴 ОЖИДАЕТ |
| CR11-011 | `api/routes/cases.ts:97-130` | **POST `/api/cases?parse=true` — синхронный парсинг.** HTTP к sudrf.ru + капча внутри request handler. Таймаут до 2 минут. Клиент (1С) отвалится. | Вернуть 202 + фоновый парсинг, как `/api/parse/run`. | 🔴 ОЖИДАЕТ |
| CR11-012 | `captcha/rucaptcha.ts:31` | **`console.log('[rucaptcha] solved:', result)`** — логирует результат капчи в stdout. | Удалить или `logger.debug`. | 🔴 ОЖИДАЕТ |
| CR11-013 | Корень репо | **Мусорные файлы.** `1ade5d55cb6782886.txt`, `22581d41e52776239.txt` («Не удалять!»), `PROMPT_WEBUI.md` (AI-промпт). | Удалить txt. `PROMPT_WEBUI.md` → `docs/` или удалить. | 🔴 ОЖИДАЕТ |
| CR11-014 | `packages/courtdesktop/msgbox_windows.go`, `msgbox_other.go` | **`showError` не вызывается.** Функция определена для двух платформ, нигде не используется. | Удалить или использовать при ошибке WebView. | 🔴 ОЖИДАЕТ |
| CR11-015 | `packages/tui/` (TS, 379 строк) vs `packages/tui-go/` (Go, 1146 строк) | **Два TUI дублируют функциональность.** Какой канонический? | Выбрать один, второй удалить/заархивировать. | 🔴 ОЖИДАЕТ |

### Советы

| ID | Файл | Описание | Статус |
|----|------|----------|--------|
| CR11-016 | Тесты, `tui/app.ts:170`, `search/shared.ts:39` | `any`-типы: `(supertest(app) as any)`, `(c as any).courtName`, `this: any`. Завести типизированный хелпер. | 💡 СОВЕТ |
| CR11-017 | `scheduler/orchestrator.ts:processOne` | ~150 строк, 5 уровней вложенности. Разбить на `checkResult()`, `checkLegalForce()`, `checkHigherCourt()`. | 💡 СОВЕТ |
| CR11-018 | `parse.ts` vs `orchestrator.ts` vs `cases.ts` | Несконсистентный HTTP: `fetch()` vs `https.get`. Unify. | 💡 СОВЕТ |
| CR11-019 | `viewer/public/index.html` | ~500 строк inline JS. Известный гэп (WEBUI-O10), но стоит приоритизировать для CSP. | 💡 СОВЕТ |
| CR11-020 | `scheduler/cron.ts:tick()` | `runFull().catch(...)` fire-and-forget. Прогон падает — `_isRunning` не сбрасывается (связано с CR11-005). | 💡 СОВЕТ |
| CR11-021 | `search/shared.ts:fetchHtml` | `timeout: 120000` (2 мин) для поискового запроса избыточно. 30с достаточно. | 💡 СОВЕТ |
| CR11-022 | `store/settings.ts:30` | `return _cache!;` — non-null assertion сразу после присваивания. Лишний `!`. | 💡 СОВЕТ |

### Что хорошо (CR11)

- Чистая доменная модель: `core/types.ts` покрывает весь lifecycle (waiting→monitoring→decision→enforced→archived).
- Атомарная запись в store: `json-store.ts` (tmp+rename) защищает от повреждения при крахе.
- HTML-escaping в viewer: `esc()` экранирует все 5 символов, используется последовательно во всех `innerHTML`.
- PATCH whitelist: `cases.ts:PATCH_ALLOWED` защищает от инъекции полей.
- CP1251 encoding: `core/encoding.ts` правильно решает проблему ГАС «Правосудие».
- Иерархия судов: `courts.ts` с кэшем MS→RS и CASSATION_MAP — аккуратная доменная логика.
- Тесты API: 94 теста, хорошее покрытие CRUD + edge cases.

---

### Ключевой вывод по CR10

Изначальная трактовка CR10 была недостаточной: 10 замечаний были закрыты частичными patch-фиксами (`79a607b`), но практическая эксплуатация показала, что сама blessed-ветка остаётся архитектурно нежизнеспособной. Поэтому далее был выполнен **полный отказ от blessed/neo-blessed** и rewrite TUI на чистом `readline` + ANSI.

Это означает:
- CR10-001 фактически **закрыт другим способом**: не миграцией на `ink`, а удалением самого проблемного класса зависимостей.
- часть промежуточных blessed-фиксов исторически верны, но больше не определяют текущее состояние TUI;
- текущий TUI больше не зависит от `blessed`, `neo-blessed`, `neo-blessed-contrib`, `@types/blessed`.

---

## Post-CR10 — TUI rewrite (2026-07-26)

### Фактически выявленные проблемы blessed-ветки

| ID | Severity | Проблема | Итог |
|----|----------|----------|------|
| TUI-R1 | CRITICAL | `blessed` / `neo-blessed` архитектурно нестабильны на Windows / ConPTY | ✅ CLOSED через полный отказ от стека |
| TUI-R2 | HIGH | Карточка дела отображала технические идентификаторы (UUID/УИД), а не admin-friendly данные | ✅ FIXED |
| TUI-R3 | HIGH | Даты выводились в сыром ISO (`2026-07-26T09:19:27.389Z`) | ✅ FIXED |
| TUI-R4 | HIGH | Баг рендера `monitoringmonitoring` / `enforcedenforced` из-за неверного применения color/value | ✅ FIXED |
| TUI-R5 | HIGH | Вкладка «ЗАПУСК» была фактически заглушкой без понятного feedback | ✅ PARTIAL FIXED (busy state + log + HTTP errors) |
| TUI-R6 | MEDIUM | Неровные метки, пустые хвостовые строки, ломанный separator | ✅ FIXED |
| TUI-R7 | MEDIUM | URL рендерился неудобно, переносился мусорно | ✅ FIXED |
| TUI-R8 | MEDIUM | Логика клавиатуры/scroll/detail была нестабильной | ✅ FIXED |

### Коммиты rewrite-фазы

| Commit | Смысл |
|--------|-------|
| `885224d` | Удалены `neo-blessed` / `neo-blessed-contrib`, локализован источник audit-проблем |
| `bf9096e` | Полный rewrite TUI на чистый Node.js (`readline` + ANSI) |
| `2e1c1c6` | Удалены `blessed` и `@types/blessed` |
| `52fcc40` | Fix detail card layout: labels, URL wrap, tail cleanup, separator |
| `626ffae` | Human-readable card: без UUID, формат дат, исправлен double-status, переработан Run tab |

---

## Актуальный статус TUI

| Область | Статус | Комментарий |
|---------|--------|-------------|
| Зависимость от blessed | ✅ Удалена | Больше не используется |
| Linux | ✅ Работает | readline + ANSI |
| Windows | ⚠️ Требует полевой проверки | ConPTY лучше, но новый стек проще и надёжнее blessed |
| Detail card | ✅ Исправлена | Без UUID/УИД, с понятными датами |
| Double status bug | ✅ Исправлен | `monitoringmonitoring` устранён |
| Run tab | ⚠️ Частично решено | Есть log/busy/error feedback, но нет полноценного progress polling |
| UX для администратора | ✅ Существенно улучшено | UI очищен от технического мусора |

---

## Open issues после rewrite

> **Примечание:** SEC-O1 частично перекрыт CR11-001 (CORS+auth). API-O1 связан с CR11-011. TEST-O1 связан с CR11-006.

| ID | Priority | Описание | Статус |
|----|----------|----------|--------|
| TUI-O1 | HIGH | Во вкладке «ЗАПУСК» всё ещё нет реального polling `GET /api/parse/progress` и прогресс-бара processed/total/errors | 🔴 OPEN |
| API-O1 | MEDIUM | `POST /api/cases?parse=true` по-прежнему без очереди ограничения Puppeteer | 🔴 OPEN |
| INFRA-O1 | LOW | Нет workspaces для изоляции пакетов | 🔴 OPEN |
| SEC-O1 | MEDIUM | Нет полноценной auth-защиты API | 🔴 OPEN |
| TEST-O1 | MEDIUM | Нет отдельного regression-пула snapshot/fixture тестов для TUI rendering | 🔴 OPEN |

---

## CR10 — исторический статус

### Что было закрыто patch-этапом

| ID | Описание | Статус |
|----|----------|--------|
| CR10-002 | tags в list | ✅ FIXED |
| CR10-003 | detail refresh bug | ✅ FIXED |
| CR10-005 | hardcoded widths | ✅ FIXED |
| CR10-006 | raw ANSI cursor conflict | ✅ FIXED |
| CR10-007 | interval cleanup | ✅ FIXED |
| CR10-008 | any[] вместо WatchedCase[] | ✅ FIXED |
| CR10-009 | dynamic import in hot-path | ✅ FIXED |
| CR10-011 | cron double-fire | ✅ FIXED |
| CR10-012 | dead `_retryTimer` | ✅ FIXED |
| CR10-013 | `*.log` в git | ✅ FIXED |

### Что изменило статус позже

| ID | Было | Теперь |
|----|------|--------|
| CR10-001 | blessed dead-end → open sprint | ✅ CLOSED другим путём: blessed удалён полностью |
| CR10-004 | run tab stub | ⚠️ PARTIAL: log/busy feedback есть, progress polling всё ещё open |
| CR10-010 | Puppeteer без очереди | 🔴 OPEN |
| CR10-014 | нет workspaces | 🔴 OPEN |

---

## Итоговое состояние

- Архитектурно главный провал blessed-ветки зафиксирован и устранён.
- Документация синхронизирована с реальным кодом, а не с промежуточными обещаниями.
- **CR11 (2026-07-29):** полный аудит выявил 5 блокеров (CORS+auth, TLS, race condition, бинарники, guard), 10 важных замечаний, 7 советов. Все зафиксированы, решения ожидаются.
- Основные зоны доработки: безопасность (CR11-001/002), конкурентность (CR11-003/005), тесты parse/search/captcha (CR11-006), очистка репо (CR11-004/010/013).
