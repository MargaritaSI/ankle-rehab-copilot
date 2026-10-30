/**
 * 🍽 Питание — порт ключевой нутри-логики bot.py + nutrition.py.
 *
 * Главный экран: target/факт по белку/ккал/воде + кнопки.
 * Логирование: категория → пресет → запись + опционально награда anti-binge.
 * Состояние: запись уровня 0-6 + рекомендация.
 * Anti-binge: контекст → список snacks.
 */

import { TelegramClient, type TgMessage, type TgCallbackQuery } from "./telegram";
import type { InlineKeyboardMarkup, InlineKeyboardButton } from "./telegram";
import {
  ensureUser,
  logFood,
  foodToday,
  logFoodState,
  latestFoodState,
} from "./db";
import {
  CAT_LABEL,
  CAT_PROTEIN,
  CAT_VOLUME,
  CAT_SWEETS,
  CAT_FRIED,
  CAT_WATER,
  PRESETS,
  ANTI_BINGE,
  STATE_LEVELS,
  stateRecommendation,
  calculateTargets,
} from "./content_nutrition";

interface Ctx {
  db: D1Database;
  tg: TelegramClient;
}

const CATEGORIES = [CAT_PROTEIN, CAT_VOLUME, CAT_SWEETS, CAT_FRIED, CAT_WATER];

// ============================================================================
// HOME — главный экран нутриции
// ============================================================================

function nutritionHomeKb(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "➕ Добавить", callback_data: "n:add" },
        { text: "🌡 Состояние 0–6", callback_data: "n:state" },
      ],
      [{ text: "🆘 Anti-binge snack", callback_data: "n:ab" }],
      [{ text: "🏠 Главная", callback_data: "home" }],
    ],
  };
}

function nutritionAddKb(): InlineKeyboardMarkup {
  const rows: InlineKeyboardButton[][] = CATEGORIES.map((c) => [
    { text: CAT_LABEL[c] ?? c, callback_data: `n:cat:${c}` },
  ]);
  rows.push([{ text: "↩️ К питанию", callback_data: "n:home" }]);
  return { inline_keyboard: rows };
}

function presetsKb(category: string): InlineKeyboardMarkup {
  const list = PRESETS[category] ?? [];
  const rows: InlineKeyboardButton[][] = list.map((p, i) => [
    { text: `${p.name} · ${p.kcal} ккал`, callback_data: `n:log:${category}:${i}` },
  ]);
  rows.push([{ text: "↩️ К категориям", callback_data: "n:add" }]);
  return { inline_keyboard: rows };
}

function stateKb(): InlineKeyboardMarkup {
  const rows: InlineKeyboardButton[][] = STATE_LEVELS.map((s) => [
    {
      text: `${s.level}. ${s.label} — ${s.desc}`,
      callback_data: `n:state_log:${s.level}`,
    },
  ]);
  rows.push([{ text: "↩️ К питанию", callback_data: "n:home" }]);
  return { inline_keyboard: rows };
}

function antiBingeKb(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "🏠 Дома", callback_data: "n:ab_ctx:home" },
        { text: "🚶 На улице", callback_data: "n:ab_ctx:outside" },
      ],
      [
        { text: "😵 Стресс", callback_data: "n:ab_ctx:stress" },
        { text: "🌙 Вечер", callback_data: "n:ab_ctx:evening" },
      ],
      [{ text: "↩️ К питанию", callback_data: "n:home" }],
    ],
  };
}

async function nutritionHomeText(ctx: Ctx, tgId: number): Promise<string> {
  const user = await ensureUser(ctx.db, tgId);
  const t = calculateTargets(
    user.sex,
    user.age,
    user.height_cm,
    user.weight_kg,
    user.activity_level,
  );
  const today = await foodToday(ctx.db, tgId);
  const lastState = await latestFoodState(ctx.db, tgId);
  const stateLine = lastState
    ? `\n🌡 Последнее состояние: <b>${lastState.level}</b>`
    : "";
  return (
    `🍽 <b>Питание</b>\n\n` +
    `📊 Цель: <b>${t.deficit}</b> ккал · <b>${t.protein_g}</b>г белка · 2000+ мл воды\n` +
    `📍 Сегодня:\n` +
    `  • Белок: <b>${today.protein_g}</b> г\n` +
    `  • Ккал: <b>${today.kcal}</b>\n` +
    `  • Вода: <b>${today.water_ml}</b> мл\n` +
    (today.sweets_count > 0 ? `  • Сладкое: ${today.sweets_count}\n` : "") +
    (today.fried_count > 0 ? `  • Жареное: ${today.fried_count}\n` : "") +
    `  • Записей: ${today.total}` +
    stateLine
  );
}

export async function nutritionEntry(ctx: Ctx, msg: TgMessage): Promise<void> {
  if (!msg.from) return;
  const text = await nutritionHomeText(ctx, msg.from.id);
  await ctx.tg.sendMessage(msg.chat.id, text, { reply_markup: nutritionHomeKb() });
}

