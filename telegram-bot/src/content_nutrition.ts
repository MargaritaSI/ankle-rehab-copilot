/**
 * Нутриция addsport-бота. Порт nutrition.py.
 *
 * Принципы (из ТЗ):
 *   • не «контроль воли» — а снижение вероятности срыва заранее
 *   • частые маленькие приёмы пищи: белок + объём + вода
 *   • ловить уровни 3–4 (лёгкий голод / шум), не доводить до 6 (срыв)
 *   • перед сладким — сначала добавить насыщение
 *   • метрики: НЕ «ела идеально», А: меньше срывов, больше белка, меньше пиков
 */

// ============================================================================
// КАТЕГОРИИ
// ============================================================================
export const CAT_PROTEIN = "protein";
export const CAT_VOLUME = "volume";
export const CAT_SWEETS = "sweets";
export const CAT_FRIED = "fried";
export const CAT_WATER = "water";

export const CAT_LABEL: Record<string, string> = {
  [CAT_PROTEIN]: "🍗 Белок",
  [CAT_VOLUME]: "🥗 Объём",
  [CAT_SWEETS]: "🍫 Сладкое",
  [CAT_FRIED]: "🍳 Жареное",
  [CAT_WATER]: "💧 Вода",
};

// ============================================================================
// PRESETS — (название, ккал, белок_г, вода_мл)
// ============================================================================
export interface FoodPreset {
  name: string;
  kcal: number;
  protein_g: number;
  water_ml: number;
}

export const PRESETS: Record<string, FoodPreset[]> = {
  [CAT_PROTEIN]: [
    { name: "Греческий йогурт", kcal: 120, protein_g: 17, water_ml: 0 },
    { name: "Творог 5%", kcal: 130, protein_g: 18, water_ml: 0 },
    { name: "Яйца (2 шт)", kcal: 155, protein_g: 13, water_ml: 0 },
    { name: "Куриная грудка 100г", kcal: 160, protein_g: 31, water_ml: 0 },
    { name: "Тунец консерва", kcal: 110, protein_g: 26, water_ml: 0 },
    { name: "Протеиновый напиток", kcal: 150, protein_g: 25, water_ml: 0 },
    { name: "Cottage cheese", kcal: 100, protein_g: 14, water_ml: 0 },
    { name: "Сыр 30г", kcal: 100, protein_g: 7, water_ml: 0 },
  ],
  [CAT_VOLUME]: [
    { name: "Овощи (тарелка)", kcal: 30, protein_g: 2, water_ml: 0 },
    { name: "Суп", kcal: 150, protein_g: 8, water_ml: 0 },
    { name: "Ягоды (200г)", kcal: 70, protein_g: 1, water_ml: 0 },
    { name: "Огурцы / морковь", kcal: 25, protein_g: 1, water_ml: 0 },
    { name: "Попкорн (100г)", kcal: 100, protein_g: 3, water_ml: 0 },
    { name: "Арбуз (200г)", kcal: 60, protein_g: 1, water_ml: 0 },
    { name: "Яблоко", kcal: 90, protein_g: 0, water_ml: 0 },
  ],
  [CAT_SWEETS]: [
    { name: "Тёмный шоколад 30г", kcal: 180, protein_g: 2, water_ml: 0 },
    { name: "Йогурт + ягоды", kcal: 150, protein_g: 8, water_ml: 0 },
    { name: "Протеиновый пудинг", kcal: 180, protein_g: 15, water_ml: 0 },
    { name: "Печенье", kcal: 250, protein_g: 3, water_ml: 0 },
    { name: "Конфета", kcal: 100, protein_g: 1, water_ml: 0 },
    { name: "Мороженое", kcal: 250, protein_g: 4, water_ml: 0 },
  ],
  [CAT_FRIED]: [
    { name: "Жареное мясо 150г", kcal: 340, protein_g: 28, water_ml: 0 },
    { name: "Картошка фри", kcal: 320, protein_g: 4, water_ml: 0 },
    { name: "Жареное яйцо", kcal: 120, protein_g: 6, water_ml: 0 },
    { name: "Жареная курица 150г", kcal: 330, protein_g: 30, water_ml: 0 },
  ],
  [CAT_WATER]: [
    { name: "Стакан 250мл", kcal: 0, protein_g: 0, water_ml: 250 },
    { name: "Большой 500мл", kcal: 0, protein_g: 0, water_ml: 500 },
    { name: "Чай / кофе 250мл", kcal: 0, protein_g: 0, water_ml: 250 },
    { name: "Бутылка 750мл", kcal: 0, protein_g: 0, water_ml: 750 },
  ],
};

