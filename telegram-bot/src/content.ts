/**
 * Полный контент addsport-бота. Порт data.py — полные EXERCISES (90+), все
 * SITUATIONS, MODES, BLOCKS, ABS_CATEGORIES, GOAL_TEMPLATES + хелперы.
 *
 * Нутриция (PRESETS, ANTI_BINGE, STATE_LEVELS, calculateTargets) — в content_nutrition.ts.
 */

import { filterSafe } from "./safety";

export interface ExerciseData {
  name: string;
  how: string;
  position: "lying" | "sitting" | "standing" | "walking" | "any" | "kneeling";
  attention: boolean;
  target: string;
  duration_sec: number;
}

export const EXERCISES: Record<string, ExerciseData> = {
  // 🛏 ЛЁЖА
  L1: { name: "Ягодицы — сжатие", how: "сжать 2–3 сек → отпустить ×10", position: "lying", attention: false, target: "ягодицы", duration_sec: 30 },
  L2: { name: "Пресс — напряжение", how: "втянуть живот 10 сек", position: "lying", attention: true, target: "пресс", duration_sec: 30 },
  L3: { name: "Стопа туда/обратно", how: "носок на себя/от себя ×15", position: "lying", attention: false, target: "суставы", duration_sec: 30 },
  L4: { name: "Подъём ноги", how: "прямая нога вверх 10–20 см ×10", position: "lying", attention: true, target: "квадрицепс", duration_sec: 45 },
  L5: { name: "Джейкобсон — скан тела", how: "сжать тело → расслабить ×5", position: "lying", attention: true, target: "релакс", duration_sec: 60 },
  L6: { name: "Квадрицепс — удержание", how: "выпрямить ногу 5–10 сек ×5", position: "lying", attention: true, target: "квадрицепс", duration_sec: 45 },
  L7: { name: "Колено вниз", how: "вдавить колено в поверхность 5 сек ×5", position: "lying", attention: true, target: "квадрицепс", duration_sec: 30 },
  L8: { name: "Микро-мост", how: "слегка приподнять таз ×10", position: "lying", attention: true, target: "ягодицы", duration_sec: 45 },

  // 🪑 СИДЯ
  S1: { name: "Пресс микро", how: "втянуть 10 сек ×3", position: "sitting", attention: false, target: "пресс", duration_sec: 30 },
  S2: { name: "Лопатки", how: "свести 5–10 сек ×5", position: "sitting", attention: true, target: "осанка", duration_sec: 45 },
  S3: { name: "Стопа педаль", how: "вверх/вниз ×15", position: "sitting", attention: false, target: "суставы", duration_sec: 30 },
  S4: { name: "Пальцы ног", how: "«собрать» ×10", position: "sitting", attention: false, target: "стопа", duration_sec: 30 },
  S5: { name: "Гантели", how: "медленно вверх/вниз ×10", position: "sitting", attention: false, target: "руки", duration_sec: 45 },
  S6: { name: "Икры сидя", how: "пятки вверх ×15", position: "sitting", attention: false, target: "икры", duration_sec: 30 },
  S7: { name: "Нога — удержание", how: "выпрямить и держать 5–10 сек ×5", position: "sitting", attention: true, target: "квадрицепс", duration_sec: 45 },
  S8: { name: "Пульс ноги", how: "микро-движения вверх-вниз ×20", position: "sitting", attention: false, target: "квадрицепс", duration_sec: 30 },

  // 📺 БЕЗ ФОКУСА
  F1: { name: "Ягодицы пульс", how: "быстро сжимать ×20", position: "any", attention: false, target: "ягодицы", duration_sec: 30 },
  F2: { name: "Икры подъёмы", how: "вверх/вниз ×15", position: "any", attention: false, target: "икры", duration_sec: 30 },
  F3: { name: "Гантели — удержание", how: "держать 10–20 сек", position: "sitting", attention: false, target: "руки", duration_sec: 30 },
  F4: { name: "Пресс коротко", how: "напряг/отпустил ×10", position: "any", attention: false, target: "пресс", duration_sec: 30 },

  // 🚶 СТОЯ
  ST1: { name: "Ягодицы стоя", how: "сжать 5 сек ×5", position: "standing", attention: false, target: "ягодицы", duration_sec: 30 },
  ST2: { name: "Баланс на одной ноге", how: "1 нога 10 сек, поменять", position: "standing", attention: true, target: "стабилизация", duration_sec: 30 },
  ST3: { name: "Икры стоя", how: "вверх/вниз ×15", position: "standing", attention: false, target: "икры", duration_sec: 30 },
  ST4: { name: "Осанка", how: "вытянуться макушкой вверх 10 сек ×3", position: "standing", attention: true, target: "осанка", duration_sec: 45 },

  // 🚶 ХОДЬБА
  W1: { name: "Шаг от ягодицы", how: "включать ягодицу при каждом шаге", position: "walking", attention: true, target: "ягодицы", duration_sec: 60 },
  W2: { name: "Пресс на ходу", how: "лёгкое напряжение", position: "walking", attention: true, target: "пресс", duration_sec: 60 },
  W3: { name: "Дыхание на прогулке", how: "вдох носом / длинный выдох", position: "walking", attention: true, target: "восстановление", duration_sec: 60 },

  // 🦵 РЕАБИЛИТАЦИЯ
  R1: { name: "Полуподъём ноги", how: "вверх/вниз ×10", position: "any", attention: true, target: "квадрицепс", duration_sec: 45 },
  R2: { name: "Пульс квадрицепса", how: "микро ×20", position: "sitting", attention: false, target: "квадрицепс", duration_sec: 30 },
  R3: { name: "Стопа — круг", how: "вращение ×10 в обе стороны", position: "any", attention: false, target: "голеностоп", duration_sec: 30 },
  R4: { name: "Пауза стопы", how: "натянуть и держать 3 сек ×8", position: "any", attention: true, target: "суставы", duration_sec: 30 },
  R5: { name: "Давление стопой", how: "мягко давить вниз 5 сек ×5", position: "sitting", attention: true, target: "стабилизация", duration_sec: 30 },
  R6: { name: "Медленный диапазон", how: "очень медленное движение ×8", position: "any", attention: true, target: "суставы", duration_sec: 45 },
  R8: { name: "Анти-боль диапазон", how: "двигаться только где комфорт ×8", position: "any", attention: true, target: "суставы", duration_sec: 30 },
  R9: { name: "Микро-круг", how: "очень маленький круг ×10", position: "any", attention: true, target: "суставы", duration_sec: 30 },
  R10: { name: "Дыхание + сустав", how: "движение на выдохе ×8", position: "any", attention: true, target: "суставы", duration_sec: 45 },
  R11: { name: "Разделение движения", how: "только колено / только стопа ×10", position: "any", attention: true, target: "суставы", duration_sec: 45 },
  R12: { name: "Ритм сустава", how: "одинаковый темп — 30 сек", position: "any", attention: true, target: "суставы", duration_sec: 30 },
  R13: { name: "Синхрон ноги", how: "две ноги одновременно ×10", position: "any", attention: true, target: "суставы", duration_sec: 30 },

  // 🦵 КВАДРИЦЕПС
  Q1: { name: "Напряг → микро-отпускание", how: "напрячь бедро → чуть отпустить → снова ×15", position: "sitting", attention: true, target: "квадрицепс", duration_sec: 45 },
  Q2: { name: "Двойное удержание", how: "5 сек держишь → 2 сек сильнее → отпустил ×5", position: "sitting", attention: true, target: "квадрицепс", duration_sec: 45 },
  Q4: { name: "Колено вперёд", how: "сидя: слегка выдвинуть колено, держать 5 сек ×5", position: "sitting", attention: true, target: "квадрицепс", duration_sec: 30 },
  Q5: { name: "Пульс с паузой", how: "маленькие движения ×10 → пауза 3 сек × 2 круга", position: "sitting", attention: true, target: "квадрицепс", duration_sec: 45 },
  Q6: { name: "Крест-активация", how: "левая нога + правый пресс 5 сек, поменять", position: "sitting", attention: true, target: "квадрицепс", duration_sec: 45 },
  Q7: { name: "Стопа + квадрицепс", how: "носок на себя → включить бедро ×10", position: "sitting", attention: true, target: "квадрицепс", duration_sec: 45 },
  Q8: { name: "Вибрация мышцы", how: "напрячь → микро-тряска 10–15 сек × 2", position: "any", attention: false, target: "квадрицепс", duration_sec: 30 },

  // 🍑 ЯГОДИЦЫ
  G1: { name: "Лестница напряжения", how: "слабое → среднее → сильное → отпустить ×5", position: "any", attention: true, target: "ягодицы", duration_sec: 45 },
  G2: { name: "Длинное удержание", how: "держать 15–20 сек × 2", position: "any", attention: true, target: "ягодицы", duration_sec: 45 },
  G3: { name: "Одна сторона + пауза", how: "левая 5 сек → пауза → правая ×3", position: "any", attention: true, target: "ягодицы", duration_sec: 45 },
  G4: { name: "Ягодицы + стопы", how: "сжать ягодицы + слегка давить стопами 5 сек ×5", position: "any", attention: true, target: "ягодицы", duration_sec: 45 },
  G5: { name: "Ягодицы в дыхании", how: "на выдохе сжать ×8", position: "any", attention: true, target: "ягодицы", duration_sec: 45 },
  G6: { name: "Пульс + удержание", how: "20 быстрых → 5 сек держать × 2", position: "any", attention: false, target: "ягодицы", duration_sec: 45 },
  G7: { name: "Микро-сдвиг таза", how: "сидя: слегка наклонить таз ×8", position: "sitting", attention: true, target: "ягодицы", duration_sec: 30 },
  G8: { name: "Ягодицы + баланс", how: "стоишь → сместить вес → включить ×5", position: "standing", attention: true, target: "ягодицы", duration_sec: 45 },

  // 🦶 СТОПА / ГОЛЕНОСТОП
  FT1: { name: "Раздельные пальцы", how: "двигать большим отдельно ×10", position: "any", attention: true, target: "стопа", duration_sec: 30 },
  FT3: { name: "Перекат микро", how: "пятка → носок очень маленько ×15", position: "any", attention: true, target: "голеностоп", duration_sec: 30 },
  FT4: { name: "Внутрь / наружу", how: "наклон стопы внутрь/наружу ×10", position: "any", attention: true, target: "голеностоп", duration_sec: 30 },
  FT6: { name: "Стопа + пауза дыхания", how: "напряг → выдох → держать 3 сек ×5", position: "any", attention: true, target: "стопа", duration_sec: 30 },
  FT8: { name: "Стопа + икры", how: "поднял пятки → держишь → медленно вниз ×8", position: "standing", attention: true, target: "икры", duration_sec: 45 },

  // 📐 ОСАНКА
  P1: { name: "Вытянуть макушку", how: "10 сек × 3", position: "any", attention: true, target: "осанка", duration_sec: 30 },
  P2: { name: "Лопатки вниз", how: "не сводить, а опустить — 5 сек ×5", position: "any", attention: true, target: "осанка", duration_sec: 30 },
  P3: { name: "Грудная клетка вверх", how: "микро-раскрытие 5 сек ×5", position: "any", attention: true, target: "осанка", duration_sec: 30 },
  P4: { name: "Подбородок назад", how: "анти «шея вперёд» ×8", position: "any", attention: true, target: "осанка", duration_sec: 30 },
  P5: { name: "Лопатки + дыхание", how: "вдох → раскрытие, выдох → удержание ×5", position: "any", attention: true, target: "осанка", duration_sec: 45 },
  P6: { name: "Стена воображаемая", how: "как будто спина к стене 10 сек ×3", position: "standing", attention: true, target: "осанка", duration_sec: 45 },
  P7: { name: "Плечи назад микро", how: "очень маленькое движение ×15", position: "any", attention: true, target: "осанка", duration_sec: 30 },
  P8: { name: "Осанка + пресс", how: "вытянулся + втянул живот 5 сек ×5", position: "any", attention: true, target: "осанка", duration_sec: 45 },

  // 💪 ПРЕСС (без перегруза)
  C2: { name: "Нижний пресс", how: "втянуть низ живота отдельно ×5", position: "any", attention: true, target: "пресс", duration_sec: 30 },
  C3: { name: "Пресс + выдох", how: "длинный выдох → включить ×5", position: "any", attention: true, target: "пресс", duration_sec: 45 },
  C4: { name: "Волна живота", how: "втянуть сверху → снизу ×5", position: "any", attention: true, target: "пресс", duration_sec: 45 },
  C5: { name: "Пресс 50%", how: "лёгкое напряжение, не максимум — 30 сек", position: "any", attention: false, target: "пресс", duration_sec: 30 },
  C6: { name: "Крест: пресс + ягодицы", how: "одновременно держать 5–10 сек ×5", position: "any", attention: true, target: "пресс", duration_sec: 45 },
  C7: { name: "Пресс + пауза", how: "10 сек → пауза → ещё 10", position: "any", attention: true, target: "пресс", duration_sec: 30 },
  C8: { name: "Анти-расслабление", how: "лёгкий тонус постоянно 30 сек", position: "any", attention: false, target: "пресс", duration_sec: 30 },

  // ⚖ БАЛАНС
  B1: { name: "Перенос веса", how: "левая → правая ×10", position: "standing", attention: true, target: "стабилизация", duration_sec: 30 },
  B2: { name: "1 нога + опора", how: "держаться рукой 10 сек × 2", position: "standing", attention: true, target: "стабилизация", duration_sec: 30 },
  B3: { name: "Микро-качание", how: "вперёд-назад очень мягко ×10", position: "standing", attention: true, target: "стабилизация", duration_sec: 30 },
  B5: { name: "Глаза + баланс", how: "закрыть глаза на 3 сек ×5 (с опорой)", position: "standing", attention: true, target: "стабилизация", duration_sec: 30 },
  B8: { name: "Реакция", how: "слегка дёрнуться → стабилизировать ×5", position: "standing", attention: true, target: "стабилизация", duration_sec: 30 },

  // === 25 УПРАЖНЕНИЙ НА ПРЕСС (AB1-AB25) ===
  AB1: { name: "Пресс у стены", how: "встать спиной, прижать поясницу + втянуть живот, держать 10–20 сек", position: "standing", attention: true, target: "пресс", duration_sec: 30 },
  AB2: { name: "Ладони в стену (анти-движение)", how: "упереться руками в стену и давить + напрячь пресс 10 сек × 3", position: "standing", attention: true, target: "пресс", duration_sec: 45 },
  AB3: { name: "Подъём колена стоя (мягкий)", how: "поднять колено до комфорта + включить пресс, смена ног ×8", position: "standing", attention: true, target: "пресс", duration_sec: 45 },
  AB4: { name: "Махи руками + пресс", how: "махи руками вперёд/назад, живот подтянут, ×10", position: "standing", attention: true, target: "пресс", duration_sec: 30 },
  AB5: { name: "Скрутка стоя (лёгкая)", how: "плечо к противоположному колену, маленькая амплитуда ×8", position: "standing", attention: true, target: "пресс", duration_sec: 30 },
  AB6: { name: "Пресс + ягодицы стоя", how: "сжать ягодицы + втянуть живот, держать 10 сек × 3", position: "standing", attention: true, target: "пресс", duration_sec: 45 },
  AB7: { name: "Наклон + пресс", how: "маленький наклон вперёд, держать корпус 5 сек × 5", position: "standing", attention: true, target: "пресс", duration_sec: 30 },
  AB8: { name: "Наклон назад (микро)", how: "слегка отклониться назад, удерживать пресс 5–10 сек × 3", position: "sitting", attention: true, target: "пресс", duration_sec: 45 },
  AB9: { name: "Подтягивание колена сидя", how: "подтянуть ногу чуть вверх, держать 5 сек, смена", position: "sitting", attention: true, target: "пресс", duration_sec: 45 },
  AB10: { name: "Обе ноги (очень лёгко)", how: "чуть приподнять обе ноги (если комфортно) 5 сек × 3", position: "sitting", attention: true, target: "пресс", duration_sec: 30 },
  AB11: { name: "Пресс + поворот корпуса", how: "маленькие повороты вправо/влево ×10, живот подтянут", position: "sitting", attention: true, target: "пресс", duration_sec: 30 },
  AB12: { name: "Гантели + пресс", how: "держать гантели и одновременно держать живот 10–15 сек × 2", position: "sitting", attention: true, target: "пресс", duration_sec: 45 },
  AB13: { name: "Резинка — руки вперёд (сидя)", how: "тянуть резинку вперёд от груди ×10, пресс стабилизирует", position: "sitting", attention: true, target: "пресс", duration_sec: 45 },
  AB14: { name: "Медленный «велосипед»", how: "поочерёдно двигать ногами, маленькая амплитуда ×10", position: "lying", attention: true, target: "пресс", duration_sec: 45 },
  AB15: { name: "Одна нога вверх + пресс", how: "держать ногу + живот 5–10 сек, смена", position: "lying", attention: true, target: "пресс", duration_sec: 45 },
  AB16: { name: "Скользящее колено", how: "подтянуть пятку к себе (по полу) ×10", position: "lying", attention: true, target: "пресс", duration_sec: 30 },
  AB17: { name: "Поясница прижата", how: "прижать поясницу к полу и держать 10–15 сек × 2", position: "lying", attention: true, target: "пресс", duration_sec: 30 },
  AB18: { name: "Руки вверх + пресс", how: "поднять руки и держать корпус 10 сек × 2", position: "lying", attention: true, target: "пресс", duration_sec: 30 },
  AB19: { name: "Планка на коленях (мягкая)", how: "локти под плечами, колени на полу, держать 10–20 сек", position: "kneeling", attention: true, target: "пресс", duration_sec: 30 },
  AB20: { name: "Рука вперёд (на коленях)", how: "встань на 4 точки, вытяни одну руку 5 сек, смена", position: "kneeling", attention: true, target: "пресс", duration_sec: 45 },
  AB21: { name: "Колено + противоположная рука", how: "птица-собака, маленькая амплитуда 3–5 сек × 5", position: "kneeling", attention: true, target: "пресс", duration_sec: 45 },
  AB22: { name: "Круг корпусом", how: "маленькие круги корпусом ×8 в обе стороны", position: "kneeling", attention: true, target: "пресс", duration_sec: 30 },
  AB23: { name: "Резинка — руки в стороны", how: "тянуть резинку в стороны ×10, пресс держит корпус", position: "sitting", attention: true, target: "пресс", duration_sec: 45 },
  AB24: { name: "Резинка вперёд (анти-вращение)", how: "тянуть перед собой, не давая корпусу крутиться 10 сек × 2", position: "sitting", attention: true, target: "пресс", duration_sec: 45 },
  AB25: { name: "Резинка на бёдрах", how: "резинка над коленями: разводить колени ×10, пресс стабилизирует", position: "sitting", attention: true, target: "пресс", duration_sec: 30 },
};

