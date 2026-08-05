# HANDOFF — CourtDesk

> Создан: 2026-08-05 18:05
> Причина: переход на новую сессию по запросу пользователя

## Текущая задача

Основная работа сессии **завершена и закоммичена** (7 коммитов: `6d59f56`..`1c489a4`): русификация UI, нормализация номеров дела, обновление всей документации, диагностика live-ошибок, фикс runSingle, таймауты капча-пайплайна. Новая сессия может браться за любую open-проблему из `docs/PLANS.md`.

## Что сделано в этой сессии

- **NUM-001 — нормализация номеров дела**: `SearchResult.uid` (смешивал case_uid/case_id) → `caseId` + `caseUid`; `CaseCard.uid` = судебный номер для всех судов (district/appeal/cassation переведены с judicial_uid на number); добавлен `identifiers.case_id`; `caseUid` передаётся при добавлении из поиска и заполняется в processWaiting
- **UI-001 — русификация**: `COURT_TYPE_LABELS` в `app.js` (district→Районный суд, appeal→Апелляционный, cassation→Кассационный, magistrate→Мировой), применён в index/search/terminal; «Case UID»→«УИД»; desktop-темы русифицированы (main.go), courtdesktop.exe пересобран (6.9 MiB)
- **NUM-002 — фикс `runSingle`**: ошибки перепарсинга теперь записываются в дело (errorCount/lastError/status), пробрасываются в роут как 500 (не 409)
- **INFR-001 — диагностика live-ошибок закрыта**: ENOTFOUND был временным DNS-сбоем; WAF ГАС банит IP по rate-limit (VPN-IP получал 403) и замедляет ответы до 1-2 минут; субдомены живы
- **Капча-пайплайн**: таймауты подняты в `captcha/session.ts` (goto/navigation 120с, waitForFunction/locator 90с, fetch капчи 60с) — переживает WAF-тормоза. Проверено end-to-end: карточка 2-800/2026 спарсилась
- **Документация**: создан `docs/PLANS.md` (roadmap); обновлены ARCHITECTURE.md (26 эндпоинтов, 8 PATCH-полей, enforced в runFull, структура пакетов), API.md (v0.7.1, 26 эндпоинтов, полные коды ошибок), CONTEXT.md, README.md, AGENTS.md, DECISIONS.md (SetHtml→факт), IMPLEMENTATION.md
- **Тесты**: 180→181 (новый тест uid в district.test.ts), все 181 проходят, tsc/biome чисто

## Что осталось сделать

- [ ] Проверить RuCaptcha-ключ (`ERROR_KEY_DOES_NOT_EXIST` на 35.perm.msudrf.ru — возможна ротация)
- [ ] Backoff при 403 в fetch-слое (WAF банит по rate-limit)
- [ ] CR11-006: тесты/фикстуры для parse-адаптеров appeal/cassation
- [ ] CR12-S10: `[А-ЯA-Z]?` без `Ё` в classify.ts:8, лимит длины входа
- [ ] CR12-019: eviction кэшей store (events растёт бесконечно)
- [ ] WEBUI-O2/O4/O5 (мобилка, вкладки карточки, календарь)
- [ ] Убрать мёртвый `debounce()` из app.js, остаточные emoji (⚠ ✓ ○ ✗ ★ ▸)
- [ ] Полный бэклог — в `docs/PLANS.md`

## Ключевые файлы

- `packages/core/types.ts` — SearchResult (caseNumber/caseUid/caseId), CaseCard (uid=судебный номер, identifiers.case_id)
- `packages/search/shared.ts` — sudrf parseResults (caseUid/caseId из href)
- `packages/search/adapters/magistrate.ts` — msudrf parseResults (caseId из case_id)
- `packages/parse/adapters/{district,appeal,cassation,magistrate}.ts` — uid=number, УИД в identifiers.case_uid
- `packages/scheduler/orchestrator.ts` — runSingle (фикс NUM-002, строки ~396-425), processWaiting (+caseUid)
- `packages/captcha/session.ts` — таймауты NAV_TIMEOUT_MS=120с/WAIT_TIMEOUT_MS=90с (константы вверху файла)
- `packages/viewer/public/app.js` — COURT_TYPE_LABELS, courtTypeLabel()
- `packages/viewer/public/{index,search,terminal}.{html,js}` — применение labels
- `packages/courtdesktop/main.go` — темы desktop (русифицированы)
- `docs/PLANS.md` — полный бэклог с приоритетами
- `docs/CONTEXT.md` — журнал работ (3 записи за 2026-08-05)

## Контекст

- **WAF ГАС «Правосудие»**: банит IP по rate-limit (403), замедляет ответы до 1-2 минут. VPN-IP блокируется (телефон/VPN с другими IP открывают). Суды реально работают — не паниковать при 403/timeout, это временно
- **Сервер**: сейчас работает мой фоновый процесс (PID 39424, слушает 127.0.0.1:8767, логи в `C:\Users\alexa\AppData\Local\Temp\opencode\cd-out.log` / `cd-err.log`). Перезапуск: `Stop-Process` по порту + `npx tsx packages/api/server.ts`
- **Все 4 live-дела в норме**: 2-124/2026 (enforced), 33-8030/2026 (monitoring), 2-238/2025 (enforced), 2-800/2026 (monitoring) — 0 error
- **Бинарники**: `courtdesktop.exe` пересобран, в .gitignore (не коммитится)
- **Кодировка**: файлы `.ts` — LF (gitattributes), PowerShell-вывод русских строк может быть кракозябрами — это артефакт консоли, не данных
- **Коммиты**: только пользователь. В истории 15+ коммитов «.» (CR12-020, не переписывать)

## Команды для проверки

```bash
npm test                # 181 тестов
npm run lint            # tsc --noEmit
npm run lint:biome      # Biome (гейт — только errors)
npm run test:coverage   # coverage-гейт v8 (44/38/38/42)
cd packages/courtdesktop && go vet ./... && go build -ldflags="-s -w -H windowsgui" -o courtdesktop.exe .
```

## Следующий шаг

Спросить пользователя, какую задачу брать: проверка RuCaptcha-ключа → backoff при 403 → CR11-006 (тесты appeal/cassation) → CR12-S10 (regex Ё). Бэклог — `docs/PLANS.md`.
