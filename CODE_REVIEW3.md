
---

<div class="rich-metrics">
  <div class="rich-metric">
    <div class="rich-metric-label">Архитектура</div>
    <div class="rich-metric-value">4/5 ⭐</div>
  </div>
  <div class="rich-metric">
    <div class="rich-metric-label">Качество кода</div>
    <div class="rich-metric-value">3.5/5 ⭐</div>
  </div>
  <div class="rich-metric">
    <div class="rich-metric-label">Документация</div>
    <div class="rich-metric-value">5/5 ⭐</div>
  </div>
  <div class="rich-metric">
    <div class="rich-metric-label">Тестирование</div>
    <div class="rich-metric-value">4/5 ⭐</div>
  </div>
  <div class="rich-metric">
    <div class="rich-metric-label">Production-ready</div>
    <div class="rich-metric-value">2/5 ⭐</div>
  </div>
</div>

## Общий вердикт

Солидный монолит для v0.2.0. Два раунда код-ревью **реально применены** в коде — 11 багов из BUG-001..011 и 11 находок из NEW-001..011 закрыты. Архитектура адекватна масштабу, типы чистые, тесты зелёные, CI работает. Главные проблемы — дублирование кода, отсутствие продакшен-харденинга и неготовый Web UI.

Далее разбираю по слоям.

### Что сделано хорошо

<div class="rich-grid">
  <section class="rich-card">
    <div class="rich-card-title"><span class="rich-icon rich-icon-check"></span> Архитектурные решения (ADR)</div>
    Все 17 решений задокументированы в DECISIONS.md с датой и обоснованием. Монолит вместо микросервисов, JSON вместо SQL, ESM + tsx — каждое осмысленно для текущего масштаба.
  </section>
  <section class="rich-card">
    <div class="rich-card-title"><span class="rich-icon rich-icon-check"></span> Работа с капчей</div>
    Puppeteer-сессия для msudrf.ru решает капчу через RuCaptcha API v2. Картинка читается через browser-context fetch (credentials:'include'), а не через page.goto + goBack — избегает хрупкой навигации.
  </section>
  <section class="rich-card">
    <div class="rich-card-title"><span class="rich-icon rich-icon-check"></span> CP1251 encoding</div>
    Корректный percent-encoder для PHP-форм ГАС «Правосудие» (пакет core/encoding.ts). Fetch с авто-детектом кодировки по Content-Type, fallback на win1251 через iconv-lite.
  </section>
  <section class="rich-card">
    <div class="rich-card-title"><span class="rich-icon rich-icon-check"></span> Хранилище</div>
    Атомарная запись (tmp + rename), in-memory cache (один readFileSync при старте), PATCH-whitelist, защита от лишней I/O при deleteCase несуществующего uid.
  </section>
  <section class="rich-card">
    <div class="rich-card-title"><span class="rich-icon rich-icon-check"></span> Scheduler</div>
    202 Accepted для асинхронного запуска, rate limit 1.5s между запросами, перечитывание getCase() перед каждым updateCase (защита от race condition с PATCH API), отдельный processWaiting для waiting-дел.
  </section>
  <section class="rich-card">
    <div class="rich-card-title"><span class="rich-icon rich-icon-check"></span> Intake/Classify</div>
    Три типа классификации: case_card (URL карточки дела), search (номер/ФИО), malformed. Извлечение courtId, courtType, caseId из URL. 18 тестов покрывают все сценарии включая edge cases (op=hl, name_op=sf).
  </section>
</div>

### Проблемы и риски

<div class="rich-timeline">
  <div class="rich-step">
    <span class="rich-step-marker">1</span>
    <div class="rich-step-body">
      <div class="rich-step-title">Дублирование кода — критично</div>
      <div class="rich-step-text">Функция <code>fetchHtml()</code> (~50 строк) и <code>buildSearchUrl()</code> (~30 строк параметров) идентичны в district.ts, appeal.ts, cassation.ts. Различаются только <code>delo_id</code> и <code>case_type</code>. При изменении API sudrf.ru придётся править 4 файла вместо одного.</div>
    </div>
  </div>
  <div class="rich-step">
    <span class="rich-step-marker">2</span>
    <div class="rich-step-body">
      <div class="rich-step-title">MagistrateSearchAdapter — два пути в одном методе</div>
      <div class="rich-step-text"><code>searchByCaseNumber</code> содержит и прямой парсинг карточки дела по URL (с полным cheerio-скрейпингом), и поиск по номеру через Puppeteer. Эвристика <code>caseNumber.startsWith('http')</code> — хрупкая: номер дела «HTTP-123/2024» сломает логику.</div>
    </div>
  </div>
  <div class="rich-step">
    <span class="rich-step-marker">3</span>
    <div class="rich-step-body">
      <div class="rich-step-title">Hardcoded delo_id</div>
      <div class="rich-step-text">1540005 (районные), 5 (апелляция), 2800001 (кассация) — магические числа в 8 файлах. При обновлении БД ГАС «Правосудие» эти идентификаторы могут измениться.</div>
    </div>
  </div>
  <div class="rich-step">
    <span class="rich-step-marker">4</span>
    <div class="rich-step-body">
      <div class="rich-step-title">Race condition не до конца закрыт</div>
      <div class="rich-step-text">NEW-002 добавил getCase() перед каждым updateCase, но 3-5 вызовов updateCase за один processOne — это 3-5 атомарных writeJson. Между ними могут вклиниться HTTP-запросы. Нужен один батчинговый updateCase в конце обработки.</div>
    </div>
  </div>
  <div class="rich-step">
    <span class="rich-step-marker">5</span>
    <div class="rich-step-body">
      <div class="rich-step-title">Нет продакшен-харденинга</div>
      <div class="rich-step-text">console.error вместо structured logging. Нет graceful shutdown (SIGTERM → закрыть Puppeteer, сохранить состояние). Нет бэкапа JSON-файлов. Нет обработки corrupted cases.json. Нет health-check с реальной диагностикой.</div>
    </div>
  </div>
  <div class="rich-step">
    <span class="rich-step-marker">6</span>
    <div class="rich-step-body">
      <div class="rich-step-title">Уведомления — синтетика</div>
      <div class="rich-step-text">GET /api/notifications генерирует уведомления на лету из статусов дел. Новые uid при каждом запросе, нет persistent-хранилища, нет отметки прочитано. ARCHITECTURE.md обещает notifications.json.</div>
    </div>
  </div>
  <div class="rich-step">
    <span class="rich-step-marker">7</span>
    <div class="rich-step-body">
      <div class="rich-step-title">Нет CORS</div>
      <div class="rich-step-text">При разработке с Vite (:5173) и API (:8767) — CORS error. При внешнем клиенте — тоже. Сейчас работает только same-origin (статика Express).</div>
    </div>
  </div>
  <div class="rich-step">
    <span class="rich-step-marker">8</span>
    <div class="rich-step-body">
      <div class="rich-step-title">Viewer — заглушка</div>
      <div class="rich-step-text">Один index.html без функциональности. Нет дашборда, поиска, истории. Основной use case «юрист в браузере» не закрыт.</div>
    </div>
  </div>
