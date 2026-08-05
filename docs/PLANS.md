# CourtDesk — PLANS

> Приоритизированный бэклог работ. Источник истины для планирования.
> Live-статус и журнал — в `docs/CONTEXT.md`. Архитектурные решения — в `docs/DECISIONS.md`.
> Обновлено: 2026-08-05

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
| NUM-001 | **Разнобой «номеров дела». Закрыт 2026-08-05** — caseNumber / caseUid / caseId разделены, CaseCard.uid = судебный номер |
| UI-001 | **Английские слова в интерфейсе. Закрыт 2026-08-05** — COURT_TYPE_LABELS, «УИД» |
| INFR-001 | **ENOTFOUND судовых субдоменов (live). Закрыт 2026-08-05** — таймауты капчи подняты, дела в норме. **2026-08-05 (доп.):** RuCaptcha-ключ проверен — валиден (баланс 240.58 ₽); fetchHtml ретраит 403/429 с экспоненциальным backoff (5с/10с, 3 попытки) |
| NUM-002 | **runSingle не фиксировал ошибки в деле** — исправлено 2026-08-05 (lastError/errorCount теперь обновляются при ручном перепарсинге) |
| CR11-006 | **Parse-адаптеры appeal/cassation без тестов/фикстур. Закрыт 2026-08-05** — appeal.test.ts / cassation.test.ts (22 теста, inline-фикстуры 5 вкладок); попутно починен parsePublishInfo (publishedAt был всегда null) |
| WEBUI-O2 | Мобильная адаптация |
| WEBUI-O4 | Карточка дела: вкладки/аккордеон |
| WEBUI-O5 | Календарь по legalForceDate |

## P1 · MEDIUM

| # | Описание |
|---|----------|
| CR12-004 | Navigation guard в courtdesktop: нет navigate handler в webview_go (XSS встроенных страниц закрыт 2026-08-02) |
| CR12-019 | store: кэши без eviction; `events` растёт бесконечно |
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