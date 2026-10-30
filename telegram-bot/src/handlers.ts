/**
 * Ключевые хендлеры addsport (объединены в один файл для краткости).
 *
 * Перенесено: /start, главное меню (reply), 💪 Сделать сейчас, 📍 По ситуации,
 * 🎯 Цели (list / add из шаблона / delete), 📈 Прогресс, ⚙️ Настройки (toggle),
 * /reflect (одно предложение → reflections).
 *
 * НЕ перенесено пока:
 *   - 🍽 Питание (nutrition.py) — лог еды/воды + состояние
 *   - детальная редактура целей (custom-title flow)
 *   - extended exercise каталог
 *   - extended settings (TZ, окно reminder_start/end)
 */

import { TelegramClient, type TgMessage, type TgCallbackQuery } from "./telegram";
import {
  ensureUser,
  getUser,
  updateUser,
  logSession,
  logReflection,
  sessionCount,
  stats,
  dailyPattern,
  createGoal,
  listActiveGoals,
  deleteGoal,
  incrementActiveGoals,
  type UserRow,
} from "./db";
import { StateManager } from "./state";
import { escapeHtml } from "./util";
import {
  SITUATIONS,
  MODES,
  BLOCKS,
  GOAL_TEMPLATES,
  GOAL_PERIOD_LABEL,
  renderBlock,
  blockMinutes,
  filterExercises,
  EVENING_PROMPT,
  type ExerciseData,
} from "./content";
import { sanitizeIds, SAFETY_NOTE } from "./safety";
import {
  homeReplyKb,
  doNowKb,
  situationsKb,
  blockDoneKb,
  modesKb,
  settingsKb,
  goalsListKb,
  goalTemplatesKb,
  goalItemKb,
} from "./keyboards";
import { nutritionEntry } from "./handlers_nutrition";
import { progressFor, TOTAL_CELLS, renderBar, renderProgressMessage } from "./progress";

interface Ctx {
  db: D1Database;
  tg: TelegramClient;
}

const S_GOAL_CUSTOM_TITLE = "GoalFSM:custom_title";
const S_REFLECT_TEXT = "Reflect:text";

// ============================================================================
// /start + Главная
// ============================================================================

const WELCOME =
  "💪 <b>Привет.</b>\n\n" +
  "Я помогаю не «делать спорт», а <i>встраивать движение в день</i>.\n" +
  "1 упражнение в нужном моменте — это уже работает.\n\n" +
  "Открой /home — главный экран, или /do — быстрая задача под текущую ситуацию.";

/**
 * Команды для «синего меню» Telegram (setMyCommands).
 * Сверено с router.ts — только реально подключённые команды.
 */
export const BOT_COMMANDS: { command: string; description: string }[] = [
  { command: "home", description: "Главный экран" },
  { command: "menu", description: "Главный экран" },
  { command: "do", description: "Сделать сейчас — задача под момент" },
  { command: "goals", description: "Цели" },
  { command: "reflect", description: "Вечерняя рефлексия" },
  { command: "nutrition", description: "Питание: лог еды и воды" },
  { command: "leg", description: "Нога: карточки-правила и ссылка на сайт с ответами" },
  { command: "diary", description: "Дневник ноги за 7 дней" },
  { command: "walk", description: "Таймер прогулки (стоп: /walk стоп)" },
  { command: "plate", description: "Тарелка дня" },
  { command: "breathe", description: "Дыхание на минуту" },
  { command: "here", description: "В группе (админ): общие окна 09:00 и 20:00" },
  { command: "cancel", description: "Отменить текущее действие" },
  { command: "help", description: "Что я умею" },
];

export async function cmdStart(ctx: Ctx, msg: TgMessage): Promise<void> {
  if (!msg.from) return;
  await new StateManager(ctx.db, msg.from.id).clear();
  await ensureUser(ctx.db, msg.from.id);
  // Зарегистрировать «синее меню команд» Telegram (идемпотентно, без падений).
  try {
    await ctx.tg.setMyCommands(BOT_COMMANDS);
  } catch {
    /* ignore — меню команд необязательно для работы бота */
  }
  await ctx.tg.sendMessage(msg.chat.id, WELCOME, { reply_markup: homeReplyKb() });
}

