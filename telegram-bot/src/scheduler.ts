/**
 * Cron-обработчик addsport. Полный порт scheduler_service.py.
 *
 * Каждые TICK_MIN (15) минут для каждого юзера с reminders_on=1:
 *   • если уже было morning-сообщение сегодня → проверяем интервал
 *   • если start ≤ now < start + MORNING_GRACE_MIN и нет утра → шлём MORNING_PROMPT
 *     (+ строка «шаг назад», если вчера был отёк / оценка ноги ≤ 2)
 *   • если now ≥ end и нет вечера → шлём дневник ноги 1–5 (в воскресенье с «Неделя: …»)
 *   • таймер /walk: предупреждение на ~90 мин и автостоп на 240 — для всех, у кого
 *     идёт прогулка, независимо от reminders_on
 *   • иначе шлём микро-пуш если истёк reminder_interval_min с last_reminder_at
 *
 * Дополнительно: окно 17:00–19:00 локально проверяем «предохранитель срыва»
 *   — если белка < 50% цели ИЛИ > 3 ч без еды → шлём food-push.
 */

import type { Env } from "./env";
import { TelegramClient, TelegramError } from "./telegram";
import type { InlineKeyboardMarkup } from "./telegram";
import {
  usersForTick,
  stmtMarkReminded,
  stmtSetLastMorning,
  stmtSetLastEvening,
  stmtMarkFoodPushed,
  stmtDisableReminders,
  foodAggregateForUsers,
  diaryRowsForUsers,
  Budget,
  IN_CHUNK,
  MAX_SENDS_PER_TICK,
  type UserRow,
  type LegDiaryRow,
} from "./db";
import { MORNING_PROMPT, EVENING_DIARY_PROMPT, MORNING_LEG_NUDGE } from "./content";
import { calculateTargets } from "./content_nutrition";
import { localMinuteOfDay, localDate, pickRandom } from "./util";
import { tickGroups } from "./handlers_group";
import {
  addDays,
  diaryKb,
  isSunday,
  nudgeFromRow,
  tickWalks,
  weeklyBlockFromRows,
} from "./handlers_diary";

export { MAX_SENDS_PER_TICK };

// ── Константы из Python scheduler_service.py ─────────────────────────────
const MORNING_GRACE_MIN = 60; // утро шлём в первые 60 минут окна
// Период cron-тика в минутах (см. crons в wrangler.toml: каждые 15 минут).
export const TICK_MIN = 15;
// После end ещё TICK_MIN минут «добить» вечер: должно быть ≥ периода тика,
// иначе тик может целиком попасть в зазор и вечерний промпт потеряется.
const END_GRACE_MIN = TICK_MIN;

const INTERVAL_SLACK_MS = 2 * 60_000;

const FOOD_PUSH_START_MIN = 17 * 60; // 17:00
const FOOD_PUSH_END_MIN = 19 * 60; // 19:00
const FOOD_LOW_PROTEIN_FRACTION = 0.5; // пуш если белка < 50% от цели
const FOOD_LONG_GAP_HOURS = 3; // >3ч без еды

// ── Микро-промпты для интервал-напоминаний ───────────────────────────────
const MICRO_PROMPTS: readonly string[] = [
  "💡 Где ты можешь включить квадрицепс на 5 секунд прямо сейчас?",
  "💡 1 минута. Я рядом. Что доступно — лежу/сижу/стою?",
  "💡 Не вставай. Просто сожми ягодицы 10 раз.",
  "💡 Втяни живот на 10 секунд. Это уже подход.",
  "💡 Стопа на себя/от себя × 15. Пока не вставая.",
  "💡 Минута микро-движения = шаг к 60 за день.",
];

