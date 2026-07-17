<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/Node-24_LTS-339933?logo=node.js&logoColor=white">
    <img alt="Node 24 LTS" src="https://img.shields.io/badge/Node-24_LTS-339933?logo=node.js&logoColor=white">
  </picture>
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript 7" src="https://img.shields.io/badge/TypeScript-7.0-3178C6?logo=typescript&logoColor=white"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/License-Apache_2.0-blue.svg?logo=apache&logoColor=white"></a>
</p>
<p align="center">
  <img alt="Express 5" src="https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white">
  <img alt="Cheerio 1" src="https://img.shields.io/badge/Cheerio-1.x-E88E1F?logo=html5&logoColor=white">
  <img alt="Puppeteer 25" src="https://img.shields.io/badge/Puppeteer-25-40B5A4?logo=puppeteer&logoColor=white">
</p>

<h1 align="center">CourtDesk</h1>
<p align="center">Оркестрация поиска и мониторинга судебных дел РФ</p>

---

Объединяет [**CourtSniffer**](https://github.com/AlexanderKuzikov/CourtSniffer) (поиск дел по номеру/участникам) и [**CourtFlow**](https://github.com/AlexanderKuzikov/CourtFlow) (мониторинг изменений) в единую CRM-платформу: классифицирует запрос, маршрутизирует в нужный сервис, хранит состояние и предлагает сценарии.

```
POST /api/intake { "input": "https://...case_id=..." }
→ { type: "case_card", courtId, courtType, caseId }
→ suggested: ["monitor", "notify_on_change"]
```

## Возможности

- **Классификация запросов** — URL карточки дела, номер дела, ФИО — Intake определяет намерение
- **Маршрутизация** — карточка дела → CourtFlow, поиск → CourtSniffer
- **Подсказки сценариев** — после каждого действия система предлагает следующий шаг
- **Хранение состояния** — дела, клиенты, события, сценарии (JSON)
- **Интеграция** — REST API для внешних CRM (1С, Битрикс24, самописные)
- **Единый интерфейс** — поиск по разным судам и мониторинг без перехода между сайтами

## Архитектура

```
User / CRM / TUI
       │
       ▼
┌─────────────────────────┐
│       CourtDesk          │
│                          │
│  Intake (классификатор)  │
│  Dispatcher (роутер)     │
│  CaseStore (JSON)        │
│  ScenarioService         │
└──────┬──────────┬────────┘
       │          │
       ▼          ▼
┌──────────┐ ┌──────────┐
│ Sniffer  │ │   Flow   │
│ (поиск)  │ │(мониторинг)│
└──────────┘ └──────────┘
```

**Intake** — глубокий модуль с единственным публичным интерфейсом `classify(input)`. На входе сырой запрос (URL, номер дела, ФИО), на выходе — структурированное намерение: `case_card`, `search` или `malformed`. Нижележащие сервисы получают уже классифицированные данные и не занимаются разбором.

## Быстрый старт

```bash
git clone https://github.com/AlexanderKuzikov/CourtDesk.git
cd CourtDesk
npm install
cp .env.example .env   # указать SNIFFER_URL и FLOW_URL
```

Запуск:

```bash
npm start               # API-сервер на порту 8767
```

Для работы требуются запущенные [CourtSniffer](https://github.com/AlexanderKuzikov/CourtSniffer) и [CourtFlow](https://github.com/AlexanderKuzikov/CourtFlow).

## API

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/api/intake` | Классификация запроса (URL / номер дела / ФИО) |
| `POST` | `/api/search` | Поиск дела через CourtSniffer |
| `POST` | `/api/monitor` | Добавление дела в мониторинг через CourtFlow |
| `GET` | `/api/health` | Статус сервиса |
| `GET` | `/api/config` | Публичная конфигурация |

### POST /api/intake

```json
{
  "input": "https://sverdlov--perm.sudrf.ru/modules.php?name_op=case&case_id=458075868&case_uid=...&delo_id=1540005"
}
```

Ответ:

```json
{
  "input": "...",
  "classification": {
    "type": "case_card",
    "url": "...",
    "courtId": "sverdlov--perm",
    "courtType": "district",
    "caseId": "458075868"
  },
  "suggested": ["monitor", "notify_on_change"]
}
```

## Типы судов

| Тип | Домен | Капча | Сервис |
|-----|-------|-------|--------|
| `district` | `*.sudrf.ru` | нет | Sniffer / Flow |
| `appeal` | `oblsud--*.sudrf.ru` | нет | Sniffer / Flow |
| `cassation` | `*kas.sudrf.ru` | нет | Sniffer / Flow |
| `magistrate` | `*.msudrf.ru` | RuCaptcha (Puppeteer) | Sniffer / Flow |

## Структура проекта

```
packages/
├── core/          # Типы, конфиг
├── intake/        # Классификатор запросов (URL / текст → намерение)
├── api/           # Express-сервер, маршрутизация
├── services/      # SearchService, MonitorService, CaseService, ScenarioService
└── exporter/      # Атомарная запись JSON
```

## Зависимости

- [**CourtSniffer**](https://github.com/AlexanderKuzikov/CourtSniffer) — поиск дел на порталах судов РФ
- [**CourtFlow**](https://github.com/AlexanderKuzikov/CourtFlow) — мониторинг изменений по делам

## Разработка

```bash
npm test            # vitest (18 тестов)
npm run lint        # tsc --noEmit
```

## Документация

- `ARCHITECTURE.md` — полное описание компонентов, data flow и API-контрактов
- `CONTEXT.md` — глоссарий, текущее состояние и карта кода
- `DECISIONS.md` — принятые архитектурные решения (ADR)

## Лицензия

[Apache License 2.0](LICENSE)
