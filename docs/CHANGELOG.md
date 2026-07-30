# CourtDesk — CHANGELOG

Все значимые изменения фиксируются здесь в формате [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/).

---

## [Unreleased] — 2026-07-30

### CR12 — контрольный аудит (документация)

**Изменена только документация** (`docs/CODE_REVIEW.md`, `docs/CONTEXT.md`, `docs/CHANGELOG.md`). Код не менялся.

- Новый раунд CR12: 21 замечание (4 блокера, 15 важных, 10 советов) — см. `docs/CODE_REVIEW.md`.
- Новые блокеры: SSRF в `POST /api/cases?parse=true` (CR12-001), data race в Go TUI (CR12-002), утечка RuCaptcha-ключа через имена git-tracked .txt-файлов (CR12-003), XSS/arbitrary scheme navigation в Desktop App (CR12-004).
- Ревизия: CR11-009 закрыт как invalid (go1.26.5 — реальная версия); CR10-013 признан ложно закрытым (`logs/courtdesk.log` по-прежнему tracked).
- Сводка: 12 раундов, 156+ замечаний, открыто 9 блокеров / 25 важных / 17 советов.

---

## [0.7.0] — 2026-07-28

### Desktop App — миграция с Fyne на WebView

**Критическое изменение**: полный переход с Fyne (40 MB) на WebView (6 MB) для десктопного приложения.

**Причины миграции:**
- Размер бинарника: 40 MB (Fyne) → 6 MB (WebView) — в 7 раз меньше
- Рендеринг: Fyne OpenGL → нативный браузерный движок (WebView2/WebKitGTK/WKWebView)
- Переиспользование: 100% Web UI вместо дублирования кода
- Кроссплатформенность: упрощена сборка для Linux

**Технические детали:**
- Библиотека: `github.com/webview/webview_go`
- Windows: WebView2 (Edge Chromium, встроен в Windows 10/11)
- Linux: WebKitGTK (`libwebkit2gtk-4.0`)
- macOS: WKWebView (встроен)
- Размер: ~6 MB (без включения WebView runtime)

**Новые возможности:**
- Настраиваемый API URL (локальный/удалённый сервер)
- `Ctrl+,` — горячая клавиша для настроек
- Профиль в `~/.config/courtdesk/profile.json`
- Поддержка fullscreen режима (`-fullscreen` flag)
- Убрана блокирующая проверка API — приложение загружается даже без сервера

**Структура:**
```
packages/courtdesktop/
├── main.go              # ~200 строк (ранее ~2000 строк в 10 файлах с Fyne)
├── go.mod               # webview_go dependency
├── courtdesktop.exe     # Windows binary (6 MB)
└── IMPLEMENTATION.md    # Детальная документация
```

### Web UI — прогресс мониторинга

**Dashboard (`index.html`):**
- Добавлена панель прогресса при запуске мониторинга
- Список дел со статусами: ✓ (обработано), ✗ (ошибка), ○ (не обработано)
- Обновление каждые 5 секунд во время мониторинга
- Определение статуса по `updatedAt` vs время начала мониторинга

### Web UI — настраиваемый API URL

**Новая функция:**
- Поле "Сервер API" в настройках (⚙️)
- Сохранение в `localStorage['courtdesk-api-url']`
- Все API-запросы используют `apiUrl()` helper
- Перезагрузка страницы после изменения URL

**Затронутые файлы:**
- `packages/viewer/public/app.js` — добавлены `getApiBase()`, `setApiBase()`, `apiUrl()`
- `packages/viewer/public/index.html` — поле URL в настройках, все fetch вызовы обёрнуты в `apiUrl()`
- `packages/viewer/public/search.html` — все fetch вызовы обёрнуты в `apiUrl()`
- `packages/viewer/public/terminal.js` — все fetch вызовы обёрнуты в `apiUrl()`

### Web UI — открытие дела по всей строке

