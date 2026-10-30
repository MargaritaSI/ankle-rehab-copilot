/** Общая мини-библиотека для batch-скриптов на Nebius (расход гранта). */
import { readFile } from "node:fs/promises";
import path from "node:path";

const URL = "https://api.tokenfactory.nebius.com/v1/chat/completions";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function nebiusKey() {
  const f = path.join(import.meta.dirname, "..", "..", "marketing", ".dev.vars");
  const raw = await readFile(f, "utf8");
  const l = raw.split("\n").find((x) => x.startsWith("NEBIUS_API_KEY="));
  return l.slice("NEBIUS_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
}

/** Вызов модели с одним ретраем на 429/ошибку. Возвращает {text, tok}. */
export async function call(key, model, messages, opts = {}) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          temperature: opts.temperature ?? 0.4,
          max_tokens: opts.max_tokens ?? 800,
          ...(opts.json ? { response_format: { type: "json_object" } } : {}),
          messages,
        }),
      });
      if (res.status === 429) { await sleep(5000); continue; }
      if (!res.ok) throw new Error(`Nebius ${res.status}: ${(await res.text()).slice(0, 150)}`);
      const j = await res.json();
      const c = (j.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      return { text: c, tok: j.usage?.total_tokens ?? 0 };
    } catch (e) { lastErr = e; await sleep(2500); }
  }
  throw lastErr;
}

export function parseJson(s) {
  try { return JSON.parse(s); } catch {}
  const m = s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}
