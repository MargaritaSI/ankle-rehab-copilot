/**
 * Генерация СЦЕНАРИЕВ-ПРОГНОЗОВ под операцию (OAT таранной кости, донор — колено)
 * на Nebius (большая модель = расход гранта). Каждый сценарий ЗАЗЕМЛЁН на реальные
 * отрывки уже собранной базы (scripts/leg_kb/*.json) + логика модели.
 *
 * Результат → scripts/leg_kb/scenarios_predictions.json (дольётся в KB при ingest).
 *
 * Запуск:  node scripts/gen_scenarios.mjs
 * Ключ Nebius берётся из ../marketing/.dev.vars (как в остальных скриптах).
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";

const DIR = path.join(import.meta.dirname, "leg_kb");
const NEBIUS_URL = "https://api.tokenfactory.nebius.com/v1/chat/completions";
const MODEL = "deepseek-ai/DeepSeek-V4-Pro"; // сильная модель — и качество, и расход гранта
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Достаём ключ из marketing/.dev.vars (не печатаем).
async function nebiusKey() {
  const envFile = path.join(import.meta.dirname, "..", "..", "marketing", ".dev.vars");
  const raw = await readFile(envFile, "utf8");
  const line = raw.split("\n").find((l) => l.startsWith("NEBIUS_API_KEY="));
  if (!line) throw new Error("NEBIUS_API_KEY не найден в marketing/.dev.vars");
  return line.slice("NEBIUS_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
}

// Сэмпл текста-заземления из указанных файлов базы.
async function grounding(files, maxChars = 5000) {
  let out = [];
  for (const f of files) {
    try {
      const rows = JSON.parse(await readFile(path.join(DIR, f), "utf8"));
      for (const r of rows.slice(0, 6)) out.push(`(${r.source_title}) ${r.text}`);
    } catch {
      /* нет файла — пропускаем */
    }
  }
  return out.join("\n\n").slice(0, maxChars);
}

// Действия/ситуации, по которым делаем сценарий-прогноз. topics = файлы-заземление.
const ACTIONS = [
  { a: "Ранняя полная нагрузка на ногу (ходьба без костылей) до 6 недель", t: ["talus_oat_rehab.json", "cartilage_longevity.json"] },
  { a: "Постепенный возврат к полной нагрузке по протоколу (6–12 недель)", t: ["talus_oat_rehab.json"] },
  { a: "Бег и прыжки (ударные нагрузки) в первые 6 месяцев", t: ["cartilage_longevity.json", "talus_oat_rehab.json"] },
  { a: "Низкоударные тренировки: велотренажёр, плавание, эллипс", t: ["talus_oat_rehab.json", "cartilage_longevity.json"] },
  { a: "Упражнения на объём движений (ROM) голеностопа с ранних недель", t: ["talus_oat_rehab.json"] },
  { a: "Силовые на икры, стопу и голень для поддержки сустава", t: ["talus_oat_rehab.json", "cartilage_longevity.json"] },
  { a: "Снижение лишнего веса для разгрузки сустава", t: ["cartilage_longevity.json"] },
  { a: "Противовоспалительный протокол питания (омега-3, овощи, меньше сахара/ультрапереработки)", t: ["nutrition_supplements.json"] },
  { a: "Коллаген/желатин + витамин C перед реабилитацией", t: ["nutrition_supplements.json"] },
  { a: "Достаточный белок в рационе для заживления", t: ["nutrition_supplements.json"] },
  { a: "Витамин D и кальций для кости и интеграции трансплантата", t: ["nutrition_supplements.json"] },
  { a: "Курение и алкоголь во время восстановления", t: ["nutrition_supplements.json"] },
  { a: "Регулярный приём НПВП во время сращения кости", t: ["nutrition_supplements.json"] },
  { a: "Бережная нагрузка на донорское колено", t: ["donor_knee.json", "cartilage_longevity.json"] },
  { a: "Глюкозамин/хондроитин как добавка", t: ["nutrition_supplements.json"] },
  { a: "Подъёмы на носки и укрепление икроножных мышц", t: ["talus_oat_rehab.json", "cartilage_longevity.json"] },
  { a: "Тренировка баланса и проприоцепции на одной ноге", t: ["talus_oat_rehab.json"] },
  { a: "Сгибание/разгибание голеностопа с эластичной лентой", t: ["talus_oat_rehab.json"] },
  { a: "Возврат к силовым тренировкам на ноги в спортзале", t: ["talus_oat_rehab.json", "cartilage_longevity.json"] },
  { a: "Велотренажёр с постепенно растущим сопротивлением", t: ["talus_oat_rehab.json", "cartilage_longevity.json"] },
  { a: "Куркумин/куркума как противовоспалительная добавка", t: ["nutrition_supplements.json"] },
  { a: "Магний и витамин K2 для костной ткани", t: ["nutrition_supplements.json"] },
  { a: "Избыток сахара и ультрапереработанной еды", t: ["nutrition_supplements.json"] },
  { a: "Полный отказ от реабилитационных упражнений (бездействие)", t: ["talus_oat_rehab.json", "cartilage_longevity.json"] },
  { a: "Слишком интенсивная реабилитация без дней отдыха", t: ["talus_oat_rehab.json"] },
  { a: "Контроль отёка: лёд и возвышение ноги в раннем периоде", t: ["talus_oat_rehab.json"] },
  { a: "Высокие дозы омега-3 против умеренных", t: ["nutrition_supplements.json"] },
];