async function homeText(ctx: Ctx, tgId: number): Promise<string> {
  const user = await ensureUser(ctx.db, tgId);
  const s = await stats(ctx.db, tgId);
  const pattern = await dailyPattern(ctx.db, tgId, 7);
  const points = await sessionCount(ctx.db, tgId);
  const { cycle, unlocked } = progressFor(points);
  const bar = renderBar(unlocked);

  return (
    `🏠 <b>Главная</b>\n\n` +
    `Сегодня: <b>${s.today} мин</b> из ${user.daily_goal_min}\n` +
    `Неделя: <b>${s.week}</b> · Месяц: <b>${s.month}</b>\n\n` +
    `Узор: ${pattern}\n\n` +
    `${bar}  ${unlocked}/${TOTAL_CELLS}` +
    (cycle > 0 ? ` · цикл ${cycle + 1}` : "")
  );
}

export async function cmdHome(ctx: Ctx, msg: TgMessage): Promise<void> {
  if (!msg.from) return;
  await new StateManager(ctx.db, msg.from.id).clear();
  const text = await homeText(ctx, msg.from.id);
  await ctx.tg.sendMessage(msg.chat.id, text, { reply_markup: homeReplyKb() });
}

export async function homeCallback(ctx: Ctx, call: TgCallbackQuery): Promise<void> {
  if (!call.message) return;
  await new StateManager(ctx.db, call.from.id).clear();
  const text = await homeText(ctx, call.from.id);
  try {
    await ctx.tg.editMessageText(call.message.chat.id, call.message.message_id, text);
  } catch {
    await ctx.tg.sendMessage(call.message.chat.id, text);
  }
  await ctx.tg.answerCallbackQuery(call.id);
}

// ============================================================================
// «← Назад» — навигация на предыдущий picker
// Маршруты:
//   back:do        → меню «Сделать сейчас»
//   back:sit       → меню «По ситуации»
//   back:settings  → settings root (после выбора режима)
//   back:home      → home screen
// ============================================================================
export async function backNav(ctx: Ctx, call: TgCallbackQuery): Promise<void> {
  if (!call.message || !call.data) return;
  const target = call.data.slice("back:".length);

  if (target === "do") {
    try {
      await ctx.tg.editMessageText(
        call.message.chat.id,
        call.message.message_id,
        DO_NOW_INTRO,
        { reply_markup: doNowKb() },
      );
    } catch {
      await ctx.tg.sendMessage(call.message.chat.id, DO_NOW_INTRO, {
        reply_markup: doNowKb(),
      });
    }
  } else if (target === "sit") {
    try {
      await ctx.tg.editMessageText(
        call.message.chat.id,
        call.message.message_id,
        "📍 <b>По ситуации</b>",
        { reply_markup: situationsKb() },
      );
    } catch {
      await ctx.tg.sendMessage(call.message.chat.id, "📍 <b>По ситуации</b>", {
        reply_markup: situationsKb(),
      });
    }
  } else if (target === "settings") {
    // Перерисовать settings root.
    const user = await ensureUser(ctx.db, call.from.id);
    try {
      await ctx.tg.editMessageText(
        call.message.chat.id,
        call.message.message_id,
        "⚙️ <b>Настройки</b>",
        { reply_markup: settingsKb(user) },
      );
    } catch {
      /* ignore */
    }
  } else {
    // back:home (или неизвестное → дом)
    await homeCallback(ctx, call);
    return;
  }
  await ctx.tg.answerCallbackQuery(call.id);
}

// ============================================================================
// 💪 Сделать сейчас + 📍 По ситуации
// ============================================================================

const DO_NOW_INTRO =
  "💪 <b>Сделать сейчас</b>\n\nГде ты сейчас?";

