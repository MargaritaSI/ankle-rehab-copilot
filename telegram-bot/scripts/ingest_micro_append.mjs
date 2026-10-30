/**
 * Заливает ТОЛЬКО micro_movement_routine.json в живой addsport-bot БЕЗ reset
 * (append: не стирает существующий корпус, не трогает чужие in-progress файлы).
 * Worker сам считает embeddings.
 *
 * Запуск:
 *   INGEST_SECRET="<= WEBHOOK_SECRET бота>" node scripts/ingest_micro_append.mjs
 *   # WORKER_URL по умолчанию https://addsport-bot.<your-subdomain>.workers.dev
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

const WORKER_URL = process.env.WORKER_URL || "https://addsport-bot.<your-subdomain>.workers.dev";
const SECRET = process.env.INGEST_SECRET;
if (!SECRET) {
  console.error("Нужен env INGEST_SECRET (= WEBHOOK_SECRET бота).");
  process.exit(1);
}

// Имя файла можно передать аргументом, иначе — micro_movement_routine.json.
// Напр.: node scripts/ingest_micro_append.mjs ocd_talus_rehab.json
const fname = process.argv[2] || "micro_movement_routine.json";
const file = path.join(import.meta.dirname, "leg_kb", fname);
const chunks = JSON.parse(await readFile(file, "utf8"));
console.log(`Файл ${fname}: чанков к добавлению (append, без reset): ${chunks.length}`);

const endpoint = `${WORKER_URL.replace(/\/$/, "")}/admin/ingest`;
const BATCH = 20;
let done = 0;
for (let i = 0; i < chunks.length; i += BATCH) {
  const slice = chunks.slice(i, i + BATCH);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Ingest-Secret": SECRET },
    body: JSON.stringify({ chunks: slice, reset: false }), // reset:false = только добавить
  });
  const txt = await res.text();
  if (!res.ok) {
    console.error(`Батч ${i}-${i + slice.length}: HTTP ${res.status} ${txt.slice(0, 200)}`);
    process.exit(1);
  }
  done += slice.length;
  console.log(`  залито ${done}/${chunks.length}`);
}
console.log(`Готово: +${done} чанков micro_movement в leg_kb (без стирания).`);