**Dashboard (`index.html`):**
- Клик по любой ячейке строки открывает карточку дела (кроме иконок действий)
- Добавлен `cursor: pointer` и hover-эффект

**Terminal view (`terminal.js`):**
- Двойной клик по строке открывает карточку дела
- Одинарный клик выделяет строку (существующее поведение)

---

## [0.6.0] — 2026-07-27

### Web UI — Terminal view (новый layout)

Добавлен второй layout для работы с таблицей дел — **не закрывает гэпы PROMPT_WEBUI**, а даёт альтернативную поверхность.

**`packages/viewer/public/terminal.html` + `terminal.js`:**

- **Sticky cmd-bar**: индикатор режима (`▸ Обычный/Поиск/Команда`), поле ввода для `/поиск` и `:команда`.
- **Sticky thead + full-scroll**: пагинации нет (terminal-конвенция), `thead` прилипает.
- **Multi-sort**: `click` — основная колонка, `Shift+click` — до 3-х уровней, ● ▲ ▼ индикаторы.
- **Vim-навигация**: `j/k` (строки), `g g` / `G` (в начало/конец), `Ctrl+D`/`Ctrl+U` (полстраницы).
- **Hotkeys**: `Enter` (деталь), `a` (архив/возврат), `d` (удаление с confirm), `r` (refresh), `m` (прогон), `n` (поиск), `?` (help), `1-7` (фильтры), `` ` `` (toggle лога), `q` (закрыть модалку).
- **Режимы**: `Обычный` (default) / `Поиск` (по `/`) / `Команда` (по `:`). Escape сбрасывает.
- **Saved views**: `:сохр ИМЯ`, `:прим ИМЯ`, `:сп` (список), `:удал ИМЯ` — хранятся в `localStorage['courtdesk-views']`, захватывают filter+sort+search. Англ. алиасы `sv/uv/lv/rv` оставлены для muscle memory.
- **Statusline по tmux**: `режим · дела:N/M · фильтр · сорт · повтор · расп · прогон · выбор · время`.
- **Лог-сайдбар** уведомлений: с правой колонки, префиксы `+ ★ ◎ ✗ ○` по типу, `` ` `` сворачивает.
- **Detail modal** переиспользует разметку dashboard (суд/участники/движение/timeline), добавлена кнопка «Закрыть (q)».
- **Help-карточка** доступна по `?`: 27 hotkeys, 5 групп.
- **Скриншоты**: smoke-test через Playwright (DOM-снимки), скриншоты не сохранялись (модель без image input).

### Web UI — Skins (новая ось оформления)

Ортогонально существующей оси `data-theme` (dark/light) добавлена ось `data-skin` (corporate/«Бумага»/compact). 3 × 2 = 6 комбинаций.

**`theme.css`:**

- **`data-skin="corporate"`** (default, «Стандарт») — текущий slate-blue, system-ui, radius 10px. Без изменений по поведению.
- **`data-skin="legal"`** («Бумага») — тёмно-navy `#1a1f2a` / светлый paper `#eef1f6`, navy primary `#6f9bd1`/`#244e8c`, flat без gradient, radius 4px. **Предыдущая коричневая sepia-палитра с Georgia serif — удалена** (критика заказчика).
- **`data-skin="compact"`** («Компактный») — carbon-teal, плотность −20% (padding/font), radius 3px, flat primary без gradient.

**Косметика (по критике заказчика):**

- **Убраны КАПС**: все `text-transform: uppercase` в terminal (5 мест: th, log-header, info-key, sub, help-group). Текущий dashboard/search капсов не имел.
- **Английский → русский**: statusline (`cases`→`дела`, `filter`→`фильтр`, `sort`→`сорт`, `retry`→`повтор`, `cron`→`расп`, `scan`→`прогон`, `sel`→`выбор`), короткие статусы `Мон/Ож/Реш/Вст/Ош/Арх` вместо `MON/WAI/DEC/ENF/ERR/ARC`, mode `Обычный/Поиск/Команда`, `NOTIFICATIONS`→`Уведомления`, команды `:сохр/:прим/:сп/:удал/:прогон/:обновить` (англ. алиасы оставлены).
- **Шрифты**: `--skin-mono` → `--skin-tabular` со значением **sans-serif** (system-ui + Helvetica Neue). Архичного моноширинного Companion/Menlo/Courier больше нет. Глобально `font-variant-numeric: tabular-nums lining-nums` — цифры не «прыгают».

