/**
 * Заливает собранный корпус (scripts/leg_kb/*.json) в развёрнутый addsport-bot
 * через guarded-роут /admin/ingest. Worker сам считает embeddings (Workers AI)
 * и пишет в D1 — поэтому векторы совместимы с запросами. Локально ничего не считаем.
 *
 * Запуск:
 *   WORKER_URL="https://addsport-bot.<твой-сабдомен>.workers.dev" \
 *   INGEST_SECRET="<= WEBHOOK_SECRET бота>" \
 *   node scripts/ingest_to_worker.mjs
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const DIR = path.join(import.meta.dirname, "leg_kb");
const WORKER_URL = process.env.WORKER_URL;
const SECRET = process.env.INGEST_SECRET;
const BATCH = 20;

if (!WORKER_URL || !SECRET) {
  console.error("Нужны env: WORKER_URL и INGEST_SECRET (= WEBHOOK_SECRET бота).");
  process.exit(1);
}

const files = (await readdir(DIR)).filter((f) => f.endsWith(".json"));
const all = [];
for (const f of files) {
  const rows = JSON.parse(await readFile(path.join(DIR, f), "utf8"));
  all.push(...rows);
}
console.log(`Чанков к заливке: ${all.length} из ${files.length} файлов`);

const endpoint = `${WORKER_URL.replace(/\/$/, "")}/admin/ingest`;
let done = 0;
for (let i = 0; i < all.length; i += BATCH) {
  const chunks = all.slice(i, i + BATCH);
  const reset = i === 0; // первый батч чистит таблицу
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Ingest-Secret": SECRET },
    body: JSON.stringify({ chunks, reset }),
  });
  const txt = await res.text();
  if (!res.ok) {
    console.error(`Батч ${i}-${i + chunks.length}: HTTP ${res.status} ${txt.slice(0, 200)}`);
    process.exit(1);
  }
  done += chunks.length;
  console.log(`  залито ${done}/${all.length} ${reset ? "(reset)" : ""}`);
}
console.log(`Готово: ${done} чанков в leg_kb.`);
