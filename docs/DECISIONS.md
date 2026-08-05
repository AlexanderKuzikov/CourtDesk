# CourtDesk — DECISIONS

Архитектурные решения, зафиксированные с датой и обоснованием.

---

## 2026-08-03: Biome вместо ESLint

**Решение:** ESLint удалён (typescript-eslint не поддерживает TS 7 — CR12-006). Линтер — Biome (`npm run lint:biome`, конфиг `biome.json`): preset recommended, useConst/noVar — error, noExplicitAny/noConsole/noUnusedVariables — warn. Скоуп: `packages/**/*.ts(x)` кроме замороженного `packages/tui/`. Форматтер Biome не включён — переформатирование всей базы отдельным решением не одобрено.

**Обоснование:** Biome не зависит от typescript-eslint (свой парсер), один бинарник, работает с TS 7. Типизацию по-прежнему проверяет `tsc --noEmit` (`npm run lint`).

**Trade-off:** правила на основе type-information (как `project: tsconfig.json` у eslint) недоступны; 112 warn + 90 info легаси-шума не гейтятся (гейт — только error).

---

## 2026-08-03: TLS-верификация отключена только за allowlist'ом судовых доменов

**Решение:** `rejectUnauthorized: false` остаётся на всех HTTPS-запросах к судам (кривые цепочки сертификатов sudrf/msudrf — реальность), но каждый fetch-путь теперь проходит через `assertCourtUrl()` (allowlist `*.sudrf.ru` / `*.msudrf.ru`, только https). Проверка добавлена во все точки выхода: `api/routes/cases.ts` (POST и PATCH), `api/routes/parse.ts`, `scheduler/orchestrator.ts`, `search/shared.ts` (fetchHtml, smartFetch), `captcha/session.ts` (fetchWithCaptcha, fetchMsudrfSearch).

**Обоснование:** включение верификации ломает парсинг части судов (самозаверенные/неполные цепочки); SSRF-риск от отключённой верификации снимается allowlist'ом — внешний URL не достигает fetch.

**Trade-off:** MITM в пределах доверенных доменов теоретически возможен. Принято: система работает в изолированной LAN заказчика (см. ADR 2026-08-02 про открытость API), а целевые домены — государственные системы ГАС «Правосудие».

---

## 2026-08-02: WebView-оболочка — единственный клиент; TUI заморожены

**Решение:** Развитие UI идёт только по пути Go+WebView (`packages/courtdesktop/`) поверх Web UI (`packages/viewer/public/`). `packages/tui/` (Node) и `packages/tui-go/` (Bubble Tea) заморожены — код сохраняется, но не дорабатывается и не тестируется. Все новые UI-функции — в viewer, оболочка их просто отображает.

**Обоснование:** Web UI уже содержит Dashboard, Terminal, Search, Skins (3×5) и переиспользуется оболочкой на 100%. TUI дублировали его функции (CR11-015), имели нерешённые блокеры (CR12-002 data race, CR12-005 UTF-8) и требовали поддержки трёх UI-кодовых баз. ADR 2026-07-27 «Go — UI-платформа» остаётся в силе в части Go-обёртки; вариант `--tui` того ADR более не развивается.

**Следствие:** замечания CR12-002, CR12-005, CR12-007, CR12-008, CR12-018, CR12-S01..S03, GOUI-O1..O4, CR11-015 снимаются с очереди как неактуальные (код остаётся в репо до отдельного решения об удалении).

---

## 2026-08-02: API открыт в локальной сети (без авторизации)

**Решение:** Подтверждено решение 2026-07-21 «Нет авторизации». API работает без токенов и auth в доверенной локальной сети. CORS wildcard остаётся. SEC-O1 и CR11-001 закрыты как by design.

**Обоснование:** система разворачивается в изолированной LAN заказчика; авторизация усложняет интеграцию с 1С и desktop-клиентами без соразмерного снижения рисков.

**Trade-off:** любой узел LAN и любая страница в браузере узла LAN может обращаться к API. Принято осознанно; при выходе за пределы LAN (публичный хостинг) — обязательный возврат к CR6-003 (токен + CORS-whitelist).

---

## 2026-08-02: Startup-подключение в desktop-оболочке

