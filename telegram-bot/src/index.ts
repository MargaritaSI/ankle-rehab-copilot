/**
 * Точка входа Cloudflare Worker для addsport-bot.
 */

import type { Env } from "./env";
import { TelegramClient, type TgUpdate } from "./telegram";
import { handleUpdate } from "./router";
import { tickScheduler } from "./scheduler";
import { ingestChunks, type IngestChunk } from "./ingest";
import { answerLeg } from "./leg_rag";
import { BOT_COMMANDS } from "./handlers";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return new Response("addsport-bot ok", { status: 200 });
    }

    const ingestOk =
      !!env.INGEST_SECRET &&
      request.headers.get("X-Ingest-Secret") === env.INGEST_SECRET;

    // Заливка базы знаний по ноге (guarded). Embeddings считает Workers AI.
    if (request.method === "POST" && url.pathname === "/admin/ingest") {
      if (!ingestOk) {
        return new Response("Forbidden", { status: 403 });
      }
      let body: { chunks?: IngestChunk[]; reset?: boolean };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return new Response("Bad JSON", { status: 400 });
      }
      try {
        const n = await ingestChunks(env, body.chunks ?? [], !!body.reset);
        return Response.json({ ok: true, inserted: n });
      } catch (err) {
        return new Response(`ingest error: ${String(err)}`, { status: 500 });
      }
    }

    // Обновить «синее меню» команд Telegram (guarded): GET /admin/setcommands
    if (request.method === "GET" && url.pathname === "/admin/setcommands") {
      if (!ingestOk) {
        return new Response("Forbidden", { status: 403 });
      }
      try {
        await new TelegramClient(env.TELEGRAM_BOT_TOKEN).setMyCommands(BOT_COMMANDS);
        return Response.json({ ok: true, commands: BOT_COMMANDS.length });
      } catch (err) {
        return new Response(`setcommands error: ${String(err)}`, { status: 500 });
      }
    }

    // Тест RAG без Телеграма (guarded): GET /admin/leg?q=...
    if (request.method === "GET" && url.pathname === "/admin/leg") {
      if (!ingestOk) {
        return new Response("Forbidden", { status: 403 });
      }
      const q = url.searchParams.get("q") ?? "";
      if (!q) return new Response("no q", { status: 400 });
      try {
        return Response.json(await answerLeg(env, q));
      } catch (err) {
        return new Response(`leg error: ${String(err)}`, { status: 500 });
      }
    }

    if (url.pathname !== "/webhook") {
      return new Response("Not found", { status: 404 });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (secret !== env.WEBHOOK_SECRET) {
      return new Response("Forbidden", { status: 403 });
    }

    let update: TgUpdate;
    try {
      update = (await request.json()) as TgUpdate;
    } catch {
      return new Response("Bad JSON", { status: 400 });
    }

    ctx.waitUntil(
      handleUpdate(update, env).catch((err) => {
        console.error("handleUpdate error:", err);
      }),
    );
    return new Response("ok", { status: 200 });
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      tickScheduler(event, env).catch((err) => {
        console.error("scheduled error:", err);
      }),
    );
  },
};
