# HANDOFF — CourtDesk

> Создан: 2026-08-05 18:05
> Обновлён: 2026-08-05 (сессия 2: backoff 403, фикстуры appeal/cassation, CR12-S10, RuCaptcha-проверка)
> Причина: переход на новую сессию по запросу пользователя

## Текущая задача

Основная работа сессии **завершена** (изменения НЕ закоммичены — коммитит пользователь): backoff при 403/429 в fetchHtml, тесты appeal/cassation (+фикс parsePublishInfo), CR12-S10 (Ё/латиница/лимит в classify), проверка RuCaptcha-ключа. Следующая сессия может браться за любую open-проблему из `docs/PLANS.md`.

## Что сделано в этой сессии

- **Backoff при 403/429**: `fetchHtml` (packages/search/shared.ts) ретраит с экспоненциальным backoff (5с → 10с, MAX_ATTEMPTS=3) при WAF rate-limit. Тесты в shared.test.ts с моком https + fake timers (4 теста). 404 не ретраится
- **CR11-006 — тесты appeal/cassation**: appeal.test.ts / cassation.test.ts (inline-фикстуры 5 вкладок, 22 теста). **Попутно найден реальный баг:** `parsePublishInfo` (parse/adapters/shared.ts) — `опубликован\w*` не матчил кириллицу, publishedAt/modifiedAt были **всегда null** (подтверждено live-данными cards.json — 13 карточек, все null). Починен: `опубликован[а-яё]*\s*:?\s*` + /i. Влияет на все 4 адаптера
- **CR12-S10 — classify.ts**: Ё/ё в CASE_NUMBER_RE (префикс и суффикс), латиница в именах (WORD_RE вместо CYRILLIC_WORD_RE), лимит длины входа MAX_INPUT_LENGTH=500. 5 новых тестов
- **RuCaptcha-ключ проверен**: `getBalance` = 240.58 ₽ — ключ валиден, ERROR_KEY_DOES_NOT_EXIST был временным сбоем. Секрет не выводился
- **Тесты 181→213, все проходят; tsc чистый; biome lint 0 errors; coverage 54/52/50/55 (гейт 44/38/38/42)**

## Что осталось сделать

- [ ] Закоммитить изменения сессии (7 файлов: 5 modified + 2 new)
- [ ] CR12-019: eviction кэшей store (events растёт бесконечно)
- [ ] CR12-004: navigation guard в courtdesktop
- [ ] WEBUI-O2/O4/O5 (мобилка, вкладки карточки, календарь)
- [ ] WEBUI-O6/O9/O10, WEBUI-O11 (мёртвый debounce), WEBUI-O13 (остаточные emoji)
- [ ] Полный бэклог — в `docs/PLANS.md`

## Ключевые файлы

- `packages/search/shared.ts` — fetchHtml с backoff (RETRY_STATUSES 403/429, MAX_ATTEMPTS=3, BACKOFF_BASE_MS=5000)
- `packages/search/shared.test.ts` — тесты backoff (vi.mock('https'), fake timers)
- `packages/parse/adapters/{appeal,cassation}.test.ts` — новые фикстуры
- `packages/parse/adapters/shared.ts` — parsePublishInfo (фикс кириллицы, строка ~22)
- `packages/intake/classify.ts` — CASE_NUMBER_RE/WORD_RE/MAX_INPUT_LENGTH (CR12-S10)
- `docs/PLANS.md`, `docs/CONTEXT.md` — обновлены

## Контекст

- **WAF ГАС «Правосудие»**: банит IP по rate-limit (403), замедляет ответы до 1-2 минут. Теперь fetchHtml сам ретраит 403/429 с backoff
- **Сервер**: фоновый процесс PID 39424 (127.0.0.1:8767), логи в `C:\Users\alexa\AppData\Local\Temp\opencode\cd-out.log` / `cd-err.log`. Перезапуск: `Stop-Process` по порту + `npx tsx packages/api/server.ts`
- **RuCaptcha**: ключ в .env валиден, баланс 240.58 ₽
- **Бинарники**: courtdesktop.exe в .gitignore (не коммитится)
- **Кодировка**: PowerShell-вывод русских строк может быть кракозябрами — артефакт консоли
- **Коммиты**: только пользователь. В истории 15+ коммитов «.» (CR12-020, не переписывать)

## Команды для проверки

```bash
npm test                # 213 тестов
npm run lint            # tsc --noEmit
npm run lint:biome      # Biome (гейт — только errors)
npm run test:coverage   # coverage-гейт v8 (54/52/50/55)
cd packages/courtdesktop && go vet ./... && go build -ldflags="-s -w -H windowsgui" -o courtdesktop.exe .
```

## Следующий шаг

Закоммитить изменения (по запросу пользователя), затем CR12-019 (eviction store) → CR12-004 (navigation guard) → WEBUI-*. Бэклог — `docs/PLANS.md`.
