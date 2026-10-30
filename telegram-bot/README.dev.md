# addsport-bot

Микро-коуч по спорту и питанию. Скелет для переезда с Python (aiogram) на TS + Cloudflare Workers.

## Статус: ИНФРАСТРУКТУРА (~5% работы)

✅ Сделано:
- `wrangler.toml`, `tsconfig.json`, `vitest.config.ts`, `package.json`
- `migrations/0001_initial.sql` — 7 таблиц + `fsm_state` (порт SCHEMA из `db.py`)
- `src/env.ts`, `src/index.ts` (заглушка)

❌ Не сделано:
- `src/db.ts` — порт ~30 функций из `db.py` (sessions, reflections, goals, food_entries, food_states, agregates, streak, daily_pattern)
- `src/telegram.ts`, `src/state.ts`, `src/util.ts`, `src/keyboards.ts`, `src/progress.ts` — переиспользуем паттерны из `bots/marketing/`
- `src/content.ts` — порт `data.py` (38 KB): EXERCISES, PRESETS, GOAL_TEMPLATES, MODES, SITUATIONS, NUTR_* constants
- `src/handlers/*` — порт `bot.py` (53 KB, монолит с ~80 хендлерами):
  - home (Reflect FSM), do-now / block / situation flows
  - goals (GoalFSM): create, list, delete, templates, custom
  - nutrition (NutrFSM): add, log, states, antibinge
  - settings (intervals, modes, on/off, time windows)
  - картинку-прогресс заменить на emoji-бар как в marketing
- `src/scheduler.ts` — порт `scheduler_service.py` (минутный tick, утренний/вечерний пуш, food push)
- `src/router.ts`, тесты

## Особенности (отличия от marketing)

- Бот в **одном файле** `bot.py` 53 KB вместо папки `handlers/` — при порту разрезаем на модули по фичам.
- 7 таблиц БД против 17 у marketing — проще схема, сложнее агрегаты (`session_count_per_day`, `food_week_summary`).
- Прогресс-картинка через Pillow → emoji-бар.
- Шедулер сложнее: каждую минуту проверяет окно `[reminder_start_min..reminder_end_min]` у каждого юзера.
- Поинты = `session_count` (количество выполнений), не отдельная таблица `points_log`.

## Локально

```bash
cd bots/addsport
npm install
cp .dev.vars.example .dev.vars
npm run migrate:local
npm test
```

## Deploy

```bash
npx wrangler d1 create addsport_db          # один раз, вписать database_id в wrangler.toml
npm run migrate:remote
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET
npm run deploy
```