// ── Клавиатуры (порт quick_kb / food_push_kb; дневник ноги — handlers_diary) ───────────────
function quickKb(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "⚡ Сделать 1 минуту", callback_data: "do:minimum" }],
      [
        { text: "🛏 Лежа", callback_data: "do:lying" },
        { text: "🪑 Сидя", callback_data: "do:sitting" },
        { text: "📺 Без внимания", callback_data: "do:nofocus" },
      ],
      [{ text: "⏭ Не сейчас", callback_data: "skip:1" }],
    ],
  };
}

function foodPushKb(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "🍗 Белок", callback_data: "n:cat:protein" },
        { text: "🛡 Anti-binge snack", callback_data: "n:ab" },
      ],
      [{ text: "🧠 Состояние", callback_data: "n:state" }],
      [{ text: "⏭ Не сейчас", callback_data: "skip:1" }],
    ],
  };
}

// ── Утилиты ──────────────────────────────────────────────────────────────
function intervalElapsed(lastIso: string | null, intervalMin: number): boolean {
  if (!lastIso) return true;
  const last = Date.parse(lastIso.replace(" ", "T") + "Z");
  if (Number.isNaN(last)) return true;
  // Допуск 2 мин: markReminded штампует Date.now() через секунды после тика,
  // без допуска интервал, кратный тику (60 мин), «проскакивал» бы на +1 тик.
  return Date.now() - last >= intervalMin * 60_000 - INTERVAL_SLACK_MS;
}


/**
 * Отправка в личку. true — сообщение ушло. На 403 (юзер заблокировал бота)
 * зовёт onBlocked, чтобы вызывающий отключил напоминания; на любой другой
 * ошибке молча (в лог) возвращает false — маркер «отправлено» ставить НЕЛЬЗЯ.
 */
async function safeSend(
  tg: TelegramClient,
  chatId: number,
  text: string,
  replyMarkup?: InlineKeyboardMarkup,
  onBlocked?: () => void,
): Promise<boolean> {
  try {
    await tg.sendMessage(chatId, text, {
      reply_markup: replyMarkup,
    });
    return true;
  } catch (err) {
    if (err instanceof TelegramError && err.code === 403 && chatId > 0) {
      onBlocked?.();
    }
    console.warn(`send failed ${chatId}:`, err);
    return false;
  }
}

// ── Entry ────────────────────────────────────────────────────────────────
export async function tickScheduler(
  event: ScheduledEvent,
  env: Env,
): Promise<void> {
  const tg = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
  const now = new Date(event.scheduledTime);
  await tickMinute(env.DB, tg, env.DEFAULT_TZ, now);
}

/**
 * Один cron-тик = один Worker-вызов = ≤ 50 subrequest'ов (free-план), поэтому
 * все стадии делят один Budget и стоят O(1) + O(реально отправленных сообщений):
 *
 *   группы (2 + действия) → прогулки (1 + действия) → юзеры (1 чтение)
 *   → напоминания (≤ 1 lookup дневника + send на каждого + 1 batch)
 *   → food (1 запрос на таймзону + send на каждого + 1 batch)
 *
 * Порядок — по срочности: слот открытия группового окна короткий, таймер
 * прогулки — про здоровье; утренние/микро-пуши терпят сдвиг на тик (состояние в БД).
 */
export async function tickMinute(
  db: D1Database,
  tg: TelegramClient,
  defaultTz: string,
  now: Date,
  budget: Budget = new Budget(),
): Promise<void> {
  // Групповые «окна» (общие практики 09:00 / 20:00, тарелка дня).
  try {
    await tickGroups(db, tg, now, TICK_MIN, budget);
  } catch (err) {
    console.warn("group tick failed:", err);
  }

  // Таймер прогулки: все, кто гуляет (reminders_on не важен).
  try {
    await tickWalks(db, tg, now, budget);
  } catch (err) {
    console.warn("walk tick failed:", err);
  }

  if (!budget.take(1)) {
    console.warn("budget exhausted at users");
    return;
  }
  let users: UserRow[];
  try {
    users = await usersForTick(db);
  } catch (err) {
    console.warn("usersForTick failed:", err);
    return;
  }

  try {
    await reminderStage(db, tg, users, defaultTz, now, budget);
  } catch (err) {
    console.warn("reminder stage failed:", err);
  }

  // «Предохранитель» вечернего срыва, окно 17:00–19:00.
  try {
    await foodStage(db, tg, users, defaultTz, now, budget);
  } catch (err) {
    console.warn("food stage failed:", err);
  }
}

