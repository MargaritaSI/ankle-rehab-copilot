/// <reference types="@cloudflare/vitest-pool-workers" />
/**
 * Бюджет subrequest'ов одного cron-тика (free-план: ≤ 50 на вызов; D1-запрос,
 * db.batch и каждый fetch в Telegram — по одному). Telegram замокан глобальным
 * fetch, D1 обёрнут счётчиком исполнений.
 */

import { env, applyD1Migrations } from "cloudflare:test";
import { beforeAll, beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { tickMinute, MAX_SENDS_PER_TICK } from "../src/scheduler";
import { Budget } from "../src/db";
import { TelegramClient } from "../src/telegram";

const TEST_MIGRATIONS = (
  env as unknown as { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] }
).TEST_MIGRATIONS;
const DB = (env as unknown as { DB: D1Database }).DB;

const TZ = "Europe/Amsterdam";
const GROUP = -1001234567890;
const BASE_ID = 5000;
// 2026-10-27 — вторник; Амстердам = UTC+1 → 08:00 local = 07:00Z.
const TUE_0800 = new Date("2026-10-27T07:00:00Z");
const plus = (d: Date, min: number) => new Date(d.getTime() + min * 60_000);
// 17:00 local = 16:00Z.
const TUE_1700 = new Date("2026-10-27T16:00:00Z");

// ---------------------------------------------------------------------------
// Мок Telegram + счётчик D1
// ---------------------------------------------------------------------------
interface Call {
  method: string;
  chat: number;
  body: Record<string, unknown>;
}
let calls: Call[] = [];
let failCodes = new Map<number, number>(); // chat_id → error_code для sendMessage
let nextMessageId = 100;

function installFetchMock(): void {
  calls = [];
  failCodes = new Map();
  nextMessageId = 100;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.includes("api.telegram.org")) throw new Error(`Unexpected fetch to ${url}`);
      const method = url.split("/").pop() ?? "";
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      calls.push({ method, chat: Number(body.chat_id), body });
      const json = (o: unknown) =>
        new Response(JSON.stringify(o), { headers: { "content-type": "application/json" } });
      const code = failCodes.get(Number(body.chat_id));
      if (method === "sendMessage" && code) {
        return json({ ok: false, error_code: code, description: "Forbidden: bot was blocked by the user" });
      }
      return json({ ok: true, result: method === "sendMessage" ? { message_id: nextMessageId++ } : true });
    }),
  );
}

/** Считает ИСПОЛНЕНИЯ запросов (run/all/first/raw) и db.batch — как Cloudflare. */
function countingDb(db: D1Database): { db: D1Database; count: () => number } {
  let n = 0;
  class Stmt {
    constructor(readonly inner: D1PreparedStatement) {}
    bind(...a: unknown[]) {
      return new Stmt(this.inner.bind(...a));
    }
    run() {
      n++;
      return this.inner.run();
    }
    all() {
      n++;
      return this.inner.all();
    }
    first(col?: string) {
      n++;
      return this.inner.first(col as never);
    }
    raw() {
      n++;
      return this.inner.raw();
    }
  }
  const wrapped = {
    prepare: (q: string) => new Stmt(db.prepare(q)),
    batch: (stmts: Stmt[]) => {
      n++;
      return db.batch(stmts.map((s) => s.inner));
    },
  } as unknown as D1Database;
  return { db: wrapped, count: () => n };
}

const tg = () => new TelegramClient("test-token");
const tgCalls = () => calls.length;
const sends = () => calls.filter((c) => c.method === "sendMessage");

// ---------------------------------------------------------------------------
// Хелперы
// ---------------------------------------------------------------------------
async function seedUsers(n: number, extra = ""): Promise<number[]> {
  const ids: number[] = [];
  const stmts: D1PreparedStatement[] = [];
  for (let i = 0; i < n; i++) {
    const id = BASE_ID + i;
    ids.push(id);
    stmts.push(
      DB.prepare(
        `INSERT INTO users (tg_id, reminders_on, timezone, reminder_start_min) VALUES (?, 1, ?, 480)`,
      ).bind(id, TZ),
    );
  }
  await DB.batch(stmts);
  if (extra) await DB.exec(extra);
  return ids;
}

async function seedGroup(morningMin: number): Promise<void> {
  await DB.prepare(
    "INSERT INTO group_chats (chat_id, title, timezone, morning_min, enabled) VALUES (?, 'g', ?, ?, 1)",
  )
    .bind(GROUP, TZ, morningMin)
    .run();
}

