# CourtDesk — CONTEXT

> CRM-система поиска и мониторинга судебных дел РФ.
> Единый сервис для интеграции с 1С, Web UI и Desktop App на Go+WebView.
> Последнее обновление: 2026-08-05

---

## Статус

**v0.7.1** — стабилизация: закрыты все 6 блокеров (SSRF, TLS-allowlist, store-races, бинарники в git). 181 тест, coverage-гейт, Biome, CI Windows+Go. Node ≥22. Русификация UI, нормализация номеров дела (caseNumber / caseUid / caseId).

| Компонент | Статус | Заметка |
|-----------|--------|---------|
| Архитектура | ✅ Утверждена | docs/ARCHITECTURE.md |
| API-контракты | ✅ 26 эндпоинтов | docs/API.md, parse=async |
| Core (типы) | ✅ errorCount, lastError, enforcedAt | |
| Security (URL allowlist) | ✅ assertCourtUrl | применён во всех fetch-точках (ADR 2026-08-03) |
| Store integrity | ✅ corrupt backup + throw | tmp-файлы через randomUUID |
| Captcha | ✅ msudrf AJAX + sudrf form | пул браузера Puppeteer |
| Search | ✅ msudrf переписан (AJAX) | |
| Parse | ✅ sync/async parse при добавлении | parse=async → 202 |
| Scheduler | ✅ cron + лок прогонов в orchestrator | общий для API и cron |
| Store | ✅ каскадное удаление + settings | |
| API | ✅ 26 эндпоинтов | open LAN, без auth (ADR 2026-08-02) |
| Viewer (Dashboard) | ✅ attention-bar, progress bar, XLS, retry | |
| Viewer (Search) | ✅ async-добавление, retry | |
| Viewer (Terminal) | ✅ Bloomberg-style | hover-дедупликация |
| Viewer (Skins) | ✅ 3 skin × 2 themes | 5 тем — только в desktop-страницах |
| Desktop App | ✅ Go+WebView, ~6.9 MB | startup-подключение, watcher, Ctrl+, |
| TUI (Node) | ❄ Заморожен | ADR 2026-08-02 |
| TUI (Go) | ❄ Заморожен | ADR 2026-08-02 |
| API tests | ✅ 181 тест, coverage-гейт 44/38/38/42 | |
| Линтер | ✅ Biome (вместо eslint) | ADR 2026-08-03 |
| CI | ✅ ubuntu+windows, tsc+biome+test, go build | |

---

## Open-проблемы

### HIGH

| # | Описание |
|---|----------|
| INFR-001 | **ENOTFOUND судовых субдоменов** (live): `oblsud--perm.sudrf.ru`, `2.perm.msudrf.ru` — `getaddrinfo ENOTFOUND`. Проверить актуальность субдоменов в справочнике судов |
| CR11-006 | Тесты parse/search/captcha: закрыты magistrate/district/rucaptcha/shared/browser; appeal/cassation parse-адаптеры всё ещё без фикстур |
| WEBUI-O2 | Мобильная адаптация |
| WEBUI-O4 | Карточка дела: вкладки/аккордеон |
| WEBUI-O5 | Календарь по legalForceDate |

### MEDIUM

| # | Описание |
|---|----------|
| CR11-010 | Зависимости react/ink/@types/react — при замороженном packages/tui (до решения об удалении) |
| CR12-004 | Navigation guard в courtdesktop: нет navigate handler в webview_go (XSS встроенных страниц закрыт 2026-08-02) |
| CR12-019 | store: кэши без eviction |
| CR12-020 | 15 коммитов с сообщением «.» в истории (не переписывается осознанно; новые — по конвенции) |
| WEBUI-O6 | Массовые операции |
| WEBUI-O9 | Фильтр по userId |
| WEBUI-O10 | Вынос JS из HTML |

### LOW

| # | Описание |
|---|----------|
| WEBUI-O12..O15 | Кэширование, история, массовое добавление, Kanban/Calendar |
| TEST-O1..O3 | Нет regression/UI/Go тестов |
| INFRA-O1 | Monorepo без workspaces |

### Советы (из code review)

| # | Файл | Описание |
|---|------|----------|
| CR12-S08 | `courtdesktop/go.mod` | `webview_go` на pseudo-version — тегов у проекта нет, апгрейд невозможен (проверено 2026-08-03) |
| CR12-S09 | `.npmrc` | `legacy-peer-deps=true` маскирует конфликты peer-зависимостей |
| CR12-S10 | `intake/classify.ts:8` | `[А-ЯA-Z]?` без `Ё`; латинские имена не классифицируются; нет лимита длины входа |

