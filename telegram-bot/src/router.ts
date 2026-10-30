/**
 * Роутер addsport.
 *
 * Перенесено: /start, /home, /do, /goals (+ custom title flow), /reflect, /cancel,
 * 🍽 Питание (полная), все расширенные настройки + reply-кнопки главного меню +
 * callback'ы do:* / sit:* / done:* / goal:* / set:* / mode:* / n:* / gcp:*.
 */

import type { Env } from "./env";
import { TelegramClient, type TgUpdate } from "./telegram";
import { ensureUser } from "./db";
import { stripBotSuffix } from "./util";
import { StateManager } from "./state";
import {
  cmdStart,
  cmdHome,
  homeCallback,
  doNowEntry,
  situationsEntry,
  pickBlock,
  markDone,
  goalsEntry,
  goalsListCb,
  goalNew,
  goalSaveTemplate,
  goalDelete,
  goalOpen,
  progressEntry,
  settingsEntry,
  settingsToggle,
  settingsModePick,
  setMode,
  cmdReflect,
  reflectSave,
  cmdCancel,
  backNav,
} from "./handlers";
import {
  nutritionEntry,
  nHome,
  nAdd,
  nCat,
  nLog,
  nState,
  nStateLog,
  nAb,
  nAbCtx,
} from "./handlers_nutrition";
import {
  goalCustomStart,
  goalCustomTitle,
  goalCustomPeriod,
  setDailyGoal,
  setDailyGoalSave,
  setInterval as settingsSetInterval,
  setIntervalSave,
  setTz,
  setTzSave,
} from "./handlers_extra";
import { legEntry, legAskSave, legPreset, S_LEG_ASK } from "./handlers_leg";
import { hereCommand, groupCallback } from "./handlers_group";
import { diaryCallback, diaryEntry, walkEntry } from "./handlers_diary";
import { plateEntry, platePick } from "./handlers_plate";
import { breatheEntry, breathePick } from "./handlers_breathing";

