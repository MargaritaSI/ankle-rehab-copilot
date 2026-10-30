/**
 * Прогресс-бар на emoji. Замена Pillow picture.py.
 */

export const GRID = 16;
export const TOTAL_CELLS = GRID * GRID; // 256
const BAR_SEGMENTS = 10;

export interface ProgressInfo {
  cycle: number;
  unlocked: number;
  needed: number;
}

export function progressFor(totalPoints: number): ProgressInfo {
  if (totalPoints <= 0) return { cycle: 0, unlocked: 0, needed: TOTAL_CELLS };
  const cycle = Math.floor((totalPoints - 1) / TOTAL_CELLS);
  const unlocked = totalPoints - cycle * TOTAL_CELLS;
  return { cycle, unlocked, needed: TOTAL_CELLS - unlocked };
}

export function renderBar(unlocked: number, total: number = TOTAL_CELLS): string {
  const clamped = Math.max(0, Math.min(unlocked, total));
  const filled = Math.round((clamped / total) * BAR_SEGMENTS);
  return "▰".repeat(filled) + "▱".repeat(BAR_SEGMENTS - filled);
}

export function renderProgressMessage(totalPoints: number): string {
  const { cycle, unlocked, needed } = progressFor(totalPoints);
  const bar = renderBar(unlocked);
  const pct = Math.round((unlocked / TOTAL_CELLS) * 100);
  let msg = `<b>📈 Прогресс</b>\n\n${bar}  ${pct}%\n\n`;
  msg += `⭐ Поинтов всего: <b>${totalPoints}</b>\n`;
  msg += `🔓 Открыто клеток: <b>${unlocked}/${TOTAL_CELLS}</b>\n`;
  if (cycle > 0) msg += `♻️ Цикл: <b>${cycle + 1}</b>\n`;
  msg += `📍 До конца цикла: <b>${needed}</b>`;
  return msg;
}
