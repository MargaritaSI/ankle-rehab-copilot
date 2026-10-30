/**
 * Групповые «окна» — общая практика в Telegram-группе без болтовни.
 *
 * Бот публикует пост в 09:00 и 20:00 (локально для группы), люди жмут кнопки,
 * бот ведёт счёт и через 45 минут закрывает окно итогом. В воскресенье после
 * вечернего окна — недельная сводка (только числа, без рейтингов). В 17:00 —
 * «тарелка дня». Без ИИ, без стыда: пустое окно = «сегодня тихо».
 */

import type { D1Database } from "@cloudflare/workers-types";
import {
  TelegramClient,
  TelegramError,
  type InlineKeyboardMarkup,
  type TgCallbackQuery,
  type TgMessage,
} from "./telegram";
import {
  upsertGroupChat,
  getGroupChat,
  listEnabledGroups,
  disableGroupChat,
  claimGroupWindow,
  setGroupWindowMessage,
  releaseGroupWindow,
  getGroupWindow,
  openWindowsToCloseAll,
  Budget,
  closeGroupWindow,
  getGroupCheckin,
  upsertGroupCheckin,
  listGroupCheckins,
  groupWeekStats,
  ensureUserQuiet,
  logSession,
  type GroupChatRow,
  type GroupWindowRow,
  type GroupCheckinRow,
} from "./db";
import { escapeHtml, formatMin, localDate, localMinuteOfDay } from "./util";
import { plateOfDay, renderPlate } from "./content_plates";

type Ctx = { db: D1Database; tg: TelegramClient };

const DEFAULT_TZ = "Europe/Amsterdam";
/** Окно закрывается через столько минут после публикации. */
export const WINDOW_OPEN_MIN = 45;
const MAX_NAMES = 12;
const DEFAULT_TICK_MIN = 15;
/**
 * Окно открывается, если локальная минута ∈ [windowMin, windowMin + 30): это два
 * тика подряд, так что голодный по квоте или упавший тик получает второй шанс.
 * Двойной пост исключён UNIQUE(chat_id, day, kind) в claimGroupWindow.
 */
export const WINDOW_SLOT_MIN = 30;

// ── Безопасный набор для смешанной группы ────────────────────────────────
// У участников разные состояния (грыжи, операции на стопе и т.д.), поэтому
// ТОЛЬКО низкорисковое: изометрия, осанка, дыхание, мягкие движения без
// осевой нагрузки. СТРОГО НЕ добавлять: подъёмы на носки, стойку на одной ноге,
// приседания, выпады, прыжки, наклоны вперёд / сгибание позвоночника под нагрузкой.
export interface GroupExercise {
  id: string;
  name: string;
  how: string;
}

export const GROUP_SAFE_SET: readonly GroupExercise[] = [
  { id: "glutes", name: "Сжатие ягодиц", how: "сожми на 5 секунд, расслабь — 10 раз" },
  { id: "scapula", name: "Лопатки", how: "сведи лопатки назад и вниз на 5 секунд — 10 раз" },
  { id: "posture", name: "Макушкой вверх", how: "вытянись, как будто нить тянет за макушку, 20 секунд" },
  { id: "abs", name: "Живот внутрь", how: "мягко втяни живот к позвоночнику на 10 секунд — 8 раз, дыши ровно" },
  { id: "neck", name: "Наклон шеи", how: "ухо к плечу, мягко, 15 секунд на сторону, плечи вниз" },
  { id: "march", name: "Марш сидя", how: "поочерёдно поднимай колени сидя, 30 секунд спокойным темпом" },
  { id: "wall", name: "Отжимания от стены", how: "ладони на стене, 10 плавных повторов" },
  { id: "breath", name: "Длинный выдох", how: "вдох 4 с, выдох 6 с — 6 циклов" },
];

// ── Даты ─────────────────────────────────────────────────────────────────
function dayNumber(day: string): number {
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
}

function addDays(day: string, delta: number): string {
  return new Date((dayNumber(day) + delta) * 86_400_000).toISOString().slice(0, 10);
}

function isSunday(day: string): boolean {
  return new Date(`${day}T00:00:00Z`).getUTCDay() === 0;
}

/**
 * 3 упражнения на дату. Шаг 3 взаимно прост с размером набора (8) → три разных
 * элемента; соседние дни сдвигаются на 3 → набор каждый день другой. Утро и
 * вечер одного дня получают один и тот же набор.
 */
export function pickGroupSet(day: string): GroupExercise[] {
  const n = GROUP_SAFE_SET.length;
  const start = (((dayNumber(day) * 3) % n) + n) % n;
  return [0, 1, 2].map((k) => GROUP_SAFE_SET[(start + k * 3) % n]);
}

// ── Тексты ───────────────────────────────────────────────────────────────
type WindowKind = "morning" | "evening";

