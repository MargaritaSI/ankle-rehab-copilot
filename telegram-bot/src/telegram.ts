/**
 * Тонкий клиент Telegram Bot API через fetch.
 * Addsport использует HTML parse_mode по умолчанию (как в bot.py с HTML).
 * При необходимости можно передать parse_mode: null чтобы выключить.
 */

export interface TgUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TgChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
}

export interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  date: number;
  text?: string;
  /** Для анонимных админов группы: sender_chat.id === chat.id. */
  sender_chat?: { id: number };
}

export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface KeyboardButton {
  text: string;
}

export interface ReplyKeyboardMarkup {
  keyboard: KeyboardButton[][];
  resize_keyboard?: boolean;
}

export type ReplyMarkup = InlineKeyboardMarkup | ReplyKeyboardMarkup;

export type ParseMode = "HTML" | "Markdown" | "MarkdownV2" | null;

const DEFAULT_PARSE_MODE: ParseMode = "HTML";

interface SendMessageOptions {
  parse_mode?: ParseMode;
  reply_markup?: ReplyMarkup;
}

interface EditMessageTextOptions {
  parse_mode?: ParseMode;
  reply_markup?: InlineKeyboardMarkup;
}

/** Жёсткий лимит Telegram на текст сообщения (символы после разбора разметки). */
const TG_TEXT_LIMIT = 4096;
/** Режем с запасом: теги HTML считаются в нашей длине, а Telegram их не считает. */
const SPLIT_MAX = 3900;
/** edit нельзя разбить на части — режем до этой длины и ставим «…». */
const EDIT_MAX = 4000;
/** Таймаут одного обращения к Telegram: зависший вызов не должен съесть окно waitUntil (30 с). */
const FETCH_TIMEOUT_MS = 8000;
/** Ждём retry_after при 429 только если он не больше этого (сек). */
const MAX_RETRY_AFTER_S = 5;

/** Ошибка Bot API с HTTP-кодом / error_code (403 = бота выгнали / заблокировали). */
export class TelegramError extends Error {
  constructor(
    public method: string,
    public code: number | undefined,
    description: string | undefined,
  ) {
    super(`Telegram ${method} failed: ${description}`);
  }
}

export interface TgChatMember {
  status: "creator" | "administrator" | "member" | "restricted" | "left" | "kicked";
  user: TgUser;
}

// ── Нарезка и обрезка длинных текстов (чистые функции) ───────────────────

const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^>]*)?>/g;

/**
 * Стек незакрытых HTML-тегов текста; null — если встретился закрывающий тег
 * без пары (разметка заведомо невалидна). Пустой массив = сбалансировано.
 */
function openTags(text: string): string[] | null {
  const stack: string[] = [];
  for (const m of text.matchAll(TAG_RE)) {
    const name = m[2].toLowerCase();
    if (m[1] === "/") {
      if (stack.pop() !== name) return null;
    } else {
      stack.push(name);
    }
  }
  return stack;
}

function isBalanced(text: string): boolean {
  const st = openTags(text);
  return st !== null && st.length === 0;
}