**Решение:** `courtdesktop` при старте делает health-check (`GET /api/health`, таймаут 2 с). Сервер доступен → переход в приложение. Недоступен → встроенная страница подключения (локальный HTTP-сервер `127.0.0.1:0` + `Navigate` на `/connect`, не зависит от API-сервера): ввод URL, проверка, список последних серверов (`recentUrls`, до 5). В runtime watcher (каждые 10 с, 3 сбоя подряд) переводит на страницу подключения при потере связи и автоматически возвращает в приложение при восстановлении. Ctrl+, (Windows, GetAsyncKeyState) переключает приложение/настройки.

**Обоснование:** Прежний flow был нерабочим: Ctrl+, не был реализован (страница настроек недостижима), а при недоступном сервере WebView2 показывал собственную страницу ошибки, где JS-bindings недоступны — сменить сервер было невозможно. Встроенные страницы (локальный HTTP-сервер) не зависят от сервера и документов WebView, что делает переключение надёжным.

**Trade-off:** navigation guard (CR12-004, часть про arbitrary navigation) не реализован — webview_go версии 2024-08 не предоставляет navigate handler. XSS-часть закрыта: все значения профиля встраиваются через `html.EscapeString`, URL валидируется на схему http/https.

---

## 2026-07-27: Go — единая UI-платформа (вместо Node.js TUI)

**Решение:** UI-клиент (TUI + Web) переводится на Go. Бэкенд (API, store, scheduler, search, parse) остаётся на Node.js.

**Архитектура:**
```
Node.js API (:8767) ← HTTP ↔ Go-бинарник (`courtdesk-ui`)
                             ├── TUI (Bubble Tea, `--tui`)
                             └── Web UI (html/template + go:embed, default)
```

**Почему не Node.js для TUI:**
- **ConPTY** — прослойка эмуляции терминала поверх Win32 API, через которую Node.js общается с консолью. Глючит: alt-screen не переключается, resize не шлёт, raw mode сбрасывается.
- **Ink 7 + React 19** — `fullScreen: true` не работает на Windows (не переключает alt-screen), `height="100%"` не прибивает статус-бар к низу, `flexGrow={1}` не растягивает контент.
- **Raw ANSI (readline)** — работает, но: alt-screen нестабилен, курсор (inverse) не на всю строку, F-keys не ловятся, resize не обрабатывается.
- **`ffi-napi`** — технически может вызывать Win32 API из Node.js, но: требует компиляции C++, нет готового TUI-фреймворка на этом, сложность не оправдана.

**Почему Go + Bubble Tea:**
- Bubble Tea работает с консолью напрямую через Win32 API (`kernel32.dll`), ConPTY не задействован. Alt-screen, resize, F-keys, мышь — из коробки.
- Один статический бинарник без зависимостей (7 MB). Кроссплатформенная компиляция одной командой: `GOOS=linux go build`.
- `go:embed` позволяет встроить HTML/CSS/JS Web UI в тот же бинарник.
- На Linux — работает через ANSI (crossterm), стабильнее чем любой Node.js-вариант.

**Почему Node.js бэкенд не трогается:**
- Кодовая база 5k+ строк, 94 теста, отлажена.
- cheerio/puppeteer/pino — зрелые библиотеки без аналогов в Go такого же качества.
- Интеграция с 1С, REST-контракты — не меняются.

**Trade-off:** Два рантайма (Node.js + Go) на сервере. GitHub CI, деплой — два артефакта. Принято: Go-бинарник — независимый клиент, не требует Node.js для работы.

---

## 2026-07-26: msudrf AJAX — отдельный пайплайн (не sudrf)

**Решение:** msudrf использует `fetchMsudrfSearch()` в `captcha/session.ts` — отдельную функцию, не переиспользует `fetchWithCaptcha`.

**Архитектура msudrf:**
- AJAX-поиск, нет `<form method="get">` (в отличие от sudrf, где GET-форма с параметрами в URL).
- Капча (`kcaptchaForm`) на отдельной странице, решается **один раз на сессию** (POST-сабмит → редирект на форму поиска).
- Кнопка «Искать» — `<input type="button" class="button-normal search">`, AJAX-запрос.
- Результаты в `<div id="search_results">` (изначально `display: none`).

**Архитектура sudrf:**
- `<form method="get">`, параметры в query string.
- Captcha встроена в форму (`input#captcha`), изображение в data URI.
- Сабмит формы → полная перезагрузка страницы.

**Таблицы результатов:**
- **msudrf (5 колонок):** № дела | Категория/Лица | Судья | Дата решения | Решение. Участники парсятся из «Категория/Лица».
- **sudrf (7 колонок):** № дела | Дата поступления | Категория | Судья | Дата решения | Результат | Вступление.

