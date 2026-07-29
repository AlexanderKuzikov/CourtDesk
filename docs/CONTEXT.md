# CourtDesk — CONTEXT
> CRM-система поиска и мониторинга судебных дел РФ.
> Единый сервис для интеграции с 1С, Web UI и Desktop App на Go+WebView.
> Собирается из CourtSniffer (поиск), CourtFlow (мониторинг) и существующего скелета CourtDesk.

---

## Статус

**v0.7.0** — Desktop App на Go+WebView (6 MB). Использует существующий Web UI через WebView2. Поддержка настраиваемого API URL (локальный/удалённый сервер). Web UI: прогресс мониторинга с индикацией статуса дел. API покрыт тестами на 94 теста (все эндпоинты).

| Компонент | Статус | Последнее изменение |
|-----------|--------|---------------------|
| Архитектура | ✅ Утверждена | docs/ARCHITECTURE.md |
| API-контракты | ✅ 25 эндпоинтов | docs/CRM-INTEGRATION.md |
| Core (типы) | ✅ errorCount, lastError, enforcedAt | 2026-07-26 |
| Security (URL allowlist) | ✅ assertCourtUrl | CR6-002 |
| Store integrity | ✅ corrupt backup + throw | CR6-001 |
| Captcha | ✅ msudrf AJAX + sudrf form | 2026-07-26 |
| Search | ✅ msudrf переписан (AJAX) | 2026-07-26 |
| Parse | ✅ sync parse при добавлении | 2026-07-26 |
| Scheduler | ✅ cron + double-fire guard | 2026-07-26 |
| Store | ✅ каскадное удаление + settings | CR6-016 |
| API | ✅ 25 эндпоинтов, static imports | 2026-07-27 |
| Viewer (Dashboard) | ⚠️ см. Web UI open-проблемы | 2026-07-28 |
| Viewer (Search) | ⚠️ см. Web UI open-проблемы | 2026-07-28 |
| Viewer (Terminal) | ✅ добавлен — `/terminal.html` Bloomberg-style | 2026-07-27 |
| Viewer (Skins) | ✅ 3 skin × 5 themes, переключатель 🎨 | 2026-07-28 |
| Court Hierarchy | ✅ CR9 закрыт | 2026-07-25 |
| Party Matching | ✅ pickBestMatch | 2026-07-26 |
| eslint | ✅ flat config | 2026-07-26 |
| pino | ✅ structured logging | 2026-07-26 |
| Dependency audit | ✅ TUI-vuln ветка удалена | 2026-07-26 |
| TUI (Node, deprecated) | ✅ readline+ANSI | 2026-07-26 |
| TUI (Go, актуальный) | 🆕 Bubble Tea — Win32 API, стабильно | 2026-07-27 |
| Desktop App (Go+WebView) | 🆕 v0.7.0 — WebView2, 6 MB, настраиваемый API URL | 2026-07-28 |
| API tests | ✅ 94 тестов, покрытие всех эндпоинтов | 2026-07-27 |
| Docs | ✅ docs/ почищен, CRM-INTEGRATION обновлён | 2026-07-27 |

---

## Desktop App — текущее состояние

**v0.7.0** — Нативное десктопное приложение на Go+WebView (6 MB).

**Архитектура:**
- Go binary с `github.com/webview/webview_go`
- WebView2 на Windows (Edge Chromium, встроен в Windows 10/11)
- WebKitGTK на Linux (`libwebkit2gtk-4.0`)
- WKWebView на macOS (встроен)
- Использует существующий Node.js API сервер и Web UI

**Возможности:**
- Нативное окно 1920×1080 (или fullscreen)
- Настраиваемый API URL (локальный/удалённый сервер)
- `Ctrl+,` — настройки (API URL, тема)
- Профиль в `~/.config/courtdesk/profile.json`
- 100% переиспользование Web UI (Dashboard, Terminal, Search, Skins)

**Преимущества перед Fyne:**
- 6 MB vs 40 MB (в 7 раз меньше)
- Нативный браузерный движок vs Fyne OpenGL
- Переиспользование Web UI vs дублирование
- Простая кроссплатформенная сборка

**История миграции:**
- v0.6.0: Fyne (40 MB, проблемы с UI и cross-compile)
- v0.7.0: WebView (6 MB, нативный рендеринг, настраиваемый сервер)

См. [`packages/courtdesktop/IMPLEMENTATION.md`](../packages/courtdesktop/IMPLEMENTATION.md) для деталей.

---