export async function doNowEntry(ctx: Ctx, msg: TgMessage): Promise<void> {
  await ctx.tg.sendMessage(msg.chat.id, DO_NOW_INTRO, { reply_markup: doNowKb() });
}

export async function situationsEntry(ctx: Ctx, msg: TgMessage): Promise<void> {
  await ctx.tg.sendMessage(msg.chat.id, "📍 <b>По ситуации</b>", {
    reply_markup: situationsKb(),
  });
}

// Маппинг do:<code> → фильтр упражнений (когда выбраны без «ситуации»).
// "any"-position всегда добавляется автоматом в filterExercises.
const DO_NOW_FILTER: Record<
  string,
  { position: ExerciseData["position"]; attention?: boolean; label: string }
> = {
  lying: { position: "lying", label: "🛏 Лёжа" },
  sitting_focus: { position: "sitting", attention: true, label: "🪑 Сидя — могу сфокусироваться" },
  sitting_bg: { position: "sitting", attention: false, label: "📺 Сидя — в фоне" },
  standing: { position: "standing", label: "🚶 Стою" },
  walking: { position: "walking", label: "🚶 Иду" },
};

/** Выбрать N случайных id из pool, исключая `exclude` если возможно. */
function pickRandomIds(pool: string[], n: number, exclude: string[] = []): string[] {
  if (pool.length === 0) return [];
  const filtered = pool.filter((id) => !exclude.includes(id));
  const source = filtered.length >= n ? filtered : pool;
  const shuffled = [...source];
  // Fisher-Yates
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(n, shuffled.length));
}

/** Получить pool упражнений для конкретного callback. */
function poolFor(
  source: "do" | "sit",
  code: string,
): { pool: string[]; label: string; filtered: boolean } {
  const raw = rawPoolFor(source, code);
  // Протокол: без подъёмов на носок / баланса / прыжков / резинки. Если после
  // фильтра < 2 упражнений — добираем безопасными заменами.
  const { ids, removed } = sanitizeIds(raw.pool, 2);
  return { pool: ids, label: raw.label, filtered: removed.length > 0 };
}

function rawPoolFor(source: "do" | "sit", code: string): { pool: string[]; label: string } {
  if (source === "sit") {
    const situation = SITUATIONS.find((s) => s.code === code);
    if (!situation) return { pool: [], label: "" };
    // У ситуаций с pool — используем его; иначе fall back на BLOCKS[block].
    const pool = situation.pool && situation.pool.length > 0
      ? [...situation.pool]
      : (BLOCKS[situation.block] ?? []);
    return { pool, label: situation.label };
  }
  // source === "do"
  const cfg = DO_NOW_FILTER[code];
  if (!cfg) {
    // Fallback на старые BLOCKS-ключи, если callback не из меню.
    const pool = BLOCKS[code] ?? [];
    return { pool, label: code };
  }
  // Полный pool для позиции (включая any-position).
  const positionPool = filterExercises({
    position: cfg.position,
    attention: cfg.attention,
  });
  // Плюс starter-ids из BLOCKS — чтобы знакомые упражнения тоже попадали.
  const startIds = BLOCKS[`${code}`] ?? BLOCKS[`${code}_basic`] ?? [];
  const merged = Array.from(new Set([...startIds, ...positionPool]));
  return { pool: merged, label: cfg.label };
}

