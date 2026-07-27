# CourtDesk — CONTEXT
> CRM-система поиска и мониторинга судебных дел РФ.
> Единый сервис для интеграции с 1С и параллельного Web UI.
> Собирается из CourtSniffer (поиск), CourtFlow (мониторинг) и существующего скелета CourtDesk.

---

## Статус

**v0.5.2** — docs/ почищен от мусора, документация актуальна. API покрыт тестами на 94 теста (все эндпоинты). TUI на readline+ANSI.

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
| Viewer (Dashboard) | ✅ courtName, progress bar, schedule settings | 2026-07-26 |
| Viewer (Search) | ✅ исправлен и очищен | 2026-07-26 |
| Court Hierarchy | ✅ CR9 закрыт | 2026-07-25 |
| Party Matching | ✅ pickBestMatch | 2026-07-26 |
| eslint | ✅ flat config | 2026-07-26 |
| pino | ✅ structured logging | 2026-07-26 |
| Dependency audit | ✅ TUI-vuln ветка удалена | 2026-07-26 |
| TUI | ✅ rewrite без blessed | 2026-07-26 |
| TUI UX | ⚠️ в активной доводке | 2026-07-26 |
| API tests | ✅ 94 тестов, покрытие всех эндпоинтов | 2026-07-27 |
| Docs | ✅ docs/ почищен, CRM-INTEGRATION обновлён | 2026-07-27 |

---

## TUI — текущее состояние

Полный отказ от blessed/neo-blessed. Текущий TUI — чистый Node.js (`readline` + ANSI), 0 внешних TUI-зависимостей.

Статус: ⚠️ требует кардинальной переработки (сейчас полное говно).

---

## Актуальные open-проблемы

| ID | Приоритет | Описание | Заметка |
|----|-----------|----------|---------|
| TUI-O1 | HIGH | Run tab без live progress polling | log есть, progress bar нет |
| API-O1 | MEDIUM | Puppeteer без очереди при bulk sync parse | нужен `p-limit`/очередь |
| SEC-O1 | MEDIUM | Zero-auth API | требуется токен/мидлварь |
| INFRA-O1 | LOW | Monorepo без workspaces | нет изоляции пакетов |
| TEST-O1 | MEDIUM | Нет regression-тестов для TUI | высокий риск регрессий |

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
│   ├── tui/            — readline + ANSI, без blessed
│   └── viewer/         — дашборд + search.html
├── data/               — JSON-хранилище
├── logs/               — pino-логи
├── README.md
├── package.json
├── tsconfig.json
└── vitest.config.ts
```