const userCol = (id: number, col: string) =>
  DB.prepare(`SELECT ${col} AS v FROM users WHERE tg_id = ?`).bind(id).first<{ v: unknown }>().then((r) => r!.v);

beforeAll(async () => {
  await applyD1Migrations(DB, TEST_MIGRATIONS);
});

beforeEach(async () => {
  installFetchMock();
  for (const t of ["group_checkins", "group_windows", "group_chats", "food_entries", "leg_diary", "users"]) {
    await DB.exec(`DELETE FROM ${t}`);
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
describe("Budget", () => {
  it("take() / spend() / sends cap", () => {
    const b = new Budget(5, 2);
    expect(b.take(2, true)).toBe(true);
    expect(b.take(1, true)).toBe(true);
    expect(b.take(1, true)).toBe(false); // лимит сообщений, хотя subrequest'ы ещё есть
    expect(b.take(1)).toBe(true);
    expect(b.take(2)).toBe(false); // 4 + 2 > 5
    b.spend(1);
    expect(b.take(1)).toBe(false);
    expect(b.used).toBe(5);
    expect(b.sends).toBe(2);
  });
});

describe("tickMinute: 60 юзеров утром + группа", () => {
  it("группа идёт первой, ≤ 35 сообщений и ≤ 45+слак subrequest'ов за тик, за 4 тика все 60 получили утро", async () => {
    const ids = await seedUsers(60);
    await seedGroup(480); // окно группы тоже в 08:00
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const ticks = [0, 15, 30, 45].map((m) => plus(TUE_0800, m));
    for (let i = 0; i < ticks.length; i++) {
      calls = [];
      const c = countingDb(DB);
      await tickMinute(c.db, tg(), TZ, ticks[i]);

      // Каждый тик укладывается в лимит: D1 + Telegram ≤ 50 (бюджет 45 + запас).
      expect(c.count() + tgCalls()).toBeLessThanOrEqual(50);
      expect(sends().length).toBeLessThanOrEqual(MAX_SENDS_PER_TICK);

      if (i === 0) {
        // Группа — первая отправка тика, до любого личного пуша.
        expect(sends()[0].chat).toBe(GROUP);
        const w = await DB.prepare("SELECT * FROM group_windows WHERE chat_id = ? AND kind = 'morning'")
          .bind(GROUP)
          .first<{ message_id: number | null }>();
        expect(w?.message_id).not.toBeNull();
        // Лимит реально ограничил: за первый тик обслужены не все 60.
        const done = (await DB.prepare("SELECT COUNT(*) AS n FROM users WHERE last_morning_at IS NOT NULL").first<{ n: number }>())!.n;
        expect(done).toBeGreaterThan(20);
        expect(done).toBeLessThan(60);
        expect(warn.mock.calls.flat().join(" ")).toMatch(/deferred|budget exhausted/);
      }
    }

    for (const id of ids) {
      expect(await userCol(id, "last_morning_at"), `user ${id}`).toBe("2026-10-27");
    }
    warn.mockRestore();
  });

  it("нет дублей: суммарно 60 личных сообщений + 1 групповой пост за 4 тика", async () => {
    await seedUsers(60);
    await seedGroup(480);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let all: Call[] = [];
    for (const m of [0, 15, 30, 45]) {
      calls = [];
      await tickMinute(DB, tg(), TZ, plus(TUE_0800, m));
      all = all.concat(sends());
    }
    expect(all.filter((c) => c.chat === GROUP)).toHaveLength(1);
    expect(all.filter((c) => c.chat !== GROUP)).toHaveLength(60);
    vi.restoreAllMocks();
  });

  it("тик без сообщений почти ничего не стоит (юзеры вне окна)", async () => {
    await seedUsers(60);
    const c = countingDb(DB);
    // 03:00 local — все вне окна.
    await tickMinute(c.db, tg(), TZ, new Date("2026-10-27T02:00:00Z"));
    expect(tgCalls()).toBe(0);
    expect(c.count()).toBeLessThanOrEqual(3); // группы + прогулки + юзеры
  });
});

describe("tickMinute: ошибки отправки", () => {
  it("403: маркер утра не ставится, reminders_on = 0; прочие юзеры не страдают", async () => {
    const ids = await seedUsers(3);
    failCodes.set(ids[1], 403);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await tickMinute(DB, tg(), TZ, TUE_0800);

    expect(await userCol(ids[1], "last_morning_at")).toBeNull();
    expect(await userCol(ids[1], "reminders_on")).toBe(0);
    expect(await userCol(ids[0], "last_morning_at")).toBe("2026-10-27");
    expect(await userCol(ids[2], "last_morning_at")).toBe("2026-10-27");
    expect(await userCol(ids[0], "reminders_on")).toBe(1);

    // Мёртвый юзер больше не стоит квоты.
    calls = [];
    await tickMinute(DB, tg(), TZ, plus(TUE_0800, 15));
    expect(calls.filter((c) => c.chat === ids[1])).toHaveLength(0);
    vi.restoreAllMocks();
  });

  it("не-403 сбой (500): маркер не ставится, юзер остаётся включённым и получит пуш на след. тике", async () => {
    const ids = await seedUsers(2);
    failCodes.set(ids[0], 500);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await tickMinute(DB, tg(), TZ, TUE_0800);
    expect(await userCol(ids[0], "last_morning_at")).toBeNull();
    expect(await userCol(ids[0], "reminders_on")).toBe(1);
    expect(await userCol(ids[0], "last_reminder_at")).toBeNull();

    failCodes.clear();
    await tickMinute(DB, tg(), TZ, plus(TUE_0800, 15));
    expect(await userCol(ids[0], "last_morning_at")).toBe("2026-10-27");
    vi.restoreAllMocks();
  });
});

describe("tickMinute: food-стадия", () => {
  it("20 кандидатов: ≤ 3 D1-запросов на всё (users + агрегат + batch), все получают пуш", async () => {
    // Окно 17–19, интервал 1000 мин → микро-пушей нет, только food.
    const ids = await seedUsers(20, "UPDATE users SET reminder_interval_min = 1000");
    // Утро давно было, вечер ещё не наступил: personal-стадия молчит.
    await DB.exec("UPDATE users SET last_morning_at = '2026-10-27', last_reminder_at = datetime('now')");
    const c = countingDb(DB);
    await tickMinute(c.db, tg(), TZ, TUE_1700);

    expect(sends()).toHaveLength(20);
    expect(sends()[0].body.text).toContain("Предохранитель вечернего срыва");
    // groups(1) + walks(1) + usersForTick(1) + агрегат на таймзону(1) + batch маркеров(1) = 5;
    // сама food-стадия = 2 запроса, без ensureUser/foodToday/lastFoodEntryAt на юзера.
    expect(c.count()).toBe(5);
    for (const id of ids) expect(await userCol(id, "last_food_push_at")).toBe("2026-10-27");

    // Повторный тик: пре-фильтр по last_food_push_at — ни запросов food, ни сообщений.
    calls = [];
    const c2 = countingDb(DB);
    await tickMinute(c2.db, tg(), TZ, plus(TUE_1700, 15));
    expect(sends()).toHaveLength(0);
    expect(c2.count()).toBeLessThanOrEqual(3); // groups + walks + users
  });

  it("юзер с достаточным белком и недавней едой пуша не получает", async () => {
    const ids = await seedUsers(2, "UPDATE users SET reminder_interval_min = 1000");
    await DB.exec("UPDATE users SET last_morning_at = '2026-10-27', last_reminder_at = datetime('now')");
    // Ест хорошо: 200 г белка за сегодня, последняя запись 16:30 local (15:30Z).
    await DB.prepare(
      "INSERT INTO food_entries (tg_id, category, name, protein_g, ts) VALUES (?, 'protein', 'x', 200, '2026-10-27 15:30:00')",
    )
      .bind(ids[0])
      .run();
    // Вчерашняя запись не считается белком «сегодня» (до локальной полуночи 2026-10-26 23:00Z).
    await DB.prepare(
      "INSERT INTO food_entries (tg_id, category, name, protein_g, ts) VALUES (?, 'protein', 'y', 200, '2026-10-26 12:00:00')",
    )
      .bind(ids[1])
      .run();
    await tickMinute(DB, tg(), TZ, TUE_1700);
    const chats = sends().map((c) => c.chat);
    expect(chats).not.toContain(ids[0]);
    expect(chats).toContain(ids[1]);
    expect(await userCol(ids[0], "last_food_push_at")).toBeNull();
  });
});