// ── Личные напоминания ───────────────────────────────────────────────────
type ReminderKind = "morning" | "evening" | "micro";

interface Planned {
  user: UserRow;
  kind: ReminderKind;
  today: string;
}

/**
 * Решение ТОЛЬКО по уже загруженной строке юзера — ни одного запроса.
 * Юзер без сообщения в этот тик не стоит ничего.
 */
function planUser(user: UserRow, defaultTz: string, now: Date): Planned | null {
  const tz = user.timezone || defaultTz;
  const nowMin = localMinuteOfDay(now, tz);
  const today = localDate(now, tz);
  const start = user.reminder_start_min;
  const end = user.reminder_end_min;

  // Вне окна [start..end+END_GRACE] — молчим.
  if (nowMin < start || nowMin > end + END_GRACE_MIN) return null;

  // Утро (один раз в день, в первые 60 минут окна).
  if (user.last_morning_at !== today && nowMin - start < MORNING_GRACE_MIN) {
    return { user, kind: "morning", today };
  }

  // Вечер (один раз, если now ≥ end).
  if (nowMin >= end) {
    return user.last_evening_at !== today ? { user, kind: "evening", today } : null;
  }

  // Микро-пуш по интервалу.
  if (intervalElapsed(user.last_reminder_at, user.reminder_interval_min)) {
    return { user, kind: "micro", today };
  }
  return null;
}

const KIND_PRIORITY: Record<ReminderKind, number> = { morning: 0, evening: 1, micro: 2 };

