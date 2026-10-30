/**
 * RAG по ноге: вопрос → embedding → поиск ближайших кусочков базы знаний
 * (косинус прямо в Worker) → ответ моделью СТРОГО по найденному.
 *
 * Тяжёлое (embeddings + генерация) считает Nebius; хранилище — D1; Cloudflare
 * считает только косинус по небольшой базе (сотни-тысячи чанков — это дёшево).
 */

import type { D1Database } from "@cloudflare/workers-types";
import type { Env } from "./env";
import { embed, generate } from "./ai";

export interface KbHit {
  id: number;
  topic: string;
  source_title: string;
  source_url: string;
  text: string;
  score: number;
}

/** Косинусная близость двух векторов. Возвращает 0, если вектор нулевой/пустой. */
export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

interface KbRow {
  id: number;
  topic: string;
  source_title: string;
  source_url: string;
  text: string;
  embedding: string;
}

/**
 * Топ-k кусочков базы по косинусной близости к вектору запроса.
 * По умолчанию отдаёт только scope='general'; чанки про конкретного пациента
 * (scope='personal') — только если includePersonal (владелец бота).
 */
export async function searchKb(
  db: D1Database,
  queryVec: number[],
  k = 5,
  opts: { includePersonal?: boolean } = {},
): Promise<KbHit[]> {
  const sql = opts.includePersonal
    ? "SELECT id, topic, source_title, source_url, text, embedding FROM leg_kb"
    : "SELECT id, topic, source_title, source_url, text, embedding FROM leg_kb WHERE scope = 'general'";
  const { results } = await db.prepare(sql).all<KbRow>();
  const scored: KbHit[] = [];
  for (const r of results ?? []) {
    let vec: number[];
    try {
      vec = JSON.parse(r.embedding) as number[];
    } catch {
      continue; // битый embedding — пропускаем, базу не роняем
    }
    scored.push({
      id: r.id,
      topic: r.topic,
      source_title: r.source_title,
      source_url: r.source_url,
      text: r.text,
      score: cosine(queryVec, vec),
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

export const SYSTEM = `Ты — помощник по реабилитации после операции на хряще (костно-хрящевая аутотрансплантация / мозаикопластика купола таранной кости голеностопа; донор хряща — колено). Тебе дают ВОПРОС и ОТРЫВКИ из базы знаний. Ты НЕ врач и не заменяешь врача.

ГЛАВНОЕ ПРАВИЛО — отвечай ТОЛЬКО по отрывкам. Любой факт, число, срок, упражнение и совет должны прямо следовать из текста отрывков. Ничего не додумывай, не домысливай «клинической логикой», не пользуйся собственными знаниями и не пиши «вероятно/скорее всего» там, где в отрывках этого нет.

Если отрывки не отвечают на вопрос (другой диагноз, другой сустав, позвоночник и грыжи, лекарства и назначения, что угодно вне базы) — так и скажи одной-двумя фразами: «В базе по ноге про это ничего нет» — и добавь, что это вопрос к лечащему врачу или физиотерапевту. Не давай советов «на всякий случай» и не пересказывай отрывки, которые к вопросу не относятся.

Сроки и разрешения. Никогда не говори человеку, когда ему можно бегать, прыгать, нагружать ногу полностью, возвращаться к спорту, и не пиши «через N месяцев» как личное разрешение. Если в отрывке С ИСТОЧНИКОМ есть такой срок, передай его только так: «в исследовании <название источника> пациентам разрешали … через …» — это не совет этому человеку, решение о нагрузке принимает хирург.

Метки отрывков. У каждого отрывка есть метка. «источник: …» — отрывок со ссылкой на первоисточник. «без первоисточника» — отрывок написан автором базы без ссылки на исследование: из него можно брать только общие формулировки и бытовые практические подсказки, но НИКОГДА сроки, дозировки и «что разрешено или запрещено».

Если отрывки покрывают вопрос, строй ответ кратко: 1) разбор ситуации (что описал человек и что об этом сказано в отрывках); 2) что делать — только то, что есть в отрывках; 3) правило отёка, если оно есть в отрывках: припухлость или боль, которая держится дольше суток или есть с утра, — сигнал перегруза, нагрузку откатить на шаг; 4) красные флаги, когда не тянуть и идти к хирургу: резко нарастающий отёк, покраснение, жар, блок или нестабильность сустава, резкая боль, онемение. Дозировки и назначения — не предписание, а справка из источника.

Формат: по-русски, тепло и конкретно, 300–500 слов, обязательно закончи ответ, не обрывайся. Пиши ПРОСТЫМ текстом для Телеграма: НИКАКИХ Markdown-таблиц, без «**» и «#», короткие абзацы и списки через «•» или «—».`;

/**
 * Контекст для модели. Чанки без source_url — синтетические (написаны LLM, без
 * первоисточника) — помечаются отдельно, чтобы модель не брала из них сроки/дозировки.
 */
export function buildContext(hits: KbHit[]): string {
  return hits
    .map((h, i) => {
      const label = h.source_url
        ? `источник: ${h.source_title}`
        : "без первоисточника";
      return `[Отрывок ${i + 1} — ${label}]\n${h.text}`;
    })
    .join("\n\n");
}

const DISCLAIMER =
  "⚠️ Это образовательная информация и рассуждение модели, не замена консультации врача или физиотерапевта.";

export interface LegAnswer {
  text: string;
  sources: { title: string; url: string }[];
  empty: boolean;
}

/** Полный RAG-цикл по ноге. Бросает NebiusError наверх (вызывающий ловит). */
export async function answerLeg(
  env: Env,
  question: string,
  opts: { personal?: boolean } = {},
): Promise<LegAnswer> {
  const qvec = await embed(env.AI, question);
  const hits = await searchKb(env.DB, qvec, 8, {
    includePersonal: opts.personal === true,
  });
  if (hits.length === 0) {
    return {
      text: "В базе знаний по ноге пока нет материалов. Загрузи источники — и я смогу отвечать по ним.",
      sources: [],
      empty: true,
    };
  }

  const context = buildContext(hits);

  const answer = await generate(
    env.NEBIUS_API_KEY,
    [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Вопрос: ${question}\n\nОтрывки из источников:\n${context}`,
      },
    ],
    { max_tokens: 1300, temperature: 0.2 },
  );

  // Уникальные источники в порядке релевантности.
  const seen = new Set<string>();
  const sources: { title: string; url: string }[] = [];
  for (const h of hits) {
    const key = h.source_url || h.source_title; // у сценариев url пустой → дедупим по названию
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({ title: h.source_title, url: h.source_url });
  }

  // Гарантируем дисклеймер, даже если модель его не добавила.
  const text = answer.includes("врача") ? answer : `${answer}\n\n${DISCLAIMER}`;
  return { text, sources, empty: false };
}
