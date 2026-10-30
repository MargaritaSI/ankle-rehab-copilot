/// <reference types="@cloudflare/vitest-pool-workers" />
/**
 * Групповые «окна»: /here (только админ), тики планировщика (открытие / закрытие
 * окна, тарелка дня, недельная сводка), callbacks gw:in / gw:done.
 * Telegram замокан глобальным fetch; время задаём явными Date.
 */

import { env, applyD1Migrations } from "cloudflare:test";
import { beforeAll, beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { handleUpdate } from "../src/router";
import { tickGroups, pickGroupSet, windowText, GROUP_SAFE_SET } from "../src/handlers_group";
import { TelegramClient, type TgUpdate } from "../src/telegram";
import { stripBotSuffix } from "../src/util";
import type { Env } from "../src/env";

const TEST_MIGRATIONS = (
  env as unknown as { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] }
).TEST_MIGRATIONS;
const DB = (env as unknown as { DB: D1Database }).DB;

const testEnv: Env = {
  DB,
  DEFAULT_TZ: "Europe/Amsterdam",
  TELEGRAM_BOT_TOKEN: "test-token",
  WEBHOOK_SECRET: "secret",
  AI: { run: async () => ({}) } as unknown as Env["AI"],
  NEBIUS_API_KEY: "test-nebius",
  INGEST_SECRET: "test-ingest",
};

const CHAT = -1001234567890;
const ADMIN = 111;
const USER = 777;

// 2026-10-26 — понедельник, Амстердам = UTC+1 (CET) → 09:00 local = 08:00Z.
const MON_0900 = new Date("2026-10-26T08:00:00Z");
const MON_0905 = new Date("2026-10-26T08:05:00Z");
const MON_0945 = new Date("2026-10-26T08:45:00Z");
const MON_1700 = new Date("2026-10-26T16:00:00Z");
const MON_1705 = new Date("2026-10-26T16:05:00Z");
// 2026-11-01 — воскресенье; 20:00 local (CET) = 19:00Z.
const SUN_2000 = new Date("2026-11-01T19:00:00Z");
const SUN_2045 = new Date("2026-11-01T19:45:00Z");

// ---------------------------------------------------------------------------
// Мок Telegram
// ---------------------------------------------------------------------------

interface Call {
  method: string;
  body: Record<string, unknown>;
}
let calls: Call[] = [];
let memberStatus = "member";
let failSendCode: number | null = null;
let nextMessageId = 100;

function installFetchMock(): void {
  calls = [];
  memberStatus = "member";
  failSendCode = null;
  nextMessageId = 100;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.includes("api.telegram.org")) throw new Error(`Unexpected fetch to ${url}`);
      const method = url.split("/").pop() ?? "";
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      calls.push({ method, body });
      const json = (o: unknown) =>
        new Response(JSON.stringify(o), { headers: { "content-type": "application/json" } });
      if (method === "getChatMember") {
        return json({ ok: true, result: { status: memberStatus, user: { id: body.user_id } } });
      }
      if (method === "sendMessage") {
        if (failSendCode) {
          return json({ ok: false, error_code: failSendCode, description: "Forbidden: bot was kicked" });
        }
        return json({ ok: true, result: { message_id: nextMessageId++ } });
      }
      return json({ ok: true, result: true });
    }),
  );
}

const byMethod = (m: string) => calls.filter((c) => c.method === m);
const tg = () => new TelegramClient("test-token");

beforeAll(async () => {
  await applyD1Migrations(DB, TEST_MIGRATIONS);
});

