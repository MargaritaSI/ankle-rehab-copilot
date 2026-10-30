/**
 * Расширение базы нога-RAG: питание / витамины / добавки / упражнения — ПРОСТЫМ
 * языком, для женщины 35+ после операции на хряще таранной кости (донор — колено).
 * Генерация на Nebius (расход гранта) → scripts/leg_kb/extended_kb.json.
 *
 * Запуск:  node scripts/gen_kb_extended.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DIR = path.join(import.meta.dirname, "leg_kb");
const NEBIUS_URL = "https://api.tokenfactory.nebius.com/v1/chat/completions";
const MODEL = "openai/gpt-oss-120b"; // быстрая+сильная, хороший русский
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function nebiusKey() {
  const envFile = path.join(import.meta.dirname, "..", "..", "marketing", ".dev.vars");
  const raw = await readFile(envFile, "utf8");
  const line = raw.split("\n").find((l) => l.startsWith("NEBIUS_API_KEY="));
  return line.slice("NEBIUS_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
}

const SYSTEM = `Ты — нутрициолог и реабилитолог. Объясняешь ПРОСТЫМ языком (для человека без медицинского образования) женщине 35+ после операции на хряще таранной кости голеностопа (донорский хрящ взят из колена). Цели: заживление, разгрузка сустава, без ударных нагрузок.

По заданной ТЕМЕ дай практичный, сбалансированный и ДОКАЗАТЕЛЬНЫЙ разбор:
- что это даёт / зачем;
- конкретика: в каких продуктах или как делать (для упражнений — как именно, без терминов);
- что будет, если делать, и чего НЕ будет / риск, если не делать или переборщить;
- предостережения: когда НЕ нужно, когда стоит проверить анализы или спросить врача.

Стиль: простой текст, БЕЗ таблиц, без «**» и «#», короткие абзацы и списки через «•». 150–250 слов. Для добавок — честно: где польза доказана, а где нет; не давай точные дозы как предписание. Для упражнений — только без ударных нагрузок.`;

// topic: nutrition_ext | supplements_ext | exercise_ext | weight_ext
const ENTRIES = [
  // ── Питание: продукты → нутриенты ──
  ["nutrition_ext", "Омега-3 и жирная рыба (лосось, скумбрия, сельдь): зачем при воспалении и хряще"],
  ["nutrition_ext", "Белок после операции: сколько нужно и где брать (мясо, рыба, яйца, творог, бобовые)"],
  ["nutrition_ext", "Витамин C для коллагена: перец, киви, цитрусы, капуста, ягоды"],
  ["nutrition_ext", "Витамин D для кости и хряща: рыба, яйца, солнце, когда добавка"],
  ["nutrition_ext", "Кальций из еды: молочное, твёрдый сыр, зелёные овощи, рыба с костями"],
  ["nutrition_ext", "Магний: орехи, цельные злаки, зелень — для мышц и кости"],
  ["nutrition_ext", "Цинк для заживления тканей: мясо, морепродукты, тыквенные семечки"],
  ["nutrition_ext", "Железо и B12 для энергии и восстановления: мясо, печень, бобовые"],
  ["nutrition_ext", "Витамин K2: где брать и зачем (кальций в кость, а не в сосуды)"],
  ["nutrition_ext", "Коллаген и желатин из еды: костный бульон, холодец — есть ли смысл"],
  ["nutrition_ext", "Какие витамины в брокколи, шпинате, моркови, болгарском перце"],
  ["nutrition_ext", "Что даёт рыба и морепродукты по сравнению с мясом для восстановления"],
  ["nutrition_ext", "Сахар и сладкое: как влияют на воспаление, вес и суставы"],
  ["nutrition_ext", "Ультрапереработанная еда: почему мешает заживлению"],
  ["nutrition_ext", "Противовоспалительные продукты: ягоды, овощи, оливковое масло, куркума, зелень"],
  ["nutrition_ext", "Клетчатка и овощи: для контроля воспаления и веса"],
  ["nutrition_ext", "Вода и достаточное питьё: связь со здоровьем хряща"],
  ["nutrition_ext", "Кофе и алкоголь при восстановлении: влияние на кость и сон"],
  ["nutrition_ext", "Простой день питания для заживления: завтрак, обед, ужин, перекусы"],
  ["nutrition_ext", "Йод из питания: йодированная соль, рыба, водоросли — сколько нужно"],
  // ── Добавки для женщины 35+ ──
  ["supplements_ext", "Креатин для женщины 35+ при реабилитации: польза для мышц и безопасность"],
  ["supplements_ext", "Йод в добавках: нужен ли или хватает из еды, чем опасен избыток"],
  ["supplements_ext", "Селен и щитовидная железа: зачем, осторожность с дозой, лучше из еды"],
  ["supplements_ext", "Витамин D в добавках: кому нужен и как понять по анализу 25-OH-D"],
  ["supplements_ext", "Омега-3 в капсулах: когда есть смысл, а когда хватит рыбы"],
  ["supplements_ext", "Коллаген в добавках с витамином C: что говорит наука"],
  ["supplements_ext", "Магний в добавках: формы, когда помогает (сон, судороги, мышцы)"],
  ["supplements_ext", "Кальций — из еды или в добавке: риски избытка добавки"],
  ["supplements_ext", "Глюкозамин и хондроитин: доказательная база, стоит ли"],
  ["supplements_ext", "Какие добавки большинству НЕ нужны (трата денег)"],
  ["supplements_ext", "Как не переборщить с добавками: безопасность и какие анализы сдать"],
  ["supplements_ext", "Железо/ферритин и B12 у женщины 35+: когда проверять и добавлять"],
  // ── Вес ──
  ["weight_ext", "Почему каждый лишний кг увеличивает нагрузку на сустав в несколько раз"],
  ["weight_ext", "Как снижать вес без ударных нагрузок и без вреда суставу"],
  ["weight_ext", "Дефицит калорий и заживление: как худеть и не мешать восстановлению"],
  // ── Упражнения (без ударных, простым языком) ──
  ["exercise_ext", "Безопасные упражнения для голеностопа без ударной нагрузки"],
  ["exercise_ext", "Укрепление икр и мышц стопы простыми движениями"],
  ["exercise_ext", "Бережные упражнения для донорского колена"],
  ["exercise_ext", "Баланс и устойчивость на одной ноге — простыми словами"],
  ["exercise_ext", "Пресс и кор без нагрузки на ногу: какие упражнения и зачем"],
  ["exercise_ext", "Осанка: простые упражнения и почему это важно при хромоте/компенсации"],
  ["exercise_ext", "Растяжка и подвижность голеностопа без боли"],
  ["exercise_ext", "Ягодицы и бёдра: чтобы разгрузить колено и голеностоп"],
  ["exercise_ext", "Велотренажёр, плавание, эллипс: как безопасно начинать"],
  ["exercise_ext", "Чего НЕ делать: ударные нагрузки, прыжки, глубокие приседы рано"],
  ["exercise_ext", "Как понять, что нагрузка чрезмерна: правило отёка и боли"],
  ["exercise_ext", "Ходьба как тренировка: дозировка и постепенная прогрессия"],
  ["exercise_ext", "Простая ежедневная мини-программа: 15 минут без нагрузки на сустав"],
];

const NUTR_GROUND = ["nutrition_supplements.json"];
const EX_GROUND = ["talus_oat_rehab.json", "cartilage_longevity.json"];

async function grounding(files, maxChars = 3500) {
  const out = [];
  for (const f of files) {
    try {
      const rows = JSON.parse(await readFile(path.join(DIR, f), "utf8"));
      for (const r of rows.slice(0, 4)) out.push(r.text);
    } catch {
      /* пропускаем */
    }
  }
  return out.join("\n\n").slice(0, maxChars);
}