async function reminderStage(
  db: D1Database,
  tg: TelegramClient,
  users: UserRow[],
  defaultTz: string,
  now: Date,
  budget: Budget,
): Promise<void> {
  const planned: Planned[] = [];
  for (const u of users) {
    const p = planUser(u, defaultTz, now);
    if (p) planned.push(p);
  }
  if (planned.length === 0) return;

  // Утро/вечер (раз в сутки, ограниченная «льгота») — раньше микро-пушей;
  // среди микро — те, кому дольше всех не писали (иначе хвост списка голодает).
  planned.sort(
    (a, b) =>
      KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind] ||
      (a.kind === "micro" && b.kind === "micro"
        ? (a.user.last_reminder_at ?? "").localeCompare(b.user.last_reminder_at ?? "")
        : 0),
  );

  // Резерв под финальный db.batch (маркеры) — до любых отправок.
  if (!budget.take(1)) {
    console.warn("budget exhausted at reminders");
    return;
  }

  // Сколько сообщений влезет; +1 subrequest на пакетный lookup дневника.
  const needsDiary = (p: Planned) =>
    p.kind === "morning" || (p.kind === "evening" && isSunday(p.today));
  let cap = Math.min(budget.sendsLeft, budget.left, IN_CHUNK);
  let selected = planned.slice(0, Math.max(0, cap));
  if (selected.some(needsDiary)) {
    cap = Math.min(cap, budget.left - 1);
    selected = planned.slice(0, Math.max(0, cap));
  }
  if (selected.length === 0) {
    console.warn("budget exhausted at reminders");
    return;
  }
  if (selected.length < planned.length) {
    console.warn(`reminders deferred: ${planned.length - selected.length} users to next tick`);
  }

  // ОДИН запрос дневника на всех: вчера (утренний «шаг назад») и 7 дней
  // (воскресная «Неделя:»).
  const diaryUsers = selected.filter(needsDiary);
  let diary: LegDiaryRow[] = [];
  if (diaryUsers.length > 0 && budget.take(1)) {
    let from = diaryUsers[0].today;
    let to = diaryUsers[0].today;
    for (const p of diaryUsers) {
      const lo = p.kind === "morning" ? addDays(p.today, -1) : addDays(p.today, -6);
      if (lo < from) from = lo;
      if (p.today > to) to = p.today;
    }
    try {
      diary = await diaryRowsForUsers(
        db,
        diaryUsers.map((p) => p.user.tg_id),
        from,
        to,
      );
    } catch (err) {
      // Без дневника шлём базовый текст — лучше без строки, чем без утра.
      console.warn("diary lookup failed:", err);
    }
  }

  const stmts: D1PreparedStatement[] = [];
  try {
    for (const p of selected) {
      try {
        if (!budget.take(1, true)) {
          console.warn("budget exhausted at reminders");
          break;
        }
        const id = p.user.tg_id;
        const mine = diary.filter((r) => r.tg_id === id);
        let text: string;
        let kb: InlineKeyboardMarkup | undefined;
        if (p.kind === "morning") {
          // Правило протокола: боль/отёк, дожившие до утра = перегруз → шаг назад.
          const y = mine.find((r) => r.day === addDays(p.today, -1));
          text = MORNING_PROMPT + (nudgeFromRow(y) ? `\n\n${MORNING_LEG_NUDGE}` : "");
        } else if (p.kind === "evening") {
          text = EVENING_DIARY_PROMPT;
          if (isSunday(p.today)) {
            const lo = addDays(p.today, -6);
            const week = weeklyBlockFromRows(
              mine.filter((r) => r.day >= lo && r.day <= p.today),
            );
            if (week) text += `\n\n${week}`;
          }
          kb = diaryKb(false);
        } else {
          text = pickRandom(MICRO_PROMPTS);
          kb = quickKb();
        }

        let blocked = false;
        const ok = await safeSend(tg, id, text, kb, () => {
          blocked = true;
        });
        if (ok) {
          if (p.kind === "morning") stmts.push(stmtSetLastMorning(db, id, p.today));
          if (p.kind === "evening") stmts.push(stmtSetLastEvening(db, id, p.today));
          stmts.push(stmtMarkReminded(db, id));
        } else if (blocked) {
          stmts.push(stmtDisableReminders(db, id));
        }
        // Другая ошибка: маркер НЕ ставим — повторим на следующем тике.
      } catch (err) {
        console.warn(`tick failed for ${p.user.tg_id}:`, err);
      }
    }
  } finally {
    await flush(db, stmts);
  }
}

async function flush(db: D1Database, stmts: D1PreparedStatement[]): Promise<void> {
  if (stmts.length === 0) return;
  try {
    await db.batch(stmts);
  } catch (err) {
    console.warn("marker batch failed:", err);
  }
}

// ── Food push (антисрыв 17-19h) ──────────────────────────────────────────

/** "YYYY-MM-DD HH:MM:SS" (UTC) локальной полуночи юзера (как пишет nowSql()). */
function localMidnightSql(now: Date, tz: string): string {
  const minute = Math.floor(now.getTime() / 60_000) * 60_000;
  const mid = new Date(minute - localMinuteOfDay(now, tz) * 60_000);
  return mid.toISOString().replace("T", " ").slice(0, 19);
}

