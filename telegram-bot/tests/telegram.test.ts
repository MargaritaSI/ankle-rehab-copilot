/// <reference types="@cloudflare/vitest-pool-workers" />
/**
 * Клиент Telegram: нарезка длинных сообщений, обрезка правок, 429-retry,
 * проброс 403. Чистые тесты: глобальный fetch замокан.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TelegramClient,
  TelegramError,
  splitMessage,
  truncateForEdit,
} from "../src/telegram";

interface Call {
  method: string;
  body: Record<string, unknown>;
}
let calls: Call[] = [];
type Responder = (call: Call, n: number) => unknown;
let responder: Responder;

function jsonRes(o: unknown): Response {
  return new Response(JSON.stringify(o), { headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  calls = [];
  let n = 0;
  responder = (c) => ({ ok: true, result: { message_id: ++n, chat: { id: 1 }, date: 0, _m: c.method } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const call: Call = {
        method: url.split("/").pop() ?? "",
        body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      };
      calls.push(call);
      return jsonRes(responder(call, calls.length));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const KB = { inline_keyboard: [[{ text: "ok", callback_data: "x" }]] };

describe("splitMessage", () => {
  it("короткий текст не трогает", () => {
    expect(splitMessage("hello")).toEqual(["hello"]);
  });

  it("режет по строкам, каждая часть ≤ max", () => {
    const text = Array.from({ length: 300 }, (_, i) => `строка ${i} ${"x".repeat(20)}`).join("\n");
    const parts = splitMessage(text, 1000);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(1000);
    expect(parts.join("\n")).toBe(text);
  });

  it("пара <b>…</b> длиннее лимита не рвётся пополам (уходит без тегов)", () => {
    const body = Array.from({ length: 40 }, (_, i) => `line ${i} ${"y".repeat(30)}`).join("\n");
    const parts = splitMessage(`<b>${body}</b>`, 500);
    for (const p of parts) {
      expect(p.length).toBeLessThanOrEqual(500);
      expect(p).not.toMatch(/<\/?b>/);
    }
  });

  it("незакрытый тег уезжает в следующую часть вместе со строкой", () => {
    const filler = "a".repeat(60);
    const text = [filler, filler, "<b>заголовок", `${filler}</b>`, filler].join("\n");
    const parts = splitMessage(text, 140);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) {
      expect((p.match(/<b>/g) ?? []).length).toBe((p.match(/<\/b>/g) ?? []).length);
      expect(p.length).toBeLessThanOrEqual(140);
    }
  });

  it("одна гигантская строка режется жёстко", () => {
    const parts = splitMessage("z".repeat(9000), 3900);
    expect(parts.map((p) => p.length)).toEqual([3900, 3900, 1200]);
  });
});

describe("sendMessage", () => {
  it("9000 символов → 3 отправки, markup только на последней, каждая ≤ 4096", async () => {
    const text = Array.from({ length: 150 }, (_, i) => `${String(i).padStart(3, "0")} ${"q".repeat(56)}`).join("\n");
    expect(text.length).toBeGreaterThan(8500);
    const last = await new TelegramClient("t").sendMessage(5, text, { reply_markup: KB });
    expect(calls).toHaveLength(3);
    for (const c of calls) expect((c.body.text as string).length).toBeLessThanOrEqual(4096);
    expect(calls[0].body.reply_markup).toBeUndefined();
    expect(calls[1].body.reply_markup).toBeUndefined();
    expect(calls[2].body.reply_markup).toEqual(KB);
    expect(last.message_id).toBe(3);
    expect(calls.map((c) => c.body.text).join("\n")).toBe(text);
  });

  it("короткое сообщение — одна отправка, parse_mode HTML по умолчанию", async () => {
    await new TelegramClient("t").sendMessage(5, "hi", { reply_markup: KB });
    expect(calls).toHaveLength(1);
    expect(calls[0].body.parse_mode).toBe("HTML");
    expect(calls[0].body.reply_markup).toEqual(KB);
  });

  it("часть, которую нельзя разрезать по тегам, уходит без parse_mode и без тегов", async () => {
    await new TelegramClient("t").sendMessage(5, `<b>${"w ".repeat(3000)}</b>`);
    expect(calls.length).toBeGreaterThan(1);
    for (const c of calls) {
      expect(c.body.parse_mode).toBeUndefined();
      expect(c.body.text as string).not.toMatch(/<\/?b>/);
    }
  });

  it("400 can't parse entities → один повтор простым текстом", async () => {
    responder = (_c, n) =>
      n === 1
        ? { ok: false, error_code: 400, description: "Bad Request: can't parse entities: Unsupported start tag" }
        : { ok: true, result: { message_id: 9, chat: { id: 1 }, date: 0 } };
    const m = await new TelegramClient("t").sendMessage(5, "<b>привет");
    expect(calls).toHaveLength(2);
    expect(calls[1].body.parse_mode).toBeUndefined();
    expect(calls[1].body.text).toBe("привет");
    expect(m.message_id).toBe(9);
  });

  it("429 с retry_after=1 → ждём и второй заход проходит", async () => {
    vi.useFakeTimers();
    responder = (_c, n) =>
      n === 1
        ? { ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 1 } }
        : { ok: true, result: { message_id: 7, chat: { id: 1 }, date: 0 } };
    const p = new TelegramClient("t").sendMessage(5, "hi");
    await vi.advanceTimersByTimeAsync(1100);
    const m = await p;
    expect(calls).toHaveLength(2);
    expect(m.message_id).toBe(7);
  });

  it("429 с retry_after > 5 → TelegramError(429) без ожидания", async () => {
    responder = () => ({
      ok: false,
      error_code: 429,
      description: "Too Many Requests",
      parameters: { retry_after: 30 },
    });
    await expect(new TelegramClient("t").sendMessage(5, "hi")).rejects.toMatchObject({ code: 429 });
    expect(calls).toHaveLength(1);
  });

  it("повторный 429 после retry → TelegramError(429)", async () => {
    vi.useFakeTimers();
    responder = () => ({
      ok: false,
      error_code: 429,
      description: "Too Many Requests",
      parameters: { retry_after: 1 },
    });
    const assertion = expect(new TelegramClient("t").sendMessage(5, "hi")).rejects.toMatchObject({ code: 429 });
    await vi.advanceTimersByTimeAsync(1500);
    await assertion;
    expect(calls).toHaveLength(2);
  });

  it("403 пробрасывается с code 403 (handlers_group отключает группу)", async () => {
    responder = () => ({ ok: false, error_code: 403, description: "Forbidden: bot was kicked" });
    const err = await new TelegramClient("t").sendMessage(5, "hi").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TelegramError);
    expect((err as TelegramError).code).toBe(403);
    expect(calls).toHaveLength(1);
  });

  it("каждый fetch получает signal (таймаут)", async () => {
    await new TelegramClient("t").sendMessage(5, "hi");
    const init = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("editMessageText / truncateForEdit", () => {
  it("правка из 5000 символов обрезается до ≤ 4096 с «…»", async () => {
    await new TelegramClient("t").editMessageText(5, 10, "e".repeat(5000));
    expect(calls).toHaveLength(1);
    const t = calls[0].body.text as string;
    expect(t.length).toBeLessThanOrEqual(4096);
    expect(t.endsWith("…")).toBe(true);
    expect(t.length).toBe(4001);
  });

  it("короткая правка не меняется", () => {
    expect(truncateForEdit("abc")).toBe("abc");
  });

  it("обрезка закрывает открытые теги и не оставляет оборванный", () => {
    const text = `<b>${"k".repeat(3995)}<i>tail text</i></b>${"z".repeat(500)}`;
    const t = truncateForEdit(text);
    expect(t.length).toBeLessThanOrEqual(4096);
    expect(t.startsWith("<b>")).toBe(true);
    expect(t.endsWith("</b>")).toBe(true);
    expect(/<[^>]*$/.test(t)).toBe(false);
  });
});
