# CourtDesk — CONTEXT
> CRM-система поиска и мониторинга судебных дел РФ.
> Единый сервис для интеграции с 1С и параллельного Web UI.
> Собирается из CourtSniffer (поиск), CourtFlow (мониторинг) и существующего скелета CourtDesk.

---

## Статус

**v0.4.0** — CR6 применён (20 замечаний: 4 CRITICAL+HIGH fixed, 8 UX fixed, 5 tech-debt). 57 тестов, tsc clean. Dashboard с управлением делами. Search с добавлением в мониторинг.

| Компонент | Статус | Последнее изменение |
|-----------|--------|---------------------|
| Архитектура | ✅ Утверждена | ARCHITECTURE.md |
| API-контракты | ✅ Утверждены (16/16) | CONTEXT.md |
| Core (типы) | ✅ Готово | NEW-006, NEW-007 |
| Security (URL allowlist) | ✅ Готово — assertCourtUrl | CR6-002 |
| Store integrity | ✅ Исправлено — corrupt backup + throw | CR6-001 |
| Captcha | ✅ Готово | CR5-006 |
| Search | ✅ Готово | CourtSniffer |
| Parse | ✅ Исправлено | BUG-003, BUG-008 |
| Intake | ✅ Исправлено | CR5-005 |
| Scheduler | ✅ Исправлено — archived race, error recovery, CourtUrlError auto-archive | CR6-004, CR6-006 |
| Store | ✅ Каскадное удаление | CR6-016 |
| API | ✅ Нет дублей роутов | CR6-008, CR6-009 |
| Tests | ✅ 57/57 зелёных | Vitest |
| tsconfig | ✅ moduleResolution: Node16 | INFRA-001 |
| CI | ✅ tsc --noEmit, 57 тестов | .github/workflows/ci.yml |
| Viewer (Dashboard) | ✅ Фильтры, пагинация, сортировка, поиск, печать, темы | CR6-007 + UX v2 |
| Viewer (Search) | ✅ Рабочий, + мониторинг, + waiting, темы | CR6-007 + UX v2 |
| CODE_REVIEW6 | ✅ Применён | 2026-07-24 |

---

## Use cases (утверждено)

### UC-0: Дашборд
- Счётчики: monitoring, waiting, decision, вступило сегодня — `GET /api/status` ✅
- Фильтры по статусу: Все / Мониторинг / Ожидание / Решение / Вступило / Ошибка / Архив ✅
- Таблица дел с действиями: детали, архивировать, удалить ✅
- Кнопка «Запустить мониторинг» — `POST /api/parse/run` ✅
- Уведомления о событиях — `GET /api/notifications` ✅
- Авто-обновление каждые 30с ✅

### UC-1: Добавить новое дело (через поиск)
- Кнопка «+📋» в результатах поиска → `POST /api/cases` ✅

### UC-2: Следить за делом
- Автоматический мониторинг через scheduler ✅

### UC-3: Отслеживать появление дела
- Форма «Отслеживать появление» в search.html → `POST /api/cases/wait` ✅
- `runNew()` через `searchByParty` ✅

### UC-4: Отслеживание решения и вступления
- `await sleep(RATE_DELAY_MS)` перед `searchByCaseNumber` на `decision`-делах ✅
- `legalForceDate` нормализуется к `YYYY-MM-DD` при записи ✅
- Error recovery: успешный прогон сбрасывает `status: 'error'` → `'monitoring'` ✅

### UC-5: Детали дела
- Timeline событий в modal — `GET /api/cases/:uid` + `GET /api/cases/:uid/events` ✅
- Архивирование / возврат / удаление ✅

### UC-6: CRM-запросы (1С)

---

## API-контракты (утверждено)

