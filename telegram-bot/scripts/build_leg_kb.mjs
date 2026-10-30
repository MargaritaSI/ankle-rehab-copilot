/**
 * Сборка корпуса нога-RAG: качает реальные авторитетные источники (их нашли
 * 4 агента-исследователя), чистит HTML → текст, режет на чанки и пишет
 * scripts/leg_kb/<cluster>.json. Тексты НЕ проходят через контекст ассистента.
 *
 * Запуск:  node scripts/build_leg_kb.mjs
 * Требует Node 18+ (global fetch). Без npm-зависимостей.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = path.join(import.meta.dirname, "leg_kb");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const WORDS_PER_CHUNK = 180;
const MIN_CHUNK_WORDS = 45;
const MAX_CHUNKS_PER_SOURCE = 12;

// Источники по кластерам (реальные URL, найдены агентами через WebSearch).
const SOURCES = {
  talus_oat_rehab: [
    ["OAT (mosaicplasty) for osteochondral lesions of the talus", "https://pmc.ncbi.nlm.nih.gov/articles/PMC7049595/"],
    ["New approach to postoperative rehabilitation after mosaicplasty + BMAC", "https://pmc.ncbi.nlm.nih.gov/articles/PMC11200487/"],
    ["Autologous osteochondral transplantation of the talus — follow-up", "https://pmc.ncbi.nlm.nih.gov/articles/PMC12839854/"],
    ["Triplane osteotomy + talar autologous osteochondral transplantation", "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8783502/"],
  ],
  donor_knee: [
    ["Knee donor-site morbidity after mosaicplasty — systematic review", "https://pmc.ncbi.nlm.nih.gov/articles/PMC5095115/"],
    ["Donor-site morbidity after OAT (capitellum) — review & meta-analysis", "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5489608/"],
    ["Long-term results of OAT of the talus (knee donor, 10+ yr)", "https://pmc.ncbi.nlm.nih.gov/articles/PMC7607963/"],
    ["Effectiveness of OAT for osteochondral lesions of the talus", "https://pmc.ncbi.nlm.nih.gov/articles/PMC9741491/"],
    ["OAT with ipsilateral lateral talar autograft (avoiding knee donor)", "https://pmc.ncbi.nlm.nih.gov/articles/PMC11262937/"],
  ],
  cartilage_longevity: [
    ["Role of body weight in osteoarthritis — Johns Hopkins Arthritis", "https://www.hopkinsarthritis.org/patient-corner/disease-management/role-of-body-weight-in-osteoarthritis/"],
    ["Obesity-related knee osteoarthritis — current concepts", "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10456094/"],
    ["Effect of body weight on knee joint biomechanics", "https://pmc.ncbi.nlm.nih.gov/articles/PMC11178890/"],
    ["How fat affects osteoarthritis — Arthritis Foundation", "https://www.arthritis.org/health-wellness/about-arthritis/related-conditions/other-diseases/how-fat-affects-osteoarthritis"],
    ["Autograft/allograft transplantation in athletes with OLT", "https://pmc.ncbi.nlm.nih.gov/articles/PMC9531908/"],
  ],
  nutrition_supplements: [
    ["Vitamin C, collagen synthesis and bone healing — systematic review", "https://pmc.ncbi.nlm.nih.gov/articles/PMC6204628/"],
    ["Clinical effect of vitamin C on bone healing — systematic review", "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9054165/"],
    ["Protein intake and bone health — umbrella review", "https://pmc.ncbi.nlm.nih.gov/articles/PMC10382330/"],
    ["Vitamin D in orthopaedics and traumatology — narrative review", "https://pmc.ncbi.nlm.nih.gov/articles/PMC8263860/"],
    ["Smoking & alcohol on bone healing — meta-analysis", "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8571530/"],
    ["Orthopaedic surgery and smoking — OrthoInfo (AAOS)", "https://orthoinfo.aaos.org/en/treatment/surgery-and-smoking/"],
    ["Glucosamine and chondroitin for osteoarthritis — NCCIH (NIH)", "https://www.nccih.nih.gov/health/glucosamine-and-chondroitin-for-osteoarthritis-what-you-need-to-know"],
    ["Vitamin C-enriched gelatin augments collagen synthesis", "https://pmc.ncbi.nlm.nih.gov/articles/PMC5183725/"],
    ["Omega-3 fatty acids for osteoarthritis — narrative review", "https://pmc.ncbi.nlm.nih.gov/articles/PMC9413343/"],
    ["NSAIDs and fracture healing — systematic review/meta-analysis", "https://www.frontiersin.org/journals/endocrinology/articles/10.3389/fendo.2024.1428240/full"],
  ],
};

const ENTITIES = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'",
  "&apos;": "'", "&nbsp;": " ", "&mdash;": "—", "&ndash;": "–", "&rsquo;": "'",
  "&lsquo;": "'", "&ldquo;": '"', "&rdquo;": '"',
};

function htmlToText(html) {
  let t = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");
  for (const [k, v] of Object.entries(ENTITIES)) t = t.split(k).join(v);
  t = t.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
  return t.replace(/\s+/g, " ").trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Пытаемся вырезать тело статьи между Abstract и References (только если разумно). */
