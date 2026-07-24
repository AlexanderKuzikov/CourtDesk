<p align="center">
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript 7" src="https://img.shields.io/badge/TypeScript-7.0-3178C6?logo=typescript&logoColor=white"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/License-Apache_2.0-blue.svg?logo=apache&logoColor=white"></a>
  <a href="https://nodejs.org/"><img alt="Node 24" src="https://img.shields.io/badge/Node-24.15-339933?logo=node.js&logoColor=white"></a>
  <a href="https://expressjs.com/"><img alt="Express 5" src="https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white"></a>
  <a href="https://pptr.dev/"><img alt="Puppeteer 25" src="https://img.shields.io/badge/Puppeteer-25-40B5A4?logo=puppeteer&logoColor=white"></a>
  <a href="https://github.com/AlexanderKuzikov/CourtDesk"><img alt="GitHub" src="https://img.shields.io/badge/GitHub-repo-181717?logo=github&logoColor=white"></a>
  <a href="https://github.com/AlexanderKuzikov/CourtDesk/actions"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/AlexanderKuzikov/CourtDesk/ci.yml?logo=githubactions&logoColor=white"></a>
</p>

<h1 align="center">CourtDesk 🏛️</h1>
<p align="center">Поиск и мониторинг судебных дел РФ</p>

Поиск и мониторинг судебных дел РФ. Единый API для 1С и браузерный UI для юристов.

- **Поиск** — по номеру дела или участникам на sudrf.ru/msudrf.ru. Один интерфейс для всех типов судов. Капча — автоматически.
- **Мониторинг** — отслеживание изменений по делу, появление новых событий, вынесение решения, вступление в силу.
- **Web UI** — дашборд с фильтрами, управление делами (архивирование, удаление), детали дела с timeline событий, кнопка запуска мониторинга.
- **API** — REST/JSON, 16 эндпоинтов для 1С.

**Состав проекта:** собирает функционал CourtSniffer (поиск) и CourtFlow (мониторинг) в единый сервис.

## Быстрый старт

```bash
git clone https://github.com/AlexanderKuzikov/CourtDesk.git
cd CourtDesk
npm install
cp .env.example .env   # RUCAPTCHA_API_KEY для капчи мировых судов
npm run dev
```

Откройте `http://127.0.0.1:8767` — дашборд. Для поиска дел — `/search.html`.

## Документация

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — полная архитектура, data flow, модули
- [`CONTEXT.md`](CONTEXT.md) — состояние, use cases, API-контракты, журнал работ
- [`DECISIONS.md`](DECISIONS.md) — принятые решения (ADR)
- [`CODE_REVIEW.md`](CODE_REVIEW.md) — все раунды ревью с прогрессом
- [`CHANGELOG.md`](CHANGELOG.md) — история изменений

## Статус

**v0.4.0** — 57 тестов, tsc clean, CI зелёный. CR6 (20 замечаний) применён. Dashboard с управлением делами. Search с добавлением в мониторинг.

## Лицензия

[Apache-2.0](LICENSE) © Alexander Kuzikov