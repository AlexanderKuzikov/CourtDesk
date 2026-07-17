# CourtDesk — CONTEXT

## Назначение

CourtDesk — CRM-оркестратор для юристов. Принимает intent от пользователя или внешней CRM, маршрутизирует запросы в CourtSniffer (поиск) и CourtFlow (мониторинг), хранит состояние дел, предлагает сценарии и отправляет уведомления.

## Карта кода

| Путь | Роль |
|---|---|
| `packages/core` | типы, конфиг |
| `packages/api` | Express сервер, REST endpoints |
| `packages/services` | SearchService, MonitorService, CaseService, ScenarioService, WebhookService |
| `packages/exporter` | атомарная запись JSON |

## Инварианты

- CourtDesk не парсит HTML — это делают Sniffer и Flow.
- CourtDesk не ходит на sudrf.ru напрямую — только через Sniffer/Flow API.
- Хранение — JSON-файлы (tmp + rename), без БД.
- Секреты — только в .env.

## Зависимости

- **CourtSniffer** — поиск дел по номеру/участникам
- **CourtFlow** — мониторинг дел по URL

## Статус

v0.1.0. Создан репозиторий, спроектирована архитектура. Реализация не начата.