**`app.js`:**

- `initSkin()/setSkin()/toggleSkinMenu()`, реестр `SKINS` с описаниями и swatch-превью в dropdown.
- Close-on-outside-click, Escape закрывает меню и подробные модалки.
- Bootstrap: `initTheme()` + `initSkin()` вызываются при загрузке.

**`index.html` / `search.html`:**

- Skin-switcher 🎨 в nav рядом с theme-toggle.
- Ссылка «Терминал» в nav.
- Inline `_t()` применяет `data-skin` + `data-theme` из localStorage до загрузки CSS (анти-FOUC).
- Жёсткие `border-radius:` в inline-стилях заменены на `var(--skin-radius-*)` — теперь скин полностью управляет углами.
- `var(--skin-mono)` (если встречался) → `var(--skin-tabular)`.

### Что НЕ вошло (PROMPT_WEBUI.md гэпы)

15 пунктов из PROMPT_WEBUI.md, описанных как приоритетные, **не реализованы**. Открыты как `WEBUI-O1..O15` в CONTEXT.md:

- **WEBUI-O1** Skeleton-загрузчики (таблица/карточки прыгают)
- **WEBUI-O2** Мобильная адаптация (search.html ломается на мобилках)
- **WEBUI-O3** Дашборд «требует внимания» (decision + enforcedToday) — отдельного блока нет
- **WEBUI-O4** Карточка дела перегружена (мегапростыня court/parties/events/timeline) — вкладки/аккордеон не сделаны
- **WEBUI-O5** Календарь/список ближайших дат по `legalForceDate` — нет
- **WEBUI-O6** Массовые операции (чекбоксы → bulk archive/delete) — нет
- **WEBUI-O7** Экспорт таблицы в CSV — нет
- **WEBUI-O8** Визуальный progress bar — в dashboard остался текстовый (в terminal — есть)
- **WEBUI-O9** Фильтр по `userId` — API поддерживает, UI не передаёт
- **WEBUI-O10** Вынос JS из HTML в `dashboard.js`/`search.js` — index/search остались инлайн (terminal.js вынесен — это был greenfield)
- **WEBUI-O11** Retry + нормальные сообщения при сетевых ошибках — нет
- **WEBUI-O12** Кэширование `loadDashboard()` при переключении вкладок — нет
- **WEBUI-O13** Сохранение истории поисков между reload — нет
- **WEBUI-O14** Массовое добавление результатов поиска в мониторинг — нет
- **WEBUI-O15** Параллельные layout-варианты Kanban (drag&drop по статусу) и Calendar (по датам) — не начаты

### Архитектурное замечание

Terminal + Skins — это **добавление новых поверхностей**, не закрытие гэпов. Skin ≠ layout: skin затрагивает только палитру/шрифт/радиус/плотность, ничего не меняя в структуре. Terminal — отдельный layout поверх того же набора эндпоинтов. Решение «3 варианта оформления» трактовано первым проходом как «3 skin × 2 темы», что **не равно** «3 варианта UX-паттернов» (Terminal/Kanban/Calendar). Последний — `WEBUI-O15`.

### Infra

- `npx tsc --noEmit` — 0 ошибок (frontend не проверяется, только `packages/`).
- `npm test` — 94/94 ✓ (без изменений).
- JS-синтаксис `app.js`/`terminal.js` — `node --check` ✓.

---

## [0.5.2] — 2026-07-26

### TUI — полный разворот архитектуры

