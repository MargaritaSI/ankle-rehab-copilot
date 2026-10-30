/**
 * Заливка базы знаний по ноге: эмбеддит чанки через Workers AI (bge-m3) и пишет
 * в D1. Embeddings считаются ТЕМ ЖЕ биндингом, что и при запросе → векторы
 * гарантированно совместимы. Вызывается из guarded-роута /admin/ingest.
 */

import type { Env } from "./env";
import { embedMany } from "./ai";

export interface IngestChunk {
  topic: string;
  source_title: string;
  source_url: string;
  chunk_idx?: number;
  text: string;
  /** 'personal' — про конкретного пациента, не отдаётся другим пользователям. Не задан → определяется inferScope. */
  scope?: "general" | "personal";
}

/**
 * Если scope не указан явно в JSON — определяем по тем же правилам, что и миграция
 * 0003_leg_kb_scope.sql, чтобы переиндексация (reset=true) не «обобщила» личные чанки.
 */
export function inferScope(c: IngestChunk): "general" | "personal" {
  if (c.scope) return c.scope;
  if (c.topic === "ocd_talus" || c.topic === "ocd_talus_personal") return "personal";
  if (
    c.text.includes("этого пациента") ||
    c.source_title.includes("Персональная калибровка") ||
    c.source_title.includes("что НЕ делать сейчас")
  ) {
    return "personal";
  }
  return "general";
}

/** Сколько чанков эмбеддить за один вызов модели (= 1 субзапрос Worker'а). */
const EMBED_BATCH = 20;

/** Эмбеддит и вставляет чанки. reset=true сначала чистит таблицу. Возвращает число вставленных. */
export async function ingestChunks(
  env: Env,
  chunks: IngestChunk[],
  reset: boolean,
): Promise<number> {
  if (reset) {
    await env.DB.prepare("DELETE FROM leg_kb").run();
  }
  let inserted = 0;
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const batch = chunks.slice(i, i + EMBED_BATCH);
    const vecs = await embedMany(
      env.AI,
      batch.map((c) => c.text),
    );
    const stmts = batch.map((c, j) =>
      env.DB.prepare(
        "INSERT INTO leg_kb (topic, source_title, source_url, chunk_idx, text, embedding, scope) VALUES (?,?,?,?,?,?,?)",
      ).bind(
        c.topic,
        c.source_title,
        c.source_url,
        c.chunk_idx ?? 0,
        c.text,
        JSON.stringify(vecs[j] ?? []),
        inferScope(c),
      ),
    );
    await env.DB.batch(stmts);
    inserted += batch.length;
  }
  return inserted;
}