**Обоснование:** `fetchWithCaptcha` завязана на GET-форму sudrf (заполнение `#captcha`, `checkForm` submit, `waitForNavigation`). msudrf требует: решить капчу на отдельной странице, дождаться формы поиска, заполнить поля, кликнуть JS-кнопку, дождаться AJAX-ответа. Общий код — только чтение капчи (через `page.$eval`/`evaluate`), остальное разное. Единая функция была бы перегружена ветвлениями.

---

## 2026-07-26: fetchMsudrfSearch — отдельная функция (не переиспользовать fetchWithCaptcha)

**Решение:** `fetchMsudrfSearch()` — самостоятельная функция, не наследующая `fetchWithCaptcha`.

**Обоснование:** `fetchWithCaptcha` спроектирована под sudrf: заполнить `#captcha` + `fillAndSubmit`. msudrf требует другой последовательности: открыть `kcaptchaForm` → решить капчу (возможно, с retry) → дождаться перехода на форму поиска → заполнить поля → кликнуть JS-кнопку → дождаться `#search_results`. Попытка параметризовать `fetchWithCaptcha` привела бы к 5+ новым параметрам и условным операторам, ухудшив читаемость обоих пайплайнов. Дублирование кода запуска Puppeteer оправдано ясностью каждого пути.

---

## 2026-07-26: https.get с rejectUnauthorized вместо fetch для msudrf TLS

**Решение:** Для HTTP-запросов к судовым сайтам используется `https.get` с `{ rejectUnauthorized: false, timeout: 120000 }` вместо `fetch()` или `node:https` default.

**Применение:** `orchestrator.ts fetchHtml()` (строка 341), синхронный парсинг в `cases.ts` (строка 99).

**Обоснование:** Судовые серверы sudrf.ru/msudrf.ru используют wildcard-сертификаты, не проходящие валидацию Node.js (самоподписанные, просроченные, неверная цепочка). `fetch()` в Node.js не поддерживает `rejectUnauthorized` (нет опции для игнорирования TLS). `https.get` — единственный встроенный способ отключить проверку сертификата. Альтернатива (`NODE_TLS_REJECT_UNAUTHORIZED=0`) глобальна и опаснее.

Trade-off: уязвимость к MITM на уровне транспорта. Mitigation: `assertCourtUrl` ограничивает запросы только доменами `.sudrf.ru`/`.msudrf.ru`.

---

## 2026-07-26: pino как единственный логгер

**Решение:** `core/logger.ts` — pino с dual-transport (файл `logs/courtdesk.log` + stdout). Уровень лога из `LOG_LEVEL` env. Экспорт: `log(level, msg, data?)`, `logRequest(method, url, status, durationMs)`.

**Применение:** `api/server.ts` — HTTP-логи через `logRequest`. `console.log` остались в `orchestrator.ts`, `parse.ts` — tech-debt.

**Обоснование:** pino — самый быстрый structured logger для Node.js (benchmark: ~2x быстрее winston, ~5x быстрее bunyan). JSON-формат: машиночитаем, совместим с log aggregators (ELK, Loki). Dual-transport: разработчик видит в stdout, продакшен читает файл. Альтернатива (console.log) — неструктурирован, нет уровней, нет ротации. Альтернатива (winston) — тяжелее, больше зависимостей.

Trade-off: pino — ещё одна dependency. Но она компактна (tree-shakeable) и оправдана для продакшен-мониторинга.

---

## 2026-07-26: eslint flat config

**Решение:** `eslint.config.js` — flat config (ESM), `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`.

**Правила:**
- `no-console: warn` — миграция на pino
- `@typescript-eslint/no-unused-vars: warn` — с `argsIgnorePattern: '^_'`
- `@typescript-eslint/no-explicit-any: warn` — контроль `any`
- `prefer-const: error`, `no-var: error`

**Обоснование:** eslint v9+ использует flat config как единственный формат (`.eslintrc` deprecated). `@typescript-eslint` — стандарт для TS-проектов. Flat config — ESM-native, без дополнительных конфиг-файлов. Правила выбраны минимально инвазивными для существующей кодовой базы: `warn` позволяет коммитить, но подсвечивает проблему.

---

## 2026-07-26: Синхронный парсинг при добавлении (?parse=true)

**Решение:** `POST /api/cases?parse=true` (или `body.parse`) запускает парсинг карточки сразу после добавления дела. Результат (`card`) возвращается в теле ответа. При ошибке парсинга дело всё равно добавляется, ошибка в `parseError`.