## Web UI — текущее состояние

В `packages/viewer/public/` — vanilla JS, без бандлера. **Backend (API, store, scheduler) НЕ трогается**.

**Сделано в v0.6.0:**

| Файл | Что | Назначение |
|------|-----|-----------|
| `terminal.html` + `terminal.js` |Terminal view (Bloomberg-style): sticky cmd-bar, sticky thead, multi-sort (Shift+click), full-scroll, vim-навигация (j/k/gg/G/C-d/C-u), hotkeys (Enter/a/d/r/m/n/?/1-7/`/), режимы (Обычный/Поиск/Команда), saved views (`:сохр/:прим/:сп/:удал`), лог-сайдбар уведомлений, statusline по tmux | Альтернативный layout для плотной работы с таблицей дел |
| `theme.css` | Skin-axis ортогонально `data-theme`: 3 skin (corporate/«Бумага»/compact) × 2 темы. Новые `--skin-*` переменные (font, radius, padding). `--skin-mono` переименован в `--skin-tabular` (sans-serif + `tabular-nums lining-nums` — без «прыгающих» цифр) | Масштабируемость оформления без layout-правок |
| `app.js` | `initSkin()/setSkin()/toggleSkinMenu()`, реестр SKINS с описаниями+swatch, close-on-outside, Esc-закрытие | Косметический переключатель |
| `index.html` `search.html` | Добавлен skin-switcher 🎨 в nav, ссылка «Терминал», inline `_t()` применяет skin до CSS (анти-FOUC) | Внесение terminal+skins в существующие страницы |

**Skin варианты (ось `data-skin`, ортогональная `data-theme`):**

| Skin | Имя | Характер |
|------|-----|----------|
| `corporate` (default) | Стандарт | slate-blue, system-ui, radius 10px |
| `legal` | Бумага | тёмно-navy/светлый paper, navy акцент `#6f9bd1`/`#244e8c`, flat (без gradient), radius 4px |
| `compact` | Компактный | carbon-teal, плотность −20% (padding/font), радиус 3px |

> Skin ≠ layout. Skin затрагивает только палитру/шрифт/радиус/плотность. Terminal — отдельный layout поверх того же API.

**Web UI open-проблемы (PROMPT_WEBUI.md — НЕ закрыты):**

| ID | Приоритет | Пункт PROMPT_WEBUI | Где |
|----|-----------|-------------------|-----|
| WEBUI-O1 | HIGH | Skeleton-загрузчики (прыгают таблица/карточки) | index/search |
| WEBUI-O2 | HIGH | Мобильная адаптация (search.html ломается) | index/search |
| WEBUI-O3 | HIGH | Дашборд «требует внимания» (decision+enforcedToday блок) | index |
| WEBUI-O4 | HIGH | Карточка дела: вкладки/аккордеон вместо мегапростыни | terminal+index |
| WEBUI-O5 | HIGH | Календарь по `legalForceDate` + список ближайших 7 дней | новый экран |
| WEBUI-O6 | MED | Массовые операции (чекбоксы → bulk archive/delete) | index/terminal |
| WEBUI-O7 | MED | Экспорт таблицы в CSV | index/terminal |
| WEBUI-O8 | MED | Визуальный progress bar (не текстовый `5/50`) | index (в terminal — есть) |
| WEBUI-O9 | MED | Фильтр по `userId` (API поддерживает, UI не передаёт) | index/search |
| WEBUI-O10 | MED | Вынос JS из HTML → `dashboard.js`/`search.js` | index/search |
| WEBUI-O11 | MED | Retry + нормальные сообщения при сетевых ошибках | index/search/terminal |
| WEBUI-O12 | LOW | Кэширование `loadDashboard()` при переключении вкладок | index |
| WEBUI-O13 | LOW | Сохранение истории поисков между reload | search |
| WEBUI-O14 | LOW | Массовое добавление результатов поиска в мониторинг | search |
| WEBUI-O15 | LOW | Параллельный дизайн: Kanban (drag&drop колонок по статусу) и Calendar — отдельные layout рядом с Terminal/Dashboard | новые экраны |

> Terminal + Skins = **новые поверхности**. PROMPT_WEBUI гэпы (O1–O14) требуют доработки существующих экранов. O15 — следующая ось layout-вариантов (см. PROMPT_WEBUI «Вариант B/C»).

---

## TUI — текущее состояние

**v0.5.1 — `packages/tui/` (Node.js, deprecated):** Чистый Node.js (`readline` + ANSI), 0 внешних TUI-зависимостей. Работает, но статус-бар не прибивается к низу на Windows, курсор (selection) не на всю строку, alt-screen нестабилен.

**v0.7.0 — `packages/tui-go/` (Go, актуальный):** Go-бинарник на Bubble Tea. Работает напрямую через Win32 API (без ConPTY), alt-screen из коробки, курсор на всю строку, статус-бар внизу, F-keys, resize. На Linux работает через ANSI (crossterm). Один .exe без зависимостей.

Текущее состояние TUI (Go): список дел, детали + события, добавление/удаление, прогон (full/retry/new), уведомления, фильтр по номеру/суду/статусу.

---

## Go UI — архитектура (plan)

### Концепция

CourtDesk UI переходит на Go как единую платформу для двух интерфейсов:

| Режим | Команда | Назначение |
|-------|---------|------------|
| **Web-сервер** | `courtdesk-ui` | HTTP-сервер, отдаёт статику + админский Web UI |
| **TUI** | `courtdesk-ui --tui` | Alt-screen TUI (Bubble Tea) для SSH/терминала без браузера |

**Принципы:**

- Go-бинарник — **клиент** к существующему Node.js API (http://127.0.0.1:8767/api). Бэкенд не трогается.
- Один исходный код на Go — общая бизнес-логика (списки, детали, управление) между Web и TUI.
- `go:embed` — HTML/CSS/JS статика внутри бинарника, второй процесс не нужен.
- Порт по умолчанию: `8768` (не конфликтует с API :8767).

### Что входит (база)

- **Web UI:** `/` — дашборд, `/search` — поиск, `/settings` — настройки. Возврат к vanilla HTML+JS (как в `packages/viewer/public/`) или `html/template` + htmx.
- **TUI:** список дел, детали + события, добавление/удаление, прогон (full/retry/new), уведомления, фильтр.
- **Один .exe** — кроссплатформенный (Windows/Linux), без зависимостей, 7 MB.

### Отношение к существующему Node.js Web UI

Существующий `packages/viewer/public/` (vanilla JS, Terminal layout, Skins) **остаётся** как фронтенд к Node API (:8767).
Go-бинарник — **альтернативный** UI, в первую очередь для администрирования по SSH, во вторую — лёгкий Web UI без Node.js на сервере.

---

## Актуальные open-проблемы

| ID | Приоритет | Описание | Заметка |
|----|-----------|----------|---------|
| CR11-001 | BLOCKER | CORS wildcard + нет аутентификации API | любой сайт может управлять делами |
| CR11-002 | BLOCKER | `rejectUnauthorized: false` на всех HTTPS | MITM на трафике к sudrf.ru |
| CR11-003 | BLOCKER | Race condition в store (read-modify-write) | параллельные запросы теряют данные |
| CR11-004 | BLOCKER | Бинарники в git (~20 MB) | courtdesktop.exe, tui-go .exe |
| CR11-005 | BLOCKER | `_isRunning` guard неатомарен + cron параллелизм | двойные прогоны |
| CR11-006 | HIGH | Нет тестов для parse/search/captcha (~40% кода) | snapshot-тесты на фикстурах |
| CR11-007 | HIGH | Дублирование fetchHtml (search vs scheduler) | вынести в core/http.ts |
| CR11-008 | MED | Версия health API (0.4.0) ≠ package.json (0.5.1) ≠ README (0.7.0) | |
| CR11-009 | MED | `go 1.26.5` в tui-go/go.mod — несуществующая версия | |
| CR11-010 | MED | Мёртвые зависимости: react, ink, @types/react | |
| CR11-011 | MED | POST /api/cases?parse=true — синхронный парсинг до 2 мин | |
| CR11-012 | LOW | console.log результата капчи в rucaptcha.ts | |
| CR11-013 | LOW | Мусорные файлы в корне (txt, PROMPT_WEBUI.md) | |
| CR11-014 | LOW | showError в Go desktop не вызывается | |
| CR11-015 | MED | Два TUI (TS + Go) дублируют функциональность | |
| WEBUI-O1..O15 | HIGH/MED | 15 гэпов из PROMPT_WEBUI.md — все не закрыты | см. «Web UI open-проблемы» выше |
| TUI-O1 | HIGH | Run tab без live progress polling | log есть, progress bar нет |
| GOUI-O1 | HIGH | TUI (Go) требует кардинальной доработки UI | курсор, цвета, скролл, прокрутка |
| GOUI-O2 | MED | Web-режим (--serve) не реализован | только TUI пока |
| GOUI-O3 | MED | Go-бинарник не использует go:embed | статика отдельно |
| GOUI-O4 | LOW | Нет автозапуска API при старте Go-бинарника | сейчас требует npm start |
| API-O1 | MEDIUM | Puppeteer без очереди при bulk sync parse | нужен `p-limit`/очередь |
| SEC-O1 | MEDIUM | Zero-auth API | ⏸ отложено — решение 2026-07-27 |
| INFRA-O1 | LOW | Monorepo без workspaces | нет изоляции пакетов |
| TEST-O1 | MEDIUM | Нет regression-тестов для TUI/UI | высокий риск регрессий |
| TEST-O2 | LOW | Нет UI-тестов (Playwright есть в dep, smoke-тестов 0) | terminal.js/dashboard/search без автоматизации |
| TEST-O3 | LOW | Нет тестов для Go-бинарника | go test — 0 файлов |

---

## API-покрытие

**94 теста (16 файлов).** Полное покрытие эндпоинтов:

| Файл | Эндпоинты |
|------|-----------|
| `api/routes/health.test.ts` | GET /api/health |
| `api/routes/status.test.ts` | GET /api/status, GET/PATCH /api/notifications |
| `api/routes/cases.test.ts` | GET /api/cases, /stats, /:uid, /:uid/events, /:uid/card, POST /api/cases, PATCH, DELETE, POST /api/cases/wait |
| `api/routes/search.test.ts` | POST /api/search/by-number, by-party, by-case-uid |
| `api/routes/resolve.test.ts` | POST /api/resolve |
| `api/routes/parse.run.test.ts` | POST /api/parse/run |
| `api/routes/parse.url.test.ts` | POST /api/parse/url |
| `api/routes/progress.test.ts` | GET /api/parse/progress |
| `api/routes/settings.test.ts` | GET/PUT /api/settings |
| `api/routes/courts.test.ts` | GET /api/courts, /api/courts/:id |
| `api/routes/intake.test.ts` | POST /api/intake |
| `store/*.test.ts` | store layer (cases, notifications) |
| `intake/classify.test.ts` | classify() unit |
| `scheduler/*.test.ts` | orchestrator, runNew |

---

## Журнал работ

| Дата | Изменение |
|------|-----------|
| 2026-07-21 .. 2026-07-25 | CR1–CR9: security, search, parse, hierarchy, UI, store integrity |
| 2026-07-26 | v0.5.0: msudrf AJAX rewrite, progress API, settings, sync parse, party matching, eslint, pino |
| 2026-07-26 | CR10: TUI rewrite, blessed удалён |
| 2026-07-27 | **docs/ почищен**: удалены DISCUSSION-1C/*, DISCUSSION-LAWYER/*, WEBUI-FOR-LAWYER/*, CRM-INTEGRATION.docx/html/pdf, convert_to_docx.py, convert_to_pdf.mjs. Оставлены только Captcha-SudRF.html, Search-MSudRF.html, CRM-INTEGRATION.md. |
| 2026-07-27 | **API тесты**: 57→94 тестов. Добавлены health, search, courts, intake, settings, progress, расширены cases. |
| 2026-07-27 | **docs/CRM-INTEGRATION.md**: обновлён под v0.5.2 — 25 эндпоинтов, новые поля (errorCount, lastError, enforcedAt, courtName), sync parse, примеры. |
| 2026-07-27 | **docs migration**: ARCHITECTURE.md, BUG_REPORT.md, CHANGELOG.md, CODE_REVIEW.md, CONTEXT.md, DECISIONS.md перемещены в docs/. |
| 2026-07-27 | **SEC-O1 отложен**: API auth не делаем. Решение зафиксировано в CONTEXT.md. |
| 2026-07-27 | **v0.6.0 Web UI — Terminal + Skins**: новый layout `terminal.html` + `terminal.js` (Bloomberg-style, vim-keys, multi-sort, saved views, statusline). Skin-axis в `theme.css` — 3 варианта оформления (corporate/Бумага/compact) ортогонально `data-theme`. `app.js` — skin-switcher с реестром и swatch. `index.html`/`search.html` — inline `_t()` от FOUC, ссылка «Терминал» в nav. **Гэпы PROMPT_WEBUI.md (O1-O15) НЕ закрыты** — открыты как WEBUI-O1..O15. |
| 2026-07-27 | **Go TUI (v0.7.0)**: `packages/tui-go/` — Go-бинарник на Bubble Tea. Отказ от Node.js для UI (Ink/ConPTY нестабильны на Windows). Работает через Win32 API напрямую, статус-бар внизу, alt-screen, F-keys. Список дел, детали+события, добавление/удаление, прогон, уведомления, фильтр. Кроссплатформенная компиляция (win/linux), 7 MB .exe. |
| 2026-07-27 | **Решение: Go — UI-платформа**: TUI-прототип подтвердил стабильность. Планируется единый Go-бинарник для Web UI (`courtdesk-ui`) и TUI (`--tui`). Node.js бэкенд не трогается. Решение зафиксировано в docs/CONTEXT.md и docs/DECISIONS.md. |
| 2026-07-28 | **v0.7.0 Desktop App — миграция на WebView**: полный переход с Fyne (40 MB) на WebView (6 MB). Библиотека `github.com/webview/webview_go`. WebView2 на Windows, WebKitGTK на Linux, WKWebView на macOS. Удалены все Fyne-компоненты (`internal/ui/*.go`, `internal/client/*.go`). Добавлена поддержка настраиваемого API URL (локальный/удалённый сервер). Убрана блокирующая проверка API — приложение загружается даже без сервера. |
| 2026-07-28 | **Web UI — настраиваемый API URL**: добавлены `getApiBase()`, `setApiBase()`, `apiUrl()` в `app.js`. Все fetch-вызовы в `index.html`, `search.html`, `terminal.js` обёрнуты в `apiUrl()`. Добавлено поле "Сервер API" в настройки. Сохранение в `localStorage['courtdesk-api-url']`. |
| 2026-07-28 | **Web UI — прогресс мониторинга**: добавлена панель прогресса в dashboard. Список дел со статусами (✓/✗/○) определяется по `updatedAt` vs время начала мониторинга. Обновление каждые 5 секунд. |
| 2026-07-28 | **Web UI — открытие дела по строке**: dashboard — клик по всей строке открывает карточку. terminal — двойной клик по строке открывает карточку. |
| 2026-07-29 | **CR11 — полный аудит** (OpenCode Go, qwen3.8): 22 замечания (5 блокеров, 10 важных, 7 советов). Зафиксированы в docs/CODE_REVIEW.md. Блокеры: CORS+auth (CR11-001), TLS rejectUnauthorized (CR11-002), race condition store (CR11-003), бинарники в git (CR11-004), неатомарный guard (CR11-005). Решения ожидаются. |

---

## Структура проекта

```text
courtdesk/
├── docs/               — документация (ARCHITECTURE, CHANGELOG, CODE_REVIEW, CONTEXT, CRM-INTEGRATION, DECISIONS, ...)
├── packages/
│   ├── core/           — типы, справочник судов, config, errors, logger, progress
│   ├── captcha/        — Puppeteer + RuCaptcha + fetchMsudrfSearch
│   ├── search/         — адаптеры поиска (district, appeal, cassation, magistrate)
│   ├── parse/          — адаптеры парсинга карточек
│   ├── intake/         — classify() (regex /iu)
│   ├── scheduler/      — orchestrator + cron.ts
│   ├── store/          — cases, events, notifications, cards, settings
│   ├── api/
│   │   ├── routes/     — 25 эндпоинтов (+тесты)
│   │   └── middleware/
│   ├── tui/            — readline + ANSI, без blessed (deprecated)
│   ├── tui-go/         — Go TUI (Bubble Tea) + Web UI (plan)
│   │   ├── main.go     — единая точка входа
│   │   ├── go.mod      — Go модуль
│   │   ├── courtdesk-tui.exe     — Windows бинарник (7 MB)
│   │   └── courtdesk-tui-linux-amd64  — Linux бинарник (7 MB)
│   └── viewer/
│       └── public/     — Web UI без бандлера
│           ├── index.html       — дашборд (разметка + inline JS 370 строк)
│           ├── search.html      — поиск (разметка + inline JS 260 строк)
│           ├── terminal.html    — Bloomberg-стиль layout (v0.6.0)
│           ├── terminal.js      — Terminal: render/multsort/keyboard/views/statusline (v0.6.0)
│           ├── app.js           — shared: theme + skin + utils
│           └── theme.css        — CSS: `data-theme` × `data-skin`, 3 skin × 2 темы (v0.6.0)
├── data/               — JSON-хранилище
├── logs/               — pino-логи
├── README.md
├── package.json
├── tsconfig.json
└── vitest.config.ts
```