function mainBody(text) {
  const lower = text.toLowerCase();
  const start = lower.indexOf("abstract");
  let end = lower.lastIndexOf("references");
  if (end < 0) end = lower.lastIndexOf("acknowledg");
  if (start >= 0 && end > start + 1500) {
    const slice = text.slice(start, end);
    if (slice.length > 0.25 * text.length) return slice;
  }
  return text;
}

function chunk(text) {
  const words = text.split(" ");
  const out = [];
  for (let i = 0; i < words.length; i += WORDS_PER_CHUNK) {
    const piece = words.slice(i, i + WORDS_PER_CHUNK).join(" ").trim();
    if (piece.split(" ").length >= MIN_CHUNK_WORDS) out.push(piece);
    if (out.length >= MAX_CHUNKS_PER_SOURCE) break;
  }
  return out;
}

async function fetchText(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal, redirect: "follow" });
    if (!res.ok) return { ok: false, status: res.status };
    const html = await res.text();
    return { ok: true, text: mainBody(htmlToText(html)) };
  } catch (e) {
    return { ok: false, status: String(e).slice(0, 60) };
  } finally {
    clearTimeout(timer);
  }
}

await mkdir(OUT_DIR, { recursive: true });
let grandChunks = 0;
let grandSources = 0;

for (const [cluster, list] of Object.entries(SOURCES)) {
  const rows = [];
  for (const [title, url] of list) {
    let r = await fetchText(url);
    let chunks = r.ok ? chunk(r.text) : [];
    if (chunks.length === 0) {
      // Ретрай: NCBI троттлит частые подряд-запросы → пустое тело.
      await sleep(3500);
      r = await fetchText(url);
      chunks = r.ok ? chunk(r.text) : [];
    }
    if (chunks.length === 0) {
      console.log(`  ✗ ${cluster} | ${r.ok ? "пусто" : "HTTP " + r.status} | ${url}`);
      await sleep(1200);
      continue;
    }
    chunks.forEach((text, i) =>
      rows.push({ topic: cluster, source_title: title, source_url: url, chunk_idx: i, text }),
    );
    grandSources += 1;
    console.log(`  ✓ ${cluster} | ${chunks.length} чанков | ${title}`);
    await sleep(1200);
  }
  const file = path.join(OUT_DIR, `${cluster}.json`);
  await writeFile(file, JSON.stringify(rows, null, 2), "utf8");
  grandChunks += rows.length;
  console.log(`→ ${cluster}.json: ${rows.length} чанков\n`);
}

console.log(`ИТОГО: ${grandSources} источников, ${grandChunks} чанков.`);