function windowTitle(kind: WindowKind, minute?: number): string {
  const t = minute === undefined ? (kind === "morning" ? "9:00" : "20:00") : formatMin(minute).replace(/^0/, "");
  return kind === "morning" ? `🌅 Окно ${t}` : `🌙 Окно ${t}`;
}

/** Текст поста окна (без счётчика участников). */
export function windowText(kind: WindowKind, day: string, minute?: number): string {
  const items = pickGroupSet(day)
    .map((e) => `• ${escapeHtml(e.name)} — ${escapeHtml(e.how)}`)
    .join("\n");
  return (
    `${windowTitle(kind, minute)} · 10 минут вместе\n\n` +
    `${items}\n\n` +
    "Своё по протоколу — у меня в личке: /do\n" +
    "Делай только то, что разрешено твоим врачом."
  );
}

function windowKb(windowId: number): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "✅ Я в деле", callback_data: `gw:in:${windowId}` },
        { text: "✅ Сделал(а)", callback_data: `gw:done:${windowId}` },
      ],
    ],
  };
}

function tally(checkins: GroupCheckinRow[]): { inN: number; done: number } {
  // «В деле» — все, кто отметился (включая сделавших); «Сделали» — подмножество.
  return {
    inN: checkins.length,
    done: checkins.filter((c) => c.state === "done").length,
  };
}

function namesLine(checkins: GroupCheckinRow[]): string {
  if (checkins.length === 0) return "";
  const names = checkins
    .slice(0, MAX_NAMES)
    .map((c) => escapeHtml(c.first_name || "—"));
  const more = checkins.length > MAX_NAMES ? ", …" : "";
  return names.join(", ") + more;
}

function livePost(w: GroupWindowRow, group: GroupChatRow | null, cs: GroupCheckinRow[]): string {
  const kind = w.kind as WindowKind;
  const minute = group ? (kind === "morning" ? group.morning_min : group.evening_min) : undefined;
  const { inN, done } = tally(cs);
  let out = windowText(kind, w.day, minute);
  if (cs.length > 0) {
    out += `\n\nВ деле: ${inN} · Сделали: ${done}\n${namesLine(cs)}`;
  }
  return out;
}

function finalPost(w: GroupWindowRow, group: GroupChatRow | null, cs: GroupCheckinRow[]): string {
  const kind = w.kind as WindowKind;
  const minute = group ? (kind === "morning" ? group.morning_min : group.evening_min) : undefined;
  const { inN, done } = tally(cs);
  const body =
    inN === 0 && done === 0
      ? "Сегодня тихо — окно завтра в то же время."
      : `Итог окна: ${inN} в деле, ${done} сделали`;
  return `${windowTitle(kind, minute)} · закрыто\n\n${body}`;
}

// ── Telegram-хелперы ─────────────────────────────────────────────────────
function isForbidden(err: unknown): boolean {
  return err instanceof TelegramError && err.code === 403;
}

/** Любой 403 (бота выгнали / чат закрыт) → группу выключаем. */
async function handleSendError(db: D1Database, chatId: number, err: unknown): Promise<void> {
  if (isForbidden(err)) {
    console.warn(`group ${chatId}: 403, disabling`);
    try {
      await disableGroupChat(db, chatId);
    } catch (e) {
      console.warn("disable group failed:", e);
    }
  } else {
    console.warn(`group ${chatId} send failed:`, err);
  }
}

// ── /here ────────────────────────────────────────────────────────────────
async function isChatAdmin(tg: TelegramClient, msg: TgMessage): Promise<boolean> {
  // Анонимный админ: сообщение «от имени группы».
  if (msg.sender_chat && msg.sender_chat.id === msg.chat.id) return true;
  if (!msg.from) return false;
  try {
    const m = await tg.getChatMember(msg.chat.id, msg.from.id);
    return m.status === "creator" || m.status === "administrator";
  } catch (err) {
    console.warn("getChatMember failed:", err);
    return false;
  }
}

export async function hereCommand(ctx: Ctx, msg: TgMessage): Promise<void> {
  const chat = msg.chat;
  if (chat.type !== "group" && chat.type !== "supergroup") {
    await ctx.tg.sendMessage(chat.id, "Эта команда работает внутри группы");
    return;
  }
  if (!(await isChatAdmin(ctx.tg, msg))) {
    await ctx.tg.sendMessage(chat.id, "Включать окна может только админ группы.");
    return;
  }

  const arg = (msg.text ?? "").trim().split(/\s+/)[1]?.toLowerCase();
  if (arg === "off") {
    if (await getGroupChat(ctx.db, chat.id)) await disableGroupChat(ctx.db, chat.id);
    await ctx.tg.sendMessage(chat.id, "Окна выключены. Включить снова: /here");
    return;
  }

  const g = await upsertGroupChat(ctx.db, chat.id, chat.title ?? null, DEFAULT_TZ);
  await ctx.tg.sendMessage(
    chat.id,
    `Окна включены: ${formatMin(g.morning_min)} и ${formatMin(g.evening_min)} ` +
      `(${g.timezone}), тарелка дня в ${formatMin(g.plate_min)}. Выключить: /here off`,
  );
}