**Обоснование:** Основной user flow: поиск → клик «+📋» → увидеть карточку. Без синхронного парсинга пользователь после добавления видел пустую карточку, пока scheduler не запустит `processOne`. `?parse=true` замыкает цикл: дело добавлено + карточка сразу видна. Trade-off: время ответа API увеличивается на ~3-10с (загрузка + парсинг). Принято: это POST, не блокирующий UI — клиент может показать спиннер.

---

## 2026-07-26: Party matching (CR6-005)

**Решение:** `matchParty(party, resultParties): number` — скоринг по правилам: 100 (точное совпадение), 90 (startsWith), фамилия + совпавшие слова (30 + N*20). `pickBestMatch(results, party)` — выбор лучшего. `processWaiting` использует `pickBestMatch(results, party) ?? results[0]`.

**Обоснование:** До этого `processWaiting` брал `results[0]` — первый результат поиска, который мог не относиться к искомой стороне. Скоринг по ФИО/названию: для юрлиц — точное совпадение названия, для физлиц — совпадение фамилии + минимум одно слово имени. Отсечение по порогу 30 (только фамилия без совпадений по имени — низкий score, не matching).

Trade-off: матчинг по имени — неточная метрика. УИД был бы точнее, но его нет на этапе waiting. Можно улучшать: стемминг русских фамилий, Levenshtein distance.

---

## 2026-07-26: Cron-планировщик

**Решение:** `packages/scheduler/cron.ts` — `setInterval` каждые 60с проверяет настройки и запускает `runFull()`/`runRetry()`. Настройки в `store/settings.ts`, API `GET/PUT /api/settings`, UI-модалка.

**Обоснование:** Без планировщика мониторинг запускался только вручную через `POST /api/parse/run`. Cron замыкает цикл «добавил дело → забыл». `setInterval` (не `node-cron`): zero-dependency, простота. Проверка каждые 60с достаточна для планирования с точностью до 5 минут.

Trade-off: никакой персистентности — при перезапуске сервера таймеры сбрасываются. Для HA нужен внешний планировщик (systemd timer, cron job).

---

## 2026-07-26: Прогресс-бар мониторинга

**Решение:** `core/progress.ts` — in-memory `ScanProgress`. `orchestrator.ts` вызывает `setProgress()` в начале и после каждого кейса. `GET /api/parse/progress` отдаёт состояние. UI поллит каждые 5с.

**Обоснование:** Без прогресс-бара пользователь не знает, сколько дел обработано и сколько осталось. In-memory: прогресс не нужно сохранять между рестартами (прогон всё равно прервётся). Race condition: `setProgress` — синхронная операция, присваивание атомарно в single-thread Node.js.

---

## 2026-07-26: Счётчик ошибок (errorCount, lastError)

**Решение:** `WatchedCase.errorCount: number` и `WatchedCase.lastError: string | null`. При ошибке в `processOne`: `errorCount+1`, `lastError`. При успехе: сброс.

**Обоснование:** До этого была только `lastChecked` — нельзя было отличить «дело никогда не проверялось» от «дело упало 20 раз подряд». `errorCount` даёт метрику для потенциальной авто-архивации (N ошибок подряд → archive). `lastError` — последняя причина для диагностики.

---

## 2026-07-26: TUI — blessed вместо neo-blessed и самопала

**Решение:** TUI создан на **blessed** v0.1.81. Не neo-blessed, не ANSI-самопал.

**Обоснование:**

**Почему не neo-blessed:**
- neo-blessed — форк blessed с «исправлениями», но требует `node-pty` (системная зависимость на C++).
- `node-pty` не собирается на Windows (ошибка `fake`: `process.stdout.isTTY = false` на Windows Terminal, плюс бинарные зависимости не компилируются).
- neo-blessed на Linux работает, но Windows — primary dev-среда автора. Если TUI не работает на Windows, его нельзя тестировать.

**Почему не самопал (ANSI-коды + process.stdin):**
- Обработка клавиатуры в терминале — ад: RAW mode, CSI-последовательности (разная длина ESC-последовательностей на разных терминалах), `process.stdin.on('data')` — ненадёжно.
- Скролл, выделение, фокус — всё нужно писать с нуля.
- `screen.key()`, `list.on('select')`, `scrollbar`, `focus` из blessed — экономия ~1000 строк кода.

