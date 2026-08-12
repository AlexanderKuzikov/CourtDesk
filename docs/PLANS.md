# CourtDesk — PLANS

> Приоритизированный бэклог работ. Источник истины для планирования.
> Live-статус и журнал — в `docs/CONTEXT.md`. Архитектурные решения — в `docs/DECISIONS.md`.
> Обновлено: 2026-08-12

---

## Приоритеты
| Приоритет | Смысл |
|-----------|-------|
| **P0 · HIGH** | Блокеры, ошибки в проде, разнобой данных, критичный UX |
| **P1 · MEDIUM** | Важные улучшения, техдолг, который виден |
| **P2 · LOW** | Оптимизации, полировка, отложенное |

---

## P0 · HIGH

| # | Описание |
|---|----------|
| MSUDRF-001 | **Регрессия мировых судов (msudrf) после правок 2026-08-05 — поиск/парсинг сломан.** Шаг 0 (диагностика): debugDir-прогон живого дела (2-800/2026), осмотр msudrf-form/results/page.html + лог page.url()/HTTP-статусов. Шаг 1 (фиксы, captcha/session.ts runMsudrfSearch): fill полей через `page.evaluate` (скрытые вкладки) с логом промахов; re-goto на formUrl после капчи если нет `sud_delo`; проверка `resp.status()` + backoff 403/429; `Promise.race([waitForNavigation, waitForFunction(!kcaptchaForm)])`; расширение селекторов сабмита/«Искать»; fallback на `page.content()` при `#search_results` без `<table>`. Шаг 2: проверить refcount `releaseBrowser()` (MSUDRF-002). Шаг 3 (тесты): фикстуры kcaptcha/form/results/empty/403 + интеграционный тест с hidden-инпутом. Детали — CONTEXT.md, журнал 2026-08-12 |
| NUM-001 | **Разнобой «номеров дела». Закрыт 2026-08-05** — caseNumber / caseUid / caseId разделены, CaseCard.uid = судебный номер |
| UI-001 | **Английские слова в интерфейсе. Закрыт 2026-08-05** — COURT_TYPE_LABELS, «УИД» |
| INFR-001 | **ENOTFOUND судовых субдоменов (live). Закрыт 2026-08-05** — таймауты капчи подняты, дела в норме. **2026-08-05 (доп.):** RuCaptcha-ключ проверен — валиден (баланс 240.58 ₽); fetchHtml ретраит 403/429 с экспоненциальным backoff (5с/10с, 3 попытки) |
| NUM-002 | **runSingle не фиксировал ошибки в деле** — исправлено 2026-08-05 (lastError/errorCount теперь обновляются при ручном перепарсинге) |
| CR11-006 | **Parse-адаптеры appeal/cassation без тестов/фикстур. Закрыт 2026-08-05** — appeal.test.ts / cassation.test.ts (22 теста, inline-фикстуры 5 вкладок); попутно починен parsePublishInfo (publishedAt был всегда null) |
| WEBUI-O16 | **Поиск сломан при настраиваемом API URL** — search.html:212 делает fetch мимо apiUrl(). Фикс: обернуть url в apiUrl() (1 строка) |
| WEBUI-O17 | **Terminal: Ctrl+D = удаление вместо скролла** — проверку ctrlKey перенести выше switch (terminal.js:620-646) |
| WEBUI-O2 | Мобильная адаптация |
| WEBUI-O4 | Карточка дела: вкладки/аккордеон |
| WEBUI-O5 | Календарь по legalForceDate |

## P1 · MEDIUM

| # | Описание |
|---|----------|
| CR12-004 | Navigation guard в courtdesktop: нет navigate handler в webview_go (XSS встроенных страниц закрыт 2026-08-02) |
| CR12-019 | store: кэши без eviction; `events` растёт бесконечно |
| WEBUI-O18 | **saveSettings:** auto-reload мёртв (условие после setApiBase всегда false), PUT настроек уходит на новый base вместо текущего (index.html:696-711). Фикс: запомнить старый base, PUT на него, reload при изменении |
| WEBUI-O19 | **Гонки viewer'а:** seq-token/AbortController для loadDashboard/loadData (stale-overwrite); дедупликация poll-интервалов runMonitor (кнопка разблокируется через 5с → 409 → второй poll); scanBar после 240с стопа (terminal.js:490); общий scanBar reparseCase/runMonitor; блок кнопки addToMonitor до ответа. Таймауты fetch (AbortSignal.timeout) во всех точках |
| WEBUI-O20 | **XSS-харднинг:** inline onclick с esc() в JS-контексте → delegation + data-* (совместить с WEBUI-O10); esc для счётчиков и `dot ${n.type}`; проверки res.ok в loadDashboard/loadData; убрать мёртвый запрос /api/courts/ (index.html:441); guard number=null в updateScanProgress (index.html:662) |
| WEBUI-O21 | **Terminal 10K:** debounce /поиска + виртуализация/пейджинг (сейчас полный re-render на кейстрок и каждые 30с); кэш filtered(); привязать markAllRead() к клавише/команде или удалить (hint «m прочитать» исправить); search.html openDetail — модалка со скелетоном до ответа /api/parse/url |
| WEBUI-O6 | Массовые операции |
| WEBUI-O9 | Фильтр по userId |
| WEBUI-O10 | Вынос JS из HTML (index.html ~540 строк inline-script, search.html ~280) |
| CR11-010 | Зависимости react/ink/@types/react — при замороженном packages/tui (до решения об удалении) |

## P2 · LOW

| # | Описание |
|---|----------|
| WEBUI-O12..O15 | Кэширование, история, массовое добавление, Kanban/Calendar |
| TEST-O1..O3 | Нет regression/UI/Go тестов |
| INFRA-O1 | Monorepo без workspaces |
| WEBUI-O11 | Мёртвый код: `debounce()` в app.js не используется |
| WEBUI-O13 | Остаточные emoji: ⚠ ✓ ○ ✗ ★ ▸ (claim «все заменены на SVG» неполон) |
| WEBUI-O22 | **Темы/доступность:** контраст --text-dim в светлых темах ~2.3-2.9:1 и btn-primary corporate dark ~2.6:1 (провал WCAG AA); нет :focus-visible; модалки без role=dialog/aria-modal/focus-trap; нет prefers-reduced-motion; незакрытая скобка matchMedia в inline-_t() всех трёх HTML |
| SIZE-001 | courtdesktop.exe ~6.9 MiB — документация говорит «6 MB» |

## Советы (из code review)

| # | Файл | Описание |
|---|------|----------|
| CR12-S08 | `courtdesktop/go.mod` | `webview_go` на pseudo-version — тегов нет, апгрейд невозможен (проверено 2026-08-03) |
| CR12-S09 | `.npmrc` | `legacy-peer-deps=true` маскирует конфликты peer-зависимостей |
| GO-001 | `courtdesktop/main.go` | `Connect()` не валидирует схему URL на Go-стороне (защита только через JS `test()`) |

---

## Закрыто (архив)

См. `docs/CHANGELOG.md` и историю `docs/CONTEXT.md`.