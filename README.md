<p align="center">
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript 7" src="https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/License-Apache_2.0-blue.svg?logo=apache&logoColor=white"></a>
  <a href="https://nodejs.org/"><img alt="Node 22" src="https://img.shields.io/badge/Node-22-339933?logo=node.js&logoColor=white"></a>
  <a href="https://expressjs.com/"><img alt="Express 5" src="https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white"></a>
  <a href="https://pptr.dev/"><img alt="Puppeteer 25" src="https://img.shields.io/badge/Puppeteer-25-40B5A4?logo=puppeteer&logoColor=white"></a>
  <a href="https://go.dev/"><img alt="Go 1.26" src="https://img.shields.io/badge/Go-1.26-00ADD8?logo=go&logoColor=white"></a>
  <a href="https://github.com/AlexanderKuzikov/CourtDesk"><img alt="GitHub" src="https://img.shields.io/badge/GitHub-repo-181717?logo=github&logoColor=white"></a>
</p>

<h1 align="center">CourtDesk 🏛️</h1>
<p align="center">Поиск и мониторинг судебных дел РФ</p>

---

Поиск и мониторинг судебных дел РФ. Единый API для 1С, браузерный UI и десктопное приложение на Go+WebView.

- **Поиск** — по номеру дела или участникам на sudrf.ru/msudrf.ru. Один интерфейс для всех типов судов. Капча — автоматически.
- **Мониторинг** — отслеживание изменений по делу, появление новых событий, вынесение решения, вступление в силу. Прогресс с индикацией статуса.
- **Web UI** — три варианта:
  - **Дашборд** (`/`) — счётчики, фильтры, таблица дел с детальной модалкой, настройки расписания.
  - **Терминал** (`/terminal.html`) — Bloomberg-стиль: sticky cmd-bar, multi-sort, vim-keys, режимы, saved views, statusline.
  - **Поиск** (`/search.html`) — выбор суда, поиск по номеру/участникам/УИД, добавление в мониторинг.
- **Desktop App** (`packages/courtdesktop/`) — нативное приложение на Go+WebView (6 MB). Использует тот же Web UI. Поддержка настраиваемого API URL.
- **TUI** — терминальный интерфейс на Go (Bubble Tea), без внешних TUI-зависимостей.
- **API** — REST/JSON, 25 эндпоинтов для 1С.

## Быстрый старт

### API сервер

```bash
git clone https://github.com/AlexanderKuzikov/CourtDesk.git
cd CourtDesk
npm install
cp .env.example .env   # RUCAPTCHA_API_KEY для капчи мировых судов
npm start              # API на http://127.0.0.1:8767
```

### Web UI

Откройте `http://127.0.0.1:8767` в браузере:
- `/` — дашборд
- `/search.html` — поиск дел
- `/terminal.html` — терминальный интерфейс (Bloomberg-стиль)

### Desktop App (Go + WebView)

```bash
cd packages/courtdesktop
go build -ldflags="-H windowsgui" -o courtdesktop.exe .
./courtdesktop.exe              # Обычный режим (1920x1080)
./courtdesktop.exe -fullscreen  # Полноэкранный режим
```

**Настройки:** `Ctrl+,` — открыть настройки (выбор API URL и темы). Профиль в `~/.config/courtdesk/profile.json`.

**Кроссплатформенность:** Windows (WebView2), Linux (WebKitGTK), macOS (WKWebView). Размер бинарника ~6 MB.

## Документация

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — архитектура, data flow, модули
- [`docs/CONTEXT.md`](docs/CONTEXT.md) — состояние, open-проблемы, журнал работ
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — архитектурные решения (ADR)
- [`docs/API.md`](docs/API.md) — 25 эндпоинтов API для 1С, примеры

## Статус

**v0.7.0** — Desktop App на Go+WebView (6 MB). Web UI: Terminal + Skins + прогресс мониторинга. API: 94 теста, 25 эндпоинтов. Node ≥22.

## Лицензия

[Apache-2.0](LICENSE) © Alexander Kuzikov