**Почему blessed (а не termkit, ink, react-blessed):**
- blessed — максимально лёгкий (zero system dependencies, чистый JS).
- termkit — тяжелее, больше зависимостей, less stable на Windows.
- ink / react-blessed — требуют React в рантайме, оверхед для 100-строчного TUI.

**Trade-off:** blessed v0.1.81 не обновлялся с 2019 года. Баг с `tags: true` в `list` (issue #400) не исправлен. Но blessed — единственная библиотека терминального UI, которая работает на Windows без компиляции C++.

## 2026-07-26: TUI — live-share сессия с пользователем для OBS-записи глюков

**Решение:** Проведена live-share сессия (через VS Code Live Share) с пользователем на Windows для демонстрации и записи всех глюков TUI через OBS Studio.

**Контекст:** TUI, созданный на blessed, на Linux работал, но на Windows — глючил. Нужно было:
1. Задокументировать все глюки визуально.
2. Понять, какие именно ошибки воспроизводятся на реальном Windows Terminal.
3. Получить видео для потенциального баг-репорта в blessed.

**Записано:**
- Стрелки вверх/вниз не работают на Windows Terminal (но работают в ConEmu).
- Теги `{bold}...{/bold}` в `header` отображаются как текст на Windows Terminal.
- Русская раскладка: Enter не открывает карточку.
- `screen.key(['enter'])` не срабатывает после переключения раскладки.

**Вывод:** Windows Terminal имеет неполную совместимость с blessed (особенно в part of fullUnicode + CSI sequences). ConEmu работает лучше, но не идеально. Решение: документировать как known limitation, рекомендовать Linux/WSL для TUI.

---

## Предыдущие решения (CR1–CR9)

### 2026-07-25: Grace period 90 дней для enforced дел (CR9)

**Решение:** `ENFORCED_GRACE_MS = 90 дней`. Дела со статусом `enforced` продолжают мониториться, если `enforcedAt` в пределах grace period. После grace period — исключаются из `runFull`.

**Обоснование:** Решение может быть обжаловано в вышестоящей инстанции. Grace period даёт 90 дней на обнаружение апелляции. После — дело считается окончательно завершённым.

---

### 2026-07-25: Court Hierarchy — отдельная функция (CR9)

**Решение:** `findHigherCourt(courtCode)` в `core/courts.ts`. Иерархия `COURT_HIERARCHY`: MS→RS→OS→KJ. `CASSATION_MAP`: 89 регионов → 9 кассационных судов. MS→RS кэшируется в `court-hierarchy.json`.

**Обоснование:** Ранее поиск в вышестоящем суде не производился. Иерархия нужна для отслеживания обжалования. Кэш MS→RS: у мирового судьи нет прямого районного — перебор кандидатов дорогой, результат кэшируется.

---

### 2026-07-24: URL allowlist — assertCourtUrl (CR6-002)

**Решение:** `assertCourtUrl(url)` проверяет protocol=https + hostname ends with `.sudrf.ru` или `.msudrf.ru`. Блокирует `file://`, `http://`, `localhost`, IP-адреса, cloud metadata endpoints.

**Применение:** `/api/parse/url` (API boundary) + `orchestrator.fetchHtml` (scheduler).

**Обоснование:** SSRF через user-controlled URL — критичная уязвимость. Allowlist по домену — zero-dependency, O(1). Альтернатива (allowlist IP) требует DNS-resolve и хрупка.

---

### 2026-07-24: Corrupt JSON → backup + throw (CR6-001)

**Решение:** `readJson` при JSON.parse error (не ENOENT) переименовывает файл в `.corrupt.<timestamp>` и бросает Error.

**Обоснование:** Silent fallback на `{}` при коррупции приводил к перезаписи всех данных пустым состоянием. Backup + throw = данные и метрика ошибки сохраняются, следующий `save()` не стирает файл.

---

### 2026-07-24: archived re-check перед updateCase (CR6-004)

**Решение:** После всех `await` в `processOne`, перед финальным `updateCase`, перечитываем `getCase(uid)`. Если `status === 'archived'` — пишем только `lastChecked`, изменения статуса отбрасываем.

**Обоснование:** `await sleep(1500)` + `await searchAdapter.searchByCaseNumber()` освобождают event loop. В этом окне HTTP PATCH может архивировать дело. Без re-check `updateCase` перезаписывает `archived` на `decision`/`enforced`.

---

### 2026-07-24: Error recovery в processOne (CR6-006)

**Решение:** При успешном `processOne`, если `prev.status === 'error'`, устанавливаем `updates.status = 'monitoring'`.

**Обоснование:** Error-дела включаются в `runFull`/`runRetry`, но успешный прогон не сбрасывал статус. Error-дела крутились вечно. Recovery в `monitoring` (или `decision`/`enforced` если найден результат/legalForceDate) — корректный lifecycle.

---

### 2026-07-24: Каскадное удаление (CR6-016)

**Решение:** `DELETE /api/cases/:uid` вызывает `clearEvents(uid)` + `deleteNotificationsByCase(uid)` + `deleteCard(uid)` после `deleteCase`.

**Обоснование:** Без каскада events и notifications для удалённого дела копятся как orphans.

---

### 2026-07-24: Дедупликация роутов (CR6-008, CR6-009)

**Решение:** Удалён дублирующий `GET /api/status` из `health.ts`. Удалён дублирующий `POST /api/resolve` из `search.ts`.

---

### 2026-07-24: _isRunning TOCTOU fix (CR6-013)

**Решение:** `_isRunning = true` устанавливается до `res.status(202)`, не после.

---

### 2026-07-24: Dashboard UX — управление делами

**Решение:** Dashboard получил: фильтры по статусу с счётчиками, modal деталей дела с timeline событий, кнопки архив/возврат/удаление, кнопку запуска мониторинга, авто-обновление 30с.

---

### 2026-07-24: Search UX — добавление в мониторинг

**Решение:** Каждая строка результатов поиска получила кнопку «+📋» → `POST /api/cases`. Добавлена форма «Отслеживать появление» → `POST /api/cases/wait`.

---

### 2026-07-24: Dead code cleanup — magistrate search adapter

**Решение:** Удалены `createMagistrateSession()` (мёртвая функция с багом `page.url()`) и `solveCaptchaOnPage()` (дубликат `captcha/session.ts`).

---

## Предыдущие решения (CR1–CR5)

| Дата | Решение | Обоснование |
|------|---------|-------------|
| 2026-07-22 | await sleep перед searchByCaseNumber (CR5-001) | Rate-limit между парными запросами к sudrf.ru |
| 2026-07-22 | Удалён 'deleted' as unknown (CR5-002) | Мёртвый код с подавлением TypeScript |
| 2026-07-22 | legalForceDate.slice(0, 10) (CR5-003) | Нормализация YYYY-MM-DD при записи |
| 2026-07-22 | CORS wildcard без Authorization (CR5-004) | Несовместимая комбинация по спецификации |
| 2026-07-22 | regex /iu для кириллицы (CR5-005) | /i без /u = ASCII-only case-insensitive |
| 2026-07-22 | Captcha polling retry (CR5-006) | Нестабильный интернет на VDS |
| 2026-07-22 | listCases multi-status (CR5-007) | Один проход по Map вместо N |
| 2026-07-22 | tmp/rename без fsync (CR5-008) | Single-process, объём мал |
| 2026-07-22 | eslint отложен (CR5-009) | tsc достаточен для v0.x |
| 2026-07-22 | HOST из env (CR5-010) | Деплой в контейнер |
| 2026-07-22 | pino отложен (CR5-011) | При появлении prod-мониторинга |
| 2026-07-22 | _isRunning guard (CR5-012) | 409 Conflict от параллельных runFull |
| 2026-07-22 | moduleResolution: Node16 | bundler для Vite/esbuild, Node16 для Node.js ESM |
| 2026-07-22 | vitest pool: forks | Чистый module registry per-test |
| 2026-07-22 | createApp() отдельно | Импорт app в тестах без HTTP сервера |
| 2026-07-21 | Единый проект | Одна кодовая база, один деплой |
| 2026-07-21 | Один package.json | Все пакеты в одном процессе |
| 2026-07-21 | JSON-хранилище | Объём < 10 000 дел; при росте — SQLite |
| 2026-07-21 | REST API | 1С умеет REST |
| 2026-07-21 | API+UI один процесс | Нет CORS изнутри |
| 2026-07-21 | Search ≠ Parse | Разные URL и логика |
| 2026-07-21 | In-memory cache | Один readFileSync при старте |
| 2026-07-21 | Rate limit 1500ms | Задержка между запросами к sudrf.ru |
| 2026-07-21 | PATCH whitelist | Нельзя менять uid, createdAt, courtId, courtType |
| 2026-07-21 | Нет авторизации | API в локальной сети (CR6-003 для публичного) |
