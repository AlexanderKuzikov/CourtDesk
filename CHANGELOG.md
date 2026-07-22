# CourtDesk — CHANGELOG

Все значимые изменения фиксируются здесь в формате [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/).

---

## [Unreleased]

### Added
- **CORS middleware**: разблокирован dev-режим с Vite (:5173 → API :8767)
- **Graceful shutdown**: SIGTERM/SIGINT → корректное завершение (`packages/api/server.ts`)
- **GET /api/courts** без `q=` теперь возвращает полный список судов, а не только `{ total }`
- **Shared fetchHtml/parseResults**: дублированный код из `district.ts`, `appeal.ts`, `cassation.ts` вынесен в `packages/search/shared.ts`
- **Batch updateCase**: `processOne()` делает один `updateCase` в конце, а не 3 промежуточных
- **CODE_REVIEW4.md**: документация состояния до изменений
- **SEARCH_PARAMS constants** (`packages/search/constants.ts`): hardcoded `delo_id`/`case_type` вынесены в единый конфиг, импортированы во все 4 адаптера
- **Tests**: добавлено покрытие для `makeEvent`, `GET /api/status`, `GET /api/notifications`, `POST /api/resolve`
- **Smoke test**: добавлен тест `POST /api/parse/url` для magistrate (через капча-сессию)
- **POST /api/resolve**: новый эндпоинт (суд + номер → ссылка) `packages/api/routes/resolve.ts`
- **Persistent notifications**: новое `store/notifications.ts` с JSON-хранилищем, `PATCH /api/notifications/:uid/read`, интеграция в scheduler (создание уведомлений при decision/enforced/found)

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
