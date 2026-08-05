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
| NUM-001 | **Разнобой «номеров дела».** Три разных номера смешаны в `uid`/`caseNumber`/`caseId`: судебный номер («2-124/2026»), УИД ГАС «Правосудие» (UUID), картотечный `case_id`. План: чётко разделить 3 поля (caseNumber / caseUid / caseId), `CaseCard.uid` = судебный номер, передавать `caseUid` при добавлении из поиска |
| UI-001 | **Английские слова в интерфейсе.** `courtType` (district/appeal/cassation/magistrate) выводится в бейджах сырым. План: `COURT_TYPE_LABELS` в app.js, русские подписи («Районный суд» и т.д.), «Case UID» → «УИД». Только отображение, enum в API/данных не менять |
| INFR-001 | **ENOTFOUND судовых субдоменов (live).** Диагноз закрыт (2026-08-05): субдомены живы, DNS резолвится (84.42.111.139). Причины: (1) утренний ENOTFOUND — временный DNS-сбой; (2) WAF ГАС банит IP по rate-limit при интенсивных запросах (телефон/VPN с другим IP открывает msudrf; наш VPN-IP получал 403 — бан временный, после отключения VPN суды доступны); (3) `35.perm.msudrf.ru` доступен, но RuCaptcha-ключ невалиден (`ERROR_KEY_DOES_NOT_EXIST` — проверить ротацию); (4) WAF замедляет ответы до 1-2 минут. **Фикс 2026-08-05:** таймауты капча-пайплайна подняты (goto/navigation 120с, waitForFunction/locator 90с, fetch капчи 60с) — пайплайн переживает тормоза. Проверено: fetchMsudrfSearch (поиск) и fetchWithCaptcha (карточка) работают, дела 33-8030 и 2-800 вышли из error→monitoring. **Осталось:** проверить RuCaptcha-ключ, в fetch-слое добавить backoff при 403 |
| NUM-002 | **runSingle не фиксировал ошибки в деле** — исправлено 2026-08-05 (lastError/errorCount теперь обновляются при ручном перепарсинге) |
| CR11-006 | Parse-адаптеры appeal/cassation без тестов/фикстур (district/magistrate закрыты) |
| WEBUI-O2 | Мобильная адаптация |
| WEBUI-O4 | Карточка дела: вкладки/аккордеон |
| WEBUI-O5 | Календарь по legalForceDate |

## P1 · MEDIUM

| # | Описание |
|---|----------|
| CR12-004 | Navigation guard в courtdesktop: нет navigate handler в webview_go (XSS встроенных страниц закрыт 2026-08-02) |
| CR12-019 | store: кэши без eviction; `events` растёт бесконечно |
| CR12-S10 | `intake/classify.ts:8` — `[А-ЯA-Z]?` без `Ё`; латинские имена не классифицируются; нет лимита длины входа |
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