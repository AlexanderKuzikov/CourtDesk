# Web UI — промпт для сессии доработки

> ## Статус сессии (2026-07-27, v0.6.0)
>
> **Закрыто пунктов PROMPT_WEBUI: 0 из 15.** Все O1–O15 ниже — не сделаны.
>
> **Сделано взамен (отдельная ось):**
>
> | # | Что | Files | Покрывает пункт PROMPT? |
> |---|-----|-------|-------------------------|
> | A | Terminal view (Bloomberg-style layout): sticky cmd-bar/thead, multi-sort, vim-keys (j/k/gg/G/C-d/C-u), hotkeys (Enter/a/d/r/m/n/?/1-7/`/), saved views (`:сохр/...`), statusline, лог-сайдбар | `terminal.html` 210 строк, `terminal.js` 720 строк | **Нет** — новый layout, не доработка существующего dashboard |
> | B | Skins: 3 варианта оформления (corporate/«Бумага»/compact) ортогонально `data-theme` (dark/light) | `theme.css` +140, `app.js` skin-toggle, `index/search/terminal.html` (inline `_t()` от FOUC, св-во `🎨` в nav) | **Нет** — косметика палитры/шрифта/радиуса, не UX-паттерн |
>
> **Архитектурное замечание:** skin ≠ layout. «3 варианта оформления» первым проходом трактовано как «3 палитры», что **не равно** «3 UX-паттерна» (Terminal/Kanban/Calendar). Реальные гэпы PROMPT_WEBUI (skeleton, mobile, календарь, bulk, CSV, retry, фикс карточки и т.д.) — не тронуты.
>
> **Открыты как `WEBUI-O1..O15`** (см. `docs/CONTEXT.md` → «Web UI open-проблемы») — соответствуют пунктам ниже 1:1, статус не изменён.
>
> **Следующий шаг:** либо закрывать O1–O14 по приоритетам PROMPT (terminal/dashboard/search), либо достраивать параллельный layout-вариант Kanban/Calendar (O15). Решение за заказчиком.

## Контекст

CourtDesk — CRM-система поиска и мониторинга судебных дел РФ. Web UI находится в `packages/viewer/public/` и состоит из 4 файлов без бандлера. Сервер — Express 5 на `packages/api/server.ts`, статика раздаётся через `express.static`.

**Текущее состояние UI:** функциональный минимум есть, но UX сырой (визуально «полное говно» в оценке автора). Нужно поднять до уровня «нормально выглядит и удобно».

> **Post-3acca обновление (v0.6.0):** добавлены `terminal.html`/`terminal.js` (новый layout Bloomberg-стиля) и skin-axis (`data-skin="corporate|legal|compact"`). Файлы ниже перечислены для исходного dashboard/search — Terminal не заменяет их, а добавляется как 3-я страница (`/terminal.html`), доступ через nav.

## Файлы

| Файл | Размер | Роль |
|------|--------|------|
| `index.html` | 513 строк | Дашборд: счётчики, таблица дел, фильтры, модалка деталей, уведомления, настройки расписания |
| `search.html` | 381 строка | Поиск дел: выбор суда, поиск по номеру/участникам/УИД, результаты, добавление в мониторинг |
| `app.js` | 61 строка | Шаред: theme toggle, esc(), toast, formatTime/Date, esc(), safeUrl() |
| `theme.css` | 170 строк | CSS variables — тёмная/светлая тема, кнопки, badge, таблицы, модалка, тост, пагинация, печать |

### index.html

Встроенный JS (строки 140–511). Основные функции:
- `loadDashboard()` — поллинг `/api/status` + `/api/cases` + `/api/notifications`, рендер счётчиков и таблицы
- `renderTable()` — сортировка (`toggleSort`), пагинация (20 на страницу), фильтр по статусу + поиск по номеру/суду
- `openDetail(uid)` — загружает `/api/cases/:uid` + `/events` + `/card`, рендерит карточку, участников, движение дела, timeline мониторинга
- `runMonitor()` — POST `/api/parse/run`, прогресс-бар с поллингом `/api/parse/progress` каждые 5с
- `archiveCase` / `unarchiveCase` / `deleteCase` — PATCH/DELETE
- `markAllRead()` — PATCH всех непрочитанных уведомлений
- `openSettings` / `saveSettings` — модалка настроек, GET/PUT `/api/settings`
- Автообновление каждые 30с, отключается при `visibilitychange`

### search.html

Встроенный JS (строки 120–378). Основные функции:
- `searchCourts(q)` — поиск судов через `/api/courts?q=` с debounce 300ms, выпадающий список
- `selectCourt(id)` — выбор суда, подгрузка названия через `/api/courts/:id`
- `switchMode(mode)` — переключение вкладок: по участникам / по номеру / по УИД
- `doSearch()` — POST `/api/search/by-number` / `by-party` / `by-case-uid`, рендер результатов
- `addToMonitor(idx)` — POST `/api/cases?parse=true` (синхронный парсинг), кнопка +📋
- `addWait()` — POST `/api/cases/wait` (отслеживание появления)
- `openDetail(idx)` — POST `/api/parse/url` для получения карточки, отображение деталей

### app.js — shared

- `initTheme()` / `toggleTheme()` — светлая/тёмная, сохраняет в localStorage
- `esc(s)` — XSS-safe экранирование (всегда использовать при вставке user-данных)
- `safeUrl(u)` — валидация URL для ссылок
- `formatTime` / `formatDate` — форматирование ISO дат для RU локали
- `showToast(msg, type)` — тост-уведомление (success/error), 3 секунды
- `debounce(fn, ms)` — debounce
- Escape — закрывает любую открытую модалку `.detail.open`

### theme.css

CSS variables в `[data-theme="dark"]` (корень) и `[data-theme="light"]`.
- Цвета: bg, surface, border, text, primary, success, warning, danger, purple
- Badge-цвета под каждый статус и тип суда
- Print styles: скрыть хедер, тулбар, фильтры, кнопки, уведомления

## API, доступное UI

| Эндпоинт | Используется где |
|----------|-----------------|
| `GET /api/status` | dashboard — счётчики |
| `GET /api/cases` | dashboard — таблица дел |
| `GET /api/cases/:uid` | dashboard — карточка дела |
| `GET /api/cases/:uid/events` | dashboard — timeline |
| `GET /api/cases/:uid/card` | dashboard — полная карточка (court info, parties, events) |
| `POST /api/cases` + `?parse=true` | search — добавление в мониторинг |
| `POST /api/cases/wait` | search — отслеживание появления |
| `PATCH /api/cases/:uid` | dashboard — архив/возврат |
| `DELETE /api/cases/:uid` | dashboard — удаление |
| `POST /api/search/by-number` | search — поиск по номеру |
| `POST /api/search/by-party` | search — поиск по участникам |
| `POST /api/search/by-case-uid` | search — поиск по УИД |
| `POST /api/parse/url` | search — получение карточки при деталях |
| `POST /api/parse/run` | dashboard — запуск мониторинга |
| `GET /api/parse/progress` | dashboard — прогресс-бар |
| `GET /api/settings` | dashboard — настройки расписания |
| `PUT /api/settings` | dashboard — сохранить настройки |
| `GET /api/notifications` | dashboard — уведомления |
| `PATCH /api/notifications/:uid/read` | dashboard — отметить прочитанным |
| `GET /api/courts?q=` | search — поиск судов |
| `GET /api/courts/:id` | search — инфо о суде |

## Известные проблемы (что нужно доработать)

### Визуал и UX (критично)
1. **Вёрстка «дешёвая».** Визуально слабо: нет отступов, воздух, иконки unicode выглядят дёшево. Нужен редизайн.
2. **Нет состояний загрузки.** Таблица и карточки прыгают. Нужны skeleton-загрузчики (класс `.skeleton` уже есть в CSS).
3. **Мобильная версия отсутствует.** Нет адаптива для планшетов/телефонов. search.html на мобилках ломается.
4. **Нет нормального дашборда "требует внимания".** Фильтры есть, но нет отдельного блока "decision + enforcedToday".
5. **Карточка дела перегружена.** Сейчас в модалке всё сразу: WatchedCase, CaseCard, участники, события, timeline. Нужно разбить на вкладки или аккордеон.

### Функциональные дыры
6. **Нет календаря/списка ближайших дат.** Юрист не видит, какие дела скоро вступают. Приоритет: отображать дела с `legalForceDate` на ближайшие 7 дней.
7. **Нет массовых операций.** Нельзя архивировать/удалить несколько дел за раз (чекбоксы).
8. **Нет экспорта таблицы в CSV.** Кнопка "Скачать" в дашборде.
9. **Progress bar при мониторинге — текстовый.** Вместо `"5/50 (2 ошибки)"` нужен визуальный прогресс-бар.
10. **Нет фильтра по userId.** API поддерживает `?userId=`, но UI не передаёт.

### Технический долг
11. **Встроенный JS в HTML.** `index.html` 370 строк JS, `search.html` 260 строк. Вынести в отдельные файлы `dashboard.js` и `search.js`.
12. **Нет обработки ошибок сети.** `loadDashboard()` ловит только `catch` и показывает generic ошибку. Нужны retry и нормальные сообщения.
13. **Кэширование.** Каждый `loadDashboard()` дёргает 3 API. При частых переключениях между вкладками — лишние запросы.

### Поиск
14. **Нет сохранения истории поисков.** После перезагрузки страницы всё сбрасывается.
15. **Нет массового добавления результатов.** Нашли 10 дел — кнопка "Добавить все в мониторинг" одной кнопкой.

## Стиль кода — конвенции

- **Без бандлера.** Vanilla JS, никаких npm-зависимостей во frontend. Все npm-зависимости — только для Node.js.
- Без TypeScript в браузере (tsx — для Node.js).
- **XSS-safe:** любой user-контент — только через `esc()` из app.js.
- **Event delegation** через `document.querySelector('.table').addEventListener(...)` (уже используется).
- **data-* атрибуты** для хранения идентификаторов (уже используется).
- **CSS variables** для темы (уже есть). Новые цвета добавлять в `:root` и `[data-theme="light"]`.
- **Никаких сторонних UI-библиотек.** (Bootstrap, Tailwind, React и т.д.) — только system-ui.
- Изменения только в `packages/viewer/public/`. Backend (API, store, scheduler) НЕ трогать.

## Структура для рефакторинга (предлагаемая)

После выноса JS из HTML:
```
packages/viewer/public/
├── index.html          — дашборд (только разметка)
├── search.html         — поиск (только разметка)
├── dashboard.js        — JS дашборда
├── search.js           — JS поиска
├── app.js              — shared utils (theme, esc, toast, formatTime, debounce)
├── theme.css           — стили
```

## Быстрый старт

```bash
cd D:\GitHub\CourtDesk
npm start              # API на http://127.0.0.1:8767
# открыть http://127.0.0.1:8767/ — дашборд
# открыть http://127.0.0.1:8767/search.html — поиск
```

## Тесты

После изменений — `npm test` (94 теста, vitest). TypeScript check: `npx tsc --noEmit`.
Если добавляешь JS-файлы — обнови `package.json` scripts не нужно (tsc проверяет только `packages/`).
