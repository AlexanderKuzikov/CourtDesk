# CODE REVIEW — CourtDesk

> Consolidated: 2026-07-30
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
| CR11 | 2026-07-29 | OpenCode Go (qwen3.8) | 22 | 0 (фиксация) | 1 invalid (CR11-009) |
| CR12 | 2026-07-30 | OpenCode Go (qwen3.8) | 21 новое + ревизия CR11 | 0 (фиксация) | 0 |
| **Итого** | | | **156+** | **101+ fix + doc sync** | **3** |

---

## CR12 — Жёсткий аудит + ревизия CR11 (2026-07-30)

> Ревьюер: OpenCode Go (qwen3.8-max-preview). Полное перечитывание всех 84 исходных файлов (~6850 строк TS/Go).
> Вердикт: **НУЖНЫ ПРАВКИ**. Ни одно замечание CR11 (2026-07-29) не исправлено — все 22 пункта по-прежнему «ОЖИДАЕТ».
> CR12 обнаружил **21 новую проблему**, включая 4 блокера, пропущенных CR11.

### Ревизия CR11

| ID | Вердикт CR12 |
|----|--------------|
| CR11-001..008, 010..022 | Подтверждены, статус не изменился — 🔴 ОЖИДАЕТ |
| CR11-009 (`go 1.26.5` — «несуществующая версия») | ❌ **INVALID.** Проверено: `go version` = `go1.26.5 windows/amd64`. Версия реальна, go.mod корректен. Закрыт. |
| CR11-013 (мусорные .txt) | ⬆️ **Переклассифицирован в CR12-003 (БЛОКЕР)**: имена файлов — фрагменты RuCaptcha-ключа, ключ восстанавливается из git-истории. |
| CR10-013 (`*.log` в git — «FIXED») | ❌ **Ложное закрытие.** `git ls-files` подтверждает: `logs/courtdesk.log` по-прежнему отслеживается. См. CR12-011. |

### Блокеры (новые)

| ID | Файл | Описание | Рекомендация | Статус |
|----|------|----------|--------------|--------|
| CR12-001 | `api/routes/cases.ts:102-109` | **SSRF.** `url` из `req.body` (строка 70) передаётся в `https.get(url, ...)` без `assertCourtUrl()`. В отличие от `parse.ts:42`, где валидация есть. Атакующий может заставить сервер делать запросы на внутренние адреса (`http://169.254.169.254/`, `http://127.0.0.1:*`). `catch {}` на строке 110 маскирует все ошибки как «нужна капча». | Вызвать `assertCourtUrl(url)` до fetch. Не глотать ошибки сети. | 🔴 ОЖИДАЕТ |
| CR12-002 | `tui-go/main.go:380-395` | **Data race.** `runCmd(mode string, m *model)` мутирует `m.runLog`/`m.runBusy` и синхронно (382-383), и из `tea.Cmd`-замыкания (386-393), которое BubbleTea выполняет в горутине. Запись из горутины + чтение из Update-цикла = undefined behavior. Вызывается из 6 мест (559-561, 589-591). | Возвращать из Cmd только сообщения (`tea.Msg`), мутировать модель исключительно в `Update()`. | 🔴 ОЖИДАЕТ |
| CR12-003 | `1ade5d55cb6782886.txt`, `22581d41e52776239.txt` | **Утечка секрета в git-истории.** Файлы отслеживаются (`git ls-files` подтверждает). Имена = две половины RuCaptcha API-ключа из `.env`: `ade5d55cb6782886` + `2581d41e52776239`. Ключ восстанавливается из публичного репо. CR11-013 оценил это как LOW («мусорные файлы») — нет, это HIGH/БЛОКЕР. | 1) Немедленно отозвать/перевыпустить ключ RuCaptcha. 2) `git rm` файлы. 3) Очистка истории (git-filter-repo) — по решению владельца, force-push опасен. | 🔴 ОЖИДАЕТ |
| CR12-004 | `courtdesktop/main.go:76,91-95,152,156,171` | **XSS + arbitrary scheme navigation в Desktop App.** `SaveSettings` принимает произвольный `apiURL` без валидации схем — `file:///C:/Users/...`, `javascript:...` работают в WebView2, навигация происходит при следующем старте (строка 76). Поля `profile.json` (`ThemeName`, `APIURL`) интерполируются в HTML/JS без экранирования (152, 156, 171) — инъекция через пользовательский профиль. `escapeJS` существует, но в `buildSettingsPage` не применяется. `w.Bind("courtdesk", jsAPI)` (75) доступно любой странице в WebView, включая внешние. | Валидировать `apiURL` (только `http://`/`https://`). Экранировать все интерполяции через `html.EscapeString`/`escapeJS`. Проверять origin перед исполнением binding-вызовов. | 🔴 ОЖИДАЕТ |

