<p align="center">
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript 7" src="https://img.shields.io/badge/TypeScript-7.0-3178C6?logo=typescript&logoColor=white"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/License-Apache_2.0-blue.svg?logo=apache&logoColor=white"></a>
  <a href="https://nodejs.org/"><img alt="Node 24" src="https://img.shields.io/badge/Node-24.15-339933?logo=node.js&logoColor=white"></a>
  <a href="https://expressjs.com/"><img alt="Express 5" src="https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white"></a>
  <a href="https://pptr.dev/"><img alt="Puppeteer 25" src="https://img.shields.io/badge/Puppeteer-25-40B5A4?logo=puppeteer&logoColor=white"></a>
  <a href="https://go.dev/"><img alt="Go 1.22" src="https://img.shields.io/badge/Go-1.22-00ADD8?logo=go&logoColor=white"></a>
  <a href="https://github.com/AlexanderKuzikov/CourtDesk"><img alt="GitHub" src="https://img.shields.io/badge/GitHub-repo-181717?logo=github&logoColor=white"></a>
  <a href="https://github.com/AlexanderKuzikov/CourtDesk/actions"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/AlexanderKuzikov/CourtDesk/ci.yml?logo=githubactions&logoColor=white"></a>
</p>

<h1 align="center">CourtDesk 🏛️</h1>
<p align="center">Поиск и мониторинг судебных дел РФ</p>

Поиск и мониторинг судебных дел РФ. Единый API для 1С, браузерный UI и десктопное приложение на Go+WebView.

- **Поиск** — по номеру дела или участникам на sudrf.ru/msudrf.ru. Один интерфейс для всех типов судов. Капча — автоматически.
- **Мониторинг** — отслеживание изменений по делу, появление новых событий, вынесение решения, вступление в силу. Прогресс с индикацией статуса каждого дела.
- **Web UI** — три варианта работы с делами:
  - **Дашборд** (`/`) — счётчики, фильтры по статусу, таблица дел с детальной модалкой, настройки расписания.
  - **Терминал** (`/terminal.html`) — Bloomberg-стиль: sticky cmd-bar, multi-sort, vim-keys (j/k/gg/G), режимы (Обычный/Поиск/Команда), saved views, statusline. Подходит для плотной работы.
  - **Поиск** (`/search.html`) — выбор суда, поиск по номеру/участникам/УИД, добавление в мониторинг.
  - **Оформление** — кнопка 🎨 в шапке переключает 3 скина (Стандарт/Бумага/Компактный) × 5 тем (Slate/Light/Paper/Forest/Contrast). Сохраняется в localStorage.
- **Desktop App** (`packages/courtdesktop/`) — нативное десктопное приложение на Go+WebView (6 MB). Использует тот же Web UI, оборачивая его в нативное окно. Поддержка настраиваемого API URL (локальный/удалённый сервер).
- **TUI** — терминальный интерфейс на `readline`+ANSI (`packages/tui/`), без внешних TUI-зависимостей.
- **API** — REST/JSON, 25 эндпоинтов для 1С.

> **Web UI в активной доработке.** Гэпы из `PROMPT_WEBUI.md` (skeleton-загрузчики, мобильная адаптация, календарь ближайших дат, массовые операции, CSV-экспорт, вынос JS из HTML и пр.) — открыты как `WEBUI-O1..O15`, см. `docs/CONTEXT.md`.

**Состав проекта:** собирает функционал CourtSniffer (поиск) и CourtFlow (мониторинг) в единый сервис.

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

**Настройки:**
- `Ctrl+,` — открыть настройки (выбор API URL и темы)
- Профиль хранится в `~/.config/courtdesk/profile.json`
- Поддержка удалённых серверов (измените API URL в настройках)

**Размер бинарника:** ~6 MB (WebView2 runtime встроен в Windows 10/11)

**Кроссплатформенность:**
- **Windows** — WebView2 (Edge Chromium, встроен в Windows 10/11)
- **Linux** — WebKitGTK (`libwebkit2gtk-4.0`, обычно предустановлен)
- **macOS** — WKWebView (встроен в macOS)

Сборка для Linux:
```bash
GOOS=linux GOARCH=amd64 go build -o courtdesktop .
```

## Документация

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — полная архитектура, data flow, модули
- [`docs/CONTEXT.md`](docs/CONTEXT.md) — состояние, open-проблемы, журнал работ, структура
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — принятые решения (ADR)
- [`docs/CODE_REVIEW.md`](docs/CODE_REVIEW.md) — все раунды ревью с прогрессом
- [`docs/CHANGELOG.md`](docs/CHANGELOG.md) — история изменений
- [`docs/CRM-INTEGRATION.md`](docs/CRM-INTEGRATION.md) — 25 эндпоинтов API для 1С, примеры
- [`PROMPT_WEBUI.md`](PROMPT_WEBUI.md) — список гэпов Web UI (статус O1–O15)
- [`packages/courtdesktop/IMPLEMENTATION.md`](packages/courtdesktop/IMPLEMENTATION.md) — детали Desktop App

## Статус

**v0.7.0** — Desktop App на Go+WebView (6 MB). Web UI: Terminal view + skin-axis + прогресс мониторинга. Гэпы `PROMPT_WEBUI.md` (O1–O15) не закрыты. API: 94 теста, 25 эндпоинтов. TUI: readline+ANSI без blessed. Node engine ≥22.

## Лицензия

[Apache-2.0](LICENSE) © Alexander Kuzikov
