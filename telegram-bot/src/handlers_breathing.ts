/** /breathe — список техник, тап → гид на минуту. */
import type { D1Database } from "@cloudflare/workers-types";
import { TelegramClient, type TgMessage, type TgCallbackQuery } from "./telegram";
import { BREATHING, renderBreathing } from "./content_breathing";

type Ctx = { db: D1Database; tg: TelegramClient };

export async function breatheEntry(ctx: Ctx, msg: TgMessage): Promise<void> {
  await ctx.tg.sendMessage(
    msg.chat.id,
    "🌬 Одна минута дыхания. Выбери технику — пришлю короткий гид.",
    {
      reply_markup: {
        inline_keyboard: BREATHING.map((t) => [
          { text: t.title, callback_data: `br:${t.id}` },
        ]),
      },
    },
  );
}

/** callback `br:<id>` */
export async function breathePick(ctx: Ctx, cq: TgCallbackQuery): Promise<void> {
  const id = (cq.data ?? "").split(":")[1];
  const t = BREATHING.find((b) => b.id === id);
  await ctx.tg.answerCallbackQuery(cq.id);
  if (!t || !cq.message) return;
  await ctx.tg.sendMessage(cq.message.chat.id, renderBreathing(t));
}
