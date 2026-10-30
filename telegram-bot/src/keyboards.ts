/**
 * Клавиатуры addsport.
 *
 * Правила:
 *   - inline-кнопки по 2 в ряд (через pairs); если нечётное число, последняя одна
 *   - вместо «🏠 Главная» — «← Назад» с явной навигацией в нужный picker
 */

import type {
  InlineKeyboardMarkup,
  InlineKeyboardButton,
  ReplyKeyboardMarkup,
} from "./telegram";
import { SITUATIONS, MODES, GOAL_TEMPLATES, GOAL_PERIOD_LABEL } from "./content";

// ──────────────────────────────────────────────────────────────────────────
// pairs([A, B, C, D, E]) → [[A, B], [C, D], [E]]  (последняя одна, если нечётно)
// ──────────────────────────────────────────────────────────────────────────
function pairs(buttons: InlineKeyboardButton[]): InlineKeyboardButton[][] {
  const rows: InlineKeyboardButton[][] = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }
  return rows;
}

// ──────────────────────────────────────────────────────────────────────────
// Нижняя reply-клавиатура главного меню
// ──────────────────────────────────────────────────────────────────────────
export function homeReplyKb(): ReplyKeyboardMarkup {
  return {
    keyboard: [
      [{ text: "💪 Сделать сейчас" }, { text: "📍 По ситуации" }],
      [{ text: "🎯 Цели" }, { text: "🍽 Питание" }],
      [{ text: "🦵 Нога" }, { text: "📈 Прогресс" }],
      [{ text: "🌬 Дыхание" }, { text: "🍽 Тарелка" }],
      [{ text: "⚙️ Настройки" }],
    ],
    resize_keyboard: true,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// «💪 Сделать сейчас» — позиция тела
// ──────────────────────────────────────────────────────────────────────────
export function doNowKb(): InlineKeyboardMarkup {
  return {
    inline_keyboard: pairs([
      { text: "🛏 Лёжа", callback_data: "do:lying" },
      { text: "🪑 Сидя — могу", callback_data: "do:sitting_focus" },
      { text: "📺 Сидя — в фоне", callback_data: "do:sitting_bg" },
      { text: "🚶 Стою", callback_data: "do:standing" },
      { text: "🚶 Иду", callback_data: "do:walking" },
    ]),
  };
}

// ──────────────────────────────────────────────────────────────────────────
// «📍 По ситуации» — 20 ситуаций (по 2 в ряд)
// ──────────────────────────────────────────────────────────────────────────
export function situationsKb(): InlineKeyboardMarkup {
  return {
    inline_keyboard: pairs(
      SITUATIONS.map((s) => ({
        text: s.label,
        callback_data: `sit:${s.code}`,
      })),
    ),
  };
}

// ──────────────────────────────────────────────────────────────────────────
// После показа блока упражнений.
// source = "do" | "sit" — куда вернуться по «Назад».
// ──────────────────────────────────────────────────────────────────────────
export function blockDoneKb(
  source: "do" | "sit",
  code: string,
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "✅ Сделала", callback_data: `done:${code}` },
        { text: "🔄 Другой блок", callback_data: `${source}:${code}` },
      ],
      [{ text: "← Назад", callback_data: `back:${source}` }],
    ],
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Режимы
// ──────────────────────────────────────────────────────────────────────────
export function modesKb(current: string): InlineKeyboardMarkup {
  const items: InlineKeyboardButton[] = Object.entries(MODES).map(([code, m]) => ({
    text: `${code === current ? "✅ " : ""}${m.label}`,
    callback_data: `mode:${code}`,
  }));
  const rows = pairs(items);
  rows.push([{ text: "← Назад", callback_data: "back:settings" }]);
  return { inline_keyboard: rows };
}

// ──────────────────────────────────────────────────────────────────────────
// Настройки
// ──────────────────────────────────────────────────────────────────────────
export function settingsKb(user: {
  daily_goal_min: number;
  reminder_interval_min: number;
  reminders_on: number;
  mode: string;
}): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: `🎯 Цель: ${user.daily_goal_min} мин/день`,
          callback_data: "set:daily_goal",
        },
        {
          text: `⏱ Интервал: ${user.reminder_interval_min} мин`,
          callback_data: "set:interval",
        },
      ],
      [
        {
          text: `🔔 Напоминания: ${user.reminders_on ? "ВКЛ" : "ВЫКЛ"}`,
          callback_data: "set:toggle",
        },
        {
          text: `🎨 Режим: ${MODES[user.mode]?.label ?? user.mode}`,
          callback_data: "set:mode",
        },
      ],
      [{ text: "🌐 Часовой пояс", callback_data: "set:tz" }],
      [{ text: "← Назад", callback_data: "back:home" }],
    ],
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Цели
// ──────────────────────────────────────────────────────────────────────────
export function goalsListKb(
  goals: Array<{ id: number; title: string }>,
): InlineKeyboardMarkup {
  const items: InlineKeyboardButton[] = goals.map((g) => ({
    text: `🎯 ${g.title.slice(0, 50)}`,
    callback_data: `goal:open:${g.id}`,
  }));
  const rows = pairs(items);
  rows.push([{ text: "➕ Новая цель", callback_data: "goal:new" }]);
  rows.push([{ text: "← Назад", callback_data: "back:home" }]);
  return { inline_keyboard: rows };
}

export function goalTemplatesKb(): InlineKeyboardMarkup {
  const items: InlineKeyboardButton[] = GOAL_TEMPLATES.map((t, i) => ({
    text: `${t.title} · ${GOAL_PERIOD_LABEL[t.period] ?? t.period}`,
    callback_data: `goal:tpl:${i}`,
  }));
  items.push({ text: "✏️ Своя цель", callback_data: "goal:custom" });
  const rows = pairs(items);
  rows.push([{ text: "← Назад", callback_data: "goal:list" }]);
  return { inline_keyboard: rows };
}

export function goalItemKb(goalId: number): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "🗑 Удалить", callback_data: `goal:del:${goalId}` },
        { text: "← К целям", callback_data: "goal:list" },
      ],
    ],
  };
}
