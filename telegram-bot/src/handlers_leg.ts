/**
 * Хендлеры /leg.
 *
 * Бот больше не отвечает на вопросы по ноге моделью: вопросы идут на сайт
 * (ответ с источниками). Здесь остаются «время и привычка» — короткие
 * статичные карточки-правила (content_cards.ts). RAG-код (leg_rag.ts) жив,
 * но отсюда не вызывается.
 */

import {
  TelegramClient,
  type TgMessage,
  type TgCallbackQuery,
} from "./telegram";
import type { Env } from "./env";
import { StateManager } from "./state";
import { escapeHtml } from "./util";
import { CARDS, renderCard, cardsKeyboard } from "./content_cards";

/** Оставлено константой: router.ts импортирует; свободный вопрос больше не ждём. */
export const S_LEG_ASK = "Leg:ask";

export const LEG_SITE_URL = "https://ankle-rehab-copilot.streamlit.app";
const MAX_QUESTION_LEN = 300;

const PRIVATE_ONLY = "Про ногу отвечаю только в личных сообщениях — напиши мне напрямую.";

function menuText(): string {
  return (
    "🦵 <b>Нога</b>\n\n" +
    "На вопросы про восстановление отвечает сайт — там ответ с источниками:\n" +
    `<a href="${LEG_SITE_URL}">Открыть на сайте</a>\n${LEG_SITE_URL}\n\n` +
    "Короткие карточки-правила:"
  );
}

function questionText(question: string): string {
  const q = question.slice(0, MAX_QUESTION_LEN);
  const url = `${LEG_SITE_URL}/?q=${encodeURIComponent(q)}`;
  return (
    "Вопросы по базе отвечает сайт — там ответ с источниками:\n" +
    `<a href="${escapeHtml(url)}">Открыть на сайте</a>\n${escapeHtml(url)}`
  );
}

/** /leg и кнопка «🦵 Нога». С вопросом — ссылка на сайт, без — меню карточек. */
export async function legEntry(
  _env: Env,
  tg: TelegramClient,
  msg: TgMessage,
): Promise<void> {
  if (msg.chat.type !== "private") {
    await tg.sendMessage(msg.chat.id, PRIVATE_ONLY);
    return;
  }
  const arg = (msg.text ?? "").replace(/^\/leg\b/, "").trim();
  if (arg && arg !== "🦵 Нога") {
    await tg.sendMessage(msg.chat.id, questionText(arg));
    return;
  }
  await tg.sendMessage(msg.chat.id, menuText(), { reply_markup: cardsKeyboard() });
}

/** Тап по карточке (callback legq:<i>). */
export async function legPreset(
  _env: Env,
  tg: TelegramClient,
  cq: TgCallbackQuery,
): Promise<void> {
  await tg.answerCallbackQuery(cq.id);
  if (cq.message && cq.message.chat.type !== "private") {
    await tg.sendMessage(cq.message.chat.id, PRIVATE_ONLY);
    return;
  }
  const raw = (cq.data ?? "").split(":")[1] ?? "";
  const idx = /^\d+$/.test(raw) ? Number(raw) : -1;
  const card = CARDS[idx];
  if (!card || !cq.message) return;
  await tg.sendMessage(cq.message.chat.id, renderCard(card), {
    reply_markup: cardsKeyboard(),
  });
}

/** Сюда попадает только устаревшее состояние Leg:ask — сбрасываем и даём ссылку. */
export async function legAskSave(
  env: Env,
  tg: TelegramClient,
  msg: TgMessage,
): Promise<void> {
  if (msg.chat.type !== "private") {
    await tg.sendMessage(msg.chat.id, PRIVATE_ONLY);
    return;
  }
  if (msg.from) {
    await new StateManager(env.DB, msg.from.id).clear();
  }
  await tg.sendMessage(
    msg.chat.id,
    "Вопросы по ноге теперь отвечает сайт — там ответ с источниками:\n" +
      `<a href="${LEG_SITE_URL}">Открыть на сайте</a>\n${LEG_SITE_URL}`,
  );
}