- **Отказ от blessed / neo-blessed:** TUI полностью переписан на чистый Node.js (`readline` + ANSI), без внешних TUI-зависимостей.
- **Удалены зависимости:** `neo-blessed`, `neo-blessed-contrib`, `blessed`, `@types/blessed` удалены из `package.json`.
- **Причина:** стек blessed/neo-blessed оказался архитектурно тупиковым: проблемы Windows ConPTY, отсутствие нормального рендера тегов в list, нестабильное поведение карточек и клавиатуры.
- **Коммиты:**
  - `885224d` — удалены `neo-blessed` / `neo-blessed-contrib`, версия поднята до `0.5.1`
  - `bf9096e` — полный rewrite TUI на `readline` + ANSI
  - `2e1c1c6` — удалены `blessed` и `@types/blessed`

### TUI — исправления UX и структуры

- **Карточка дела переработана под администратора:**
  - убраны технические UUID/УИД из основной карточки,
  - показаны только человекочитаемые поля: номер дела, суд, статус, результат, дата вступления в силу, дата добавления, последняя проверка,
  - ISO-таймстампы заменены на `DD.MM.YYYY` / `DD.MM.YYYY HH:MM`.
- **Исправлен баг двойного статуса:** `monitoringmonitoring` / `enforcedenforced` больше не выводятся; статус рендерится один раз, человекочитаемым русским текстом.
- **Исправлена detail-card layout:** выравнивание меток, перенос длинных строк и URL, очистка хвостовых пустых строк, корректный separator.
- **Добавлен run log во вкладке «ЗАПУСК»:** теперь есть явное состояние `выполняется`, лог завершения/ошибки, блокировка повторного запуска во время активного run.
- **Добавлены/исправлены клавиши:** `↑↓`, `PageUp/PageDown`, `Home/End`, `Enter`, `Esc`, `1/2`, `F4/F5/F6`, `q`, `Ctrl+C`, `Ctrl+D`.
- **Коммиты:**
  - `52fcc40` — выравнивание detail card, перенос URL, cleanup пустых строк, separator width
  - `626ffae` — человекочитаемая карточка, форматирование дат, удаление UUID из UI, рабочая вкладка запуска

### TUI — что именно сломано было и почему

- Blessed-ветка не просто «выглядела плохо», а была системно непригодна:
  - `tags: true` в списках не давал цветной рендер, теги отображались как текст,
  - карточка не обновлялась корректно при refresh,
  - ручной ANSI конфликтовал с internal cursor handling,
  - `setInterval` не чистился,
  - размеры колонок были захардкожены,
  - на Windows поведение было нестабильным.
- Даже после частичных CR10-фиксов blessed оставался тупиком, поэтому решение зафиксировано как **полный отказ от blessed**, а не «ещё одна серия патчей».

### Dependency / security

- Источник `npm audit`-алертов локализован: уязвимости тянулись через старые TUI-зависимости (`neo-blessed*`).
- После удаления TUI-зависимостей класс проблем по этой ветке устранён.
- Версия проекта поднята с `0.5.0` до `0.5.1`, далее фактическое состояние документации соответствует ветке после TUI rewrite (условно `0.5.2-doc-state`).

### Документация

- Полностью обновлены `CHANGELOG.md`, `CODE_REVIEW.md`, `CONTEXT.md`.
- Зафиксированы:
  - хронология TUI rewrite,
  - реальные ошибки UX/UI,
  - исправления detail card,
  - причины отказа от technical identifiers в интерфейсе,
  - текущие open-проблемы после rewrite.

---

## [0.5.1] — 2026-07-26

### Dependency cleanup

- Удалены `neo-blessed` и `neo-blessed-contrib` — источник уязвимостей в `npm audit`.
- Версия поднята до `0.5.1`.

---

## [0.5.0] — 2026-07-26

### msudrf — полностью переписан