### Важно (новые)

| ID | Файл | Описание | Рекомендация | Статус |
|----|------|----------|--------------|--------|
| CR12-005 | `tui-go/main.go:521,602,1079-1105` | **UTF-8 коррупция.** `pad()`, `trunc()`, `wrap()` и backspace-обработка работают с байтами (`len(s)`, `s[:n]`), не с рунами. Русский текст (2 байта/символ) режется посередине руны → невалидный UTF-8 в терминале. Backspace по кириллице удаляет полсимвола. | `[]rune(s)`, `utf8.RuneCountInString`, `unicode/utf8` для всех операций. | 🔴 ОЖИДАЕТ |
| CR12-006 | Корень репо | **ESLint не работает.** `npm run lint:eslint` падает: `typescript-eslint does not support TS 7.0`. Статический анализ отсутствует полностью. `eslint-config-prettier` установлен, но не подключён в конфиге. `no-explicit-any` = warn. Viewer JS (`*.html`, `terminal.js`) вне линтинга. | Либо откат на TS 6.x, либо `typescript-eslint` с TS 6 API side-by-side (см. ссылку в ошибке). Подключить prettier-config. | 🔴 ОЖИДАЕТ |
| CR12-007 | `tui-go/main.go:399-402` | **`Init()` мутирует value receiver.** `m.firstLoad = true` пишется в копию модели, изменение теряется. Loading-screen (строка 643, `if m.firstLoad`) — мёртвый код, никогда не отображается. | Инициализировать `firstLoad` в `initModel()` или возвращать Cmd. | 🔴 ОЖИДАЕТ |
| CR12-008 | `tui-go/main.go:771-772` | **Сломанный guard в `renderDetail`.** `m.page = pList` присваивается value-копии при out-of-bounds `m.cur` — мутация теряется. Модель остаётся на `pDetail`, guard срабатывает на каждом рендере, детальная страница пустая. | Возвращать редирект через `tea.Cmd` или проверять границы в `Update()`. | 🔴 ОЖИДАЕТ |
| CR12-009 | `captcha/session.ts:182-189,260` | **Новый браузер Puppeteer на каждый вызов.** `fetchWithCaptcha` и `fetchMsudrfSearch` делают `puppeteer.launch()` каждый раз. Batch из 50 дел = 50+ Chromium-процессов. Плюс `--no-sandbox` (185). Appeal-поиск (`search/adapters/appeal.ts:14`) всегда идёт через Puppeteer. | Browser pool (singleton + переиспользование страниц). Очередь с concurrency limit. | 🔴 ОЖИДАЕТ |
| CR12-010 | `search/adapters/magistrate.ts:26-27` | **Тихая потеря данных.** `if (req.defendant) fields['G1_PARTS__NAMESS'] = req.defendant; if (req.plaintiff) fields['G1_PARTS__NAMESS'] = req.plaintiff;` — при обоих заполненных полях истец молча перезаписывает ответчика. | Конкатенировать или использовать разные поля; бросать ошибку при конфликте. | 🔴 ОЖИДАЕТ |
| CR12-011 | `logs/courtdesk.log` | **Лог отслеживается в git.** `git ls-files` = tracked, несмотря на `*.log` в `.gitignore:50` (добавлен до правила). Содержит запросы поиска судов (персональные данные участников дел). CR10-013 помечен «FIXED» — ложь. | `git rm --cached logs/courtdesk.log`, добавить `/logs/` в `.gitignore`. | 🔴 ОЖИДАЕТ |
| CR12-012 | `search/shared.ts:59` | **Капча возвращается как результат.** `if (!apiKey) return html;` — при обнаружении капчи без ключа HTML капчи возвращается как валидный результат поиска. Парсер выше даёт мусор или падает. | Бросать `CaptchaRequiredError`, обрабатывать на уровне маршрута. | 🔴 ОЖИДАЕТ |
| CR12-013 | `scheduler/cron.ts:25-26` | **Рассинхрон часовых поясов.** `shouldRunFull` использует локальное время (`now.getHours()`), `todayDate()` — UTC (`toISOString().slice(0,10)`). Для UTC+3 (Москва) между 00:00 и 03:00 локального «сегодня» и час запуска не совпадают — пропуск или двойной прогон. | Всё в UTC или всё в локальном. `Intl.DateTimeFormat` с явным timeZone. | 🔴 ОЖИДАЕТ |
| CR12-014 | `api/middleware/error.ts:5` | **Утечка внутренних ошибок.** `err.message` отдаётся клиенту. Stack-треки с путями файловой системы и именами модулей попадают в API-ответы. | Возвращать generic message; детали — только в лог. | 🔴 ОЖИДАЕТ |
| CR12-015 | `api/routes/settings.ts:20` | **Нет валидации значений.** `retryIntervalHours` можно установить в строку, отрицательное число или NaN — store сохраняет что угодно, прошедшее whitelist ключей. | Zod/ручная проверка типов и диапазонов. | 🔴 ОЖИДАЕТ |
| CR12-016 | `.github/workflows/ci.yml` | **Go невидим для CI.** Workflow: `npm ci` + `tsc` + `vitest`. Нет `setup-go`, `go build`, `go vet`, `go test`. Нет Windows-matrix (courtdesktop — Windows-primary). Два Go-пакета (1333 строки) никогда не компилируются в CI. | Добавить job `go`: setup-go, `go vet ./...`, `go build ./...`, matrix windows/ubuntu. | 🔴 ОЖИДАЕТ |
| CR12-017 | `.gitignore`, `.gitattributes` | **Бинарники не исключены.** Нет `*.exe` в `.gitignore`; `courtdesk-tui-linux-amd64` (без расширения) не ловится ни одним glob. `.gitattributes` не помечает `*.exe` как `binary` — git может применять CRLF-конверсию к экзешникам. 21 MB бинарников в working tree, .git = 95 MB (исторические Fyne-блобы по 40 MB). | `*.exe` и явные пути в `.gitignore`; `*.exe binary` в `.gitattributes`; CI-артефакты вместо коммита. Связано с CR11-004. | 🔴 ОЖИДАЕТ |
| CR12-018 | `tui-go/main.go:139,152,173,186,197,376` | **6+ проигнорированных ошибок в API-клиенте.** `b, _ := json.Marshal(...)`, `b, _ := io.ReadAll(...)`, `_, _ = apiPatch(...)`. HTTP-статусы не проверяются ни в одной из 4 функций (`apiGet/apiPost/apiDelete/apiPatch`) — 500/403 парсится как JSON. `addCaseCmd` (353-365) глотает обе ошибки и закрывает диалог с видимостью успеха. | Проверять StatusCode до парсинга; возвращать ошибки в `tea.Msg`; показывать в statusbar. | 🔴 ОЖИДАЕТ |
| CR12-019 | `store/events.ts:30`, `notifications.ts:22`, `cases.ts:7` | **Неограниченный рост памяти.** Кэши модулей растут без eviction: events — все события всех дел навсегда в памяти + полная сериализация на каждый append. `notifications.ts:22` мутирует кэш до `save()` — при ошибке записи память и диск расходятся. | Лимиты + eviction; сначала save, потом мутация кэша (или откат). | 🔴 ОЖИДАЕТ |
| CR12-020 | Git-история | **8 подряд коммитов с сообщением «.»** (0a106ef..0a96bd3). История нечитаема, `git log` бесполезен для бисекции. Нарушение конвенций AGENTS.md (повелительное наклонение, ≤72 символа). | Дисциплина коммитов; squash мусора при следующем удобном случае (без force-push без решения). | 🔴 ОЖИДАЕТ |
| CR12-021 | `api/routes/health.ts:6` vs `package.json:3` vs `README.md:90` | **Хаос версий (подтверждение CR11-008).** health = `0.4.0`, package.json = `0.5.1`, README/CONTEXT = `v0.7.0`. Три разных версии в трёх местах. | Единый источник: читать из package.json при старте. | 🔴 ОЖИДАЕТ |