// ============================================================================
// ANTI-BINGE по контексту
// ============================================================================
export const ANTI_BINGE: Record<string, { title: string; items: string[] }> = {
  home: {
    title: "🏠 Дома",
    items: [
      "греческий йогурт + ягоды — сладко + белок",
      "творог + мёд — долго держит",
      "яйца + хлебец — стабильность",
      "суп — быстро снижает голод",
      "протеиновый напиток — easy mode",
      "cottage cheese + фрукты — объём",
      "попкорн — объём + жевание",
      "огурцы / морковь — хруст",
      "ягоды — долго есть",
    ],
  },
  outside: {
    title: "🚶 На улице",
    items: [
      "протеиновый батончик — emergency",
      "питьевой йогурт — быстро",
      "банан + орехи — стабильнее",
      "протеиновый пудинг — сытость",
      "сыр + хлебцы — норм в дороге",
    ],
  },
  stress: {
    title: "😵 Стресс / перевозбуждение",
    items: [
      "тёплый суп — успокаивает",
      "йогурт — мягко",
      "овсянка — стабилизирует",
      "банан — безопасный carb",
      "чай + белок — снижение хаоса",
    ],
  },
  evening: {
    title: "🌙 Вечер / сериал",
    items: [
      "попкорн + протеиновый напиток — объём",
      "йогурт + шоколад — меньше срыв",
      "ягоды + творог — сладко",
      "протеиновый пудинг — десерт без хаоса",
      "чай + маленький snack — ритуал",
    ],
  },
};

// ============================================================================
// ШКАЛА СОСТОЯНИЙ 0-6
// ============================================================================
export const STATE_LEVELS: Array<{
  level: number;
  label: string;
  desc: string;
  rec: string;
}> = [
  { level: 0, label: "Переела", desc: "тяжесть, тошно", rec: "🟦 Только вода и пауза. Не наказывай — тело справляется." },
  { level: 1, label: "Слишком сытая", desc: "«не лезет»", rec: "🟦 Ничего не добавляй. Подожди 1–2 часа." },
  { level: 2, label: "Спокойная сытость", desc: "еды не хочется", rec: "🟢 Идеально. Главное — не доводить до сильного голода." },
  { level: 3, label: "Лёгкий голод", desc: "можно поесть спокойно", rec: "🟡 Добавь что-то небольшое с белком: йогурт / яйца / творог / протеин." },
  { level: 4, label: "Пищевой шум", desc: "мысли о еде", rec: "🟠 Мозг ищет быстрый дофамин. Сделай anti-binge snack — белок + объём." },
  { level: 5, label: "Тяга", desc: "хочу всё сладкое", rec: "🔴 Сначала быстро снизь голод: вода + белок + объём. Не «держись» — ешь." },
  { level: 6, label: "Срыв близко", desc: "ем быстро / без контроля", rec: "🚨 Вода → белок → объём в этом порядке. Снизит хаос за 10–15 минут." },
];

export function stateRecommendation(level: number): string {
  const s = STATE_LEVELS.find((x) => x.level === level);
  if (!s) return "";
  return `<b>${s.level}. ${s.label}</b> — <i>${s.desc}</i>\n\n${s.rec}`;
}

// ============================================================================
// АКТИВНОСТЬ + РАСЧЁТ ЦЕЛЕЙ (Mifflin-St Jeor)
// ============================================================================
export const ACTIVITY_LABEL: Record<number, string> = {
  1: "🛌 Низкая (сидячий)",
  2: "🚶 Лёгкая (1–2 тр./нед)",
  3: "🏃 Средняя (3–5 тр./нед)",
  4: "🏋 Высокая (6–7 тр./нед)",
  5: "🔥 Максимум (физ. труд)",
};

const ACTIVITY_FACTOR: Record<number, number> = {
  1: 1.2,
  2: 1.375,
  3: 1.55,
  4: 1.725,
  5: 1.9,
};

export interface NutritionTargets {
  bmr: number;
  maintenance: number;
  deficit: number;
  protein_g: number;
}

/** Mifflin–St Jeor BMR → maintenance / deficit kcal + протеин. */
export function calculateTargets(
  sex: string,
  age: number,
  heightCm: number,
  weightKg: number,
  activity: number,
): NutritionTargets {
  const bmr =
    sex === "m"
      ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
      : 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  const factor = ACTIVITY_FACTOR[activity] ?? 1.2;
  const maintenance = bmr * factor;
  const deficit = maintenance - 250;
  const proteinG = Math.round(weightKg * 1.8);
  return {
    bmr: Math.round(bmr),
    maintenance: Math.round(maintenance / 10) * 10,
    deficit: Math.round(deficit / 10) * 10,
    protein_g: proteinG,
  };
}