// ============================================================================
// BLOCKS
// ============================================================================
export const BLOCKS: Record<string, string[]> = {
  lying_quick: ["L1", "L3", "L2"],
  sitting_focus: ["S2", "S1", "S3"],
  sitting_bg: ["S3", "F4", "S5"],
  standing: ["G1", "ST1", "ST4"],
  walking: ["W3", "W1", "W2"],
  lying_basic: ["L1", "L2", "L3"],
  sitting_basic: ["S1", "S2", "S3"],
  standing_basic: ["ST4", "ST1", "G1"],
  no_focus: ["F1", "Q8", "F4"],
  joints: ["R3", "R4", "L3"],
  quad_focus: ["L6", "S7", "R2"],
  wakeup: ["L1", "L4", "L5"],
  before_sleep: ["L2", "L1", "L5"],
  anti_anxiety: ["F1", "R10", "L5"],
};

// ============================================================================
// SITUATIONS — полный список (20 шт) с pool'ами
// ============================================================================
export interface SituationData {
  code: string;
  label: string;
  block: string;
  position?: ExerciseData["position"];
  ids?: string[];
  pool?: string[];
}

export const SITUATIONS: SituationData[] = [
  { code: "lying", label: "🛏 Лёжа", block: "lying_quick" },
  { code: "sitting_focus", label: "🪑 Сидя — могу сфокусироваться", block: "sitting_focus" },
  { code: "sitting_bg", label: "📺 Сидя — нужно в фоне", block: "sitting_bg" },
  { code: "standing", label: "🚶 Стою", block: "standing" },
  { code: "walking", label: "🚶 Иду", block: "walking" },
  // Расширенные ситуации (с pool'ами) — для случайного выбора «↩ Другое»:
  { code: "teeth", label: "🪥 Чищу зубы", block: "standing_basic", position: "standing", ids: ["ST4", "ST1"], pool: ["ST1", "ST4", "G1", "G2", "G3", "G5", "G4", "P1", "P2", "P4", "P7"] },
  { code: "kettle", label: "☕ Жду чайник", block: "standing_basic", position: "standing", ids: ["ST1", "ST4"], pool: ["ST1", "G5", "ST4", "P1", "P2", "P3", "P5", "P6", "P7", "P4", "G3", "G1", "G2", "G6"] },
  { code: "queue", label: "🛒 В очереди", block: "standing_basic", position: "standing", ids: ["ST1", "F4", "R4"], pool: ["ST1", "ST4", "F4", "R4", "P1", "P2", "P4", "P7", "G1", "G3", "G5", "G7", "C5", "C8"] },
  { code: "tv", label: "📺 Сериал", block: "no_focus", position: "sitting", ids: ["F1", "F3", "S8"], pool: ["F1", "S3", "F3", "F4", "S5", "S4", "S8", "Q1", "Q2", "Q5", "Q8", "G1", "G6", "L1", "L4", "L6"] },
  { code: "morning_bed", label: "🌅 Утром в кровати", block: "wakeup", position: "lying", ids: ["L1", "L4", "L2"], pool: ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8", "Q1", "Q2", "Q4", "Q6", "Q7", "G1", "G2", "G6", "C2", "C3"] },
  { code: "before_sleep", label: "🌙 Перед сном", block: "before_sleep", position: "lying", ids: ["L2", "L1", "L5"], pool: ["L1", "L2", "L5", "C5", "C8", "G5", "P1", "R10"] },
  { code: "laptop", label: "💻 За ноутбуком", block: "sitting_focus", position: "sitting", ids: ["S2", "S1", "L7"], pool: ["S1", "S2", "P1", "P2", "P4", "P5", "P7", "P8", "C2", "C5", "C7", "C8", "G3", "G7", "R2", "S4", "FT1"] },
  { code: "phone_call", label: "📞 Звонок", block: "standing_basic", position: "standing", ids: ["ST1", "ST4"], pool: ["ST1", "G5", "ST4", "P1", "P2", "P4", "P7", "G1", "G2", "G7", "G3"] },
  { code: "metro_sit", label: "🚇 Метро сидя", block: "sitting_basic", position: "sitting", ids: ["R2", "S4", "S1"], pool: ["R2", "S1", "S4", "C2", "C5", "C7", "C8", "G3", "G5", "G7", "P1", "P4", "P7", "FT1", "FT4"] },
  { code: "cooking", label: "🍳 Готовлю", block: "standing_basic", position: "standing", ids: ["ST4", "ST1"], pool: ["ST1", "ST4", "P1", "P2", "P4", "P7", "P8", "G1", "G2", "G7", "G5"] },
  { code: "dishes", label: "🍽 Мою посуду", block: "standing_basic", position: "standing", ids: ["ST4", "S2", "F4"], pool: ["ST1", "ST4", "F4", "P1", "P2", "P4", "P7", "P8", "G1", "G2", "G7", "C5", "C8"] },
  { code: "shower", label: "🚿 В душе", block: "standing_basic", position: "standing", ids: ["ST1", "S7"], pool: ["ST1", "ST4", "S7", "P1", "P2", "G1", "G2", "P4"] },
  { code: "elevator", label: "🛗 Жду лифт", block: "standing_basic", position: "standing", ids: ["ST1"], pool: ["ST1", "ST4", "P1", "P4", "P7", "G1", "G7"] },
  { code: "ebike", label: "🚲 Электровел", block: "sitting_bg", position: "sitting", ids: ["S1", "S2"], pool: ["S1", "S2", "C2", "C5", "C7", "C8", "G3", "G5", "G7", "P1", "P2", "P4", "P7", "P8", "R2"] },
  { code: "dog_walk", label: "🐕 Прогулка с собакой", block: "walking", position: "walking", ids: ["W1", "W2", "W3"], pool: ["W1", "W2", "W3", "P1", "P4"] },
  { code: "phone_scroll", label: "📱 Залипаю в телефон", block: "no_focus", position: "any", ids: ["L4", "S7", "F4"], pool: ["L4", "S7", "F4", "F1", "C5", "C8", "Q5", "Q8", "G1", "G6", "S8", "R2"] },
];

// ============================================================================
// MODES
// ============================================================================
export const MODES: Record<string, { label: string; desc: string }> = {
  useful_first: {
    label: "🍬 Сначала полезное → потом награда",
    desc: "Сделай 1 минуту → потом смотришь дальше / залипаешь.",
  },
  parallel: {
    label: "🎬 Делаю одновременно",
    desc: "Сериал/телефон + микро-упражнения в фоне.",
  },
  stuck: {
    label: "⏸ Я застряла / жду / не могу начать",
    desc: "Вместо прокрастинации — тело. Минимум, мягко.",
  },
};

export const EMPATHY_SKIP =
  "это скрипт, но он был написан быть всегда рядом, пока нет твоего " +
  "лучшего осязаемого помощника. это всего 1 минута и ты с ней делаешь " +
  "себе будущей лучше.\n\n" +
  "Трудно? Представь меня рядом, как я помогаю тебе заниматься. " +
  "Я рядом. Начинаем?";

export const MORNING_PROMPT =
  "🌅 Доброе утро.\n\n" +
  "Короткий чек-ин (1 минута):\n" +
  "• Как состояние?\n" +
  "• Какая цель на сегодня?\n" +
  "• Чем ты её приблизишь?\n\n" +
  "Напоминание: гнобить себя не помогает. Что помогает прорваться?";

/** Старая вечерняя рефлексия — теперь только для /reflect (handlers.ts). */
export const EVENING_PROMPT =
  "🌙 Что сегодня сработало?\n\n" +
  "1. помогло\n2. мешало\n3. где тело откликнулось";

/** Вечерний пуш планировщика: дневник ноги 1–5 (кнопки в handlers_diary). */
export const EVENING_DIARY_PROMPT =
  "🌙 Как нога сегодня?\n" +
  "1 — совсем плохо · 5 — отлично";

/** Строка в утренний пуш, если вчера была плохая нога / отёк. */
export const MORNING_LEG_NUDGE =
  "Вчера нога была так себе — сегодня нагрузку на шаг назад, не ноль.";

// ============================================================================
// ABS LIST — категоризированный список 25 упражнений на пресс
// ============================================================================
export const ABS_CATEGORIES: Array<[string, string[]]> = [
  ["🧍 Стоя / у стены", ["AB1", "AB2", "AB3", "AB4", "AB5", "AB6", "AB7"]],
  ["🪑 Сидя", ["AB8", "AB9", "AB10", "AB11", "AB12", "AB13"]],
  ["🛏 Лёжа", ["AB14", "AB15", "AB16", "AB17", "AB18"]],
  ["🧎 На коленях", ["AB19", "AB20", "AB21", "AB22"]],
  ["🏋 С резинкой", ["AB23", "AB24", "AB25"]],
];

export const ABS_NOTES =
  "🔧 <b>Как делать правильно:</b>\n" +
  "• живот не втягивать резко, а «подтянуть»\n" +
  "• дышать, не задерживать\n" +
  "• движения маленькие\n" +
  "• нет боли в спине / колене";

export function renderAbsList(): string {
  // Резинка / подъём колена стоя и т.п. — по протоколу не показываем (см. safety.ts).
  const cats = ABS_CATEGORIES.map(([title, ids]) => [title, filterSafe(ids)] as [string, string[]])
    .filter(([, ids]) => ids.length > 0);
  const count = cats.reduce((a, [, ids]) => a + ids.length, 0);
  const lines: string[] = [`<b>📋 Больше упражнений на пресс (${count} шт.)</b>`, ""];
  let n = 0;
  for (const [title, ids] of cats) {
    lines.push(`<b>${title}:</b>`);
    for (const exId of ids) {
      n += 1;
      const ex = EXERCISES[exId];
      if (ex) lines.push(`${n}. <b>${ex.name}</b> — ${ex.how}`);
    }
    lines.push("");
  }
  lines.push(ABS_NOTES);
  return lines.join("\n");
}

// ============================================================================
// GOALS
// ============================================================================
export const GOAL_TEMPLATE_TITLES: string[] = [
  "Свободная ходьба",
  "Осанка",
  "Ягодицы",
  "Живот",
  "Колено",
  "Голеностоп",
];

/** Расширенный набор шаблонов: системные + по target'ам. */
export const GOAL_TEMPLATES: Array<{ title: string; period: string }> = [
  { title: "Каждый день — хотя бы 1 упражнение", period: "week" },
  { title: "5 раз в неделю — 10 минут активности", period: "week" },
  { title: "30 дней подряд — что-то на тело", period: "month" },
  { title: "Месяц без полного исчезновения практики", period: "month" },
  ...GOAL_TEMPLATE_TITLES.map((t) => ({ title: t, period: "month" })),
];

export const GOAL_PERIOD_TARGETS: Record<string, number> = { week: 14, month: 60 };
export const GOAL_PERIOD_DAYS: Record<string, number> = { week: 7, month: 30 };
export const GOAL_PERIOD_LABEL: Record<string, string> = {
  week: "Неделя",
  month: "Месяц",
};

// ============================================================================
// HELPERS
// ============================================================================

function minutesWord(n: number): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n100 >= 11 && n100 <= 14) return "минут";
  if (n10 === 1) return "минута";
  if (n10 >= 2 && n10 <= 4) return "минуты";
  return "минут";
}

