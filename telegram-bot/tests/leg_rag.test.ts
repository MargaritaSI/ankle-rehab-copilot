/// <reference types="@cloudflare/vitest-pool-workers" />
import { env, applyD1Migrations } from "cloudflare:test";
import { beforeAll, beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { cosine, searchKb, buildContext, SYSTEM, type KbHit } from "../src/leg_rag";
import { inferScope } from "../src/ingest";
import { legEntry, legPreset, legAskSave, LEG_SITE_URL } from "../src/handlers_leg";
import { CARDS, renderCard, cardsKeyboard, CARD_DISCLAIMER } from "../src/content_cards";
import { TelegramClient, type TgMessage, type TgCallbackQuery } from "../src/telegram";
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
};

beforeAll(async () => {
  await applyD1Migrations(DB, TEST_MIGRATIONS);
});

describe("cosine", () => {
  it("одинаковые векторы → 1", () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it("ортогональные → 0", () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("противоположные → -1", () => {
    expect(cosine([1, 2], [-1, -2])).toBeCloseTo(-1);
  });

  it("нулевой вектор → 0 (без NaN)", () => {
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });

  it("разная длина → считает по короткой", () => {
    expect(cosine([1, 0, 99], [1, 0])).toBeCloseTo(1);
  });
});

describe("searchKb — scope", () => {
  beforeAll(async () => {
    await DB.prepare("DELETE FROM leg_kb").run();
    const ins = (topic: string, vec: number[], scope: string) =>
      DB.prepare(
        "INSERT INTO leg_kb (topic, source_title, source_url, chunk_idx, text, embedding, scope) VALUES (?,?,?,?,?,?,?)",
      )
        .bind(topic, `t-${topic}`, "https://x.test", 0, `text-${topic}`, JSON.stringify(vec), scope)
        .run();
    await ins("gen", [1, 0], "general");
    await ins("pers", [0.9, 0.1], "personal");
  });

  it("по умолчанию personal исключён", async () => {
    const hits = await searchKb(DB, [1, 0], 5);
    expect(hits.map((h) => h.topic)).toEqual(["gen"]);
  });

  it("includePersonal: true возвращает оба", async () => {
    const hits = await searchKb(DB, [1, 0], 5, { includePersonal: true });
    expect(hits.map((h) => h.topic).sort()).toEqual(["gen", "pers"]);
  });

  it("includePersonal: false = как по умолчанию", async () => {
    const hits = await searchKb(DB, [1, 0], 5, { includePersonal: false });
    expect(hits.map((h) => h.topic)).toEqual(["gen"]);
  });
});

describe("миграция scope", () => {
  it("колонка scope по умолчанию 'general'", async () => {
    await DB.prepare(
      "INSERT INTO leg_kb (topic, source_title, source_url, text, embedding) VALUES ('d','d','','d','[]')",
    ).run();
    const r = await DB.prepare("SELECT scope FROM leg_kb WHERE topic='d'").first<{ scope: string }>();
    expect(r?.scope).toBe("general");
  });
});

describe("inferScope", () => {
  const base = { topic: "x", source_title: "t", source_url: "", text: "общий текст" };
  it("обычный чанк — general", () => {
    expect(inferScope(base)).toBe("general");
  });
  it("ocd_talus* и «этого пациента» — personal", () => {
    expect(inferScope({ ...base, topic: "ocd_talus" })).toBe("personal");
    expect(inferScope({ ...base, topic: "ocd_talus_personal" })).toBe("personal");
    expect(inferScope({ ...base, text: "у этого пациента боль" })).toBe("personal");
    expect(inferScope({ ...base, source_title: "Голеностоп: что НЕ делать сейчас" })).toBe("personal");
  });
  it("явный scope важнее эвристики", () => {
    expect(inferScope({ ...base, topic: "ocd_talus", scope: "general" })).toBe("general");
  });
});

describe("SYSTEM prompt — строгая привязка к базе", () => {
  it("не разрешает достраивать и предполагать", () => {
    expect(SYSTEM).not.toContain("достраивай");
    expect(SYSTEM.toLowerCase()).not.toContain("предположение");
  });
  it("требует отвечать только по отрывкам и признавать отсутствие в базе", () => {
    expect(SYSTEM).toContain("ТОЛЬКО по отрывкам");
    expect(SYSTEM).toContain("В базе по ноге про это ничего нет");
    expect(SYSTEM).toContain("без первоисточника");
    expect(SYSTEM).toContain("в исследовании <название источника> пациентам разрешали");
  });
});

describe("buildContext", () => {
  const hit = (over: Partial<KbHit>): KbHit => ({
    id: 1,
    topic: "t",
    source_title: "Title",
    source_url: "",
    text: "body",
    score: 1,
    ...over,
  });

  it("синтетические (пустой url) помечены «без первоисточника»", () => {
    const ctx = buildContext([hit({ source_url: "" })]);
    expect(ctx).toContain("[Отрывок 1 — без первоисточника]");
    expect(ctx).not.toContain("источник: Title");
  });

  it("с url — «источник: <title>»", () => {
    const ctx = buildContext([
      hit({ source_url: "https://x.test", source_title: "Smith 2020" }),
      hit({ id: 2, source_url: "" }),
    ]);
    expect(ctx).toContain("[Отрывок 1 — источник: Smith 2020]");
    expect(ctx).toContain("[Отрывок 2 — без первоисточника]");
  });
});

describe("handlers_leg — только личные чаты", () => {
  let calls: { url: string; body: Record<string, unknown> }[] = [];

  beforeEach(() => {
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        let body: Record<string, unknown> = {};
        if (typeof init?.body === "string") body = JSON.parse(init.body) as Record<string, unknown>;
        calls.push({ url, body });
        if (url.includes("api.telegram.org")) {
          return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
            headers: { "content-type": "application/json" },
          });
        }
        throw new Error(`Unexpected fetch to ${url}`);
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const user = { id: 7, is_bot: false, first_name: "T" };
  const REPLY = "Про ногу отвечаю только в личных сообщениях — напиши мне напрямую.";

  function msg(type: "private" | "supergroup", text: string): TgMessage {
    return { message_id: 1, from: user, chat: { id: -100, type }, date: 0, text };
  }

  it("/leg <вопрос> в супергруппе: отказ, модель не вызывается", async () => {
    const tg = new TelegramClient("test-token");
    await legEntry(testEnv, tg, msg("supergroup", "/leg болит нога"));
    expect(calls.some((c) => c.url.includes("nebius"))).toBe(false);
    expect(calls.every((c) => c.url.includes("api.telegram.org"))).toBe(true);
    const sends = calls.filter((c) => c.url.includes("sendMessage"));
    expect(sends).toHaveLength(1);
    expect(sends[0].body.text).toBe(REPLY);
  });

  it("legq: callback в группе: отказ без вызова модели", async () => {
    const tg = new TelegramClient("test-token");
    const cq: TgCallbackQuery = {
      id: "1",
      from: user,
      data: "legq:0",
      message: msg("supergroup", "x"),
    };
    await legPreset(testEnv, tg, cq);
    expect(calls.some((c) => c.url.includes("nebius"))).toBe(false);
    const sends = calls.filter((c) => c.url.includes("sendMessage"));
    expect(sends).toHaveLength(1);
    expect(sends[0].body.text).toBe(REPLY);
  });

  const noModelCalls = () =>
    calls.every((c) => c.url.includes("api.telegram.org")) &&
    !calls.some((c) => /api\.tokenfactory|api\.studio\.nebius|nebius/.test(c.url));

  it("в личном чате без вопроса: ссылка на сайт + клавиатура карточек, без FSM", async () => {
    const tg = new TelegramClient("test-token");
    await legEntry(testEnv, tg, msg("private", "/leg"));
    const sends = calls.filter((c) => c.url.includes("sendMessage"));
    expect(sends).toHaveLength(1);
    const text = String(sends[0].body.text);
    expect(text).toContain(LEG_SITE_URL);
    expect(text).toContain("https://ankle-rehab-copilot.streamlit.app");
    const kb = (sends[0].body.reply_markup as { inline_keyboard: { callback_data: string }[][] })
      .inline_keyboard;
    expect(kb[0][0].callback_data).toBe("legq:0");
    expect(kb.length).toBe(CARDS.length);
    expect(noModelCalls()).toBe(true);
  });

  it("/leg <вопрос>: ссылка с ?q=, модель не вызывается", async () => {
    const tg = new TelegramClient("test-token");
    await legEntry(testEnv, tg, msg("private", "/leg как бегать"));
    const sends = calls.filter((c) => c.url.includes("sendMessage"));
    expect(sends).toHaveLength(1);
    const text = String(sends[0].body.text);
    expect(text).toContain(`?q=${encodeURIComponent("как бегать")}`);
    expect(text).toContain("<a href=");
    expect(noModelCalls()).toBe(true);
  });

  it("/leg <длинный вопрос>: вопрос обрезается до 300 символов", async () => {
    const tg = new TelegramClient("test-token");
    await legEntry(testEnv, tg, msg("private", "/leg " + "а".repeat(500)));
    const text = String(calls.filter((c) => c.url.includes("sendMessage"))[0].body.text);
    expect(text).toContain(encodeURIComponent("а".repeat(300)));
    expect(text).not.toContain(encodeURIComponent("а".repeat(301)));
  });

  it("legq:0 в личном чате: карточка с заголовком первой карточки", async () => {
    const tg = new TelegramClient("test-token");
    const cq: TgCallbackQuery = {
      id: "1",
      from: user,
      data: "legq:0",
      message: msg("private", "x"),
    };
    await legPreset(testEnv, tg, cq);
    const sends = calls.filter((c) => c.url.includes("sendMessage"));
    expect(sends).toHaveLength(1);
    expect(String(sends[0].body.text)).toContain(CARDS[0].title);
    expect(noModelCalls()).toBe(true);
  });

  it("legq: неизвестный индекс — только answerCallbackQuery", async () => {
    const tg = new TelegramClient("test-token");
    const cq: TgCallbackQuery = {
      id: "1",
      from: user,
      data: "legq:99",
      message: msg("private", "x"),
    };
    await legPreset(testEnv, tg, cq);
    expect(calls.filter((c) => c.url.includes("sendMessage"))).toHaveLength(0);
  });

  it("legAskSave (устаревшее состояние): ссылка на сайт", async () => {
    const tg = new TelegramClient("test-token");
    await legAskSave(testEnv, tg, msg("private", "вопрос"));
    const sends = calls.filter((c) => c.url.includes("sendMessage"));
    expect(sends).toHaveLength(1);
    expect(String(sends[0].body.text)).toContain(LEG_SITE_URL);
  });
});

describe("content_cards", () => {
  const BANNED =
    /через \d+ (мес|нед)|\d+ ?(мг|ме|iu)|этого пациента|часов ходьбы|можно бегать|прыгать можно/i;

  it("8–10 карточек, уникальные id и названия", () => {
    expect(CARDS.length).toBeGreaterThanOrEqual(8);
    expect(CARDS.length).toBeLessThanOrEqual(10);
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
    expect(new Set(CARDS.map((c) => c.title)).size).toBe(CARDS.length);
  });

  it("тело ≤ 700 символов", () => {
    for (const c of CARDS) expect(c.body.length).toBeLessThanOrEqual(700);
  });

  it("нет личных порогов, сроков, дозировок и разрешений на нагрузку", () => {
    for (const c of CARDS) {
      expect(`${c.title}\n${c.body}`).not.toMatch(BANNED);
    }
  });

  it("каждый рендер заканчивается дисклеймером", () => {
    for (const c of CARDS) {
      const html = renderCard(c);
      expect(html).toContain(CARD_DISCLAIMER);
      expect(html.trimEnd().split("\n").pop()).toContain(CARD_DISCLAIMER);
      expect(html).toContain(`<b>${c.title}</b>`);
    }
  });

  it("renderCard экранирует <>&", () => {
    const html = renderCard({ id: "x", title: "A & B", body: "• 1 < 2 > 0" });
    expect(html).toContain("A &amp; B");
    expect(html).toContain("1 &lt; 2 &gt; 0");
  });

  it("клавиатура: кнопка на карточку, legq:<i>, ≤ 10 строк", () => {
    const kb = cardsKeyboard().inline_keyboard;
    expect(kb.length).toBe(CARDS.length);
    expect(kb.length).toBeLessThanOrEqual(10);
    kb.forEach((row, i) => {
      expect(row).toHaveLength(1);
      expect(row[0].callback_data).toBe(`legq:${i}`);
      expect(row[0].text).toBe(CARDS[i].title);
    });
  });
});