- **Новая архитектура AJAX-поиска:** msudrf не поддерживает GET-формы (как sudrf). Поиск через JS/AJAX. Капча (`kcaptchaForm`) решается один раз на сессию. Результаты в `<div id="search_results">`.
- **`fetchMsudrfSearch()`** (`captcha/session.ts`) — отдельная функция для AJAX-пайплайна: открыть страницу → решить капчу (с retry) → заполнить поля → клик «Искать» → дождаться `#search_results`. Не переиспользует `fetchWithCaptcha`.
- **`search/adapters/magistrate.ts`** — переписан полностью. Использует `fetchMsudrfSearch()`, парсит 5-колоночную таблицу msudrf (№ дела | Категория/Лица | Судья | Дата решения | Решение). Участники извлекаются из колонки «Категория/Лица» через regex (ИСТЕЦ/ОТВЕТЧИК).
- **Таблица msudrf (5 колонок):** № дела | Категория/Лица | Судья | Дата решения | Решение. Отличается от sudrf (7 колонок: № дела | Дата поступления | Категория | Судья | Дата решения | Результат | Вступление).
- **TLS:** `rejectUnauthorized: false` для `https.get` в orchestrator и синхронном парсинге (msudrf требует игнорирования TLS-ошибок).

### UI

- **Убран КАПС:** `theme.css` — все КАПС-селекторы и переменные заменены на нормальный регистр. `index.html`, `search.html` — текст КАПС заменён.
- **Название суда вместо домена:** `GET /api/cases` и `GET /api/cases/:uid` обогащают ответ полем `courtName` через `findCourtByCodeOrSubdomain()`. Дашборд: колонка «Суд» отображает название, а не subdomain. Поиск по таблице включает `courtName`.
- **Прогресс-бар мониторинга:** новый эндпоинт `GET /api/parse/progress`, модуль `core/progress.ts`. Дашборд: поллинг прогресса каждые 5с, отображение `processed/total (errors)`, скрытие при завершении.
- **Настройки расписания:** модалка в `index.html` с полями: время полного прогона, интервал retry, stale-порог, вкл/выкл. Эндпоинты `GET/PUT /api/settings`.

### Синхронный парсинг при добавлении

- `POST /api/cases?parse=true` (или `body.parse`) — парсинг карточки сразу после добавления дела.
- Результат возвращается в теле ответа (`card`).
- Использует `https.get` с `rejectUnauthorized: false`, при капче — Puppeteer.
- Если парсинг упал — дело всё равно добавлено, ошибка в `parseError`.

### Счётчик ошибок

- `WatchedCase` получил `errorCount: number` и `lastError: string | null`.
- `PATCH_ALLOWED` включает эти поля.
- `orchestrator.ts`: при ошибке пишет `errorCount+1` и `lastError`, при успехе сбрасывает.

### Party matching (CR6-005 — закрыт)

- `matchParty(party, resultParties): number` — скоринг совпадения имён (100 = точное, 90 = startsWith, фамилия+слова).
- `pickBestMatch(results, party): SearchResult | null` — выбор лучшего по score.
- `processWaiting` использует `pickBestMatch` вместо `results[0]`.

### Infra

- **eslint + @typescript-eslint (CR5-009 — закрыт):** `eslint.config.js` (flat config, ESM). Правила: `no-console: warn`, `@typescript-eslint/no-unused-vars`, `@typescript-eslint/no-explicit-any`, `prefer-const`, `no-var`.
- **pino (CR5-011 — закрыт):** `core/logger.ts` — pino с dual-transport (файл `logs/courtdesk.log` + stdout), ISO-таймстампы. `log()` и `logRequest()` функции. Express-логи через `logRequest`.
- **Node engine:** `>=22.0.0` (было `>=20.6.0`). CR7-008 закрыт.

### Cron-планировщик

