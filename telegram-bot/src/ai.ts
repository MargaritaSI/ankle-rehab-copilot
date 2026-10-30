/**
 * Тонкий клиент Cloudflare Workers AI для RAG по ноге.
 *
 * Всё считается НА Cloudflare (free-tier Neurons) — НЕ нужен Nebius или внешний
 * API. Поэтому бот работает и ПОСЛЕ окончания кредитов Nebius, бесплатно.
 *
 * ВАЖНО: embeddings на ingest и на запрос обязаны использовать ОДНУ модель,
 * иначе векторы несовместимы. Поэтому модели зафиксированы здесь.
 */

/** Минимальный структурный тип AI-биндинга (без привязки к версии workers-types). */
export interface AiBinding {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
}

/** Мультиязычные embeddings (RU вопрос ↔ EN источники), вектор 1024. */
export const EMBED_MODEL = "@cf/baai/bge-m3";

/**
 * Генерация ответа — frontier-модель Nebius (сильное клиническое рассуждение).
 * Embeddings остаются на Workers AI (бесплатно); только генерация идёт на грант
 * Nebius. После гранта — заменить ключ/модель (одна строка).
 */
export const CHAT_MODEL = "openai/gpt-oss-120b";
const NEBIUS_CHAT_URL = "https://api.tokenfactory.nebius.com/v1/chat/completions";
const GEN_TIMEOUT_MS = 50_000;

export class AiError extends Error {
  constructor(public original: unknown) {
    super(`Workers AI error: ${String(original)}`);
    this.name = "AiError";
  }
}

/** Эмбеддинг одной строки → массив float. Кидает AiError при сбое. */
export async function embed(ai: AiBinding, text: string): Promise<number[]> {
  try {
    const r = (await ai.run(EMBED_MODEL, { text: [text] })) as {
      data?: number[][];
    };
    return r.data?.[0] ?? [];
  } catch (e) {
    throw new AiError(e);
  }
}

/** Эмбеддинги пачки строк → массив векторов (для ingest). Кидает AiError при сбое. */
export async function embedMany(
  ai: AiBinding,
  texts: string[],
): Promise<number[][]> {
  try {
    const r = (await ai.run(EMBED_MODEL, { text: texts })) as {
      data?: number[][];
    };
    return r.data ?? [];
  } catch (e) {
    throw new AiError(e);
  }
}

/** Генерация ответа frontier-моделью Nebius. messages = system + user. Кидает AiError при сбое. */
export async function generate(
  apiKey: string,
  messages: { role: string; content: string }[],
  opts: { max_tokens?: number; temperature?: number } = {},
): Promise<string> {
  try {
    const res = await fetch(NEBIUS_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(GEN_TIMEOUT_MS),
      body: JSON.stringify({
        model: CHAT_MODEL,
        temperature: opts.temperature ?? 0.4,
        max_tokens: opts.max_tokens ?? 1800,
        messages,
      }),
    });
    if (!res.ok) {
      throw new Error(`Nebius ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    }
    const j = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return (j.choices?.[0]?.message?.content ?? "")
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .trim();
  } catch (e) {
    throw new AiError(e);
  }
}
