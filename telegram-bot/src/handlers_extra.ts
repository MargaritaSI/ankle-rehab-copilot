/**
 * Доп-хендлеры addsport: кастомный goal title flow + расширенные настройки
 * (daily_goal_min, reminder_interval_min, timezone, reminder_start/end_min).
 */

import { TelegramClient, type TgMessage, type TgCallbackQuery } from "./telegram";
import type { InlineKeyboardMarkup } from "./telegram";
import {
  ensureUser,
  getUser,
  updateUser,
  createGoal,
} from "./db";
import { StateManager } from "./state";

interface Ctx {
  db: D1Database;
  tg: TelegramClient;
}

// ============================================================================
// CUSTOM GOAL — title → period
// ============================================================================

const S_GOAL_CUSTOM_TITLE = "GoalCustom:title";
const S_GOAL_CUSTOM_PERIOD = "GoalCustom:period";

function goalPeriodKb(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "📅 Неделя (14 вып)", callback_data: "gcp:week" },
        { text: "📆 Месяц (60 вып)", callback_data: "gcp:month" },
      ],
      [{ text: "🏠 Главная", callback_data: "home" }],
    ],
  };
}

export async function goalCustomStart(ctx: Ctx, call: TgCallbackQuery): Promise<void> {
  if (!call.message) return;
  await new StateManager(ctx.db, call.from.id).setState(S_GOAL_CUSTOM_TITLE);
  await ctx.tg.sendMessage(
    call.message.chat.id,
    "✏️ Напиши название цели (короткое, до 80 символов):\n" +
      "Например: <i>«Месяц без пропусков»</i>",
  );
  await ctx.tg.answerCallbackQuery(call.id);
}

export async function goalCustomTitle(ctx: Ctx, msg: TgMessage): Promise<void> {
  if (!msg.from) return;
  const state = new StateManager(ctx.db, msg.from.id);
  if ((await state.getState()) !== S_GOAL_CUSTOM_TITLE) return;
  const title = (msg.text ?? "").trim().slice(0, 80);
  if (title.length < 3) {
    await ctx.tg.sendMessage(msg.chat.id, "Слишком коротко. Дай нормальное название или /cancel.");
    return;
  }
  await state.updateData({ title });
  await state.setState(S_GOAL_CUSTOM_PERIOD);
  await ctx.tg.sendMessage(msg.chat.id, `📝 «${title}»\n\nВыбери период:`, {
    reply_markup: goalPeriodKb(),
  });
}

export async function goalCustomPeriod(ctx: Ctx, call: TgCallbackQuery): Promise<void> {
  if (!call.message || !call.data) return;
  const state = new StateManager(ctx.db, call.from.id);
  if ((await state.getState()) !== S_GOAL_CUSTOM_PERIOD) {
    await ctx.tg.answerCallbackQuery(call.id);
    return;
  }
  const period = call.data.split(":")[1];
  if (period !== "week" && period !== "month") {
    await ctx.tg.answerCallbackQuery(call.id);
    return;
  }
  const data = await state.getData();
  const title = (data.title as string) ?? "";
  await createGoal(ctx.db, call.from.id, title, period);
  await state.clear();
  await ctx.tg.editMessageText(
    call.message.chat.id,
    call.message.message_id,
    `✅ Цель создана: <b>${title}</b>`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📋 К целям", callback_data: "goal:list" }],
          [{ text: "🏠 Главная", callback_data: "home" }],
        ],
      },
    },
  );
  await ctx.tg.answerCallbackQuery(call.id, "Сохранила");
}

// ============================================================================
// EXTENDED SETTINGS — daily_goal_min / reminder_interval_min / timezone /
// reminder_start_min / reminder_end_min
// ============================================================================

const S_SET_DAILY_GOAL = "Setting:daily_goal";
const S_SET_INTERVAL = "Setting:interval";
const S_SET_TZ = "Setting:timezone";