export async function handleUpdate(update: TgUpdate, env: Env): Promise<void> {
  const tg = new TelegramClient(env.TELEGRAM_BOT_TOKEN);
  const ctx = { db: env.DB, tg };

  const fromTg = update.message?.from ?? update.callback_query?.from;
  // Юзеров заводим только из личных чатов: иначе каждый, кто написал команду
  // в группе, получил бы личные напоминания (reminders_on=1 по умолчанию).
  // Группового участника заводит groupCallback (ensureUserQuiet).
  const originChat = update.message?.chat ?? update.callback_query?.message?.chat;
  if (fromTg && (!originChat || originChat.type === "private")) {
    try {
      await ensureUser(env.DB, fromTg.id);
    } catch {
      /* ignore */
    }
  }

  // ============ Callbacks ============
  if (update.callback_query) {
    const cq = update.callback_query;
    const data = cq.data ?? "";

    if (data.startsWith("gw:")) return groupCallback(ctx, cq);
    if (data.startsWith("plate:")) return platePick(ctx, cq);
    if (data.startsWith("br:")) return breathePick(ctx, cq);
    if (data.startsWith("diary:")) return diaryCallback(ctx, cq);

    if (data === "home") return homeCallback(ctx, cq);
    if (data.startsWith("back:")) return backNav(ctx, cq);

    if (data.startsWith("do:")) return pickBlock(ctx, cq);
    if (data.startsWith("sit:")) return pickBlock(ctx, cq);
    if (data.startsWith("done:")) return markDone(ctx, cq);

    if (data === "goal:list") return goalsListCb(ctx, cq);
    if (data === "goal:new") return goalNew(ctx, cq);
    if (data === "goal:custom") return goalCustomStart(ctx, cq);
    if (data.startsWith("gcp:")) return goalCustomPeriod(ctx, cq);
    if (data.startsWith("goal:tpl:")) return goalSaveTemplate(ctx, cq);
    if (data.startsWith("goal:del:")) return goalDelete(ctx, cq);
    if (data.startsWith("goal:open:")) return goalOpen(ctx, cq);

    if (data === "set:toggle") return settingsToggle(ctx, cq);
    if (data === "set:mode") return settingsModePick(ctx, cq);
    if (data.startsWith("mode:")) return setMode(ctx, cq);
    if (data === "set:daily_goal") return setDailyGoal(ctx, cq);
    if (data === "set:interval") return settingsSetInterval(ctx, cq);
    if (data === "set:tz") return setTz(ctx, cq);

    // Нутриция
    if (data === "n:home") return nHome(ctx, cq);
    if (data === "n:add") return nAdd(ctx, cq);
    if (data.startsWith("n:cat:")) return nCat(ctx, cq);
    if (data.startsWith("n:log:")) return nLog(ctx, cq);
    if (data === "n:state") return nState(ctx, cq);
    if (data.startsWith("n:state_log:")) return nStateLog(ctx, cq);
    if (data === "n:ab") return nAb(ctx, cq);
    if (data.startsWith("n:ab_ctx:")) return nAbCtx(ctx, cq);

    // Нога-RAG: тап по готовому вопросу
    if (data.startsWith("legq:")) return legPreset(env, ctx.tg, cq);

    await tg.answerCallbackQuery(cq.id);
    return;
  }

  // ============ Messages ============
  if (update.message) {
    const msg = update.message;
    // В группах команды приходят как «/plate@botname» — снимаем суффикс.
    const text = stripBotSuffix(msg.text ?? "");

    // Команды, доступные и в группе, и в личке.
    if (text === "/here" || text.startsWith("/here ")) return hereCommand(ctx, msg);
    if (text === "/plate" || text === "🍽 Тарелка") return plateEntry(ctx, msg);
    if (text === "/breathe" || text === "🌬 Дыхание") return breatheEntry(ctx, msg);
    if (text === "/leg" || text.startsWith("/leg ")) return legEntry(env, ctx.tg, msg);

    // Всё остальное — личный поток. В группе на команду отвечаем одной строкой,
    // обычный текст участников игнорируем (бот не должен шуметь в чате).
    if (msg.chat.type !== "private") {
      if (text.startsWith("/")) {
        await tg.sendMessage(
          msg.chat.id,
          "Это команда для личных сообщений — напиши мне напрямую. В группе работают /plate, /breathe и /here.",
        );
      }
      return;
    }

    if (text === "/start" || text.startsWith("/start ")) return cmdStart(ctx, msg);
    if (text === "/home" || text === "/menu") return cmdHome(ctx, msg);
    if (text === "/do") return doNowEntry(ctx, msg);
    if (text === "/goals") return goalsEntry(ctx, msg);
    if (text === "/reflect") return cmdReflect(ctx, msg);
    if (text === "/cancel") return cmdCancel(ctx, msg);
    if (text === "/diary") return diaryEntry(ctx, msg);
    if (text === "/walk" || text.startsWith("/walk ")) return walkEntry(ctx, msg);
    if (text === "/help") {
      await tg.sendMessage(
        msg.chat.id,
        "💪 <b>addsport</b> — движение по чуть-чуть, в нужный момент.\n\n" +
          "🏠 /home (/menu) — главный экран\n" +
          "💪 /do — сделать сейчас (задача под момент)\n" +
          "🎯 /goals — цели\n" +
          "📝 /reflect — вечерняя рефлексия\n" +
          "🍽 /nutrition — питание: лог еды и воды\n" +
          "🦵 /leg — вопросы про восстановление ноги (по базе знаний)\n" +
          "📓 /diary — дневник ноги за 7 дней (оценки 1–5, отёк, прогулки)\n" +
          "🚶 /walk — таймер прогулки (/walk стоп — закончить)\n" +
          "🥗 /plate — тарелка дня (противовоспалительная)\n" +
          "🌬 /breathe — дыхательные техники на минуту\n" +
          "👥 /here — в группе (админ): общие окна в 09:00 и 20:00\n" +
          "↩️ /cancel — отменить текущее действие\n\n" +
          "Reply-кнопки внизу — быстрый доступ.",
      );
      return;
    }

    // Reply-кнопки
    if (text === "💪 Сделать сейчас") return doNowEntry(ctx, msg);
    if (text === "📍 По ситуации") return situationsEntry(ctx, msg);
    if (text === "🎯 Цели") return goalsEntry(ctx, msg);
    if (text === "📈 Прогресс") return progressEntry(ctx, msg);
    if (text === "⚙️ Настройки") return settingsEntry(ctx, msg);
    if (text === "🍽 Питание" || text === "/nutrition") {
      return nutritionEntry(ctx, msg);
    }
    if (text === "🦵 Нога") return legEntry(env, ctx.tg, msg);

    // FSM — только в личке: в группе чужой диалог не должен перехватывать сообщения.
    if (msg.from && msg.chat.type === "private") {
      const s = await new StateManager(env.DB, msg.from.id).getState();
      switch (s) {
        case "Reflect:text":
          return reflectSave(ctx, msg);
        case "GoalCustom:title":
          return goalCustomTitle(ctx, msg);
        case "Setting:daily_goal":
          return setDailyGoalSave(ctx, msg);
        case "Setting:interval":
          return setIntervalSave(ctx, msg);
        case "Setting:timezone":
          return setTzSave(ctx, msg);
        case S_LEG_ASK:
          return legAskSave(env, ctx.tg, msg);
      }
    }
  }
}
