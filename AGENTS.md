# CourtDesk — Instructions for AI Agents

## Commands

- **start:** `npm start` — API на http://127.0.0.1:8767
- **dev:** `npm run dev` — с watch-режимом
- **test:** `npm test` — vitest (181 тест)
- **test:coverage:** `npm run test:coverage` — с coverage-гейтом (v8)
- **lint:** `npm run lint` — tsc --noEmit
- **lint:biome:** `npm run lint:biome` — Biome, пакеты кроме замороженного tui (гейт — только error; warnings — легаси-шум)
- **build:desktop:** `go build -ldflags="-s -w -H windowsgui" -o courtdesktop.exe .` (в `packages/courtdesktop/`; `-H windowsgui` обязателен — без него рядом открывается чёрное консольное окно)

## Conventions

- **Runtime:** Node.js ≥22, TypeScript 7, Express 5
- **ESM:** `"type": "module"`, import с `.js` расширением
- **Стиль:** без `any`, без `console.log` (pino), `prefer-const`
- **Коммиты:** на русском или английском, повелительное наклонение, ≤72 символа
- **Коммиты в main напрямую**, без feature-веток
- **Коммитит только пользователь.** Агент не коммитит и не пушит никогда

## Structure

```
CourtDesk/
├── packages/
│   ├── core/           # Типы, справочник судов, encoding, config, logger
│   ├── captcha/        # Puppeteer + RuCaptcha
│   ├── search/         # Адаптеры поиска (district, appeal, cassation, magistrate)
│   ├── parse/          # Адаптеры парсинга карточек
│   ├── intake/         # classify() — regex /iu
│   ├── scheduler/      # orchestrator + cron
│   ├── store/          # cases, events, notifications, cards, settings (JSON)
│   ├── api/            # Express 5, 26 эндпоинтов
│   │   ├── routes/     # +тесты (181 total)
│   │   └── middleware/
│   ├── tui/            # Node TUI (заморожен)
│   ├── tui-go/         # Go TUI (заморожен)
│   ├── courtdesktop/   # Go Desktop App (WebView, ~6.9 MB)
│   └── viewer/public/  # Web UI (vanilla JS, без бандлера)
├── docs/               # Документация
├── data/               # JSON-хранилище
└── logs/               # pino-логи
```

## Do NOT touch

- `data/` — JSON-хранилище, генерируется приложением
- `logs/` — логи, не коммитить
- `node_modules/` — зависимости

## Frontend conventions (viewer/public/)

- **Без бандлера.** Vanilla JS, никаких npm-зависимостей во frontend.
- **Без TypeScript в браузере.** tsx — для Node.js, viewer — чистый JS.
- **XSS-safe:** любой user-контент — только через `esc()` из `app.js`.
- **Event delegation** через `document.querySelector('.table').addEventListener(...)`.
- **data-* атрибуты** для хранения идентификаторов.
- **CSS variables** для темы (`data-theme`, `data-skin`).
- **Никаких сторонних UI-библиотек.** Только system-ui.
- **Изменения только в `packages/viewer/public/`.** Backend (API, store, scheduler) НЕ трогать.

## Documentation rules

- После работы — обнови `docs/CONTEXT.md`
- Архитектурное решение — запиши в `docs/DECISIONS.md`
- НЕ создавай новых `.md` файлов без разрешения
- Переиспользуемые знания — в `D:\GitHub\knowledge/README.md`
- Техдолг / баги / open-проблемы — только в `docs/CONTEXT.md`
