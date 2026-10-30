/**
 * Фактчек синтетических записей базы (scenarios_predictions.json + extended_kb.json)
 * на самой сильной модели Nebius (DeepSeek-V4-Pro). Находит мед-ошибки, бессмыслицу
 * (напр. «подъёмы плеч на ногу»), опасные/необоснованные советы — и переписывает
 * с конкретными ВЕРНЫМИ примерами. Исправленные тексты пишутся обратно в файлы.
 *
 * Запуск:  node scripts/factcheck_kb.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DIR = path.join(import.meta.dirname, "leg_kb");
const NEBIUS_URL = "https://api.tokenfactory.nebius.com/v1/chat/completions";
const MODEL = "deepseek-ai/DeepSeek-V4-Pro"; // самая сильная — качество фактчека + расход гранта
// Можно указать один файл аргументом: node factcheck_kb.mjs extended_kb.json
const FILES = process.argv[2] ? [process.argv[2]] : ["scenarios_predictions.json", "extended_kb.json"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function nebiusKey() {
  const envFile = path.join(import.meta.dirname, "..", "..", "marketing", ".dev.vars");
  const raw = await readFile(envFile, "utf8");
  const line = raw.split("\n").find((l) => l.startsWith("NEBIUS_API_KEY="));
  return line.slice("NEBIUS_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
}

const SYSTEM = `Ты — придирчивый медицинский фактчекер и реабилитолог. Проверяешь ОБУЧАЮЩИЙ текст для женщины 35+ после костно-хрящевой аутотрансплантации (мозаикопластики) купола таранной кости голеностопа (донорский хрящ взят из колена). Цель пациента: заживление, разгрузка сустава, без ударных нагрузок.

Найди в тексте:
- фактические/медицинские ошибки и устаревшие/необоснованные утверждения;
- БЕССМЫСЛИЦУ и перепутанные части тела/движения (напр. «подъёмы плеч на ногу», неверная анатомия);
- опасные советы (ударные нагрузки рано, рискованные дозы, вредные рекомендации);
- выдуманные точные цифры и внутренние противоречия;
- слишком обобщённые/пустые места, где не хватает конкретики.

Верни СТРОГО валидный JSON (без markdown):
{
  "verdict": "ok" | "fix",
  "issues": ["краткий список найденных проблем; [] если всё корректно"],
  "corrected_text": "если verdict=fix — ПОЛНОСТЬЮ исправленный и улучшенный текст; иначе пустая строка"
}

Требования к corrected_text: тот же простой человеческий язык, БЕЗ таблиц, без «**» и «#», 150–280 слов, с КОНКРЕТНЫМИ и ВЕРНЫМИ примерами (упражнения/продукты). При сомнении в безопасности — переписывай консервативно. Дозы — как общие сведения, не предписание. По-русски.`;

function parseJson(s) {
  try { return JSON.parse(s); } catch {}
  const m = s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

async function check(key, title, text) {
  const res = await fetch(NEBIUS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      max_tokens: 1500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Заголовок: ${title}\n\nТекст для проверки:\n${text}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Nebius ${res.status}: ${(await res.text()).slice(0, 150)}`);
  const j = await res.json();
  return { parsed: parseJson(j.choices?.[0]?.message?.content ?? ""), tok: j.usage?.total_tokens ?? 0 };
}

const key = await nebiusKey();
let okCount = 0, fixCount = 0, errCount = 0, totalTok = 0;

for (const file of FILES) {
  const fp = path.join(DIR, file);
  const rows = JSON.parse(await readFile(fp, "utf8"));
  console.log(`\n===== ${file}: ${rows.length} записей =====`);
  for (const r of rows) {
    if (r._fc) { okCount++; continue; } // уже проверено в прошлый прогон — пропускаем
    try {
      const { parsed, tok } = await check(key, r.source_title, r.text);
      totalTok += tok;
      if (!parsed) { errCount++; console.log(`  ? не распарсил: ${r.source_title}`); continue; }
      if (parsed.verdict === "fix" && parsed.corrected_text && parsed.corrected_text.length > 80) {
        r.text = parsed.corrected_text.replace(/\*\*(.+?)\*\*/g, "$1").trim();
        fixCount++;
        console.log(`  ✏️  ИСПРАВЛЕНО: ${r.source_title}`);
        for (const is of (parsed.issues || []).slice(0, 3)) console.log(`        – ${is}`);
      } else {
        okCount++;
      }
      r._fc = true;
      await writeFile(fp, JSON.stringify(rows, null, 2), "utf8"); // инкрементально — kill-safe
    } catch (e) {
      errCount++;
      console.log(`  ✗ ошибка: ${r.source_title} — ${String(e).slice(0, 90)}`);
    }
    await sleep(300);
  }
  await writeFile(fp, JSON.stringify(rows, null, 2), "utf8");
  console.log(`  → ${file} перезаписан`);
}

console.log(`\nИТОГ: ok=${okCount}, исправлено=${fixCount}, ошибок_проверки=${errCount}, ~${totalTok} токенов Nebius.`);