export async function pickBlock(ctx: Ctx, call: TgCallbackQuery): Promise<void> {
  if (!call.message || !call.data) return;
  const parts = call.data.split(":");
  const source = (parts[0] === "sit" ? "sit" : "do") as "do" | "sit";
  const code = parts[1];

  const { pool, label, filtered } = poolFor(source, code);
  if (pool.length === 0) {
    await ctx.tg.answerCallbackQuery(call.id, "Нет упражнений для этой ситуации");
    return;
  }

  // Запоминаем что показывали в прошлый раз → исключаем при «Другой блок».
  const state = new StateManager(ctx.db, call.from.id);
  const data = await state.getData();
  const stateKey = `last_${source}_${code}`;
  const previous = (data[stateKey] as string[]) ?? [];

  // Сколько упражнений в блоке: 2 если pool маленький, иначе 3.
  const blockSize = pool.length < 4 ? Math.min(2, pool.length) : 3;
  const ids = sanitizeIds(pickRandomIds(pool, blockSize, previous), 2).ids;

  await state.updateData({ [stateKey]: ids });

  const isAnotherBlock = previous.length > 0;
  const header = isAnotherBlock ? `🔄 ${label} · ещё блок` : label;
  const text =
    `${header}\n\n` +
    renderBlock(ids) +
    `\n\n<i>≈ ${blockMinutes(ids)} мин · из ${pool.length} вариантов</i>\n\n` +
    (filtered ? `${SAFETY_NOTE}\n\n` : "") +
    "Когда сделаешь — жми «Сделала».";
  try {
    await ctx.tg.editMessageText(call.message.chat.id, call.message.message_id, text, {
      reply_markup: blockDoneKb(source, code),
    });
  } catch {
    await ctx.tg.sendMessage(call.message.chat.id, text, {
      reply_markup: blockDoneKb(source, code),
    });
  }
  await ctx.tg.answerCallbackQuery(call.id);
}

export async function markDone(ctx: Ctx, call: TgCallbackQuery): Promise<void> {
  if (!call.message || !call.data) return;
  const code = call.data.split(":")[1];

  // Достаём реально показанные id из state (а не из фиксированного BLOCKS).
  const state = new StateManager(ctx.db, call.from.id);
  const data = await state.getData();
  const ids =
    ((data[`last_sit_${code}`] as string[]) ??
      (data[`last_do_${code}`] as string[]) ??
      []);
  if (ids.length === 0) {
    await ctx.tg.answerCallbackQuery(call.id, "Блок уже сброшен — открой заново");
    return;
  }

  const minutes = blockMinutes(ids);
  await logSession(ctx.db, call.from.id, ids, minutes, null, code);

  // +1 каждой активной цели; если завершилась — поздравить.
  const justCompleted = await incrementActiveGoals(ctx.db, call.from.id);

  const total = await sessionCount(ctx.db, call.from.id);
  const { cycle, unlocked } = progressFor(total);

  let msg =
    `✅ Записала: ${minutes} мин.\n` +
    `🧩 +1 клетка · ${unlocked}/${TOTAL_CELLS}` +
    (cycle > 0 ? ` · цикл ${cycle + 1}` : "");
  if (justCompleted.length > 0) {
    msg += "\n\n🎉 Цель завершена:";
    for (const g of justCompleted) msg += `\n  • ${escapeHtml(g.title)}`;
  }
  try {
    await ctx.tg.editMessageText(call.message.chat.id, call.message.message_id, msg);
  } catch {
    await ctx.tg.sendMessage(call.message.chat.id, msg);
  }
  await ctx.tg.answerCallbackQuery(call.id, "Молодец 💪");
}

// ============================================================================
// 🎯 Цели
// ============================================================================

export async function goalsEntry(ctx: Ctx, msg: TgMessage): Promise<void> {
  if (!msg.from) return;
  await new StateManager(ctx.db, msg.from.id).clear();
  const goals = await listActiveGoals(ctx.db, msg.from.id);
  const text =
    goals.length === 0
      ? "🎯 Целей пока нет.\n\nДобавь — буду засчитывать каждое выполнение упражнения."
      : `🎯 Активные цели (${goals.length}):\n\n` +
        goals
          .map((g) => `• ${escapeHtml(g.title)} — ${g.points}/${g.target}`)
          .join("\n");
  await ctx.tg.sendMessage(msg.chat.id, text, { reply_markup: goalsListKb(goals) });
}