// ── Callbacks gw:in:<id> / gw:done:<id> ──────────────────────────────────
export async function groupCallback(ctx: Ctx, cq: TgCallbackQuery): Promise<void> {
  const [, action, idStr] = (cq.data ?? "").split(":");
  const windowId = Number(idStr);
  if ((action !== "in" && action !== "done") || !Number.isInteger(windowId)) {
    await ctx.tg.answerCallbackQuery(cq.id);
    return;
  }

  const win = await getGroupWindow(ctx.db, windowId);
  // Кнопка должна принадлежать окну именно этого чата.
  if (!win || (cq.message && cq.message.chat.id !== win.chat_id)) {
    await ctx.tg.answerCallbackQuery(cq.id);
    return;
  }
  if (win.closed) {
    await ctx.tg.answerCallbackQuery(cq.id, "Окно уже закрыто");
    return;
  }

  await ensureUserQuiet(ctx.db, cq.from.id);
  const prev = await getGroupCheckin(ctx.db, windowId, cq.from.id);
  await upsertGroupCheckin(ctx.db, windowId, cq.from.id, cq.from.first_name, action);

  if (action === "done" && prev?.state !== "done") {
    // Считаем в личный прогресс — один раз за окно.
    await logSession(ctx.db, cq.from.id, ["GRP"], 10, null, "group");
  }

  await ctx.tg.answerCallbackQuery(cq.id, "Записала ✓");

  const group = await getGroupChat(ctx.db, win.chat_id);
  const cs = await listGroupCheckins(ctx.db, windowId);
  const messageId = cq.message?.message_id ?? win.message_id;
  if (messageId == null) return;
  try {
    await ctx.tg.editMessageText(win.chat_id, messageId, livePost(win, group, cs), {
      reply_markup: windowKb(windowId),
    });
  } catch (err) {
    // «message is not modified» и т.п. — не страшно.
    if (isForbidden(err)) await handleSendError(ctx.db, win.chat_id, err);
    else console.warn("edit window failed:", err);
  }
}

// ── Тик планировщика ─────────────────────────────────────────────────────
async function openWindow(
  db: D1Database,
  tg: TelegramClient,
  g: GroupChatRow,
  day: string,
  kind: WindowKind,
  now: Date,
  budget: Budget,
): Promise<void> {
  if (!budget.take(1)) return budgetOut();
  const id = await claimGroupWindow(db, g.chat_id, day, kind, now.toISOString());
  if (id === null) return; // уже постили
  if (!budget.take(2, true)) {
    // send + setGroupWindowMessage не влезают: отдаём слот, повторим на след. тике.
    budget.spend(1);
    await releaseGroupWindow(db, id).catch(() => undefined);
    return budgetOut();
  }
  try {
    const minute = kind === "morning" ? g.morning_min : g.evening_min;
    const sent = await tg.sendMessage(g.chat_id, windowText(kind, day, minute), {
      reply_markup: windowKb(id),
    });
    await setGroupWindowMessage(db, id, sent.message_id);
  } catch (err) {
    budget.spend(2); // release + возможный disableGroupChat
    await releaseGroupWindow(db, id).catch(() => undefined);
    await handleSendError(db, g.chat_id, err);
  }
}

async function postPlate(
  db: D1Database,
  tg: TelegramClient,
  g: GroupChatRow,
  day: string,
  now: Date,
  budget: Budget,
): Promise<void> {
  const plate = plateOfDay(day);
  if (!plate) return;
  if (!budget.take(1)) return budgetOut();
  const id = await claimGroupWindow(db, g.chat_id, day, "plate", now.toISOString());
  if (id === null) return;
  if (!budget.take(2, true)) {
    budget.spend(1);
    await releaseGroupWindow(db, id).catch(() => undefined);
    return budgetOut();
  }
  try {
    const sent = await tg.sendMessage(g.chat_id, renderPlate(plate));
    await setGroupWindowMessage(db, id, sent.message_id);
  } catch (err) {
    budget.spend(2);
    await releaseGroupWindow(db, id).catch(() => undefined);
    await handleSendError(db, g.chat_id, err);
  }
}