beforeEach(async () => {
  installFetchMock();
  await DB.exec("DELETE FROM group_checkins");
  await DB.exec("DELETE FROM group_windows");
  await DB.exec("DELETE FROM group_chats");
  await DB.prepare("DELETE FROM sessions WHERE tg_id = ?").bind(USER).run();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Хелперы апдейтов
// ---------------------------------------------------------------------------

let uid = 1;
function groupMsg(text: string, fromId: number, type: "group" | "supergroup" | "private" = "supergroup"): TgUpdate {
  return {
    update_id: uid++,
    message: {
      message_id: uid,
      from: { id: fromId, is_bot: false, first_name: "Анна" },
      chat: { id: type === "private" ? fromId : CHAT, type, title: "Спина" },
      date: 0,
      text,
    },
  };
}

function gwCallback(data: string, fromId: number, name: string, messageId: number): TgUpdate {
  return {
    update_id: uid++,
    callback_query: {
      id: `cq${uid}`,
      from: { id: fromId, is_bot: false, first_name: name },
      message: {
        message_id: messageId,
        chat: { id: CHAT, type: "supergroup" },
        date: 0,
      },
      data,
    },
  };
}

async function enableGroup(): Promise<void> {
  memberStatus = "administrator";
  await handleUpdate(groupMsg("/here", ADMIN), testEnv);
  calls = [];
  nextMessageId = 100;
}

async function windowRow(day: string, kind: string) {
  return await DB.prepare("SELECT * FROM group_windows WHERE chat_id = ? AND day = ? AND kind = ?")
    .bind(CHAT, day, kind)
    .first<{ id: number; message_id: number | null; closed: number }>();
}

// ---------------------------------------------------------------------------
// /here
// ---------------------------------------------------------------------------

describe("/here", () => {
  it("refuses a non-admin and creates nothing", async () => {
    memberStatus = "member";
    await handleUpdate(groupMsg("/here", USER), testEnv);
    expect(byMethod("getChatMember")).toHaveLength(1);
    const row = await DB.prepare("SELECT * FROM group_chats WHERE chat_id = ?").bind(CHAT).first();
    expect(row).toBeNull();
    expect(String(byMethod("sendMessage")[0].body.text)).toContain("админ");
  });

  it("enables the group for an admin (also with @botname suffix)", async () => {
    memberStatus = "administrator";
    await handleUpdate(groupMsg("/here@addsport_bot", ADMIN), testEnv);
    const row = await DB.prepare("SELECT * FROM group_chats WHERE chat_id = ?")
      .bind(CHAT)
      .first<{ enabled: number; timezone: string; morning_min: number; evening_min: number; plate_min: number }>();
    expect(row).not.toBeNull();
    expect(row!.enabled).toBe(1);
    expect(row!.timezone).toBe("Europe/Amsterdam");
    expect([row!.morning_min, row!.evening_min, row!.plate_min]).toEqual([540, 1200, 1020]);
    const text = String(byMethod("sendMessage")[0].body.text);
    expect(text).toContain("Окна включены: 09:00 и 20:00 (Europe/Amsterdam), тарелка дня в 17:00");
  });

  it("/here off disables", async () => {
    await enableGroup();
    await handleUpdate(groupMsg("/here off", ADMIN), testEnv);
    const row = await DB.prepare("SELECT enabled FROM group_chats WHERE chat_id = ?")
      .bind(CHAT)
      .first<{ enabled: number }>();
    expect(row!.enabled).toBe(0);
  });

  it("explains itself in a private chat", async () => {
    await handleUpdate(groupMsg("/here", USER, "private"), testEnv);
    expect(byMethod("getChatMember")).toHaveLength(0);
    expect(String(byMethod("sendMessage")[0].body.text)).toContain("внутри группы");
  });
});

// ---------------------------------------------------------------------------
// Тики
// ---------------------------------------------------------------------------

describe("tickGroups", () => {
  it("opens the morning window once and records message_id", async () => {
    await enableGroup();
    await tickGroups(DB, tg(), MON_0900, 15);
    const sends = byMethod("sendMessage");
    expect(sends).toHaveLength(1);
    const text = String(sends[0].body.text);
    expect(text).toContain("🌅 Окно 9:00 · 10 минут вместе");
    expect(text).toContain("/do");
    expect(text).toContain("Делай только то, что разрешено твоим врачом.");
    const w = await windowRow("2026-10-26", "morning");
    expect(w).not.toBeNull();
    expect(w!.message_id).toBe(100);
    const kb = (sends[0].body.reply_markup as { inline_keyboard: { callback_data: string }[][] }).inline_keyboard;
    expect(kb[0].map((b) => b.callback_data)).toEqual([`gw:in:${w!.id}`, `gw:done:${w!.id}`]);

    await tickGroups(DB, tg(), MON_0905, 15);
    expect(byMethod("sendMessage")).toHaveLength(1);
  });

  it("slot is [windowMin, windowMin + 30): a starved tick gets a second chance, no double post", async () => {
    await enableGroup();
    // 09:15 local — второй тик слота (первый пропустили): пост уходит.
    await tickGroups(DB, tg(), new Date("2026-10-26T08:15:00Z"), 15);
    expect(byMethod("sendMessage")).toHaveLength(1);
    // 09:29 — всё ещё слот, но слот уже занят: дубля нет.
    await tickGroups(DB, tg(), new Date("2026-10-26T08:29:00Z"), 15);
    expect(byMethod("sendMessage")).toHaveLength(1);
  });

  it("does not post once the 30-minute slot has passed", async () => {
    await enableGroup();
    await tickGroups(DB, tg(), new Date("2026-10-26T08:30:00Z"), 15); // 09:30 local
    expect(byMethod("sendMessage")).toHaveLength(0);
  });

  it("a failed open (non-403) releases the slot so the next tick in the slot retries", async () => {
    await enableGroup();
    failSendCode = 500;
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await tickGroups(DB, tg(), MON_0900, 15);
    failSendCode = null;
    expect(await windowRow("2026-10-26", "morning")).toBeNull();
    await tickGroups(DB, tg(), new Date("2026-10-26T08:15:00Z"), 15);
    expect((await windowRow("2026-10-26", "morning"))?.message_id).not.toBeNull();
    vi.restoreAllMocks();
  });

  it("does not post outside the windows", async () => {
    await enableGroup();
    await tickGroups(DB, tg(), new Date("2026-10-26T10:00:00Z"), 15); // 11:00 local
    expect(byMethod("sendMessage")).toHaveLength(0);
  });

  it("gw:in then gw:done by one user ends as one done checkin, edits the post, logs one session", async () => {
    await enableGroup();
    await tickGroups(DB, tg(), MON_0900, 15);
    const w = (await windowRow("2026-10-26", "morning"))!;
    calls = [];

    await handleUpdate(gwCallback(`gw:in:${w.id}`, USER, "Борис", 100), testEnv);
    expect(String(byMethod("answerCallbackQuery")[0].body.text)).toContain("Записала");
    let edit = byMethod("editMessageText").at(-1)!;
    expect(String(edit.body.text)).toContain("В деле: 1 · Сделали: 0");
    expect(String(edit.body.text)).toContain("Борис");

    await handleUpdate(gwCallback(`gw:done:${w.id}`, USER, "Борис", 100), testEnv);
    await handleUpdate(gwCallback(`gw:done:${w.id}`, USER, "Борис", 100), testEnv); // повтор
    await handleUpdate(gwCallback(`gw:in:${w.id}`, USER, "Борис", 100), testEnv); // не понижает

    const rows = await DB.prepare("SELECT * FROM group_checkins WHERE window_id = ?")
      .bind(w.id)
      .all<{ state: string; tg_id: number }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0].state).toBe("done");

    edit = byMethod("editMessageText").at(-1)!;
    expect(String(edit.body.text)).toContain("В деле: 1 · Сделали: 1");

    const sess = await DB.prepare("SELECT * FROM sessions WHERE tg_id = ?")
      .bind(USER)
      .all<{ exercise_ids: string; minutes: number; situation: string }>();
    expect(sess.results).toHaveLength(1);
    expect(JSON.parse(sess.results[0].exercise_ids)).toEqual(["GRP"]);
    expect(sess.results[0].minutes).toBe(10);
    expect(sess.results[0].situation).toBe("group");

    // Групповой участник не получает личные напоминания.
    const u = await DB.prepare("SELECT reminders_on FROM users WHERE tg_id = ?")
      .bind(USER)
      .first<{ reminders_on: number }>();
    expect(u!.reminders_on).toBe(0);
  });

  it("closes the window after 45 minutes with the final tally", async () => {
    await enableGroup();
    await tickGroups(DB, tg(), MON_0900, 15);
    const w = (await windowRow("2026-10-26", "morning"))!;
    await handleUpdate(gwCallback(`gw:in:${w.id}`, USER, "Борис", 100), testEnv);
    await handleUpdate(gwCallback(`gw:done:${w.id}`, 222, "Вера", 100), testEnv);
    calls = [];

    await tickGroups(DB, tg(), new Date("2026-10-26T08:30:00Z"), 15); // рано
    expect(byMethod("editMessageText")).toHaveLength(0);

    await tickGroups(DB, tg(), MON_0945, 15);
    const edit = byMethod("editMessageText")[0];
    expect(String(edit.body.text)).toContain("Итог окна: 2 в деле, 1 сделали");
    expect(byMethod("editMessageReplyMarkup")).toHaveLength(1);
    expect((await windowRow("2026-10-26", "morning"))!.closed).toBe(1);

    // Повторный тик ничего не правит и кнопки закрытому окну не работают.
    calls = [];
    await tickGroups(DB, tg(), new Date("2026-10-26T09:00:00Z"), 15);
    expect(byMethod("editMessageText")).toHaveLength(0);
    await handleUpdate(gwCallback(`gw:in:${w.id}`, 333, "Глеб", 100), testEnv);
    expect(String(byMethod("answerCallbackQuery")[0].body.text)).toContain("закрыто");
    expect(byMethod("editMessageText")).toHaveLength(0);
  });

  it("an empty window closes quietly", async () => {
    await enableGroup();
    await tickGroups(DB, tg(), MON_0900, 15);
    calls = [];
    await tickGroups(DB, tg(), MON_0945, 15);
    expect(String(byMethod("editMessageText")[0].body.text)).toContain(
      "Сегодня тихо — окно завтра в то же время.",
    );
  });

  it("posts at most one plate per day (skips cleanly when PLATES is empty)", async () => {
    await enableGroup();
    await tickGroups(DB, tg(), MON_1700, 15);
    await tickGroups(DB, tg(), MON_1705, 15);
    const plateRows = await DB.prepare(
      "SELECT COUNT(*) AS n FROM group_windows WHERE chat_id = ? AND kind = 'plate'",
    )
      .bind(CHAT)
      .first<{ n: number }>();
    expect(plateRows!.n).toBeLessThanOrEqual(1);
    // Окон утро/вечер в 17:00 нет, значит все sendMessage — это тарелка.
    expect(byMethod("sendMessage").length).toBeLessThanOrEqual(1);
    expect(byMethod("sendMessage").length).toBe(plateRows!.n);
  });

  it("posts the weekly summary when the Sunday evening window closes", async () => {
    await enableGroup();
    // Понедельник: 1 окно, 1 человек.
    await tickGroups(DB, tg(), MON_0900, 15);
    const mon = (await windowRow("2026-10-26", "morning"))!;
    await handleUpdate(gwCallback(`gw:done:${mon.id}`, USER, "Борис", 100), testEnv);
    // Воскресенье вечер: ещё 2 участника.
    await tickGroups(DB, tg(), SUN_2000, 15);
    const sun = (await windowRow("2026-11-01", "evening"))!;
    expect(sun).not.toBeNull();
    await handleUpdate(gwCallback(`gw:in:${sun.id}`, USER, "Борис", sun.message_id!), testEnv);
    await handleUpdate(gwCallback(`gw:done:${sun.id}`, 222, "Вера", sun.message_id!), testEnv);
    calls = [];

    await tickGroups(DB, tg(), SUN_2045, 15);
    const sends = byMethod("sendMessage").map((c) => String(c.body.text));
    // Окно утра 26.10 к этому моменту ещё не закрыто тиком — закроется тут же,
    // поэтому неделя считает 2 окна (пн-утро, вс-вечер).
    expect(sends.some((t) => t.startsWith("Неделя: 2 окон, 3 участий, 2 человек"))).toBe(true);
    // Один раз.
    await tickGroups(DB, tg(), new Date("2026-11-01T20:00:00Z"), 15);
    const again = byMethod("sendMessage").map((c) => String(c.body.text)).filter((t) => t.startsWith("Неделя"));
    expect(again).toHaveLength(1);
  });

  it("disables the group on 403 and stops posting", async () => {
    await enableGroup();
    failSendCode = 403;
    await tickGroups(DB, tg(), MON_0900, 15);
    const row = await DB.prepare("SELECT enabled FROM group_chats WHERE chat_id = ?")
      .bind(CHAT)
      .first<{ enabled: number }>();
    expect(row!.enabled).toBe(0);
    failSendCode = null;
    calls = [];
    await tickGroups(DB, tg(), MON_0905, 15);
    expect(byMethod("sendMessage")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Контент и утилиты
// ---------------------------------------------------------------------------

describe("group content", () => {
  it("picks 3 distinct items, same within a day, different on the next day", () => {
    const a = pickGroupSet("2026-10-26");
    expect(new Set(a.map((e) => e.id)).size).toBe(3);
    expect(pickGroupSet("2026-10-26")).toEqual(a);
    expect(pickGroupSet("2026-10-27").map((e) => e.id)).not.toEqual(a.map((e) => e.id));
    expect(windowText("morning", "2026-10-26")).toContain(a[0].name);
    expect(windowText("evening", "2026-10-26")).toContain("🌙 Окно 20:00");
    expect(windowText("evening", "2026-10-26")).toContain(a[2].name);
  });

  it("safe set has no risky exercises", () => {
    expect(GROUP_SAFE_SET.length).toBeGreaterThanOrEqual(8);
    const all = GROUP_SAFE_SET.map((e) => `${e.name} ${e.how}`.toLowerCase()).join(" | ");
    for (const bad of ["носк", "на одной ног", "присед", "выпад", "прыж", "наклон вперёд", "складк"]) {
      expect(all).not.toContain(bad);
    }
  });

  it("stripBotSuffix", () => {
    expect(stripBotSuffix("/plate@my_bot")).toBe("/plate");
    expect(stripBotSuffix("/here@my_bot off")).toBe("/here off");
    expect(stripBotSuffix("/do")).toBe("/do");
    expect(stripBotSuffix("привет@бот")).toBe("привет@бот");
  });
});
