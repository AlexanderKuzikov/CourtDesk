# CourtDesk — CONTEXT

> **Authoritative handoff.** Этот документ является источником фактов для передачи работы между сессиями и моделями.

## Назначение

CourtDesk — CRM-оркестратор для юристов. Принимает intent от пользователя или внешней CRM, маршрутизирует запросы в CourtSniffer (поиск) и CourtFlow (мониторинг), хранит состояние дел, предлагает сценарии и отправляет уведомления.

## Архитектура верхнего уровня

```
CourtDesk (API + Services + Storage)
  ├── SearchService   → REST → CourtSniffer
  ├── MonitorService  → REST → CourtFlow
  ├── CaseService     → локальное состояние (SQLite)
  ├── ScenarioService → подсказки сценариев
  └── WebhookService  → PUSH во внешние CRM
```

## Карта кода

| Путь | Роль |
|---|---|
| `packages/core` | типы, конфиг, URL-утилиты |
| `packages/api` | Express сервер, REST endpoints |
| `packages/services` | SearchService, MonitorService, CaseService, ScenarioService, WebhookService |
| `packages/storage` | SQLite слой |

## Инварианты

- CourtDesk **не парсит HTML** — это делают Sniffer и Flow.
- CourtDesk **не ходит на sudrf.ru напрямую** — только через Sniffer/Flow API.
- Выходные данные (Case, событие) используют те же типы, что Sniffer и Flow.
- Секреты — только в `.env`.

## Зависимости от других проектов

- **CourtSniffer** — поиск дел по номеру/участникам
- **CourtFlow** — мониторинг дел по URL

## Статус проекта

v0.1.0. Создан репозиторий, спроектирована архитектура. Реализация не начата.

## Верификация

```bash
npm test          # нет тестов (v0.1.0)
npx tsc --noEmit  # нет ошибок
```

### SHA: HEAD

## Журнал работ

| Дата | Изменение | Проверка |
|---|---|---|
| 2026-07-17 | Создан репозиторий, архитектурный ADR | git history |

## Старт следующей сессии

1. Прочитать CONTEXT.md, DECISIONS.md, CODE_REVIEW.md
2. Выполнить `git status`, `git log --oneline -20`
3. Проверить `npx tsc --noEmit`
4. Выбрать одну задачу для реализации
