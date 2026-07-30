# CourtDesk — CONTEXT

> CRM-система поиска и мониторинга судебных дел РФ.
> Единый сервис для интеграции с 1С, Web UI и Desktop App на Go+WebView.
> Последнее обновление: 2026-07-30

---

## Статус

**v0.7.0** — Desktop App на Go+WebView (6 MB). Web UI: Terminal + Skins + прогресс мониторинга. API: 94 теста, 25 эндпоинтов. Node ≥22.

| Компонент | Статус | Заметка |
|-----------|--------|---------|
| Архитектура | ✅ Утверждена | docs/ARCHITECTURE.md |
| API-контракты | ✅ 25 эндпоинтов | docs/API.md |
| Core (типы) | ✅ errorCount, lastError, enforcedAt | |
| Security (URL allowlist) | ✅ assertCourtUrl | ⚠️ не применён в cases.ts |
| Store integrity | ✅ corrupt backup + throw | |
| Captcha | ✅ msudrf AJAX + sudrf form | |
| Search | ✅ msudrf переписан (AJAX) | |
| Parse | ✅ sync parse при добавлении | |
| Scheduler | ✅ cron + double-fire guard | |
| Store | ✅ каскадное удаление + settings | |
| API | ✅ 25 эндпоинтов | |
| Viewer (Dashboard) | ⚠️ см. open-проблемы | |
| Viewer (Search) | ⚠️ см. open-проблемы | |
| Viewer (Terminal) | ✅ Bloomberg-style | |
| Viewer (Skins) | ✅ 3 skin × 5 themes | |
| TUI (Go) | 🆕 Bubble Tea, Win32 API | |
| Desktop App | 🆕 Go+WebView, 6 MB | packages/courtdesktop/ |
| API tests | ✅ 94 теста | |
| eslint | ⚠️ Сломан | TS 7.0 не поддерживается |

---

## Open-проблемы

### BLOCKER