### Советы (новые)

| ID | Файл | Описание | Статус |
|----|------|----------|--------|
| CR12-S01 | `tui-go/main.go:787-798` | `det`-замыкание определено и сразу отброшено `_ = det`. Мёртвый код. | 💡 СОВЕТ |
| CR12-S02 | `tui-go/main.go:110`, `tui/app.ts:27` | Оба TUI хардкодят `http://127.0.0.1:8767/api`. Нет флага/env/конфига. | 💡 СОВЕТ |
| CR12-S03 | `tui/api.ts` vs `tui/app.ts:28-47` | Два параллельных API-клиента в TS TUI; `app.ts` не использует `api.ts` — мёртвый модуль. | 💡 СОВЕТ |
| CR12-S04 | `terminal.js:654-659` | `mouseover` → `selectRow()` → полная перерисовка statusbar на каждое движение мыши. | 💡 СОВЕТ |
| CR12-S05 | `core/courts.ts:116`, `core/logger.ts:8` | `readFileSync`/`mkdirSync` на уровне модуля — крах при импорте без graceful degradation. | 💡 СОВЕТ |
| CR12-S06 | `store/json-store.ts:30` | `Date.now()` в tmp-имени: две записи в одну миллисекунду = коллизия пути. | 💡 СОВЕТ |
| CR12-S07 | `vitest.config.ts` | Нет coverage-провайдера и порогов. Реальное покрытие неизвестно. | 💡 СОВЕТ |
| CR12-S08 | `courtdesktop/go.mod` | `webview_go` закреплён на pseudo-version (коммит, не тег) — нет semver-гарантий. `go 1.22` при установленном 1.26. | 💡 СОВЕТ |
| CR12-S09 | `.npmrc` | `legacy-peer-deps=true` маскирует конфликты peer-зависимостей. | 💡 СОВЕТ |
| CR12-S10 | `intake/classify.ts:8` | `[А-ЯA-Z]?` без `Ё` в первом классе; латинские имена («ООО „Romashka"») не классифицируются. Нет лимита длины входа. | 💡 СОВЕТ |

### Что хорошо (CR12)

- Тесты API по-прежнему зелёные: 94/94, все 16 файлов, включая edge-cases CRUD и фоновый раннер.
- `tsc --noEmit` чистый — strict mode соблюдается, компиляционных ошибок нет.
- Доменная модель (`core/types.ts`) и lifecycle дел — цельные, покрывают waiting→monitoring→decision→enforced→archived.
- `assertCourtUrl` существует и применяется в `parse.ts` — механизм защиты есть, нужно лишь распространить на `cases.ts`.
- Атомарная запись `json-store.ts` (tmp+rename) корректна на уровне одиночной операции.
- Go TUI: раскладка клавиатуры (рус/англ по физическим клавишам) сделана аккуратно и консистентно.
- `data/` корректно в `.gitignore` и не отслеживается.

### Проверено

- Тесты: да, `npm test` = 94 passed (16 файлов). Покрытие parse/search/captcha/core/viewer/tui/tui-go = 0 (подтверждает CR11-006, TEST-O3).
- Линт: `tsc --noEmit` = чисто; **ESLint = сломан** (CR12-006).
- Безопасность: SSRF (CR12-001), secret leak (CR12-003), XSS/navigation (CR12-004), TLS off (CR11-002), zero-auth (CR11-001), `--no-sandbox` (CR12-009), error leak (CR12-014).
- Go: data race (CR12-002), UTF-8 (CR12-005), мёртвый код (CR12-007/008), CI-дыра (CR12-016).

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
- **CR12 (2026-07-30):** контрольный аудит. Ни одно замечание CR11 не исправлено. Найдено 21 новое замечание: 4 блокера (SSRF, data race в Go TUI, утечка ключа через имена файлов, XSS/arbitrary navigation в Desktop App), 15 важных, 10 советов. CR11-009 признан invalid (go 1.26.5 существует). CR10-013 («*.log FIXED») признан ложно закрытым — лог по-прежнему в git.
- Суммарно открыто: **9 блокеров** (CR11-001..005 + CR12-001..004), **25 важных**, **17 советов**.
- Критический путь: 1) отозвать RuCaptcha-ключ (CR12-003), 2) SSRF (CR12-001), 3) data race (CR12-002), 4) XSS в desktop (CR12-004), 5) починить ESLint (CR12-006).
- Системная проблема: ревью фиксируются, но не исправляются — 12 раундов, 156+ замечаний, закрыто ~3. Нужен процесс triage, а не новые раунды.
