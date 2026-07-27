# CourtDesk — CONTEXT
> CRM-система поиска и мониторинга судебных дел РФ.
> Единый сервис для интеграции с 1С и параллельного Web UI.
> Собирается из CourtSniffer (поиск), CourtFlow (мониторинг) и существующего скелета CourtDesk.

---

## Статус

**v0.5.2 (doc state)** — после CR10 выполнен полный отказ от blessed/neo-blessed. Текущий TUI — чистый Node.js (`readline` + ANSI), без внешних TUI-зависимостей.

| Компонент | Статус | Последнее изменение |
|-----------|--------|---------------------|
| Архитектура | ✅ Утверждена | ARCHITECTURE.md |
| API-контракты | ✅ Утверждены | CONTEXT.md |
| Core (типы) | ✅ errorCount, lastError, enforcedAt | 2026-07-26 |
| Security (URL allowlist) | ✅ assertCourtUrl | CR6-002 |
| Store integrity | ✅ corrupt backup + throw | CR6-001 |
| Captcha | ✅ msudrf AJAX + sudrf form | 2026-07-26 |
| Search | ✅ msudrf переписан (AJAX) | 2026-07-26 |
| Parse | ✅ sync parse при добавлении | 2026-07-26 |
| Scheduler | ✅ cron + double-fire guard | 2026-07-26 |
| Store | ✅ каскадное удаление + settings | CR6-016 |
| API | ✅ реализовано | static imports, progress, settings |
| Viewer (Dashboard) | ✅ courtName, progress bar, schedule settings | 2026-07-26 |
| Viewer (Search) | ✅ исправлен и очищен | 2026-07-26 |
| Court Hierarchy | ✅ CR9 закрыт | 2026-07-25 |
| Party Matching | ✅ pickBestMatch | 2026-07-26 |
| eslint | ✅ flat config | 2026-07-26 |
| pino | ✅ structured logging | 2026-07-26 |
| Dependency audit | ✅ TUI-vuln ветка удалена | 2026-07-26 |
| TUI | ✅ rewrite без blessed | 2026-07-26 |
| TUI UX | ⚠️ в активной доводке, но уже без UUID/ISO/double-status | 2026-07-26 |
| Docs sync | ✅ CHANGELOG/CODE_REVIEW/CONTEXT обновлены | 2026-07-27 |

---

## TUI — текущее состояние

### Архитектура

Текущий TUI больше **не** использует `blessed`, `neo-blessed`, `neo-blessed-contrib` или `@types/blessed`.

Он реализован на:
- `readline.emitKeypressEvents(process.stdin)`
- `process.stdin.setRawMode(true)`
- прямом ANSI-рендере (`cursor`, `clear line`, `alternate screen buffer`, colors)
- `fetch()` через `tuiFetch()` с AbortController timeout

### Почему старая ветка признана провальной

Старый TUI-стек создавал не локальные баги, а системный мусор:
- blessed не рендерил теги корректно;
- карточка открывалась нестабильно;
- UI содержал технические идентификаторы, бесполезные админу;
- даты были в сыром ISO-формате;
- вкладка запуска не давала понятной обратной связи;
- Windows-совместимость оставалась токсичной зоной.

### Что исправлено в текущей реализации

- detail card больше не показывает UUID/УИД в основных полях;
- статус переведён в русский человекочитаемый вид;
- устранён баг `monitoringmonitoring` / `enforcedenforced`;
- даты форматируются как `DD.MM.YYYY` и `DD.MM.YYYY HH:MM`;
- есть лог запуска во вкладке `ЗАПУСК`;
- повторный запуск блокируется, пока идёт текущий run;
- поддержаны scroll/navigation keys.

### Что всё ещё открыто

| ID | Приоритет | Описание |
|----|-----------|----------|
| TUI-O1 | HIGH | нет полноценного progress polling из `/api/parse/progress` |
| TUI-O2 | MEDIUM | нужен дополнительный UX-polish по layout/цветам/плотности интерфейса |
| TUI-O3 | MEDIUM | нужен regression-набор тестов/фикстур для TUI rendering |

---

## Актуальные open-проблемы

| ID | Приоритет | Описание | Заметка |
|----|-----------|----------|---------|
| TUI-O1 | HIGH | Run tab без live progress polling | log есть, progress bar нет |
| API-O1 | MEDIUM | Puppeteer без очереди при bulk sync parse | нужен `p-limit`/очередь |
| INFRA-O1 | LOW | Monorepo без workspaces | нет изоляции пакетов |
| SEC-O1 | MEDIUM | Zero-auth API | требуется токен/мидлварь |
| TEST-O1 | MEDIUM | Нет отдельного regression-suite для TUI | высокий риск повторных UI-регрессий |
| CR6-010 | LOW | TLS `rejectUnauthorized: false` | осознанный trade-off |
| CR6-014 | LOW | Subdomain коллизии в справочнике | legacy data issue |

---

## Use cases

### UC-0: Дашборд
- Счётчики, фильтры, таблица дел, действия, прогресс-бар, расписание, уведомления, автообновление — ✅

### UC-1: Добавить новое дело
- `POST /api/cases`, включая `?parse=true` — ✅

### UC-2: Следить за делом
- scheduler / cron / retry / full-run — ✅

### UC-3: Отслеживать появление дела
- `POST /api/cases/wait`, party matching — ✅

### UC-4: Отслеживание решения и вступления
- `legalForceDate`, `enforcedAt`, grace period — ✅

### UC-5: Детали дела
- Web UI: modal + timeline — ✅
- TUI: human-readable detail card — ✅

---

## API-контракты

Основные endpoints сохранены и актуальны, включая:
- `/api/status`
- `/api/cases`
- `/api/cases/:uid`
- `/api/cases/:uid/events`
- `/api/cases/:uid/card`
- `/api/search/by-number`
- `/api/search/by-party`
- `/api/resolve`
- `/api/parse/url`
- `/api/parse/run`
- `/api/parse/progress`
- `/api/settings`
- `/api/notifications`

---

## Журнал работ

| Дата | Изменение |
|------|-----------|
| 2026-07-21 .. 2026-07-25 | CR1–CR9: security, search, parse, hierarchy, UI, store integrity |
| 2026-07-26 | v0.5.0: msudrf AJAX rewrite, progress API, settings, sync parse, party matching, eslint, pino |
| 2026-07-26 | `79a607b`: частичные CR10 patch fixes |
| 2026-07-26 | `885224d`: удалены `neo-blessed` / `neo-blessed-contrib` |
| 2026-07-26 | `bf9096e`: полный rewrite TUI на `readline` + ANSI |
| 2026-07-26 | `2e1c1c6`: удалены `blessed` и `@types/blessed` |
| 2026-07-26 | `52fcc40`: fix detail-card layout |
| 2026-07-26 | `626ffae`: человекочитаемая карточка, даты, run tab, удаление UUID из UI |
| 2026-07-27 | документация синхронизирована с фактическим кодом |

---

## Структура проекта

```text
courtdesk/
├── packages/
│   ├── core/
│   ├── captcha/
│   ├── search/
│   ├── parse/
│   ├── intake/
│   ├── scheduler/
│   ├── store/
│   ├── api/
│   ├── tui/          — readline + ANSI, без blessed
│   └── viewer/
├── ARCHITECTURE.md
├── BUG_REPORT.md
├── CHANGELOG.md
├── CODE_REVIEW.md
├── CONTEXT.md
└── package.json
```