| # | Запрос | Назначение | Статус |
|---|--------|-----------|--------|
| 1 | `GET /api/status` | Счётчики + здоровье | ✅ |
| 2 | `GET /api/cases` | Список дел | ✅ |
| 3 | `GET /api/cases/:uid` | Карточка дела | ✅ |
| 4 | `POST /api/cases` | Добавить в мониторинг | ✅ |
| 5 | `PATCH /api/cases/:uid` | Обновить разрешённые поля | ✅ |
| 6 | `DELETE /api/cases/:uid` | Удалить (каскадно: events + notifications) | ✅ CR6-016 |
| 7 | `POST /api/cases/wait` | Отслеживать появление | ✅ |
| 8 | `POST /api/resolve` | Суд + номер → ссылка (URL builder) | ✅ CR6-009 |
| 9 | `POST /api/search/by-number` | Поиск по номеру | ✅ |
| 10 | `POST /api/search/by-party` | Поиск по участникам | ✅ |
| 11 | `POST /api/parse/url` | Парсинг URL (assertCourtUrl) | ✅ CR6-002 |
| 12 | `GET /api/courts?q=` | Поиск судов | ✅ |
| 13 | `GET /api/courts/:id` | Инфо о суде | ✅ |
| 14 | `GET /api/notifications` | Уведомления | ✅ |
| 15 | `POST /api/parse/run` | Асинхр парсинг (202) + 409 | ✅ CR6-013 |
| 16 | `GET /api/cases/:uid/events` | События дела (timeline) | ✅ NEW |

---

## Баги

> **70/70 закрыто.** Открытых замечаний нет.
> Полная история — в BUG_REPORT.md

---

## Tech-debt (открытые, не критичные)

| ID | Приоритет | Описание | Заметка |
|----|-----------|----------|---------|
| CR5-008 | LOW | tmp/rename без fsync | Документированный trade-off |
| CR5-009 | LOW | Нет eslint | tsc покрывает типы |
| CR5-011 | LOW | console.log вместо pino | При появлении prod-мониторинга |
| CR6-003 | MEDIUM | Zero authentication | COURTDESK_API_TOKEN в .env.example, реализация — separate sprint |
| CR6-005 | MEDIUM | waiting → results[0] без матчинга | Нужен score/party matching |
| CR6-010 | LOW | TLS rejectUnauthorized: false | Trade-off для sudrf.ru wildcard |
| CR6-012 | LOW | Puppeteer browser pool | Single-session на magistrate |
| CR6-014 | LOW | Subdomain коллизии в справочнике | 3 дубликата, 1914 без subdomain |

---

## Следующие шаги

1. **WebSocket / SSE** — push-уведомления в браузер
2. **Пагинация** — при росте числа дел > 200
3. **eslint + @typescript-eslint** — закрыть CR5-009
4. **Structured logging (pino)** — закрыть CR5-011
5. **Scheduler cron** — автозапуск `runFull()` по расписанию
6. **API token auth** — закрыть CR6-003
7. **Party matching** — закрыть CR6-005

---

## Журнал работ

| Дата | Изменение |
|------|-----------|
| 2026-07-17 | Создан репозиторий, intake-модуль + 18 тестов |
| 2026-07-21 | BUG-001..011 + search/parse/store/scheduler/captcha |
| 2026-07-22 | NEW-001..011, CR4-001..008, CR5-001..012 (50 багов закрыто) |
| 2026-07-23 | CR6 — CODE_REVIEW6.md от Cursor Agent (20 замечаний) |
| 2026-07-24 | CR6 применён: security, store integrity, route dups, archived race, error recovery. UX/UI: dashboard с управлением, search с мониторингом. Dead code cleanup. Documentation. |
| 2026-07-25 | UX/UI v2: смена тем (dark/light), пагинация, сортировка, поиск по таблице, печать, mark-all-read, Esc-close. theme.css + app.js shared. CourtUrlError → автоархивация (разрыв error-цикла). |

---

## Структура проекта

```
courtdesk/
├── packages/
│   ├── core/         — типы, справочник судов, конфиг, errors (assertCourtUrl)
│   ├── captcha/       — Puppeteer + RuCaptcha
│   ├── search/       — адаптеры поиска + shared.ts
│   ├── parse/        — адаптеры парсинга карточек
│   ├── intake/       — classify() (regex /iu)
│   ├── scheduler/    — orchestrator (CR6-004, CR6-006)
│   ├── store/        — cases, events, notifications (CR6-001, CR6-016)
│   ├── api/
│   │   ├── routes/   — 16 эндпоинтов (CR6-002, CR6-008, CR6-009, CR6-013)
│   │   └── middleware/
│   └── viewer/       — дашборд + search.html (UX v2: темы, пагинация, сортировка)
├── .env.example
├── .gitattributes
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── ARCHITECTURE.md
├── CHANGELOG.md
├── CODE_REVIEW.md
├── CODE_REVIEW6.md
├── BUG_REPORT.md
├── DECISIONS.md
└── CONTEXT.md
```