async function gen(key, title, ground) {
  const user = ground
    ? `Тема: ${title}\n\nМожешь опереться на эти факты (если релевантно):\n${ground}`
    : `Тема: ${title}`;
  const res = await fetch(NEBIUS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.5,
      max_tokens: 700,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Nebius ${res.status}: ${(await res.text()).slice(0, 150)}`);
  const j = await res.json();
  return { text: j.choices?.[0]?.message?.content ?? "", tok: j.usage?.total_tokens ?? 0 };
}

const key = await nebiusKey();
const rows = [];
let totalTok = 0;
for (const [topic, title] of ENTRIES) {
  const ground = topic === "exercise_ext" ? await grounding(EX_GROUND) : await grounding(NUTR_GROUND);
  try {
    const { text, tok } = await gen(key, title, ground);
    totalTok += tok;
    const clean = text.replace(/\*\*(.+?)\*\*/g, "$1").trim();
    if (clean) {
      rows.push({ topic, source_title: title, source_url: "", chunk_idx: 0, text: clean });
      console.log(`  ✓ [${topic}] ${title} (${tok} ток.)`);
    } else {
      console.log(`  ✗ пусто: ${title}`);
    }
  } catch (e) {
    console.log(`  ✗ ошибка: ${title} — ${String(e).slice(0, 100)}`);
  }
  await sleep(300);
}

await writeFile(path.join(DIR, "extended_kb.json"), JSON.stringify(rows, null, 2), "utf8");
console.log(`\nГотово: ${rows.length} тем, ~${totalTok} токенов Nebius (расход гранта).`);