export async function setDailyGoal(ctx: Ctx, call: TgCallbackQuery): Promise<void> {
  if (!call.message) return;
  await new StateManager(ctx.db, call.from.id).setState(S_SET_DAILY_GOAL);
  await ctx.tg.sendMessage(
    call.message.chat.id,
    "🎯 Введи новую цель в минутах в день (5–240):",
  );
  await ctx.tg.answerCallbackQuery(call.id);
}

export async function setDailyGoalSave(ctx: Ctx, msg: TgMessage): Promise<void> {
  if (!msg.from) return;
  const state = new StateManager(ctx.db, msg.from.id);
  if ((await state.getState()) !== S_SET_DAILY_GOAL) return;
  const v = parseInt((msg.text ?? "").trim(), 10);
  if (Number.isNaN(v) || v < 5 || v > 240) {
    await ctx.tg.sendMessage(msg.chat.id, "Нужно число от 5 до 240.");
    return;
  }
  await updateUser(ctx.db, msg.from.id, { daily_goal_min: v });
  await state.clear();
  await ctx.tg.sendMessage(msg.chat.id, `✅ Цель: ${v} мин/день.`);
}

export async function setInterval(ctx: Ctx, call: TgCallbackQuery): Promise<void> {
  if (!call.message) return;
  await new StateManager(ctx.db, call.from.id).setState(S_SET_INTERVAL);
  await ctx.tg.sendMessage(
    call.message.chat.id,
    "⏱ Введи интервал напоминаний в минутах (15–240):",
  );
  await ctx.tg.answerCallbackQuery(call.id);
}

export async function setIntervalSave(ctx: Ctx, msg: TgMessage): Promise<void> {
  if (!msg.from) return;
  const state = new StateManager(ctx.db, msg.from.id);
  if ((await state.getState()) !== S_SET_INTERVAL) return;
  const v = parseInt((msg.text ?? "").trim(), 10);
  if (Number.isNaN(v) || v < 15 || v > 240) {
    await ctx.tg.sendMessage(msg.chat.id, "Нужно число от 15 до 240.");
    return;
  }
  await updateUser(ctx.db, msg.from.id, { reminder_interval_min: v });
  await state.clear();
  await ctx.tg.sendMessage(msg.chat.id, `✅ Интервал: ${v} мин.`);
}

export async function setTz(ctx: Ctx, call: TgCallbackQuery): Promise<void> {
  if (!call.message) return;
  await new StateManager(ctx.db, call.from.id).setState(S_SET_TZ);
  await ctx.tg.sendMessage(
    call.message.chat.id,
    "🌍 Введи таймзону IANA, например:\n" +
      "• <code>Europe/Amsterdam</code>\n" +
      "• <code>Europe/Moscow</code>\n" +
      "• <code>America/New_York</code>",
  );
  await ctx.tg.answerCallbackQuery(call.id);
}

export async function setTzSave(ctx: Ctx, msg: TgMessage): Promise<void> {
  if (!msg.from) return;
  const state = new StateManager(ctx.db, msg.from.id);
  if ((await state.getState()) !== S_SET_TZ) return;
  const v = (msg.text ?? "").trim();
  // Validate IANA
  let valid = true;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: v }).format(new Date());
  } catch {
    valid = false;
  }
  if (!valid) {
    await ctx.tg.sendMessage(
      msg.chat.id,
      "Неизвестная таймзона. Пример: <code>Europe/Amsterdam</code>.",
    );
    return;
  }
  await updateUser(ctx.db, msg.from.id, { timezone: v });
  await state.clear();
  await ctx.tg.sendMessage(msg.chat.id, `✅ TZ: ${v}`);
}

// Reference exports keep TypeScript happy when used by router via switch.
export { S_GOAL_CUSTOM_TITLE, S_GOAL_CUSTOM_PERIOD, S_SET_DAILY_GOAL, S_SET_INTERVAL, S_SET_TZ };

void ensureUser;
void getUser;
