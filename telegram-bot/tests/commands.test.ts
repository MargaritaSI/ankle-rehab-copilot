/// <reference types="@cloudflare/vitest-pool-workers" />
/**
 * Рантайм-интеграционный тест роутера addsport.
 *
 * Вызывает handleUpdate(update, env) напрямую (как делает index.ts) и проверяет,
 * что КАЖДАЯ текстовая команда / reply-кнопка / ключевые callbacks доходят до
 * обработчиков, ничего не бросают и отвечают в Telegram.
 *
 * У addsport НЕТ AI-фич — Nebius не мокается. Глобальный fetch замокан так, что
 * api.telegram.org → {ok:true}; любой другой fetch — это ошибка теста.
 */

import { env, applyD1Migrations } from "cloudflare:test";
import { beforeAll, beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { handleUpdate } from "../src/router";
import { BOT_COMMANDS } from "../src/handlers";
import type { TgUpdate } from "../src/telegram";
import type { Env } from "../src/env";

// ---------------------------------------------------------------------------
// Окружение / миграции
// ---------------------------------------------------------------------------

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

const USER_ID = 424242; // tg_id — ЧИСЛО

beforeAll(async () => {
  await applyD1Migrations(DB, TEST_MIGRATIONS);
});

// ---------------------------------------------------------------------------
// Хелперы апдейтов
// ---------------------------------------------------------------------------

let updateId = 1;

function makeUpdate(text: string, userId: number = USER_ID): TgUpdate {
  return {
    update_id: updateId++,
    message: {
      message_id: updateId,
      from: { id: userId, is_bot: false, first_name: "Test", username: "tester" },
      chat: { id: userId, type: "private" },
      date: Math.floor(Date.now() / 1000),
      text,
    },
  };
}

function makeCallback(data: string, userId: number = USER_ID): TgUpdate {
  return {
    update_id: updateId++,
    callback_query: {
      id: String(updateId),
      from: { id: userId, is_bot: false, first_name: "Test", username: "tester" },
      message: {
        message_id: updateId,
        from: { id: userId, is_bot: false, first_name: "Test", username: "tester" },
        chat: { id: userId, type: "private" },
        date: Math.floor(Date.now() / 1000),
        text: "(prev)",
      },
      data,
    },
  };
}

// ---------------------------------------------------------------------------
// Мок глобального fetch
// ---------------------------------------------------------------------------

interface SentMessage {
  url: string;
  method: string;
  body: Record<string, unknown>;
}

let sent: SentMessage[] = [];

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function installFetchMock(): void {
  sent = [];
  const mock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      let body: Record<string, unknown> = {};
      const rawBody = init?.body;
      if (typeof rawBody === "string") {
        try {
          body = JSON.parse(rawBody) as Record<string, unknown>;
        } catch {
          /* ignore */
        }
      }

      if (url.includes("api.telegram.org")) {
        sent.push({ url, method: init?.method ?? "POST", body });
        return jsonResponse({ ok: true, result: { message_id: 1 } });
      }

      throw new Error(`Unexpected fetch to ${url}`);
    },
  );
  vi.stubGlobal("fetch", mock);
}

beforeEach(() => {
  installFetchMock();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Собранный текст всех sendMessage/editMessageText, отправленных в Telegram. */
function sentTexts(): string[] {
  return sent
    .filter((s) => s.url.includes("/sendMessage") || s.url.includes("/editMessageText"))
    .map((s) => String(s.body.text ?? ""));
}

// ---------------------------------------------------------------------------
// Все текстовые команды из router.ts
// ---------------------------------------------------------------------------

const TEXT_COMMANDS = [
  "/start",
  "/menu",
  "/home",
  "/cancel",
  "/do",
  "/goals",
  "/reflect",
  "/nutrition",
  "/help",
];

describe("text commands do not throw at runtime", () => {
  for (const cmd of TEXT_COMMANDS) {
    it(`${cmd} runs without throwing and answers something`, async () => {
      await expect(handleUpdate(makeUpdate(cmd), testEnv)).resolves.toBeUndefined();
      expect(sentTexts().length).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// Каждая команда из BOT_COMMANDS реально роутится (не «не распознана»)
// ---------------------------------------------------------------------------

describe("every BOT_COMMANDS entry routes", () => {
  for (const { command } of BOT_COMMANDS) {
    it(`/${command} routes and answers`, async () => {
      await expect(
        handleUpdate(makeUpdate(`/${command}`), testEnv),
      ).resolves.toBeUndefined();
      const texts = sentTexts().join("\n");
      expect(texts.length).toBeGreaterThan(0);
      expect(texts).not.toContain("не распознан");
      expect(texts).not.toContain("Неизвестная команда");
    });
  }
});

// ---------------------------------------------------------------------------
// Нижние reply-кнопки главного меню
// ---------------------------------------------------------------------------

describe("bottom reply-buttons route", () => {
  const buttons = [
    "💪 Сделать сейчас",
    "📍 По ситуации",
    "🎯 Цели",
    "🍽 Питание",
    "📈 Прогресс",
    "⚙️ Настройки",
  ];
  for (const b of buttons) {
    it(`button "${b}" runs without throwing`, async () => {
      await expect(handleUpdate(makeUpdate(b), testEnv)).resolves.toBeUndefined();
      expect(sentTexts().length).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// /start регистрирует «синее меню» команд (setMyCommands)
// ---------------------------------------------------------------------------

describe("/start registers the command menu", () => {
  it("calls setMyCommands with all BOT_COMMANDS", async () => {
    await handleUpdate(makeUpdate("/start"), testEnv);
    const call = sent.find((s) => s.url.includes("/setMyCommands"));
    expect(call).toBeDefined();
    const commands = (call?.body.commands ?? []) as Array<{ command: string }>;
    expect(commands.length).toBe(BOT_COMMANDS.length);
    expect(commands.map((c) => c.command).sort()).toEqual(
      BOT_COMMANDS.map((c) => c.command).sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// /reflect end-to-end: команда → текст → reflections +1
// ---------------------------------------------------------------------------

describe("/reflect end-to-end", () => {
  it("/reflect then free text writes a row to reflections", async () => {
    const u = 999101;
    const before = await DB.prepare(
      "SELECT COUNT(*) AS n FROM reflections WHERE tg_id = ?",
    )
      .bind(u)
      .first<{ n: number }>();

    await handleUpdate(makeUpdate("/reflect", u), testEnv); // ставит state Reflect:text
    await handleUpdate(makeUpdate("Сегодня прогулялась и сделала зарядку.", u), testEnv);

    const after = await DB.prepare(
      "SELECT COUNT(*) AS n FROM reflections WHERE tg_id = ?",
    )
      .bind(u)
      .first<{ n: number }>();

    expect((after?.n ?? 0) - (before?.n ?? 0)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Представительные callbacks не бросают
// ---------------------------------------------------------------------------

describe("representative callbacks do not throw", () => {
  const callbacks = [
    "home",
    "back:home",
    "do:lying",
    "sit:" /* пустой — обработается как safe no-op */,
    "goal:list",
    "goal:new",
    "set:toggle",
    "set:mode",
    "set:daily_goal",
    "set:interval",
    "set:tz",
    "n:home",
    "n:add",
    "n:state",
    "n:ab",
  ];
  for (const data of callbacks) {
    it(`callback "${data}" runs without throwing`, async () => {
      await expect(handleUpdate(makeCallback(data), testEnv)).resolves.toBeUndefined();
    });
  }
});