export async function nHome(ctx: Ctx, call: TgCallbackQuery): Promise<void> {
  if (!call.message) return;
  const text = await nutritionHomeText(ctx, call.from.id);
  try {
    await ctx.tg.editMessageText(call.message.chat.id, call.message.message_id, text, {
      reply_markup: nutritionHomeKb(),
    });
  } catch {
    await ctx.tg.sendMessage(call.message.chat.id, text, {
      reply_markup: nutritionHomeKb(),
    });
  }
  await ctx.tg.answerCallbackQuery(call.id);
}

export async function nAdd(ctx: Ctx, call: TgCallbackQuery): Promise<void> {
  if (!call.message) return;
  await ctx.tg.editMessageText(
    call.message.chat.id,
    call.message.message_id,
    "Что добавляем?",
    { reply_markup: nutritionAddKb() },
  );
  await ctx.tg.answerCallbackQuery(call.id);
}

export async function nCat(ctx: Ctx, call: TgCallbackQuery): Promise<void> {
  if (!call.message || !call.data) return;
  const cat = call.data.split(":")[2];
  if (!PRESETS[cat]) {
    await ctx.tg.answerCallbackQuery(call.id);
    return;
  }
  await ctx.tg.editMessageText(
    call.message.chat.id,
    call.message.message_id,
    `${CAT_LABEL[cat]} — выбери:`,
    { reply_markup: presetsKb(cat) },
  );
  await ctx.tg.answerCallbackQuery(call.id);
}

export async function nLog(ctx: Ctx, call: TgCallbackQuery): Promise<void> {
  if (!call.message || !call.data) return;
  const parts = call.data.split(":");
  if (parts.length !== 4) {
    await ctx.tg.answerCallbackQuery(call.id);
    return;
  }
  const cat = parts[2];
  const idx = parseInt(parts[3], 10);
  const preset = PRESETS[cat]?.[idx];
  if (!preset) {
    await ctx.tg.answerCallbackQuery(call.id);
    return;
  }
  await logFood(
    ctx.db,
    call.from.id,
    cat,
    preset.name,
    preset.protein_g,
    preset.kcal,
    preset.water_ml,
  );
  await ctx.tg.answerCallbackQuery(call.id, `✅ ${preset.name}`);
  // Обновляем home-экран.
  const text = await nutritionHomeText(ctx, call.from.id);
  try {
    await ctx.tg.editMessageText(call.message.chat.id, call.message.message_id, text, {
      reply_markup: nutritionHomeKb(),
    });
  } catch {
    /* ignore */
  }
}

// ============================================================================
// STATE (шкала 0-6)
// ============================================================================

export async function nState(ctx: Ctx, call: TgCallbackQuery): Promise<void> {
  if (!call.message) return;
  await ctx.tg.editMessageText(
    call.message.chat.id,
    call.message.message_id,
    "🌡 <b>Состояние сейчас</b>\n\n" +
      "Где ты по шкале 0–6? (0 = переела, 6 = срыв близко)",
    { reply_markup: stateKb() },
  );
  await ctx.tg.answerCallbackQuery(call.id);
}

export async function nStateLog(ctx: Ctx, call: TgCallbackQuery): Promise<void> {
  if (!call.message || !call.data) return;
  const level = parseInt(call.data.split(":")[2], 10);
  if (Number.isNaN(level) || level < 0 || level > 6) {
    await ctx.tg.answerCallbackQuery(call.id);
    return;
  }
  await logFoodState(ctx.db, call.from.id, level);
  await ctx.tg.editMessageText(
    call.message.chat.id,
    call.message.message_id,
    `✅ Записала.\n\n${stateRecommendation(level)}`,
    { reply_markup: nutritionHomeKb() },
  );
  await ctx.tg.answerCallbackQuery(call.id);
}

// ============================================================================
// ANTI-BINGE
// ============================================================================

export async function nAb(ctx: Ctx, call: TgCallbackQuery): Promise<void> {
  if (!call.message) return;
  await ctx.tg.editMessageText(
    call.message.chat.id,
    call.message.message_id,
    "🆘 <b>Anti-binge snack</b>\n\nГде ты сейчас?",
    { reply_markup: antiBingeKb() },
  );
  await ctx.tg.answerCallbackQuery(call.id);
}

export async function nAbCtx(ctx: Ctx, call: TgCallbackQuery): Promise<void> {
  if (!call.message || !call.data) return;
  const ctxCode = call.data.split(":")[2];
  const ab = ANTI_BINGE[ctxCode];
  if (!ab) {
    await ctx.tg.answerCallbackQuery(call.id);
    return;
  }
  let text = `${ab.title}\n\n<b>Anti-binge snack:</b>\n`;
  for (const item of ab.items) text += `• ${item}\n`;
  await ctx.tg.editMessageText(call.message.chat.id, call.message.message_id, text, {
    reply_markup: nutritionHomeKb(),
  });
  await ctx.tg.answerCallbackQuery(call.id);
}
