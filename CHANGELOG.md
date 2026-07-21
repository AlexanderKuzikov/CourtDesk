# CourtDesk — CHANGELOG

Все значимые изменения фиксируются здесь в формате [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/).

---

## [Unreleased]

### Fixed
- **tsconfig.json**: `moduleResolution` исправлен с `bundler` на `Node16` (вместе с `module: Node16`). `bundler` предназначен для Vite/esbuild и вызывал ошибки `tsc --noEmit` в Node ESM-проекте.
- **CI workflow**: `actions/checkout@v5` и `actions/setup-node@v5` заменены на `@v4` — v5 не существует и ломал CI на первом шаге.
- **vitest.config.ts**: добавлен конфигурационный файл с `pool: 'forks'` и `environment: 'node'`.
- **packages/api/server.ts**: выделена экспортируемая функция `createApp()`. `app.listen()` остался в том же файле.

---

## [0.1.0] — 2026-07-21

### Added
- Модульная структура `packages/`: `api`, `core`, `store`, `scheduler`, `search`, `parse`, `captcha`, `intake`, `viewer`
- REST API: все 15 эндпоинтов
- JSON-хранилище с атомарной записью (tmp + rename)
- In-memory кэш в store/cases.ts (BUG-009)
- PATCH-whitelist (BUG-004), deleteCase guard (BUG-006)
- runNew через searchByParty (BUG-002), 202 Accepted (BUG-008)
- Статический import iconv (BUG-011), rate limit (RATE-001)
- Полный набор unit/smoke тестов
- Apache 2.0 лицензия
