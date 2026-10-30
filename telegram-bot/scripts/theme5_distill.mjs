/** Тема 5: дистилляция реальных статей — качаем полный текст и топ-модель
 * пересказывает чисто по-русски (лучше грубого HTML-скрейпа). → leg_kb/distilled.json */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { nebiusKey, call, sleep } from "./_nebius_lib.mjs";

const OUT = path.join(import.meta.dirname, "leg_kb", "distilled.json");
const MODEL = "openai/gpt-oss-120b";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const SYS = `На входе сырой текст медицинской статьи. Выдели КЛЮЧЕВЫЕ практические факты про реабилитацию/нагрузку/питание/донорское колено после операции на хряще и перескажи ЧИСТО по-русски, простым языком, БЕЗ таблиц и «**», 200–350 слов. Бери ТОЛЬКО факты из текста, не выдумывай. Если текст не по теме/пустой — верни ровно «НЕ ПО ТЕМЕ».`;

const SOURCES = [
  ["Постоперационная реабилитация после мозаикопластики", "https://pmc.ncbi.nlm.nih.gov/articles/PMC11200487/"],
  ["OAT (мозаикопластика) при дефектах хряща таранной кости", "https://pmc.ncbi.nlm.nih.gov/articles/PMC7049595/"],
  ["Морбидность донорского колена после мозаикопластики", "https://pmc.ncbi.nlm.nih.gov/articles/PMC5095115/"],
  ["Отдалённые результаты OAT таранной кости (донор — колено)", "https://pmc.ncbi.nlm.nih.gov/articles/PMC7607963/"],
  ["Роль массы тела при остеоартрозе (Johns Hopkins)", "https://www.hopkinsarthritis.org/patient-corner/disease-management/role-of-body-weight-in-osteoarthritis/"],
  ["Аутотрансплантация хряща у спортсменов с OLT", "https://pmc.ncbi.nlm.nih.gov/articles/PMC9531908/"],
  ["Витамин C, синтез коллагена и заживление кости", "https://pmc.ncbi.nlm.nih.gov/articles/PMC6204628/"],
  ["Потребление белка и здоровье кости (umbrella review)", "https://pmc.ncbi.nlm.nih.gov/articles/PMC10382330/"],
  ["Глюкозамин и хондроитин при остеоартрозе (NCCIH/NIH)", "https://www.nccih.nih.gov/health/glucosamine-and-chondroitin-for-osteoarthritis-what-you-need-to-know"],
  ["Курение и ортопедическая операция (OrthoInfo/AAOS)", "https://orthoinfo.aaos.org/en/treatment/surgery-and-smoking/"],
];

function htmlToText(html) {
  let t = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ");
  return t.replace(/\s+/g, " ").trim();
}

let rows = [];
try { rows = JSON.parse(await readFile(OUT, "utf8")); } catch {}
const done = new Set(rows.map((r) => r.source_url));
const key = await nebiusKey();
let tok = 0;
for (const [title, url] of SOURCES) {
  if (done.has(url)) continue;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
    if (!res.ok) { console.log(`  ✗ fetch ${res.status}: ${title}`); continue; }
    const text = htmlToText(await res.text()).slice(0, 9000);
    const { text: dist, tok: t } = await call(key, MODEL,
      [{ role: "system", content: SYS }, { role: "user", content: `Источник: ${title}\n\nТекст:\n${text}` }],
      { max_tokens: 900, temperature: 0.3 });
    tok += t;
    if (dist && !dist.includes("НЕ ПО ТЕМЕ")) {
      rows.push({ topic: "distilled", source_title: title, source_url: url, chunk_idx: 0, text: dist.replace(/\*\*(.+?)\*\*/g, "$1").trim() });
      await writeFile(OUT, JSON.stringify(rows, null, 2), "utf8");
      console.log(`  ✓ ${title}`);
    } else { console.log(`  — пропуск (не по теме): ${title}`); }
  } catch (e) { console.log(`  ✗ ${title} — ${String(e).slice(0, 70)}`); }
  await sleep(400);
}
console.log(`\nТема5 дистилляция: ${rows.length} источников, ~${tok} токенов.`);