const SYSTEM = `Ты — клинически грамотный ассистент по реабилитации после костно-хрящевой аутотрансплантации (OAT/мозаикопластика) купола ТАРАННОЙ КОСТИ голеностопа; донор хряща — колено пациента. Тебе дают ДЕЙСТВИЕ/ситуацию и ОТРЫВКИ из реальных источников. Составь практический СЦЕНАРИЙ-ПРОГНОЗ по-русски:

- Если делать это правильно/по протоколу — что вероятно произойдёт (польза, механизм, примерные сроки).
- Если переборщить / делать слишком рано / неправильно — что будет (риски, механизм).
- Если не делать вовсе — чего НЕ будет / что упустишь.
- Связь с противовоспалительным протоколом и питанием, где уместно.

Опирайся на отрывки и достраивай логикой; помечай «(из источника)» либо «(предположение)». Конкретно, без воды и без банальностей «обратитесь к врачу». 180–320 слов.`;

async function gen(key, action, ground) {
  const body = {
    model: MODEL,
    temperature: 0.5,
    max_tokens: 1100,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Действие/ситуация: ${action}\n\nОтрывки из источников:\n${ground}` },
    ],
  };
  const res = await fetch(NEBIUS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Nebius ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return { text: j.choices?.[0]?.message?.content ?? "", usage: j.usage };
}

const key = await nebiusKey();
const rows = [];
let totalTokens = 0;
for (const { a, t } of ACTIONS) {
  const ground = await grounding(t);
  try {
    const { text, usage } = await gen(key, a, ground);
    totalTokens += usage?.total_tokens ?? 0;
    if (text.trim()) {
      rows.push({
        topic: "scenarios_predictions",
        source_title: `Сценарий-прогноз: ${a}`,
        source_url: "", // синтетика на основе базы — не реальная статья
        chunk_idx: 0,
        text: text.trim(),
      });
      console.log(`  ✓ ${a}  (${usage?.total_tokens ?? "?"} ток.)`);
    } else {
      console.log(`  ✗ пусто: ${a}`);
    }
  } catch (e) {
    console.log(`  ✗ ошибка: ${a} — ${String(e).slice(0, 120)}`);
  }
  await sleep(400);
}

await writeFile(path.join(DIR, "scenarios_predictions.json"), JSON.stringify(rows, null, 2), "utf8");
console.log(`\nГотово: ${rows.length} сценариев, ~${totalTokens} токенов Nebius (расход гранта).`);