| # | Описание | Файл |
|---|----------|------|
| CR12-001 | **SSRF.** `url` из `req.body` в `https.get()` без `assertCourtUrl()` | `api/routes/cases.ts:102` |
| CR12-002 | **Data race.** `runCmd` мутирует модель из горутины | `tui-go/main.go:380` |
| CR12-003 | **Утечка RuCaptcha-ключа.** txt-файлы = фрагменты ключа, git tracked | корень репо |
| CR12-004 | **XSS + arbitrary navigation** в courtdesktop | `courtdesktop/main.go` |
| CR11-001 | **CORS wildcard + нет auth API** | `api/server.ts:23` |
| CR11-002 | **rejectUnauthorized: false** на всех HTTPS | search, orchestrator, cases |
| CR11-003 | **Race condition в store** (read-modify-write) | store/* |
| CR11-004 | **Бинарники в git** (~20 MB) | courtdesktop.exe, tui-go .exe |
| CR11-005 | **_isRunning guard неатомарен** + cron параллелизм | api/routes/parse.ts |

### HIGH

| # | Описание |
|---|----------|
| CR11-006 | Нет тестов для parse/search/captcha (~40% кода) |
| CR11-007 | Дублирование fetchHtml (search vs scheduler) |
| CR12-005 | UTF-8 коррупция в tui-go (pad/trunc по байтам) |
| CR12-006 | ESLint сломан: typescript-eslint не поддерживает TS 7.0 |
| CR12-009 | Puppeteer: новый браузер на каждый вызов, --no-sandbox |
| CR12-010 | magistrate.ts: plaintiff перезаписывает defendant |
| CR12-011 | logs/courtdesk.log tracked в git |
| CR12-016 | CI: Go не компилируется, нет Windows matrix |
| CR12-017 | .gitignore без *.exe; .git = 95 MB |
| CR12-018 | tui-go: 6+ ignored errors |
| WEBUI-O1 | Skeleton-загрузчики |
| WEBUI-O2 | Мобильная адаптация |
| WEBUI-O3 | Дашборд «требует внимания» |
| WEBUI-O4 | Карточка дела: вкладки/аккордеон |
| WEBUI-O5 | Календарь по legalForceDate |

### MEDIUM

| # | Описание |
|---|----------|
| CR11-008 | Версия health (0.4.0) ≠ package.json (0.5.1) ≠ README (0.7.0) |
| CR11-010 | Мёртвые зависимости: react, ink, @types/react |
| CR11-011 | POST /api/cases?parse=true — sync до 2 мин |
| CR11-015 | Два TUI (TS + Go) дублируют |
| CR12-007 | tui-go Init() мутирует value receiver |
| CR12-008 | tui-go renderDetail guard мутирует копию |
| CR12-012 | shared.ts:59 — HTML капчи как результат |
| CR12-013 | cron.ts: local time vs UTC рассинхрон |
| CR12-014 | error middleware отдаёт err.message клиенту |
| CR12-015 | settings: нет валидации значений |
| CR12-019 | store: кэши без eviction |
| CR12-020 | 8 коммитов с сообщением «.» |
| WEBUI-O6 | Массовые операции |
| WEBUI-O7 | Экспорт в CSV |
| WEBUI-O8 | Визуальный progress bar |
| WEBUI-O9 | Фильтр по userId |
| WEBUI-O10 | Вынос JS из HTML |
| WEBUI-O11 | Retry + сообщения при ошибках |

### LOW

| # | Описание |
|---|----------|
| CR11-012 | console.log результата капчи |
| CR11-014 | showError в Go desktop не вызывается |
| WEBUI-O12..O15 | Кэширование, история, массовое добавление, Kanban/Calendar |
| TEST-O1..O3 | Нет regression/UI/Go тестов |
| GOUI-O1..O4 | TUI Go: доработка UI, web-режим, go:embed, автозапуск API |
| INFRA-O1 | Monorepo без workspaces |
| SEC-O1 | Zero-auth API (⏸ отложено 2026-07-27) |

### Советы (из code review)

| # | Файл | Описание |
|---|------|----------|
| CR12-S01 | `tui-go/main.go:787` | `det`-замыкание определено и отброшено — мёртвый код |
| CR12-S02 | `tui-go/main.go:110`, `tui/app.ts:27` | Оба TUI хардкодят `http://127.0.0.1:8767/api` — нет флага/env/конфига |
| CR12-S03 | `tui/api.ts` vs `tui/app.ts` | Два параллельных API-клиента в TS TUI; `api.ts` не используется — мёртвый модуль |
| CR12-S04 | `terminal.js:654` | `mouseover` → `selectRow()` → полная перерисовка statusbar на каждое движение мыши |
| CR12-S05 | `core/courts.ts:116`, `core/logger.ts:8` | `readFileSync`/`mkdirSync` на уровне модуля — крах при импорте без graceful degradation |
| CR12-S06 | `store/json-store.ts:30` | `Date.now()` в tmp-имени: две записи в одну мс = коллизия пути |
| CR12-S07 | `vitest.config.ts` | Нет coverage-провайдера и порогов — реальное покрытие неизвестно |
| CR12-S08 | `courtdesktop/go.mod` | `webview_go` на pseudo-version (коммит, не тег) — нет semver-гарантий |
| CR12-S09 | `.npmrc` | `legacy-peer-deps=true` маскирует конфликты peer-зависимостей |
| CR12-S10 | `intake/classify.ts:8` | `[А-ЯA-Z]?` без `Ё`; латинские имена не классифицируются; нет лимита длины входа |

---

## API-покрытие

**94 теста (16 файлов).** Все эндпоинты:

| Файл | Эндпоинты |
|------|-----------|
| health.test.ts | GET /api/health |
| status.test.ts | GET /api/status, GET/PATCH /api/notifications |
| cases.test.ts | CRUD /api/cases + /events /card /stats /wait |
| search.test.ts | POST /api/search/by-number, by-party, by-case-uid |
| resolve.test.ts | POST /api/resolve |
| parse.run.test.ts | POST /api/parse/run |
| parse.url.test.ts | POST /api/parse/url |
| progress.test.ts | GET /api/parse/progress |
| settings.test.ts | GET/PUT /api/settings |
| courts.test.ts | GET /api/courts, /api/courts/:id |
| intake.test.ts | POST /api/intake |
| store/*.test.ts | store layer |
| intake/classify.test.ts | classify() unit |
| scheduler/*.test.ts | orchestrator, runNew |

---

## Журнал работ

| Дата | Изменение |
|------|-----------|
| 2026-07-30 | **Реорганизация документации.** Удалены CODE_REVIEW.md, BUG_REPORT.md, SESSION_CONTINUE.md, PROMPT_WEBUI.md. Open-проблемы слиты сюда. Создан AGENTS.md. CRM-INTEGRATION.md → API.md. Создан knowledge base в `D:\GitHub\knowledge/`. |
| 2026-07-30 | **CR12** — контрольный аудит. 21 новое замечание, 4 блокера. CR11 не исправлены. |
| 2026-07-29 | **CR11** — полный аудит. 22 замечания, 5 блокеров. |
| 2026-07-28 | **v0.7.0 Desktop App** — миграция Fyne → WebView (6 MB). Настраиваемый API URL. |
| 2026-07-28 | Web UI — настраиваемый API URL, прогресс мониторинга, открытие дела по строке. |
| 2026-07-27 | **v0.6.0 Terminal + Skins.** Terminal view (Bloomberg-style). 3 skin × 5 themes. |
| 2026-07-27 | Go TUI (v0.7.0) — Bubble Tea, Win32 API. Решение: Go — UI-платформа. |
| 2026-07-27 | docs/ почищен, API тесты 57→94, docs/ migration. |
| 2026-07-26 | **v0.5.0** — msudrf AJAX, progress API, settings, sync parse, party matching, eslint, pino. |
| 2026-07-26 | CR10 — TUI rewrite (blessed → readline+ANSI). |
| 2026-07-21..25 | CR1–CR9: security, search, parse, hierarchy, UI, store. |

---

## Структура проекта

```text
courtdesk/
├── AGENTS.md            # Инструкции для AI-агентов
├── README.md            # Точка входа
├── docs/
│   ├── CONTEXT.md       # Этот файл
│   ├── DECISIONS.md     # ADR
│   ├── ARCHITECTURE.md  # Архитектура, data flow
│   └── API.md           # API-документация для 1С
├── packages/
│   ├── core/            # Типы, суды, encoding, config, logger, progress
│   ├── captcha/         # Puppeteer + RuCaptcha
│   ├── search/          # Адаптеры (district, appeal, cassation, magistrate)
│   ├── parse/           # Адаптеры парсинга
│   ├── intake/          # classify() (regex /iu)
│   ├── scheduler/       # orchestrator + cron
│   ├── store/           # cases, events, notifications, cards, settings
│   ├── api/routes/      # 25 эндпоинтов + тесты
│   ├── tui/             # Node TUI (deprecated)
│   ├── tui-go/          # Go TUI (Bubble Tea)
│   ├── courtdesktop/    # Go Desktop (WebView, 6 MB)
│   └── viewer/public/   # Web UI (vanilla JS)
├── data/                # JSON-хранилище
├── logs/                # pino-логи
├── package.json         # version: 0.5.1
├── tsconfig.json
└── vitest.config.ts
```
