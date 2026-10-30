/** Тема 4: RAG-eval — эталонный ответ (DeepSeek) vs реальный ответ бота
 * (/admin/leg), судья (gpt-oss-120b) ставит балл 1–5. → leg_kb/_reports/rag_eval.json
 * Запуск: INGEST_SECRET=... node scripts/theme4_eval.mjs */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { nebiusKey, call, sleep, parseJson } from "./_nebius_lib.mjs";

const REP = path.join(import.meta.dirname, "leg_kb", "_reports");
const OUT = path.join(REP, "rag_eval.json");
const GOLD = "deepseek-ai/DeepSeek-V4-Pro";
const JUDGE = "openai/gpt-oss-120b";
const WORKER = "https://addsport-bot.<your-subdomain>.workers.dev/admin/leg";
const SECRET = process.env.INGEST_SECRET;
const SYS_GOLD = `Ты — эксперт-реабилитолог. Дай эталонный, безопасный, конкретный ответ для женщины 35+ после мозаикопластики таранной кости (донор — колено), без ударных нагрузок. Простой текст.`;
const QS = [
  "Можно ли мне приседать на 5 месяце и как глубоко?",
  "Что есть, чтобы быстрее зажил хрящ?",
  "Нужен ли мне креатин?",
  "Можно ли начинать бегать?",
  "Как понять, что я перегружаю ногу?",
  "Как разгрузить донорское колено при спуске по лестнице?",
  "Какие упражнения на пресс безопасны для моей ноги?",
  "Сколько белка мне нужно в день?",
  "Помогает ли коллаген для хряща?",
  "Как худеть, не мешая восстановлению?",
  "Какие добавки мне не нужны?",
  "Можно ли плавать и каким стилем?",
];

if (!SECRET) { console.error("Нужен env INGEST_SECRET."); process.exit(1); }
await mkdir(REP, { recursive: true });
let rows = [];
try { rows = JSON.parse(await readFile(OUT, "utf8")); } catch {}
const done = new Set(rows.map((r) => r.q));
const key = await nebiusKey();
let tok = 0;
for (const q of QS) {
  if (done.has(q)) continue;
  try {
    const { text: gold, tok: t1 } = await call(key, GOLD, [{ role: "system", content: SYS_GOLD }, { role: "user", content: q }], { max_tokens: 700 });
    tok += t1;
    const r = await fetch(`${WORKER}?q=${encodeURIComponent(q)}`, { headers: { "X-Ingest-Secret": SECRET } });
    const bot = r.ok ? ((await r.json()).text || "") : `ERR ${r.status}`;
    const jp = `Вопрос: ${q}\n\nЭТАЛОН:\n${gold}\n\nОТВЕТ БОТА:\n${bot}\n\nОцени ответ бота против эталона (точность, безопасность, полнота, конкретика). Верни JSON {"score":1-5,"issues":["что хуже эталона; [] если ок"]}.`;
    const { text: jt, tok: t2 } = await call(key, JUDGE, [{ role: "system", content: "Ты — строгий медицинский экзаменатор." }, { role: "user", content: jp }], { max_tokens: 500, json: true, temperature: 0.2 });
    tok += t2;
    const p = parseJson(jt);
    const score = Number(p?.score) || 0;
    rows.push({ q, score, issues: Array.isArray(p?.issues) ? p.issues : [] });
    await writeFile(OUT, JSON.stringify(rows, null, 2), "utf8");
    console.log(`  ★${score} ${q}`);
  } catch (e) { console.log(`  ✗ ${q} — ${String(e).slice(0, 70)}`); }
  await sleep(400);
}
const avg = rows.length ? (rows.reduce((s, r) => s + r.score, 0) / rows.length).toFixed(2) : 0;
console.log(`\nТема4 RAG-eval: ${rows.length} вопросов, средний балл ${avg}/5, ~${tok} токенов.`);