async function postWeekly(
  db: D1Database,
  tg: TelegramClient,
  g: GroupChatRow,
  day: string,
  now: Date,
  budget: Budget,
): Promise<void> {
  // Стоимость (claim + 2 stats + send + setMessage = 5) резервирует tickGroups.
  const id = await claimGroupWindow(db, g.chat_id, day, "weekly", now.toISOString());
  if (id === null) return;
  try {
    const s = await groupWeekStats(db, g.chat_id, addDays(day, -6), day);
    const sent = await tg.sendMessage(
      g.chat_id,
      `Неделя: ${s.windows} окон, ${s.participations} участий, ${s.people} человек`,
    );
    await setGroupWindowMessage(db, id, sent.message_id);
  } catch (err) {
    budget.spend(2);
    await releaseGroupWindow(db, id).catch(() => undefined);
    await handleSendError(db, g.chat_id, err);
  }
}

async function closeWindow(
  db: D1Database,
  tg: TelegramClient,
  g: GroupChatRow,
  w: GroupWindowRow,
  now: Date,
  budget: Budget,
): Promise<void> {
  const cs = await listGroupCheckins(db, w.id);
  try {
    if (w.message_id != null) {
      await tg.editMessageText(g.chat_id, w.message_id, finalPost(w, g, cs), {
        reply_markup: { inline_keyboard: [] },
      });
      try {
        await tg.editMessageReplyMarkup(g.chat_id, w.message_id, { inline_keyboard: [] });
      } catch {
        /* кнопок уже нет — «not modified» */
      }
    }
  } catch (err) {
    await handleSendError(db, g.chat_id, err);
  }
  // Закрываем в любом случае — иначе будем бесконечно ретраить удалённый пост.
  await closeGroupWindow(db, w.id);

  if (w.kind === "evening" && isSunday(w.day)) {
    await postWeekly(db, tg, g, w.day, now, budget);
  }
}

function budgetOut(): void {
  console.warn("budget exhausted at groups");
}

/** Закрытие окна: checkins + edit + editMarkup + close (+ недельная сводка: 5). */
const CLOSE_COST = 4;
const WEEKLY_COST = 5;

/**
 * Один тик для всех включённых групп: закрыть просроченные окна, открыть
 * утреннее/вечернее, опубликовать тарелку дня. Окно открывается, если локальная
 * минута попала в [windowMin, windowMin + WINDOW_SLOT_MIN) (см. WINDOW_SLOT_MIN).
 *
 * Стоимость тика: 2 (список групп + все просроченные окна одним запросом)
 * + на действие: открытие/тарелка 3 (claim, send, setMessage; повторный claim в
 * слоте = 1), закрытие 4 (+5 в воскресенье вечером). Idle-тик = 2.
 * Группы идут ПЕРВЫМИ в тике: слот открытия короткий, терять его нельзя.
 */
export async function tickGroups(
  db: D1Database,
  tg: TelegramClient,
  now: Date,
  tickMin: number = DEFAULT_TICK_MIN,
  budget: Budget = Budget.unlimited(),
): Promise<void> {
  if (!budget.take(1)) return budgetOut();
  const groups = await listEnabledGroups(db);
  if (groups.length === 0) return;

  const cutoff = new Date(now.getTime() - WINDOW_OPEN_MIN * 60_000).toISOString();
  if (!budget.take(1)) return budgetOut();
  const toClose = new Map<number, GroupWindowRow[]>();
  for (const w of await openWindowsToCloseAll(db, cutoff)) {
    const list = toClose.get(w.chat_id) ?? [];
    list.push(w);
    toClose.set(w.chat_id, list);
  }
  const slot = Math.max(tickMin, WINDOW_SLOT_MIN);

  for (const g of groups) {
    try {
      const tz = g.timezone || DEFAULT_TZ;
      const nowMin = localMinuteOfDay(now, tz);
      const day = localDate(now, tz);
      const inSlot = (m: number) => nowMin >= m && nowMin < m + slot;

      // 1. Закрываем просроченные (в т.ч. вчерашние, если тик пропустили).
      let closedAny = false;
      for (const w of toClose.get(g.chat_id) ?? []) {
        const weekly = w.kind === "evening" && isSunday(w.day);
        if (!budget.take(CLOSE_COST + (weekly ? WEEKLY_COST : 0), weekly)) {
          return budgetOut();
        }
        await closeWindow(db, tg, g, w, now, budget);
        closedAny = true;
      }

      // Если закрытие получило 403 — группа уже выключена, дальше не шлём.
      if (closedAny) {
        if (!budget.take(1)) return budgetOut();
        const fresh = await getGroupChat(db, g.chat_id);
        if (!fresh || !fresh.enabled) continue;
      }

      // 2. Открываем окна.
      if (inSlot(g.morning_min)) await openWindow(db, tg, g, day, "morning", now, budget);
      if (inSlot(g.evening_min)) await openWindow(db, tg, g, day, "evening", now, budget);

      // 3. Тарелка дня.
      if (inSlot(g.plate_min)) await postPlate(db, tg, g, day, now, budget);
    } catch (err) {
      console.warn(`group tick failed for ${g.chat_id}:`, err);
    }
  }
}
