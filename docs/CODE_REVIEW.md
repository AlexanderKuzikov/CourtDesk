# CODE REVIEW — CourtDesk

> Consolidated: 2026-07-27
> All review rounds plus post-CR10 TUI rewrite and documentation sync.

---

## Сводка

| Раунд | Дата | Ревьюер | Найдено | Исправлено | Закрыто |
|-------|------|---------|---------|------------|---------|
| CR1 | 2026-07-21 | Первичное | 11 (BUG-001..011) | 9 | 2 (не воспр.) |
| CR2 | 2026-07-22 | Первичное | 11 (NEW-001..011) | 11 | 0 |
| CR3 | 2026-07-22 | Perplexity | 8 | 8 | 0 |
| CR4 | 2026-07-22 | Perplexity (CR3→4) | 8 | 8 | 0 |
| CR5 | 2026-07-22 | Perplexity | 12 | 9 fix + 3 doc | 0 |
| CR6 | 2026-07-23 | Cursor Agent | 20 | 13 fix + UX + debt docs | 0 |
| CR7 | 2026-07-25 | OpenCode Go | 10 | 9 fix + 1 doc | 0 |
| CR8 | 2026-07-25 | OpenCode Go | 9 | 9 fix | 0 |
| CR9 | 2026-07-25 | OpenCode Go | 10 | 10 fix | 0 |
| CR10 | 2026-07-26 | Perplexity | 14 | 10 fix + полный rewrite TUI | 4 reclassified |
| **Итого** | | | **113+** | **101+ fix + doc sync** | **2** |

### Ключевой вывод по CR10

Изначальная трактовка CR10 была недостаточной: 10 замечаний были закрыты частичными patch-фиксами (`79a607b`), но практическая эксплуатация показала, что сама blessed-ветка остаётся архитектурно нежизнеспособной. Поэтому далее был выполнен **полный отказ от blessed/neo-blessed** и rewrite TUI на чистом `readline` + ANSI.

Это означает:
- CR10-001 фактически **закрыт другим способом**: не миграцией на `ink`, а удалением самого проблемного класса зависимостей.
- часть промежуточных blessed-фиксов исторически верны, но больше не определяют текущее состояние TUI;
- текущий TUI больше не зависит от `blessed`, `neo-blessed`, `neo-blessed-contrib`, `@types/blessed`.

---

## Post-CR10 — TUI rewrite (2026-07-26)

### Фактически выявленные проблемы blessed-ветки

| ID | Severity | Проблема | Итог |
|----|----------|----------|------|
| TUI-R1 | CRITICAL | `blessed` / `neo-blessed` архитектурно нестабильны на Windows / ConPTY | ✅ CLOSED через полный отказ от стека |
| TUI-R2 | HIGH | Карточка дела отображала технические идентификаторы (UUID/УИД), а не admin-friendly данные | ✅ FIXED |
| TUI-R3 | HIGH | Даты выводились в сыром ISO (`2026-07-26T09:19:27.389Z`) | ✅ FIXED |
| TUI-R4 | HIGH | Баг рендера `monitoringmonitoring` / `enforcedenforced` из-за неверного применения color/value | ✅ FIXED |
| TUI-R5 | HIGH | Вкладка «ЗАПУСК» была фактически заглушкой без понятного feedback | ✅ PARTIAL FIXED (busy state + log + HTTP errors) |
| TUI-R6 | MEDIUM | Неровные метки, пустые хвостовые строки, ломанный separator | ✅ FIXED |
| TUI-R7 | MEDIUM | URL рендерился неудобно, переносился мусорно | ✅ FIXED |
| TUI-R8 | MEDIUM | Логика клавиатуры/scroll/detail была нестабильной | ✅ FIXED |

### Коммиты rewrite-фазы

| Commit | Смысл |
|--------|-------|
| `885224d` | Удалены `neo-blessed` / `neo-blessed-contrib`, локализован источник audit-проблем |
| `bf9096e` | Полный rewrite TUI на чистый Node.js (`readline` + ANSI) |
| `2e1c1c6` | Удалены `blessed` и `@types/blessed` |
| `52fcc40` | Fix detail card layout: labels, URL wrap, tail cleanup, separator |
| `626ffae` | Human-readable card: без UUID, формат дат, исправлен double-status, переработан Run tab |

---

## Актуальный статус TUI

| Область | Статус | Комментарий |
|---------|--------|-------------|
| Зависимость от blessed | ✅ Удалена | Больше не используется |
| Linux | ✅ Работает | readline + ANSI |
| Windows | ⚠️ Требует полевой проверки | ConPTY лучше, но новый стек проще и надёжнее blessed |
| Detail card | ✅ Исправлена | Без UUID/УИД, с понятными датами |
| Double status bug | ✅ Исправлен | `monitoringmonitoring` устранён |
| Run tab | ⚠️ Частично решено | Есть log/busy/error feedback, но нет полноценного progress polling |
| UX для администратора | ✅ Существенно улучшено | UI очищен от технического мусора |

---

## Open issues после rewrite

| ID | Priority | Описание | Статус |
|----|----------|----------|--------|
| TUI-O1 | HIGH | Во вкладке «ЗАПУСК» всё ещё нет реального polling `GET /api/parse/progress` и прогресс-бара processed/total/errors | 🔴 OPEN |
| API-O1 | MEDIUM | `POST /api/cases?parse=true` по-прежнему без очереди ограничения Puppeteer | 🔴 OPEN |
| INFRA-O1 | LOW | Нет workspaces для изоляции пакетов | 🔴 OPEN |
| SEC-O1 | MEDIUM | Нет полноценной auth-защиты API | 🔴 OPEN |
| TEST-O1 | MEDIUM | Нет отдельного regression-пула snapshot/fixture тестов для TUI rendering | 🔴 OPEN |

---

## CR10 — исторический статус

### Что было закрыто patch-этапом

| ID | Описание | Статус |
|----|----------|--------|
| CR10-002 | tags в list | ✅ FIXED |
| CR10-003 | detail refresh bug | ✅ FIXED |
| CR10-005 | hardcoded widths | ✅ FIXED |
| CR10-006 | raw ANSI cursor conflict | ✅ FIXED |
| CR10-007 | interval cleanup | ✅ FIXED |
| CR10-008 | any[] вместо WatchedCase[] | ✅ FIXED |
| CR10-009 | dynamic import in hot-path | ✅ FIXED |
| CR10-011 | cron double-fire | ✅ FIXED |
| CR10-012 | dead `_retryTimer` | ✅ FIXED |
| CR10-013 | `*.log` в git | ✅ FIXED |

### Что изменило статус позже

| ID | Было | Теперь |
|----|------|--------|
| CR10-001 | blessed dead-end → open sprint | ✅ CLOSED другим путём: blessed удалён полностью |
| CR10-004 | run tab stub | ⚠️ PARTIAL: log/busy feedback есть, progress polling всё ещё open |
| CR10-010 | Puppeteer без очереди | 🔴 OPEN |
| CR10-014 | нет workspaces | 🔴 OPEN |

---

## Итоговое состояние

- Архитектурно главный провал blessed-ветки зафиксирован и устранён.
- Документация синхронизирована с реальным кодом, а не с промежуточными обещаниями.
- Основная зона дальнейшей доработки: progress polling для run tab, очередь Puppeteer, API auth, regression tests для нового TUI.
