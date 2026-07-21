<p align="center">
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript 7" src="https://img.shields.io/badge/TypeScript-7.0-3178C6?logo=typescript&logoColor=white"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/License-Apache_2.0-blue.svg?logo=apache&logoColor=white"></a>
  <a href="https://nodejs.org/"><img alt="Node 24" src="https://img.shields.io/badge/Node-24.15-339933?logo=node.js&logoColor=white"></a>
  <a href="https://expressjs.com/"><img alt="Express 5" src="https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white"></a>
  <a href="https://pptr.dev/"><img alt="Puppeteer 25" src="https://img.shields.io/badge/Puppeteer-25-40B5A4?logo=puppeteer&logoColor=white"></a>
  <a href="https://github.com/AlexanderKuzikov/CourtDesk"><img alt="GitHub" src="https://img.shields.io/badge/GitHub-repo-181717?logo=github&logoColor=white"></a>
</p>

<h1 align="center">CourtDesk 🏛️</h1>
<p align="center">Поиск и мониторинг судебных дел РФ</p>

Поиск и мониторинг судебных дел РФ. Единый API для 1С и браузерный UI для юристов.

- **Поиск** — по номеру дела или участникам на sudrf.ru/msudrf.ru. Один интерфейс для всех типов судов. Капча — автоматически.
- **Мониторинг** — отслеживание изменений по делу, появление новых событий, вынесение решения, вступление в силу.
- **API** — REST/JSON, 15 эндпоинтов для 1С.
- **Web UI** — дашборд с фильтрами, поиск, история изменений.

**Состав проекта:** собирает функционал CourtSniffer (поиск) и CourtFlow (мониторинг) в единый сервис.

## Быстрый старт

```bash
git clone https://github.com/AlexanderKuzikov/CourtDesk.git
cd CourtDesk
npm install
cp .env.example .env   # RUCAPTCHA_API_KEY для капчи
npm run dev
```

## Документация

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — полная архитектура, data flow, модули
- [`CONTEXT.md`](CONTEXT.md) — состояние, use cases, API-контракты, журнал работ
- [`DECISIONS.md`](DECISIONS.md) — принятые решения (ADR)

## Статус

**v0.1.0** — архитектура утверждена, начата разработка.

## Лицензия

[Apache-2.0](LICENSE) © Alexander Kuzikov