/** HTML → простой текст (для запасного plain-варианта, который не может дать 400). */
function htmlToPlain(text: string): string {
  return text
    .replace(TAG_RE, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

interface SendPart {
  text: string;
  /** true → слать без parse_mode (разметку сохранить нельзя). */
  plain: boolean;
}

/**
 * Нарезка на части ≤ max по границам строк. В HTML-режиме часть не должна
 * заканчиваться внутри открытой пары тегов: незакрытый хвост строк уходит в
 * следующую часть. Если сбалансированного разреза нет — часть уходит как
 * plain-текст (без тегов), чтобы не получить 400.
 */
function splitParts(text: string, max: number, html: boolean): SendPart[] {
  if (text.length <= max) return [{ text, plain: false }];

  const out: SendPart[] = [];
  const hardCut: string[] = [];
  // Строки; слишком длинная строка режется жёстко (помечаем куски как «сырые»).
  const lines: string[] = [];
  for (const line of text.split("\n")) {
    if (line.length <= max) {
      lines.push(line);
    } else {
      for (let i = 0; i < line.length; i += max) {
        const piece = line.slice(i, i + max);
        hardCut.push(piece);
        lines.push(piece);
      }
    }
  }
  const hard = new Set(hardCut);

  let cur: string[] = [];
  const len = (arr: string[]) => arr.reduce((n, l) => n + l.length, 0) + Math.max(0, arr.length - 1);

  const flush = () => {
    if (cur.length === 0) return;
    if (!html) {
      out.push({ text: cur.join("\n"), plain: false });
      cur = [];
      return;
    }
    // Самый длинный сбалансированный префикс строк.
    let k = cur.length;
    while (k > 0 && !isBalanced(cur.slice(0, k).join("\n"))) k--;
    if (k > 0 && !cur.slice(0, k).some((l) => hard.has(l))) {
      out.push({ text: cur.slice(0, k).join("\n"), plain: false });
      cur = cur.slice(k);
    } else {
      // Нет безопасного разреза → plain без тегов.
      out.push({ text: htmlToPlain(cur.join("\n")), plain: true });
      cur = [];
    }
  };

  for (const line of lines) {
    if (cur.length > 0 && len(cur) + 1 + line.length > max) flush();
    // Хвост после flush мог остаться и всё ещё не влезать с новой строкой.
    while (cur.length > 0 && len(cur) + 1 + line.length > max) flush();
    cur.push(line);
  }
  if (cur.length > 0) {
    if (html && !isBalanced(cur.join("\n")) && out.length > 0) {
      // Последняя часть невалидна по тегам — отдаём как plain, но целиком.
      out.push({ text: htmlToPlain(cur.join("\n")), plain: true });
    } else {
      out.push({ text: cur.join("\n"), plain: false });
    }
  }
  return out;
}

/**
 * Режет text на части ≤ max (по умолчанию 3900) по границам строк; не рвёт
 * пары HTML-тегов (если разреза нет — часть возвращается без тегов).
 * Короткий текст возвращается как есть одним элементом.
 */
export function splitMessage(text: string, max: number = SPLIT_MAX): string[] {
  return splitParts(text, max, true).map((p) => p.text);
}

/**
 * Для editMessageText: правка не делится на части, поэтому > 4096 символов
 * обрезаем до 4000 + «…». Не оставляем оборванный тег/сущность и закрываем
 * открытые теги, чтобы правка не упала с 400.
 */
export function truncateForEdit(text: string): string {
  if (text.length <= TG_TEXT_LIMIT) return text;
  let cut = text.slice(0, EDIT_MAX);
  // Оборванный тег «<b class=…» или сущность «&am».
  const lt = cut.lastIndexOf("<");
  if (lt > cut.lastIndexOf(">")) cut = cut.slice(0, lt);
  const amp = cut.lastIndexOf("&");
  if (amp >= 0 && amp > cut.lastIndexOf(";") && cut.length - amp < 10) cut = cut.slice(0, amp);
  const open = openTags(cut);
  // Кривая разметка (закрывающий тег без пары): убираем теги, сущности оставляем.
  if (open === null) return cut.replace(TAG_RE, "") + "…";
  return cut + "…" + open.reverse().map((t) => `</${t}>`).join("");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TelegramClient {
  constructor(private token: string) {}

  private async call<T = unknown>(
    method: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      let json: {
        ok: boolean;
        result?: T;
        description?: string;
        error_code?: number;
        parameters?: { retry_after?: number };
      };
      try {
        json = (await res.json()) as typeof json;
      } catch {
        // 502/HTML-страница вместо JSON — это не «ok».
        throw new TelegramError(method, res.status, "non-JSON response");
      }
      if (json.ok) return json.result as T;

      const code = json.error_code ?? res.status;
      const retryAfter = json.parameters?.retry_after;
      if (
        code === 429 &&
        attempt === 0 &&
        typeof retryAfter === "number" &&
        retryAfter <= MAX_RETRY_AFTER_S
      ) {
        await sleep(Math.max(0, retryAfter) * 1000);
        continue;
      }
      throw new TelegramError(method, code, json.description);
    }
  }

  /**
   * Отправка с авто-нарезкой: текст > 3900 символов уходит несколькими
   * сообщениями, reply_markup — только на последнем. Возвращает последнее
   * отправленное сообщение. Если HTML не разобрался (400 can't parse entities)
   * — один повтор простым текстом: лучше без форматирования, чем без ответа.
   */
  async sendMessage(
    chatId: number,
    text: string,
    options: SendMessageOptions = {},
  ): Promise<TgMessage> {
    const mode: ParseMode =
      options.parse_mode === null ? null : (options.parse_mode ?? DEFAULT_PARSE_MODE);
    const parts = splitParts(text, SPLIT_MAX, mode === "HTML");
    let last: TgMessage | undefined;
    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1;
      const reply_markup = isLast ? options.reply_markup : undefined;
      const plain = parts[i].plain || mode === null;
      const send = (t: string, pm: ParseMode) =>
        this.call<TgMessage>("sendMessage", {
          chat_id: chatId,
          text: t,
          parse_mode: pm === null ? undefined : pm,
          reply_markup,
        });
      try {
        last = await send(parts[i].text, plain ? null : mode);
      } catch (err) {
        if (
          !plain &&
          mode === "HTML" &&
          err instanceof TelegramError &&
          err.code === 400 &&
          /parse entities/i.test(err.message)
        ) {
          last = await send(htmlToPlain(parts[i].text), null);
        } else {
          throw err;
        }
      }
    }
    return last as TgMessage;
  }

  editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    options: EditMessageTextOptions = {},
  ): Promise<TgMessage | boolean> {
    return this.call<TgMessage | boolean>("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: truncateForEdit(text),
      parse_mode:
        options.parse_mode === null
          ? undefined
          : (options.parse_mode ?? DEFAULT_PARSE_MODE),
      reply_markup: options.reply_markup,
    });
  }

  answerCallbackQuery(callbackQueryId: string, text?: string): Promise<boolean> {
    return this.call<boolean>("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text,
    });
  }

  editMessageReplyMarkup(
    chatId: number,
    messageId: number,
    replyMarkup?: InlineKeyboardMarkup,
  ): Promise<TgMessage | boolean> {
    return this.call<TgMessage | boolean>("editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: replyMarkup,
    });
  }

  setMyCommands(
    commands: Array<{ command: string; description: string }>,
  ): Promise<boolean> {
    return this.call<boolean>("setMyCommands", { commands });
  }

  getChatMember(chatId: number, userId: number): Promise<TgChatMember> {
    return this.call<TgChatMember>("getChatMember", {
      chat_id: chatId,
      user_id: userId,
    });
  }
}