</div>

### По-пакетная оценка

| Пакет | Оценка | Что хорошо | Что плохо |
|-------|--------|-----------|----------|
| **core** | 🟢 | Типы полные, courts.ts с O(1)-lookup, encoding.ts корректен | config.ts — только RuCaptcha, нет общего конфига |
| **search** | 🟡 | Адаптеры работают, magistrate с капчей | Дублирование fetchHtml/buildSearchUrl ×4, hardcoded delo_id, два пути в magistrate |
| **parse** | 🟢 | Чистые адаптеры, shared.ts с утилитами | decodeEntities-комментарий с опечаткой (`courtdesk`), BUG-009-стиль комментариев в коде |
| **intake** | 🟢 | Классификатор с 18 тестами, покрытие edge cases | — |
| **scheduler** | 🟡 | 202 Accepted, rate limit, runNew через searchByParty | 3-5 writeJson за processOne, race condition не до конца, нет backoff для error-дел |
| **store** | 🟢 | In-memory cache, атомарная запись, PATCH whitelist | Нет проверки целостности JSON при старте |
| **api** | 🟡 | Все 15 эндпоинтов, createApp() вынесен, error handler | Нет CORS, notifications — синтетика, нет валидации формата caseNumber в POST |
| **captcha** | 🟢 | RuCaptcha API v2, browser context fetch для картинки | — |
| **viewer** | 🔴 | — | Заглушка, нет функциональности |

### Справочник судов

<div class="rich-panel">
  <div class="rich-panel-title">core/courts.ts — 10 287 записей</div>

- `findCourtBySubdomain` / `findCourtByCode` — O(1) через Map
- `findCourtsByName` — AND-поиск с `filter → slice → map` (NEW-008 исправлен)
- `getAllCourts()` — возвращает кэшированный `byCode.values()`, не пересоздаёт объекты
- `COURT_TYPE_CODE` — маппинг 14 кодов типов судов в 4 CourtType. Военные суды (GV, KV) маппятся в district — технически работает, но не задокументировано

⚠️ `GET /api/courts` без `q=` возвращает только `{ total: N }`, а не список судов. `getAllCourts()` существует, но не используется в роутах.
</div>

### CI и тесты

- **CI:** GitHub Actions, Ubuntu, Node 24, `tsc --noEmit` + `vitest run`
- **Тесты:** 42 теста — store/cases, intake/classify, API cases route, parse/run, scheduler/runNew
- **Моки:** файловая система, store, search/parse адаптеры — без реального I/O и сети
- **Vitest:** pool: forks для чистого module registry

### Что я бы сделал в первую очередь

1. **Вынести `fetchHtml()` и `buildSearchUrl()` в shared-утилиту** — один параметр `deloId`/`caseType` вместо 4 копий. Самый высокий ROI по трудозатратам.
2. **Батчить updateCase в processOne** — один вызов с агрегированными изменениями в конце, а не 3-5 промежуточных.
3. **Добавить `cors()` middleware** — одна строчка, разблокирует dev-окружение.
4. **Graceful shutdown** — `process.on('SIGTERM', ...)` → закрыть Puppeteer browser, сохранить кэш.
5. **Выделить парсинг карточки из MagistrateSearchAdapter** — делегировать в parse/adapters/magistrate.ts вместо инлайн-скрейпинга.

Резюме: проект движется в правильном направлении. Архитектура осмысленная, баги из ревью реально фиксятся, тесты пишутся. До продакшена не хватает харденинга и Web UI, но для v0.2.0 это ожидаемо.