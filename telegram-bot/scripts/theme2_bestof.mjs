/** Тема 2: best-of-N — на каждый частый вопрос 3 варианта (gpt-oss-120b) +
 * судья-редактор (DeepSeek-V4-Pro) сливает лучшее. → leg_kb/faq_bestof.json. */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { nebiusKey, call, sleep } from "./_nebius_lib.mjs";

const OUT = path.join(import.meta.dirname, "leg_kb", "faq_bestof.json");
const GEN = "openai/gpt-oss-120b";
const JUDGE = "deepseek-ai/DeepSeek-V4-Pro";
const SYS = `Ты — реабилитолог и нутрициолог. Отвечай просто и конкретно для женщины 35+ после мозаикопластики таранной кости (донор — колено), без ударных нагрузок. Простой текст, без таблиц и «**», 150–250 слов. Дозы — как общие сведения.`;
const QS = [
  "Можно ли мне приседать на 5 месяце и как глубоко?",
  "Что есть, чтобы быстрее зажил хрящ?",
  "Нужен ли мне креатин и какие добавки реально полезны?",
  "Когда можно начинать бегать?",
  "Как понять, что я перегружаю ногу?",
  "Как разгрузить донорское колено при спуске по лестнице?",
  "Какие упражнения на пресс безопасны для моей ноги?",
  "Сколько белка мне нужно в день и где брать?",
  "Помогает ли коллаген для хряща?",
  "Как худеть, не мешая восстановлению?",
  "Какой спорт мне можно сейчас?",
  "Можно ли плавать и каким стилем?",
];

let rows = [];
try { rows = JSON.parse(await readFile(OUT, "utf8")); } catch {}
const done = new Set(rows.map((r) => r.source_title));
const key = await nebiusKey();
let tok = 0;
for (const q of QS) {
  if (done.has(q)) continue;
  try {
    const cand = [];
    for (let i = 0; i < 3; i++) {
      const { text, tok: t } = await call(key, GEN, [{ role: "system", content: SYS }, { role: "user", content: q }], { max_tokens: 600, temperature: 0.85 });
      tok += t; if (text) cand.push(text);
    }
    if (!cand.length) { console.log(`  ✗ нет вариантов: ${q}`); continue; }
    const jp = `Вопрос: ${q}\n\n` + cand.map((c, i) => `=== Вариант ${i + 1} ===\n${c}`).join("\n\n") + `\n\nСлей лучшее из вариантов в ОДИН точный, безопасный, конкретный ответ. Исправь любые ошибки и бессмыслицу. Простой текст, без таблиц/«**», 150–250 слов.`;
    const { text: best, tok: t2 } = await call(key, JUDGE, [{ role: "system", content: "Ты — придирчивый медицинский редактор." }, { role: "user", content: jp }], { max_tokens: 900, temperature: 0.3 });
    tok += t2;
    const clean = (best || cand[0]).replace(/\*\*(.+?)\*\*/g, "$1").trim();
    rows.push({ topic: "faq_bestof", source_title: q, source_url: "", chunk_idx: 0, text: clean });
    await writeFile(OUT, JSON.stringify(rows, null, 2), "utf8");
    console.log(`  ✓ ${q}`);
  } catch (e) { console.log(`  ✗ ${q} — ${String(e).slice(0, 70)}`); }
  await sleep(300);
}
console.log(`\nТема2 best-of-N: ${rows.length} FAQ, ~${tok} токенов.`);
