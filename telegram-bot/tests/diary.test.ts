/// <reference types="@cloudflare/vitest-pool-workers" />
/**
 * Дневник ноги (diary:score / diary:swell, /diary, воскресная «Неделя»,
 * утренняя строка «шаг назад») и таймер /walk (предупреждение ~90 мин,
 * автостоп 240). Telegram замокан глобальным fetch; время — явные Date.
 */

import { env, applyD1Migrations } from "cloudflare:test";
import { beforeAll, beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { handleUpdate } from "../src/router";
import { tickMinute } from "../src/scheduler";
import {
  diaryCallback,
  diaryEntry,
  walkEntry,
  tickWalks,
  weeklyDiaryBlock,
} from "../src/handlers_diary";
import { MORNING_PROMPT } from "../src/content";
import { ensureUser } from "../src/db";
import { TelegramClient, type TgCallbackQuery, type TgMessage, type TgUpdate } from "../src/telegram";
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

const USER = 777;
const TZ = "Europe/Amsterdam";

// 2026-10-26 — понедельник; Амстердам = UTC+1 (CET, переход на зиму был 25.10).
const MON_NOON = new Date("2026-10-26T11:00:00Z"); // 12:00 local
// 23:30Z понедельника = 00:30 вторника 27.10 local — проверяем именно локальную дату.
const MON_LATE_UTC = new Date("2026-10-26T23:30:00Z");
const TUE_0800 = new Date("2026-10-27T07:00:00Z"); // 08:00 local = начало окна
const WED_NOON = new Date("2026-10-28T11:00:00Z");
// 2026-11-01 — воскресенье; 23:30 local (конец окна) = 22:30Z.
const SUN_2330 = new Date("2026-11-01T22:30:00Z");
const MON_2330 = new Date("2026-10-26T22:30:00Z");
const WALK_START = new Date("2026-10-26T10:00:00Z");
const plus = (d: Date, min: number) => new Date(d.getTime() + min * 60_000);

// ---------------------------------------------------------------------------
// Мок Telegram
// ---------------------------------------------------------------------------
interface Call {
  method: string;
  body: Record<string, unknown>;
}
let calls: Call[] = [];
let nextMessageId = 100;

function installFetchMock(): void {
  calls = [];
  nextMessageId = 100;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.includes("api.telegram.org")) throw new Error(`Unexpected fetch to ${url}`);
      const method = url.split("/").pop() ?? "";
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      calls.push({ method, body });
      const result = method === "sendMessage" ? { message_id: nextMessageId++ } : true;
      return new Response(JSON.stringify({ ok: true, result }), {
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

const byMethod = (m: string) => calls.filter((c) => c.method === m);
const sent = () => byMethod("sendMessage").map((c) => String(c.body.text));
const tg = () => new TelegramClient("test-token");
const ctx = () => ({ db: DB, tg: tg() });

// ---------------------------------------------------------------------------
// Хелперы
// ---------------------------------------------------------------------------
let uid = 1;
function privMsg(text: string): TgMessage {
  return {
    message_id: uid++,
    from: { id: USER, is_bot: false, first_name: "Маша" },
    chat: { id: USER, type: "private" },
    date: 0,
    text,
  };
}
function privUpdate(text: string): TgUpdate {
  return { update_id: uid++, message: privMsg(text) };
}
function cbq(data: string, text = "🌙 Как нога сегодня?\n1 — совсем плохо · 5 — отлично"): TgCallbackQuery {
  return {
    id: `cq${uid++}`,
    from: { id: USER, is_bot: false, first_name: "Маша" },
    message: { message_id: 55, chat: { id: USER, type: "private" }, date: 0, text },
    data,
  };
}

async function seedUser(opts: { reminders?: number } = {}): Promise<void> {
  await ensureUser(DB, USER);
  await DB.prepare("UPDATE users SET timezone = ?, reminders_on = ? WHERE tg_id = ?")
    .bind(TZ, opts.reminders ?? 1, USER)
    .run();
}

async function seedDiary(day: string, score: number | null, swelling = 0, walk = 0): Promise<void> {
  await DB.prepare(
    "INSERT INTO leg_diary (tg_id, day, score, swelling, walk_min) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(USER, day, score, swelling, walk)
    .run();
}

const diaryRow = (day: string) =>
  DB.prepare("SELECT * FROM leg_diary WHERE tg_id = ? AND day = ?")
    .bind(USER, day)
    .first<{ score: number | null; swelling: number; walk_min: number }>();
const userRow = () =>
  DB.prepare("SELECT walk_started_at, walk_warned FROM users WHERE tg_id = ?")
    .bind(USER)
    .first<{ walk_started_at: string | null; walk_warned: number }>();
const walkSessions = () =>
  DB.prepare("SELECT minutes, situation, exercise_ids FROM sessions WHERE tg_id = ? AND situation = 'walk'")
    .bind(USER)
    .all<{ minutes: number; situation: string; exercise_ids: string }>();

beforeAll(async () => {
  await applyD1Migrations(DB, TEST_MIGRATIONS);
});

beforeEach(async () => {
  installFetchMock();
  await DB.exec("DELETE FROM leg_diary");
  await DB.exec("DELETE FROM sessions");
  await DB.exec("DELETE FROM users");
  await seedUser();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
describe("diary:score / diary:swell", () => {
  it("diary:score:4 создаёт строку на ЛОКАЛЬНУЮ дату и правит сообщение", async () => {
    await diaryCallback(ctx(), cbq("diary:score:4"), MON_LATE_UTC);

    // 23:30Z пн = 00:30 вт по Амстердаму.
    expect((await diaryRow("2026-10-27"))?.score).toBe(4);
    expect(await diaryRow("2026-10-26")).toBeNull();

    expect(byMethod("answerCallbackQuery")[0].body.text).toBe("Записала ✓");
    const edit = byMethod("editMessageText")[0];
    expect(edit.body.text).toBe("🌙 Нога сегодня: 4/5");
    expect(edit.body.message_id).toBe(55);
    // кнопки остаются: можно перетапнуть оценку и отметить отёк
    const kb = JSON.stringify(edit.body.reply_markup);
    expect(kb).toContain("diary:score:1");
    expect(kb).toContain("diary:swell");
  });

  it("повторный тап перезаписывает оценку", async () => {
    await diaryCallback(ctx(), cbq("diary:score:4"), MON_NOON);
    await diaryCallback(ctx(), cbq("diary:score:2"), MON_NOON);
    expect((await diaryRow("2026-10-26"))?.score).toBe(2);
    const n = await DB.prepare("SELECT COUNT(*) AS n FROM leg_diary WHERE tg_id = ?")
      .bind(USER)
      .first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it("невалидная оценка игнорируется", async () => {
    await diaryCallback(ctx(), cbq("diary:score:9"), MON_NOON);
    await diaryCallback(ctx(), cbq("diary:score:abc"), MON_NOON);
    expect(await diaryRow("2026-10-26")).toBeNull();
    expect(byMethod("editMessageText")).toHaveLength(0);
  });

  it("diary:swell ставит отёк (и снимает повторным тапом), оценку не трогает", async () => {
    await diaryCallback(ctx(), cbq("diary:score:3"), MON_NOON);
    await diaryCallback(ctx(), cbq("diary:swell"), MON_NOON);
    let row = await diaryRow("2026-10-26");
    expect(row?.swelling).toBe(1);
    expect(row?.score).toBe(3);
    expect(byMethod("answerCallbackQuery").at(-1)?.body.text).toBe("Отметила отёк");

    await diaryCallback(ctx(), cbq("diary:swell"), MON_NOON);
    row = await diaryRow("2026-10-26");
    expect(row?.swelling).toBe(0);
  });

  it("отёк до оценки создаёт строку без оценки; оценка потом дописывается", async () => {
    await diaryCallback(ctx(), cbq("diary:swell"), MON_NOON);
    expect((await diaryRow("2026-10-26"))?.score).toBeNull();
    await diaryCallback(ctx(), cbq("diary:score:5"), MON_NOON);
    const row = await diaryRow("2026-10-26");
    expect(row?.score).toBe(5);
    expect(row?.swelling).toBe(1);
  });

  it("через роутер: callback diary:* больше не мёртвая кнопка", async () => {
    await handleUpdate(
      { update_id: uid++, callback_query: cbq("diary:score:5") },
      testEnv,
    );
    expect(byMethod("answerCallbackQuery")[0].body.text).toBe("Записала ✓");
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    expect((await diaryRow(today))?.score).toBe(5);
  });
});

// ---------------------------------------------------------------------------
describe("/diary", () => {
  it("печатает последние 7 дней: оценка, отёк, прогулка, итоги", async () => {
    await seedDiary("2026-10-20", 5); // старше 7 дней от 28.10 → не попадает
    await seedDiary("2026-10-26", 3, 1, 85);
    await seedDiary("2026-10-27", null, 0, 30);
    await seedDiary("2026-10-28", 4);
    await diaryEntry(ctx(), privMsg("/diary"), WED_NOON);

    const text = sent()[0];
    expect(text).toContain("пн 26.10 · 3/5 · отёк · прогулка 85 мин");
    expect(text).toContain("вт 27.10 · прогулка 30 мин");
    expect(text).toContain("ср 28.10 · 4/5");
    expect(text).not.toContain("20.10");
    expect(text).toContain("средняя 3,5");
    expect(text).toContain("отёк 1 день");
    expect(text).toContain("прогулки 115 мин");
  });

  it("пустой дневник — мягкая подсказка", async () => {
    await diaryEntry(ctx(), privMsg("/diary"), WED_NOON);
    expect(sent()[0]).toContain("пока пуст");
  });

  it("через роутер: /diary и /walk распознаются", async () => {
    await handleUpdate(privUpdate("/diary"), testEnv);
    expect(sent()[0]).toContain("Дневник ноги");
    await handleUpdate(privUpdate("/walk"), testEnv);
    expect(sent()[1]).toContain("Прогулка пошла");
    expect((await userRow())?.walk_started_at).not.toBeNull();
    await handleUpdate(privUpdate("/help"), testEnv);
    expect(sent()[2]).toContain("/walk");
    expect(sent()[2]).toContain("/diary");
  });
});

// ---------------------------------------------------------------------------
describe("/walk", () => {
  it("старт: метки в users, ответ с подсказкой; повторный /walk показывает минуты", async () => {
    await walkEntry(ctx(), privMsg("/walk"), WALK_START);
    expect(sent()[0]).toBe("Прогулка пошла. Напомню закругляться через ~90 минут. Стоп: /walk стоп");
    const u = await userRow();
    expect(u?.walk_started_at).toBe(WALK_START.toISOString());
    expect(u?.walk_warned).toBe(0);

    await walkEntry(ctx(), privMsg("/walk старт"), plus(WALK_START, 12));
    expect(sent()[1]).toContain("12 мин");
    expect(sent()[1]).toContain("/walk стоп");
    expect((await userRow())?.walk_started_at).toBe(WALK_START.toISOString());
  });

  it("предупреждение на ~90 мин приходит ровно один раз (и при reminders_on=0)", async () => {
    await seedUser({ reminders: 0 });
    await walkEntry(ctx(), privMsg("/walk"), WALK_START);
    const before = sent().length;

    await tickMinute(DB, tg(), TZ, plus(WALK_START, 80)); // рано
    expect(sent()).toHaveLength(before);

    await tickMinute(DB, tg(), TZ, plus(WALK_START, 95));
    const warns = () => sent().filter((t) => t.includes("Уже 1:30 на ногах"));
    expect(warns()).toHaveLength(1);
    expect((await userRow())?.walk_warned).toBe(1);

    await tickMinute(DB, tg(), TZ, plus(WALK_START, 110));
    expect(warns()).toHaveLength(1);
  });

  it("/walk стоп пишет walk_min в дневник (суммируя) и сессию WALK", async () => {
    await walkEntry(ctx(), privMsg("/walk"), WALK_START);
    await walkEntry(ctx(), privMsg("/walk стоп"), plus(WALK_START, 47));

    expect(sent().at(-1)).toBe(
      "Прогулка 47 мин записана. После нагрузки: нога выше сердца, холод 15 минут.",
    );
    expect((await diaryRow("2026-10-26"))?.walk_min).toBe(47);
    const s = await walkSessions();
    expect(s.results).toHaveLength(1);
    expect(s.results[0].minutes).toBe(47);
    expect(JSON.parse(s.results[0].exercise_ids)).toEqual(["WALK"]);
    const u = await userRow();
    expect(u?.walk_started_at).toBeNull();
    expect(u?.walk_warned).toBe(0);

    // вторая прогулка в тот же день прибавляется
    await walkEntry(ctx(), privMsg("/walk"), plus(WALK_START, 300));
    await walkEntry(ctx(), privMsg("/walk stop"), plus(WALK_START, 330));
    expect((await diaryRow("2026-10-26"))?.walk_min).toBe(77);
  });

  it("/walk стоп без запущенной прогулки", async () => {
    await walkEntry(ctx(), privMsg("/walk стоп"), WALK_START);
    expect(sent()[0]).toBe("Прогулка не запущена: /walk");
    expect((await walkSessions()).results).toHaveLength(0);
  });

  it("автостоп на 240 минутах: 240 мин в дневник и сессию, поля очищены", async () => {
    await seedUser({ reminders: 0 });
    await walkEntry(ctx(), privMsg("/walk"), WALK_START);
    await tickWalks(DB, tg(), plus(WALK_START, 95)); // предупреждение
    await tickWalks(DB, tg(), plus(WALK_START, 245));

    expect(sent().at(-1)).toContain("закрыла автоматически на 4 часах");
    expect((await diaryRow("2026-10-26"))?.walk_min).toBe(240);
    const s = await walkSessions();
    expect(s.results).toHaveLength(1);
    expect(s.results[0].minutes).toBe(240);
    expect((await userRow())?.walk_started_at).toBeNull();

    // больше ничего не шлётся
    const n = sent().length;
    await tickWalks(DB, tg(), plus(WALK_START, 260));
    expect(sent()).toHaveLength(n);
  });

  it("если первый тик сразу после 240 мин — только автостоп, без предупреждения", async () => {
    await seedUser({ reminders: 0 });
    await walkEntry(ctx(), privMsg("/walk"), WALK_START);
    await tickWalks(DB, tg(), plus(WALK_START, 250));
    expect(sent().filter((t) => t.includes("Уже 1:30"))).toHaveLength(0);
    expect(sent().at(-1)).toContain("автоматически");
  });
});

// ---------------------------------------------------------------------------
describe("планировщик: вечер, неделя, утро", () => {
  it("вечерний пуш — кнопки 1–5 и отёк, без refl:", async () => {
    await tickMinute(DB, tg(), TZ, MON_2330);
    const evening = byMethod("sendMessage").find((c) => String(c.body.text).startsWith("🌙 Как нога"));
    expect(evening).toBeDefined();
    const kb = evening!.body.reply_markup as { inline_keyboard: Array<Array<{ callback_data: string }>> };
    expect(kb.inline_keyboard[0].map((b) => b.callback_data)).toEqual([
      "diary:score:1",
      "diary:score:2",
      "diary:score:3",
      "diary:score:4",
      "diary:score:5",
    ]);
    expect(kb.inline_keyboard[1][0].callback_data).toBe("diary:swell");
    expect(String(evening!.body.text)).toContain("1 — совсем плохо · 5 — отлично");
    expect(JSON.stringify(calls)).not.toContain("refl:");
  });

  it("утренний пуш без кнопки «Ответить» (refl:)", async () => {
    await tickMinute(DB, tg(), TZ, TUE_0800);
    const morning = byMethod("sendMessage").find((c) => String(c.body.text).startsWith(MORNING_PROMPT));
    expect(morning).toBeDefined();
    expect(JSON.stringify(morning!.body)).not.toContain("refl:");
    expect(morning!.body.reply_markup).toBeUndefined();
  });

  it("воскресный вечер: «Неделя:» при ≥ 3 оценок — одним сообщением", async () => {
    await seedDiary("2026-10-27", 3, 1, 40);
    await seedDiary("2026-10-29", 4, 0, 60);
    await seedDiary("2026-10-31", 5, 1, 90);
    await tickMinute(DB, tg(), TZ, SUN_2330);

    const msgs = byMethod("sendMessage").filter((c) => String(c.body.text).startsWith("🌙 Как нога"));
    expect(msgs).toHaveLength(1);
    const text = String(msgs[0].body.text);
    expect(text).toContain("Неделя: средняя оценка 4,0, отёк 2 дня, прогулки 190 мин");
    expect(JSON.stringify(msgs[0].body.reply_markup)).toContain("diary:score:3");
  });

  it("воскресенье с < 3 оценок — без «Неделя:»", async () => {
    await seedDiary("2026-10-29", 4);
    await seedDiary("2026-10-31", 5);
    await seedDiary("2026-10-30", null, 1, 20); // без оценки — не считается
    await tickMinute(DB, tg(), TZ, SUN_2330);
    const text = sent().find((t) => t.startsWith("🌙 Как нога"));
    expect(text).toBeDefined();
    expect(text).not.toContain("Неделя:");
  });

  it("не в воскресенье «Неделя:» не добавляется", async () => {
    await seedDiary("2026-10-22", 3);
    await seedDiary("2026-10-23", 3);
    await seedDiary("2026-10-24", 3);
    await tickMinute(DB, tg(), TZ, MON_2330);
    expect(sent().find((t) => t.startsWith("🌙 Как нога"))).not.toContain("Неделя:");
  });

  it("weeklyDiaryBlock: окно — последние 7 дней включая сегодня", async () => {
    await seedDiary("2026-10-25", 1); // 7 дней назад от 01.11 — вне окна (окно с 26.10)
    await seedDiary("2026-10-26", 4);
    await seedDiary("2026-10-27", 4);
    await seedDiary("2026-11-01", 4);
    expect(await weeklyDiaryBlock(DB, USER, "2026-11-01")).toBe(
      "Неделя: средняя оценка 4,0, отёк 0 дней, прогулки 0 мин",
    );
  });

  it("утро после отёка: добавляется одна строка «шаг назад»", async () => {
    await seedDiary("2026-10-26", 4, 1);
    await tickMinute(DB, tg(), TZ, TUE_0800);
    const text = sent().find((t) => t.startsWith(MORNING_PROMPT));
    expect(text).toBe(
      `${MORNING_PROMPT}\n\nВчера нога была так себе — сегодня нагрузку на шаг назад, не ноль.`,
    );
  });

  it("утро после оценки ≤ 2: строка есть; после 3 и без записи — нет", async () => {
    await seedDiary("2026-10-26", 2);
    await tickMinute(DB, tg(), TZ, TUE_0800);
    expect(sent().find((t) => t.startsWith(MORNING_PROMPT))).toContain("шаг назад");

    // оценка 3 без отёка
    await DB.exec("DELETE FROM leg_diary");
    await DB.exec("UPDATE users SET last_morning_at = NULL");
    calls = [];
    await seedDiary("2026-10-26", 3);
    await tickMinute(DB, tg(), TZ, TUE_0800);
    expect(sent().find((t) => t.startsWith(MORNING_PROMPT))).toBe(MORNING_PROMPT);

    // нет записи вовсе (в т.ч. строка с NULL-оценкой и без отёка)
    await DB.exec("DELETE FROM leg_diary");
    await DB.exec("UPDATE users SET last_morning_at = NULL");
    calls = [];
    await seedDiary("2026-10-26", null, 0, 30);
    await tickMinute(DB, tg(), TZ, TUE_0800);
    expect(sent().find((t) => t.startsWith(MORNING_PROMPT))).toBe(MORNING_PROMPT);
  });
});
