# CourtDesk — DECISIONS

Архитектурные решения, зафиксированные с датой и обоснованием.

---

## 2026-07-24: URL allowlist — assertCourtUrl (CR6-002)

**Решение:** `assertCourtUrl(url)` проверяет protocol=https + hostname ends with `.sudrf.ru` или `.msudrf.ru`. Блокирует `file://`, `http://`, `localhost`, IP-адреса, cloud metadata endpoints.

**Применение:** `/api/parse/url` (API boundary) + `orchestrator.fetchHtml` (scheduler).

**Обоснование:** SSRF через user-controlled URL — критичная уязвимость. Allowlist по домену — zero-dependency, O(1). Альтернатива (allowlist IP) требует DNS-resolve и хрупка.

---

## 2026-07-24: Corrupt JSON → backup + throw (CR6-001)

**Решение:** `readJson` при JSON.parse error (не ENOENT) переименовывает файл в `.corrupt.<timestamp>` и бросает Error.

**Обоснование:** Silent fallback на `{}` при коррупции приводил к перезаписи всех данных пустым состоянием. Backup + throw = данные и метрика ошибки сохраняются, следующий `save()` не стирает файл.

---

## 2026-07-24: archived re-check перед updateCase (CR6-004)

**Решение:** После всех `await` в `processOne`, перед финальным `updateCase`, перечитываем `getCase(uid)`. Если `status === 'archived'` — пишем только `lastChecked`, изменения статуса отбрасываем.

**Обоснование:** `await sleep(1500)` + `await searchAdapter.searchByCaseNumber()` освобождают event loop. В этом окне HTTP PATCH может архивировать дело. Без re-check `updateCase` перезаписывает `archived` на `decision`/`enforced`.

---

## 2026-07-24: Error recovery в processOne (CR6-006)

**Решение:** При успешном `processOne`, если `prev.status === 'error'`, устанавливаем `updates.status = 'monitoring'`.

**Обоснование:** Error-дела включаются в `runFull`/`runRetry`, но успешный прогон не сбрасывал статус. Error-дела крутились вечно. Recovery в `monitoring` (или `decision`/`enforced` если найден результат/legalForceDate) — корректный lifecycle.

---

## 2026-07-24: Каскадное удаление (CR6-016)

**Решение:** `DELETE /api/cases/:uid` вызывает `clearEvents(uid)` + `deleteNotificationsByCase(uid)` после `deleteCase`.

**Обоснование:** Без каскада events и notifications для удалённого дела копятся как orphans, `events.json` растёт бесконечно.

---

## 2026-07-24: Дедупликация роутов (CR6-008, CR6-009)

**Решение:** Удалён дублирующий `GET /api/status` из `health.ts` (тенит `status.ts`). Удалён дублирующий `POST /api/resolve` из `search.ts` (live scrape, дублирует `resolve.ts` URL builder).

**Обоснование:** Express выполняет первый match. Дубль в health.ts возвращал расширенный ответ без `health` поля — dashboard работал, но `DashboardStatus.health` был мёртв. Дубль в search.ts делал network-запрос, а resolve.ts строит URL без сети — два разных контракта на одном пути.

---

## 2026-07-24: _isRunning TOCTOU fix (CR6-013)

**Решение:** `_isRunning = true` устанавливается до `res.status(202)`, не после.

**Обоснование:** В single-process Node.js окно TOCTOU микросекундно (синхронный код до `runner()`), но установка флага до ответа — корректный паттерн. При multi-instance заменять на Redis lock.

---

## 2026-07-24: Dashboard UX — управление делами

**Решение:** Dashboard получил: фильтры по статусу с счётчиками, modal деталей дела с timeline событий, кнопки архив/возврат/удаление, кнопку запуска мониторинга, авто-обновление 30с.

**Обоснование:** Без управления делами dashboard — read-only счётчик. Базовый сценарий «найти → добавить → следить → архивировать» теперь доступен из UI.

---

## 2026-07-24: Search UX — добавление в мониторинг

**Решение:** Каждая строка результатов поиска получила кнопку «+📋» → `POST /api/cases`. Добавлена форма «Отслеживать появление» → `POST /api/cases/wait`.

**Обоснование:** Разрыв user flow (поиск → ??? → мониторинг) — главный UX-блокер. Кнопка замыкает петлю.

---

## 2026-07-24: Dead code cleanup — magistrate search adapter

**Решение:** Удалены `createMagistrateSession()` (мёртвая функция с багом `page.url()`) и `solveCaptchaOnPage()` (дубликат `captcha/session.ts`).

**Обоснование:** Два независимых Puppeteer-launch пути — контролируемых одинпуть. Устранение дублирования = один source of truth для капчи.

---

## Предыдущие решения (CR1–CR5)

| Дата | Решение | Обоснование |
|------|---------|-------------|
| 2026-07-22 | await sleep перед searchByCaseNumber (CR5-001) | Rate-limit между парными запросами к sudrf.ru |
| 2026-07-22 | Удалён 'deleted' as unknown (CR5-002) | Мёртвый код с подавлением TypeScript |
| 2026-07-22 | legalForceDate.slice(0, 10) (CR5-003) | Нормализация YYYY-MM-DD при записи |
| 2026-07-22 | CORS wildcard без Authorization (CR5-004) | Несовместимая комбинация по спецификации |
| 2026-07-22 | regex /iu для кириллицы (CR5-005) | /i без /u = ASCII-only case-insensitive |
| 2026-07-22 | Captcha polling retry (CR5-006) | Нестабильный интернет на VDS |
| 2026-07-22 | listCases multi-status (CR5-007) | Один проход по Map вместо N |
| 2026-07-22 | tmp/rename без fsync (CR5-008) | Single-process, объём мал |
| 2026-07-22 | eslint отложен (CR5-009) | tsc достаточен для v0.x |
| 2026-07-22 | HOST из env (CR5-010) | Деплой в контейнер |
| 2026-07-22 | pino отложен (CR5-011) | При появлении prod-мониторинга |
| 2026-07-22 | _isRunning guard (CR5-012) | 409 Conflict от параллельных runFull |
| 2026-07-22 | moduleResolution: Node16 | bundler для Vite/esbuild, Node16 для Node.js ESM |
| 2026-07-22 | vitest pool: forks | Чистый module registry per-test |
| 2026-07-22 | createApp() отдельно | Импорт app в тестах без HTTP сервера |
| 2026-07-21 | Единый проект | Одна кодовая база, один деплой |
| 2026-07-21 | Один package.json | Все пакеты в одном процессе |
| 2026-07-21 | JSON-хранилище | Объём < 10 000 дел; при росте — SQLite |
| 2026-07-21 | REST API | 1С умеет REST |
| 2026-07-21 | API+UI один процесс | Нет CORS изнутри |
| 2026-07-21 | Search ≠ Parse | Разные URL и логика |
| 2026-07-21 | In-memory cache | Один readFileSync при старте |
| 2026-07-21 | Rate limit 1500ms | Задержка между запросами к sudrf.ru |
| 2026-07-21 | PATCH whitelist | Нельзя менять uid, createdAt, courtId, courtType |
| 2026-07-21 | Нет авторизации | API в локальной сети (CR6-003 для публичного) |