export async function goalsListCb(ctx: Ctx, call: TgCallbackQuery): Promise<void> {
  if (!call.message) return;
  const goals = await listActiveGoals(ctx.db, call.from.id);
  const text =
    goals.length === 0
      ? "🎯 Целей пока нет."
      : `🎯 Активные цели (${goals.length}):\n\n` +
        goals
          .map((g) => `• ${escapeHtml(g.title)} — ${g.points}/${g.target}`)
          .join("\n");
  await ctx.tg.editMessageText(call.message.chat.id, call.message.message_id, text, {
    reply_markup: goalsListKb(goals),
  });
  await ctx.tg.answerCallbackQuery(call.id);
}

export async function goalNew(ctx: Ctx, call: TgCallbackQuery): Promise<void> {
  if (!call.message) return;
  await ctx.tg.editMessageText(
    call.message.chat.id,
    call.message.message_id,
    "🎯 Выбери шаблон цели:",
    { reply_markup: goalTemplatesKb() },
  );
  await ctx.tg.answerCallbackQuery(call.id);
}

export async function goalSaveTemplate(ctx: Ctx, call: TgCallbackQuery): Promise<void> {
  if (!call.message || !call.data) return;
  const idx = parseInt(call.data.split(":")[2], 10);
  const tpl = GOAL_TEMPLATES[idx];
  if (!tpl) {
    await ctx.tg.answerCallbackQuery(call.id, "Шаблон не найден");
    return;
  }
  await createGoal(ctx.db, call.from.id, tpl.title, tpl.period);
  await ctx.tg.answerCallbackQuery(call.id, "Цель создана");
  await goalsListCb(ctx, call);
}

export async function goalDelete(ctx: Ctx, call: TgCallbackQuery): Promise<void> {
  if (!call.message || !call.data) return;
  const goalId = parseInt(call.data.split(":")[2], 10);
  if (Number.isNaN(goalId)) {
    await ctx.tg.answerCallbackQuery(call.id);
    return;
  }
  await deleteGoal(ctx.db, goalId, call.from.id);
  await ctx.tg.answerCallbackQuery(call.id, "Удалила");
  await goalsListCb(ctx, call);
}

export async function goalOpen(ctx: Ctx, call: TgCallbackQuery): Promise<void> {
  if (!call.message || !call.data) return;
  const goalId = parseInt(call.data.split(":")[2], 10);
  const goals = await listActiveGoals(ctx.db, call.from.id);
  const goal = goals.find((g) => g.id === goalId);
  if (!goal) {
    await ctx.tg.answerCallbackQuery(call.id, "Цель не найдена");
    return;
  }
  const text =
    `🎯 <b>${escapeHtml(goal.title)}</b>\n\n` +
    `Период: ${GOAL_PERIOD_LABEL[goal.period] ?? goal.period}\n` +
    `Прогресс: ${goal.points}/${goal.target}`;
  await ctx.tg.editMessageText(call.message.chat.id, call.message.message_id, text, {
    reply_markup: goalItemKb(goalId),
  });
  await ctx.tg.answerCallbackQuery(call.id);
}

// ============================================================================
// 📈 Прогресс
// ============================================================================

export async function progressEntry(ctx: Ctx, msg: TgMessage): Promise<void> {
  if (!msg.from) return;
  const points = await sessionCount(ctx.db, msg.from.id);
  await ctx.tg.sendMessage(msg.chat.id, renderProgressMessage(points));
}

// ============================================================================
// ⚙️ Настройки
// ============================================================================

export async function settingsEntry(ctx: Ctx, msg: TgMessage): Promise<void> {
  if (!msg.from) return;
  const user = await ensureUser(ctx.db, msg.from.id);
  await ctx.tg.sendMessage(msg.chat.id, settingsText(user), {
    reply_markup: settingsKb(user),
  });
}

function settingsText(user: UserRow): string {
  return (
    `⚙️ <b>Настройки</b>\n\n` +
    `🎯 Цель в день: <b>${user.daily_goal_min} мин</b>\n` +
    `⏱ Интервал напоминаний: <b>${user.reminder_interval_min} мин</b>\n` +
    `🔔 Напоминания: <b>${user.reminders_on ? "ВКЛ" : "ВЫКЛ"}</b>\n` +
    `🎨 Режим: <b>${MODES[user.mode]?.label ?? user.mode}</b>\n` +
    `🌍 TZ: ${user.timezone}`
  );
}

