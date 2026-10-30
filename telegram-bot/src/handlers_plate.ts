/** /plate — тарелка дня + выбор по приёму пищи. */
import type { D1Database } from "@cloudflare/workers-types";
import {
  TelegramClient,
  type TgMessage,
  type TgCallbackQuery,
  type InlineKeyboardMarkup,
} from "./telegram";
import {
  PLATE_INTRO,
  plateOfDay,
  platesFor,
  nextPlate,
  renderPlate,
  type Plate,
  type PlateMeal,
} from "./content_plates";

type Ctx = { db: D1Database; tg: TelegramClient };

const MEALS: readonly PlateMeal[] = ["breakfast", "lunch", "dinner", "snack"];

function isMeal(s: string | undefined): s is PlateMeal {
  return !!s && (MEALS as readonly string[]).includes(s);
}

/** YYYY-MM-DD в Europe/Amsterdam. */
function localDateIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function plateKb(p: Plate): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "🌅 Завтрак", callback_data: "plate:breakfast" },
        { text: "☀️ Обед", callback_data: "plate:lunch" },
        { text: "🌙 Ужин", callback_data: "plate:dinner" },
        { text: "🍎 Перекус", callback_data: "plate:snack" },
      ],
      [{ text: "🔄 Ещё", callback_data: `plate:next:${p.meal}:${p.id}` }],
    ],
  };
}

export async function plateEntry(ctx: Ctx, msg: TgMessage): Promise<void> {
  const p = plateOfDay(localDateIso());
  if (!p) {
    await ctx.tg.sendMessage(msg.chat.id, "🍽 Тарелки скоро появятся.");
    return;
  }
  await ctx.tg.sendMessage(msg.chat.id, `${PLATE_INTRO}\n\n${renderPlate(p)}`, {
    reply_markup: plateKb(p),
  });
}

/** callback `plate:<meal>` или `plate:next:<meal>:<id>` */
export async function platePick(ctx: Ctx, cq: TgCallbackQuery): Promise<void> {
  const parts = (cq.data ?? "").split(":");
  let plate: Plate | undefined;
  if (parts[1] === "next") {
    if (isMeal(parts[2])) plate = nextPlate(parts[2], parts[3] ?? "");
  } else if (isMeal(parts[1])) {
    plate = platesFor(parts[1])[0];
  }
  await ctx.tg.answerCallbackQuery(cq.id);
  if (!plate || !cq.message) return;
  await ctx.tg.sendMessage(cq.message.chat.id, renderPlate(plate), {
    reply_markup: plateKb(plate),
  });
}
