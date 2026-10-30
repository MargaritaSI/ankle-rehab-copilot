/**
 * Дневник ноги («как нога, 1–5») и таймер прогулки /walk.
 *
 * Вечерний пуш планировщика шлёт кнопки 1–5 и «💧 Был отёк» (diary:*). Ответы
 * копятся в leg_diary (одна строка на локальный день). Правило протокола:
 * боль или отёк, дожившие до утра, = перегруз → утром мягкая строка «шаг назад».
 * /walk считает время на ногах: предупреждение на ~90 мин, автостоп на 240.
 * Без ИИ.
 */

import type { D1Database } from "@cloudflare/workers-types";
import type {
  InlineKeyboardMarkup,
  TelegramClient,
  TgCallbackQuery,
  TgMessage,
} from "./telegram";
import {
  ensureUser,
  getUser,
  getDiaryDay,
  upsertDiaryScore,
  toggleDiarySwelling,
  addDiaryWalk,
  listDiaryRange,
  usersWalking,
  startWalk,
  clearWalk,
  markWalkWarned,
  logSession,
  Budget,
  type LegDiaryRow,
} from "./db";
import { escapeHtml, localDate, stripBotSuffix } from "./util";

type Ctx = { db: D1Database; tg: TelegramClient };

const DEFAULT_TZ = "Europe/Amsterdam";
/** Предупреждение «пора закругляться» (тик 15 мин → придёт между 90 и 105). */
export const WALK_WARN_MIN = 90;
/** Автостоп прогулки. */
export const WALK_MAX_MIN = 240;
const SCORE_LABEL_PREFIX = "🌙 Нога сегодня: ";

// ── Даты ─────────────────────────────────────────────────────────────────
function dayNumber(day: string): number {
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
}

export function addDays(day: string, delta: number): string {
  return new Date((dayNumber(day) + delta) * 86_400_000).toISOString().slice(0, 10);
}

const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

/** «пн 27.10». */
function dayLabel(day: string): string {
  const wd = WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()];
  return `${wd} ${day.slice(8, 10)}.${day.slice(5, 7)}`;
}

export function isSunday(day: string): boolean {
  return new Date(`${day}T00:00:00Z`).getUTCDay() === 0;
}

function daysWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} день`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return `${n} дня`;
  return `${n} дней`;
}

async function userTz(db: D1Database, tgId: number): Promise<string> {
  const u = await getUser(db, tgId);
  return u?.timezone || DEFAULT_TZ;
}

// ── Клавиатура ───────────────────────────────────────────────────────────
export function diaryKb(swelling = false): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [1, 2, 3, 4, 5].map((n) => ({ text: String(n), callback_data: `diary:score:${n}` })),
      [
        {
          text: swelling ? "💧 Отёк отмечен ✓" : "💧 Был отёк",
          callback_data: "diary:swell",
        },
      ],
    ],
  };
}

// ── Сводки ───────────────────────────────────────────────────────────────
interface Stats {
  scored: number;
  avg: number | null;
  swellDays: number;
  walkMin: number;
}

function statsOf(rows: LegDiaryRow[]): Stats {
  const scores = rows.filter((r) => r.score !== null).map((r) => r.score as number);
  return {
    scored: scores.length,
    avg: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    swellDays: rows.filter((r) => r.swelling === 1).length,
    walkMin: rows.reduce((a, r) => a + r.walk_min, 0),
  };
}

const fmtAvg = (n: number) => n.toFixed(1).replace(".", ",");

/**
 * Блок «Неделя: …» для воскресного вечернего пуша: последние 7 дней, включая
 * сегодняшний. null, если оценок меньше 3.
 */
export async function weeklyDiaryBlock(
  db: D1Database,
  tgId: number,
  today: string,
): Promise<string | null> {
  const rows = await listDiaryRange(db, tgId, addDays(today, -6), today);
  return weeklyBlockFromRows(rows);
}

/** Чистая часть weeklyDiaryBlock: rows — уже отфильтрованные 7 дней одного юзера. */
export function weeklyBlockFromRows(rows: LegDiaryRow[]): string | null {
  const st = statsOf(rows);
  if (st.scored < 3 || st.avg === null) return null;
  return (
    `Неделя: средняя оценка ${fmtAvg(st.avg)}, ` +
    `отёк ${daysWord(st.swellDays)}, прогулки ${st.walkMin} мин`
  );
}

/** true, если вчера был отёк или оценка ≤ 2 → утром «шаг назад». */
export async function needsLegNudge(
  db: D1Database,
  tgId: number,
  today: string,
): Promise<boolean> {
  const y = await getDiaryDay(db, tgId, addDays(today, -1));
  return nudgeFromRow(y);
}

/** Чистая часть needsLegNudge: вчерашняя строка дневника (или null). */
export function nudgeFromRow(y: LegDiaryRow | null | undefined): boolean {
  if (!y) return false;
  return y.swelling === 1 || (y.score !== null && y.score <= 2);
}

// ── Callbacks diary:* ────────────────────────────────────────────────────
export async function diaryCallback(
  ctx: Ctx,
  cq: TgCallbackQuery,
  now: Date = new Date(),
): Promise<void> {
  const data = cq.data ?? "";
  const tgId = cq.from.id;
  const tz = await userTz(ctx.db, tgId);
  const today = localDate(now, tz);
  const msg = cq.message;

  if (data.startsWith("diary:score:")) {
    const n = Number(data.slice("diary:score:".length));
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      await ctx.tg.answerCallbackQuery(cq.id);
      return;
    }
    await ensureUser(ctx.db, tgId);
    await upsertDiaryScore(ctx.db, tgId, today, n);
    await ctx.tg.answerCallbackQuery(cq.id, "Записала ✓");
    if (msg) {
      const row = await getDiaryDay(ctx.db, tgId, today);
      // Воскресную «Неделю» из исходного текста сохраняем при перерисовке.
      const weekLine = (msg.text ?? "")
        .split("\n")
        .find((l) => l.startsWith("Неделя:"));
      const text =
        `${SCORE_LABEL_PREFIX}${n}/5` + (weekLine ? `\n\n${escapeHtml(weekLine)}` : "");
      try {
        await ctx.tg.editMessageText(msg.chat.id, msg.message_id, text, {
          reply_markup: diaryKb(row?.swelling === 1),
        });
      } catch (err) {
        // «message is not modified» при повторном тапе на ту же оценку — не ошибка.
        console.warn("diary edit failed:", err);
      }
    }
    return;
  }

  if (data === "diary:swell") {
    await ensureUser(ctx.db, tgId);
    const now1 = await toggleDiarySwelling(ctx.db, tgId, today);
    await ctx.tg.answerCallbackQuery(cq.id, now1 ? "Отметила отёк" : "Сняла отметку об отёке");
    if (msg) {
      try {
        await ctx.tg.editMessageReplyMarkup(msg.chat.id, msg.message_id, diaryKb(now1 === 1));
      } catch (err) {
        console.warn("diary markup edit failed:", err);
      }
    }
    return;
  }

  await ctx.tg.answerCallbackQuery(cq.id);
}

// ── /diary ───────────────────────────────────────────────────────────────
function entryLine(r: LegDiaryRow): string | null {
  const parts: string[] = [dayLabel(r.day)];
  if (r.score !== null) parts.push(`${r.score}/5`);
  if (r.swelling === 1) parts.push("отёк");
  if (r.walk_min > 0) parts.push(`прогулка ${r.walk_min} мин`);
  return parts.length > 1 ? parts.join(" · ") : null;
}

export async function diaryEntry(
  ctx: Ctx,
  msg: TgMessage,
  now: Date = new Date(),
): Promise<void> {
  if (!msg.from) return;
  const tgId = msg.from.id;
  await ensureUser(ctx.db, tgId);
  const today = localDate(now, await userTz(ctx.db, tgId));
  const rows = await listDiaryRange(ctx.db, tgId, addDays(today, -6), today);
  const lines = rows.map(entryLine).filter((l): l is string => l !== null);
  if (lines.length === 0) {
    await ctx.tg.sendMessage(
      msg.chat.id,
      "🦵 Дневник ноги пока пуст. Вечером спрошу, как нога, — отметишь кнопкой 1–5.",
    );
    return;
  }
  const st = statsOf(rows);
  const tail: string[] = [];
  if (st.avg !== null) tail.push(`средняя ${fmtAvg(st.avg)}`);
  tail.push(`отёк ${daysWord(st.swellDays)}`);
  tail.push(`прогулки ${st.walkMin} мин`);
  await ctx.tg.sendMessage(
    msg.chat.id,
    `🦵 <b>Нога за 7 дней</b>\n\n${lines.map(escapeHtml).join("\n")}\n\n<i>Итого: ${tail.join(" · ")}</i>`,
  );
}

// ── /walk ────────────────────────────────────────────────────────────────
function minutesSince(startIso: string, now: Date): number {
  const start = Date.parse(startIso);
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((now.getTime() - start) / 60_000));
}

/** Записывает минуты прогулки в дневник и в sessions. */
async function recordWalk(
  db: D1Database,
  tgId: number,
  tz: string,
  now: Date,
  minutes: number,
): Promise<void> {
  await addDiaryWalk(db, tgId, localDate(now, tz), minutes);
  await logSession(db, tgId, ["WALK"], minutes, null, "walk");
}

export async function walkEntry(
  ctx: Ctx,
  msg: TgMessage,
  now: Date = new Date(),
): Promise<void> {
  if (!msg.from) return;
  const tgId = msg.from.id;
  const user = await ensureUser(ctx.db, tgId);
  const arg = stripBotSuffix(msg.text ?? "")
    .replace(/^\/walk/i, "")
    .trim()
    .toLowerCase();
  const wantsStop = arg === "стоп" || arg === "stop";

  if (wantsStop) {
    if (!user.walk_started_at) {
      await ctx.tg.sendMessage(msg.chat.id, "Прогулка не запущена: /walk");
      return;
    }
    const minutes = Math.max(1, minutesSince(user.walk_started_at, now));
    if (!(await clearWalk(ctx.db, tgId))) {
      await ctx.tg.sendMessage(msg.chat.id, "Прогулка не запущена: /walk");
      return;
    }
    await recordWalk(ctx.db, tgId, user.timezone || DEFAULT_TZ, now, minutes);
    await ctx.tg.sendMessage(
      msg.chat.id,
      `Прогулка ${minutes} мин записана. После нагрузки: нога выше сердца, холод 15 минут.`,
    );
    return;
  }

  if (user.walk_started_at) {
    const minutes = minutesSince(user.walk_started_at, now);
    await ctx.tg.sendMessage(
      msg.chat.id,
      `Прогулка идёт уже ${minutes} мин. Стоп: /walk стоп`,
    );
    return;
  }

  await startWalk(ctx.db, tgId, now.toISOString());
  await ctx.tg.sendMessage(
    msg.chat.id,
    "Прогулка пошла. Напомню закругляться через ~90 минут. Стоп: /walk стоп",
  );
}

/**
 * Тик планировщика: у всех, кто сейчас гуляет (reminders_on не важен),
 * предупреждение на ~90 мин (один раз) и автостоп на 240.
 */
export async function tickWalks(
  db: D1Database,
  tg: TelegramClient,
  now: Date,
  budget: Budget = Budget.unlimited(),
): Promise<void> {
  if (!budget.take(1)) {
    console.warn("budget exhausted at walks");
    return;
  }
  const walking = await usersWalking(db);
  for (const u of walking) {
    try {
      if (!u.walk_started_at) continue;
      const elapsed = minutesSince(u.walk_started_at, now);
      if (elapsed >= WALK_MAX_MIN) {
        // clearWalk + addDiaryWalk + logSession + send. Не хватило квоты —
        // прогулка остаётся идти, следующий тик закроет.
        if (!budget.take(4, true)) {
          console.warn("budget exhausted at walks");
          return;
        }
        if (!(await clearWalk(db, u.tg_id))) continue;
        await recordWalk(db, u.tg_id, u.timezone || DEFAULT_TZ, now, WALK_MAX_MIN);
        await safeSend(
          tg,
          u.tg_id,
          "Прогулку закрыла автоматически на 4 часах — если шла дольше, поправь в /diary",
        );
      } else if (elapsed >= WALK_WARN_MIN && u.walk_warned === 0) {
        // markWalkWarned + send.
        if (!budget.take(2, true)) {
          console.warn("budget exhausted at walks");
          return;
        }
        await markWalkWarned(db, u.tg_id);
        await safeSend(
          tg,
          u.tg_id,
          "⏱ Уже 1:30 на ногах — лучше закруглиться сейчас, чем восстанавливаться два дня. Стоп: /walk стоп",
        );
      }
    } catch (err) {
      console.warn(`walk tick failed for ${u.tg_id}:`, err);
    }
  }
}

async function safeSend(tg: TelegramClient, chatId: number, text: string): Promise<void> {
  try {
    await tg.sendMessage(chatId, text);
  } catch (err) {
    console.warn(`send failed ${chatId}:`, err);
  }
}