---

## API-покрытие

**181 тест (22 файла), coverage-гейт (v8): lines 44 / functions 38 / branches 38 / statements 42.** Все эндпоинты:

| Файл | Эндпоинты |
|------|-----------|
| health.test.ts | GET /api/health |
| status.test.ts | GET /api/status, GET/PATCH /api/notifications |
| cases.test.ts | CRUD /api/cases (+SSRF, parse=async) + /events /card /stats /wait + POST /:uid/parse (+409) |
| search.test.ts | POST /api/search/by-number, by-party, by-case-uid |
| resolve.test.ts | POST /api/resolve |
| parse.run.test.ts | POST /api/parse/run |
| parse.url.test.ts | POST /api/parse/url |
| progress.test.ts | GET /api/parse/progress |
| settings.test.ts | GET/PUT /api/settings (+валидация) |
| courts.test.ts | GET /api/courts, /api/courts/:id |
| intake.test.ts | POST /api/intake |
| store/*.test.ts | store layer |
| intake/classify.test.ts | classify() unit |
| scheduler/*.test.ts | orchestrator, runNew |
| search/shared.test.ts | buildSearchUrl, parseResults, URL-allowlist |
| search/adapters/magistrate.test.ts | buildFields (CR12-010), buildFormUrl, parseResults msudrf |
| parse/adapters/magistrate.test.ts | карточка мирового суда (фикстура) |
| parse/adapters/district.test.ts | карточка районного суда (фикстура) |
| captcha/rucaptcha.test.ts | RuCaptcha API v2: createTask/polling/retry/timeout |
| captcha/browser.test.ts | пул браузера Puppeteer (CR12-009) |

---

## Журнал работ

| Дата | Изменение |
|------|-----------|
| 2026-08-05 | **Капча-пайплайн: таймауты под WAF-тормоза ГАС.** WAF замедляет ответы до 1-2 минут (видно вручную: капча думает минуту+). Пайплайн падал по дефолтным таймаутам Puppeteer (30-60с): `Execution context was destroyed`, `Captcha image fetch failed: HTTP 502`. Подняты в `captcha/session.ts`: goto/navigation → 120с, waitForFunction/locator → 90с, fetch капчи-картинки → 60с (AbortSignal). Проверено end-to-end: fetchMsudrfSearch (поиск 42-91с) и fetchWithCaptcha (карточка 1.8с) работают, карточка 2-800/2026 спарсилась (uid=судебный номер, case_id=1284505). Дело 2-800 вышло из error→monitoring; все 4 дела в норме (0 error). Таймауты зафиксированы константами NAV_TIMEOUT_MS/WAIT_TIMEOUT_MS. |
| 2026-08-05 | **Диагностика live-ошибок + фикс runSingle.** Субдомены ГАС живы (DNS ок); утренний ENOTFOUND — временный DNS-сбой. district/appeal перепарсируются (35-46с, WAF замедляет); appeal 33-8030 вышел из error→monitoring. **INFR-001 закрыт:** WAF ГАС банит IP по rate-limit (наш IP 196.61.180.141 после серии тестов получает 403 на sudrf+msudrf; телефон/VPN с другим IP открывают msudrf без проблем); RuCaptcha-ключ невалиден (ERROR_KEY_DOES_NOT_EXIST — проверить ротацию). **NUM-002:** `runSingle` не фиксировал ошибки в деле (lastError оставался устаревшим) — добавлен catch с записью errorCount/lastError/status, ошибка пробрасывается в роут (500 PARSE_ERROR, не 409). Тесты 181, tsc/biome чисто. |
| 2026-08-05 | **Русификация UI + нормализация номеров дела.** Бейджи типа суда: `COURT_TYPE_LABELS` в app.js (district→Районный суд, appeal→Апелляционный, cassation→Кассационный, magistrate→Мировой), применён в index/search/terminal. «Case UID»/«UID дела» → «УИД». Desktop-темы русифицированы (Slate (Dark)→Slate (тёмная) и т.д.). **NUM-001:** `SearchResult.uid` (смешивал case_uid и case_id) → `caseId` + `caseUid`; `CaseCard.uid` = судебный номер для всех судов (district/appeal/cassation переведены с judicial_uid); `identifiers.case_id` добавлен; `caseUid` теперь передаётся при добавлении из поиска и заполняется в processWaiting. API.md: 26 эндпоинтов, коды ошибок, v0.7.1. ARCHITECTURE.md: 26 эндпоинтов, 8 PATCH-полей, enforced в runFull, структура пакетов. Создан docs/PLANS.md. Тесты 180→181. |
| 2026-08-03 | **Кроссплатформенность UI (Web=Windows=Linux).** Все emoji-иконки (не рендерились в Linux-WebKit без emoji-шрифта) заменены на inline SVG (stroke=currentColor, темы перекрашивают). Набор ICONS + `ic()`/`data-icon` в app.js, применён в index/search/terminal. Экспорт CSV → XLSX (zero-dep: zip-store + inline strings, Excel открывает без предупреждений). Перепарсинг: прогресс-бар (indeterminate + счётчик сек) и спиннер в строке; кнопки-дубли (архив/удалить/перепарсить) из карточки дела удалены. Linux-сборка courtdesktop: webkit2gtk-4.0→4.1 патч pkg-config в webview_go (в /tmp, в репо не зафиксировано — open: легализация). Проверено в WSLg (X11), API на Windows. |
| 2026-08-03 | **v0.7.1 — стабилизация.** Закрыты все 6 блокеров: CR12-001 SSRF (assertCourtUrl в cases.ts POST/PATCH + все fetch-точки: shared, session, orchestrator), CR12-003 (проверка: ключ в git не попадал, txt-пустышки удалены), CR11-002 (ADR: TLS только за allowlist), CR11-003/005 (лок прогонов + per-uid in-flight в orchestrator, cron поверх лока), CR11-004 (бинарники и лог untracked, *.exe в .gitignore). CR12-010 (plaintiff/defendant), CR12-012 (капча не возвращается как результат), CR11-007 (единый fetchHtml), CR12-009 (пул браузера), CR11-011 (parse=async 202), CR12-013/014/015, S04–S07, CR11-008/012. ESLint→Biome (ADR). CI: Windows matrix + go build courtdesktop. Coverage v8 + пороги. Тесты 97→180. Web UI: attention-bar, progress bar, CSV, retry, skeleton, async-добавление в поиске. |
| 2026-08-02 | **Кнопка «Перепарсить» (вариант 2).** `POST /api/cases/:uid/parse` — тонкий роут над `scheduler.runSingle` (привязанный парсинг: saveCard под внутр. uid + обновление дела). 🔄 в строке дашборда и в карточке, guard от двойного клика. Убран глазик 👁 «Детали» (дубль клика по строке). Тесты 94→97. API.md §4.17. |
| 2026-08-02 | **Desktop: connection flow.** Health-check при старте → приложение или встроенная страница подключения (локальный HTTP-сервер :0 + Navigate). Watcher потери/восстановления связи (10 с, 3 сбоя). Ctrl+, через GetAsyncKeyState (Windows). recentUrls (до 5). XSS встроенных страниц закрыт (html.EscapeString), валидация схемы URL. ADR: WebView — единственный клиент, TUI заморожены, API открыт в LAN. CR11-001 закрыт (by design); CR12-002/005/007/008/018, CR11-015, GOUI-O*, CR12-S01..S03 сняты (TUI frozen). |
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
│   ├── PLANS.md         # Бэклог работ (приоритеты)
│   └── API.md           # API-документация для 1С
├── packages/
│   ├── core/            # Типы, суды, encoding, config, logger, progress
│   ├── captcha/         # Puppeteer + RuCaptcha
│   ├── search/          # Адаптеры (district, appeal, cassation, magistrate)
│   ├── parse/           # Адаптеры парсинга
│   ├── intake/          # classify() (regex /iu)
│   ├── scheduler/       # orchestrator + cron
│   ├── store/           # cases, events, notifications, cards, settings
│   ├── api/routes/      # 26 эндпоинтов + тесты
│   ├── tui/             # Node TUI (заморожен)
│   ├── tui-go/          # Go TUI (заморожен)
│   ├── courtdesktop/    # Go Desktop (WebView, ~6.9 MB)
│   └── viewer/public/   # Web UI (vanilla JS)
├── data/                # JSON-хранилище
├── logs/                # pino-логи
├── biome.json           # линтер (Biome)
├── package.json         # version: 0.7.0
├── tsconfig.json
└── vitest.config.ts     # + coverage v8 с порогами
```