async function foodStage(
  db: D1Database,
  tg: TelegramClient,
  users: UserRow[],
  defaultTz: string,
  now: Date,
  budget: Budget,
): Promise<void> {
  // Пре-фильтр целиком в JS: окно 17:00–19:00 и «сегодня ещё не слали».
  const byTz = new Map<string, Array<{ user: UserRow; today: string }>>();
  for (const u of users) {
    const tz = u.timezone || defaultTz;
    const nowMin = localMinuteOfDay(now, tz);
    if (nowMin < FOOD_PUSH_START_MIN || nowMin > FOOD_PUSH_END_MIN) continue;
    const today = localDate(now, tz);
    if (u.last_food_push_at === today) continue;
    const list = byTz.get(tz) ?? [];
    list.push({ user: u, today });
    byTz.set(tz, list);
  }
  if (byTz.size === 0) return;

  // Резерв под финальный batch.
  if (!budget.take(1)) {
    console.warn("budget exhausted at food");
    return;
  }

  // Агрегат на всех кандидатов: один запрос на таймзону (обычно один всего).
  interface Pending {
    user: UserRow;
    today: string;
    text: string;
  }
  const pending: Pending[] = [];
  for (const [tz, list] of byTz) {
    const since = localMidnightSql(now, tz);
    for (let i = 0; i < list.length; i += IN_CHUNK) {
      const chunk = list.slice(i, i + IN_CHUNK);
      if (!budget.take(1)) {
        console.warn("budget exhausted at food");
        break;
      }
      const agg = await foodAggregateForUsers(
        db,
        chunk.map((c) => c.user.tg_id),
        since,
      );
      for (const c of chunk) {
        const text = foodPushText(c.user, agg.get(c.user.tg_id), now);
        if (text) pending.push({ user: c.user, today: c.today, text });
      }
    }
  }

  const stmts: D1PreparedStatement[] = [];
  try {
    for (const p of pending) {
      try {
        if (!budget.take(1, true)) {
          console.warn("budget exhausted at food");
          break;
        }
        let blocked = false;
        const ok = await safeSend(tg, p.user.tg_id, p.text, foodPushKb(), () => {
          blocked = true;
        });
        if (ok) stmts.push(stmtMarkFoodPushed(db, p.user.tg_id, p.today));
        else if (blocked) stmts.push(stmtDisableReminders(db, p.user.tg_id));
      } catch (err) {
        console.warn(`food push failed for ${p.user.tg_id}:`, err);
      }
    }
  } finally {
    await flush(db, stmts);
  }
}

/** Текст пуша или null, если юзеру пуш не нужен. Чистая функция. */
function foodPushText(
  user: UserRow,
  agg: { protein_g: number; last_ts: string | null } | undefined,
  now: Date,
): string | null {
  const targets = calculateTargets(
    user.sex,
    user.age,
    user.height_cm,
    user.weight_kg,
    user.activity_level,
  );
  const proteinToday = agg?.protein_g ?? 0;
  const proteinNeed = Math.round(targets.protein_g * FOOD_LOW_PROTEIN_FRACTION);
  const lowProtein = proteinToday < proteinNeed;

  const lastFoodIso = agg?.last_ts ?? null;
  let longGap = false;
  let gapHours = 0;
  if (!lastFoodIso) {
    longGap = true;
  } else {
    const lastMs = Date.parse(lastFoodIso.replace(" ", "T") + "Z");
    if (!Number.isNaN(lastMs)) {
      gapHours = (now.getTime() - lastMs) / 3_600_000;
      longGap = gapHours >= FOOD_LONG_GAP_HOURS;
    } else {
      longGap = true;
    }
  }

  if (!lowProtein && !longGap) return null;

  const lines: string[] = ["🍽 <b>Предохранитель вечернего срыва</b>", ""];
  if (lowProtein) {
    lines.push(
      `Сегодня белка <b>${proteinToday}/${targets.protein_g} г</b> — ` +
        "до сильного голода ещё есть время добавить.",
    );
  }
  if (longGap && lastFoodIso) {
    lines.push(`⏱ Уже ${gapHours.toFixed(1)} ч без еды.`);
  } else if (longGap) {
    lines.push("⏱ Сегодня ещё ничего не записано.");
  }
  lines.push("");
  lines.push("<i>Не «держись» — мягко добавь насыщение заранее.</i>");
  return lines.join("\n");
}