export function renderBlock(allIds: string[]): string {
  const ids = filterSafe(allIds); // запрещённое по протоколу никогда не рисуем
  const total = ids.reduce((a, id) => a + (EXERCISES[id]?.duration_sec ?? 0), 0);
  const m = Math.max(1, Math.round(total / 60));
  const lines: string[] = [`⚡ ${m} ${minutesWord(m)}:`, ""];
  for (const id of ids) {
    const ex = EXERCISES[id];
    if (ex) lines.push(`• ${ex.name} — ${ex.how}`);
  }
  lines.push("");
  lines.push("• расслабление 5 сек");
  return lines.join("\n");
}

export function blockMinutes(allIds: string[]): number {
  const ids = filterSafe(allIds);
  const total = ids.reduce((a, id) => a + (EXERCISES[id]?.duration_sec ?? 0), 0);
  return Math.max(1, Math.round(total / 60));
}

export function filterExercises(opts: {
  position?: ExerciseData["position"];
  attention?: boolean;
  target?: string;
}): string[] {
  const result: string[] = [];
  for (const [id, ex] of Object.entries(EXERCISES)) {
    if (opts.position && ex.position !== opts.position && ex.position !== "any") continue;
    if (opts.attention !== undefined && ex.attention !== opts.attention) continue;
    if (opts.target && ex.target !== opts.target) continue;
    result.push(id);
  }
  return result;
}