- `packages/scheduler/cron.ts` — `startCron()` проверяет каждые 60с, запускает `runFull()` по расписанию и `runRetry()` по интервалу.
- `stopCron()` — остановка.
- `server.ts` — автостарт `startCron()` при запуске.
- Настройки: `scheduleFull`, `retryIntervalHours`, `retryStaleHours`, `scheduleEnabled` — через UI и `PUT /api/settings`.

### API

- **23 эндпоинта**:
  - `GET /api/parse/progress` — прогресс мониторинга
  - `GET /api/settings` — настройки расписания
  - `PUT /api/settings` — сохранить настройки
  - `POST /api/cases?parse=true` — синхронный парсинг

### Tech-debt закрыто

| ID | Описание | Решение |
|----|----------|---------|
| CR5-009 | Нет eslint | eslint.config.js (flat config) |
| CR5-011 | console.log вместо pino | pino structured logging |
| CR6-005 | waiting → results[0] без матчинга | pickBestMatch + matchParty |
| CR7-008 | `process.loadEnvFile()` требует Node ≥21 | engine >=22.0.0 |

---

## [0.4.0] — 2026-07-25

### CR6 — Security & Data Integrity (20 замечаний)

#### Fixed (CRITICAL)

- **CR6-001**: `readJson` при коррупции файла бэкапит в `.corrupt.<ts>` и бросает ошибку вместо silent-wipe (`store/json-store.ts`)
- **CR6-002**: `assertCourtUrl()` — allowlist `*.sudrf.ru` / `*.msudrf.ru`, https-only. Применён в `/api/parse/url` и `orchestrator.fetchHtml`. Блок SSRF (`file://`, `localhost`, cloud metadata) (`core/errors.ts`, `api/routes/parse.ts`, `scheduler/orchestrator.ts`)
- **CR6-004**: Re-check `archived` перед финальным `updateCase` — если дело заархивировано во время async-обработки, пишется только `lastChecked`, изменения статуса отбрасываются (`scheduler/orchestrator.ts`)
- **CR6-006**: `status: 'error'` сбрасывается в `'monitoring'` при успешном `processOne` — error-дела больше не крутятся вечно (`scheduler/orchestrator.ts`)

#### Fixed (HIGH)

- **CR6-007**: `search.html` — исправлены API-пути (`/api/search/by-number`, `/api/search/by-party`) и unwrap (`data.data.results`). Страница поиска восстановлена (`viewer/public/search.html`)
- **CR6-008**: Удалён дублирующий `GET /api/status` из `health.ts` — `status.ts` больше не тенится (`api/routes/health.ts`)
- **CR6-009**: Удалён дублирующий `POST /api/resolve` из `search.ts` — `resolve.ts` (URL builder) работает корректно (`api/routes/search.ts`)
- **CR6-013**: `_isRunning = true` перемещён до `res.status(202)` — устранён TOCTOU в guard (`api/routes/parse.ts`)
- **CR6-016**: `DELETE /api/cases/:uid` теперь каскадно чистит events и notifications (`api/routes/cases.ts`, `store/notifications.ts`)

---

## [0.3.0] — 2026-07-22

### Added
- CORS middleware, graceful shutdown, GET /api/courts без q=, shared fetchHtml/parseResults
- Batch updateCase, persistent notifications, magistrate search refactor
- Viewer dashboard (UC-0), SEARCH_PARAMS constants
- CODE_REVIEW4.md, CODE_REVIEW5.md, BUG_REPORT.md

---

## [0.2.0] — 2026-07-22

### Added
- Дашборд UC-0, /api/status, /api/notifications, persistent notifications, POST /api/resolve

---

## [0.1.0] — 2026-07-21

### Added
- Модульная структура packages/: api, core, store, scheduler, search, parse, captcha, intake, viewer
- REST API: 15 эндпоинтов, JSON-хранилище с tmp+rename, in-memory кэш
- PATCH-whitelist, deleteCase guard, runNew через searchByParty
- 202 Accepted для parse/run, статический import iconv, rate limit
- 57 unit/smoke тестов, Apache 2.0