export async function settingsToggle(ctx: Ctx, call: TgCallbackQuery): Promise<void> {
  if (!call.message) return;
  const user = await ensureUser(ctx.db, call.from.id);
  await updateUser(ctx.db, call.from.id, {
    reminders_on: user.reminders_on ? 0 : 1,
  });
  const fresh = await getUser(ctx.db, call.from.id);
  if (fresh) {
    try {
      await ctx.tg.editMessageText(
        call.message.chat.id,
        call.message.message_id,
        settingsText(fresh),
        { reply_markup: settingsKb(fresh) },
      );
    } catch {
      await ctx.tg.sendMessage(call.message.chat.id, settingsText(fresh), {
        reply_markup: settingsKb(fresh),
      });
    }
  }
  await ctx.tg.answerCallbackQuery(
    call.id,
    user.reminders_on ? "🔕 Выключено" : "🔔 Включено",
  );
}

export async function settingsModePick(ctx: Ctx, call: TgCallbackQuery): Promise<void> {
  if (!call.message) return;
  const user = await ensureUser(ctx.db, call.from.id);
  await ctx.tg.editMessageText(
    call.message.chat.id,
    call.message.message_id,
    "🎨 Выбери режим:",
    { reply_markup: modesKb(user.mode) },
  );
  await ctx.tg.answerCallbackQuery(call.id);
}

export async function setMode(ctx: Ctx, call: TgCallbackQuery): Promise<void> {
  if (!call.message || !call.data) return;
  const code = call.data.split(":")[1];
  if (!MODES[code]) {
    await ctx.tg.answerCallbackQuery(call.id);
    return;
  }
  await updateUser(ctx.db, call.from.id, { mode: code });
  await ctx.tg.answerCallbackQuery(call.id, "Сохранила");
  const fresh = await getUser(ctx.db, call.from.id);
  if (fresh) {
    try {
      await ctx.tg.editMessageText(
        call.message.chat.id,
        call.message.message_id,
        settingsText(fresh),
        { reply_markup: settingsKb(fresh) },
      );
    } catch {
      /* ignore */
    }
  }
}

// ============================================================================
// /reflect (вечерняя рефлексия в одно предложение)
// ============================================================================

export async function cmdReflect(ctx: Ctx, msg: TgMessage): Promise<void> {
  if (!msg.from) return;
  const state = new StateManager(ctx.db, msg.from.id);
  await state.setState(S_REFLECT_TEXT);
  await ctx.tg.sendMessage(
    msg.chat.id,
    EVENING_PROMPT + "\n\nНапиши одно предложение — что было сегодня:",
  );
}

export async function reflectSave(ctx: Ctx, msg: TgMessage): Promise<void> {
  if (!msg.from) return;
  const state = new StateManager(ctx.db, msg.from.id);
  if ((await state.getState()) !== S_REFLECT_TEXT) return;
  const text = (msg.text ?? "").trim().slice(0, 500);
  if (!text) {
    await ctx.tg.sendMessage(msg.chat.id, "Пусто — напиши хоть фразу или /cancel.");
    return;
  }
  await logReflection(ctx.db, msg.from.id, "evening", text);
  await state.clear();
  await ctx.tg.sendMessage(msg.chat.id, "✅ Записала. Хороший день.");
}

export async function cmdCancel(ctx: Ctx, msg: TgMessage): Promise<void> {
  if (!msg.from) return;
  await new StateManager(ctx.db, msg.from.id).clear();
  await ctx.tg.sendMessage(msg.chat.id, "Окей.");
}

/** Скрыто, на потом: cmdGoalCustom — для FSM добавления своей цели. */
export { S_GOAL_CUSTOM_TITLE, S_REFLECT_TEXT };
