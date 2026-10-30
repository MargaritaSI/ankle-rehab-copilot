/** Тема 1: перекрёстный фактчек ДРУГОЙ моделью (gpt-oss-120b) поверх уже
 * исправленной синтетики — только флагует оставшиеся проблемы (без перезаписи).
 * → leg_kb/_reports/xcheck.json. Возобновляемо. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { nebiusKey, call, sleep, parseJson } from "./_nebius_lib.mjs";

const DIR = path.join(import.meta.dirname, "leg_kb");
const REP = path.join(DIR, "_reports");
const OUT = path.join(REP, "xcheck.json");
const MODEL = "openai/gpt-oss-120b"; // не DeepSeek — независимое второе мнение
const FILES = ["scenarios_predictions.json", "extended_kb.json", "extended_kb2.json", "micro_movement_routine.json"];
const SYS = `Ты — независимый медицинский ревизор. Проверяешь обучающий текст для женщины 35+ после мозаикопластики таранной кости (донор хряща — колено), без ударных нагрузок. Найди ОСТАВШИЕСЯ проблемы: фактические/анатомические ошибки, бессмыслицу, опасные советы, выдуманные точные цифры, противоречия. Верни СТРОГО JSON: {"verdict":"ok"|"issues","issues":["краткие пункты; [] если чисто"]}.`;

await mkdir(REP, { recursive: true });
let report = [];
try { report = JSON.parse(await readFile(OUT, "utf8")); } catch {}
const done = new Set(report.map((r) => `${r.file}|${r.title}`));
const key = await nebiusKey();
let tok = 0, flagged = 0, n = 0;
for (const f of FILES) {
  let rows = [];
  try { rows = JSON.parse(await readFile(path.join(DIR, f), "utf8")); } catch { continue; }
  for (const r of rows) {
    const id = `${f}|${r.source_title}`;
    if (done.has(id)) continue;
    try {
      const { text, tok: t } = await call(key, MODEL,
        [{ role: "system", content: SYS }, { role: "user", content: `Заголовок: ${r.source_title}\n\nТекст:\n${r.text}` }],
        { max_tokens: 500, json: true, temperature: 0.2 });
      tok += t; n++;
      const p = parseJson(text);
      const issues = Array.isArray(p?.issues) ? p.issues : [];
      const verdict = p?.verdict === "issues" && issues.length ? "issues" : "ok";
      report.push({ file: f, title: r.source_title, verdict, issues });
      await writeFile(OUT, JSON.stringify(report, null, 2), "utf8");
      if (verdict === "issues") { flagged++; console.log(`  ⚠ ${r.source_title}`); issues.slice(0, 2).forEach((i) => console.log(`      – ${i}`)); }
    } catch (e) { console.log(`  ✗ ${r.source_title} — ${String(e).slice(0, 70)}`); }
    await sleep(250);
  }
}
console.log(`\nТема1 кросс-чек: проверено ${report.length}, с замечаниями ${flagged}, ~${tok} токенов.`);
