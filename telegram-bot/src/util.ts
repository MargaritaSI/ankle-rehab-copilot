/**
 * Утилиты общего назначения для addsport-бота.
 */

export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Локальная дата YYYY-MM-DD в указанной TZ. */
export function localDate(date: Date, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** Минута дня в локальной TZ (0..1439). */
export function localMinuteOfDay(date: Date, tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
    return parseInt(get("hour"), 10) * 60 + parseInt(get("minute"), 10);
  } catch {
    return date.getUTCHours() * 60 + date.getUTCMinutes();
  }
}

/** Форматировать минуты как «HH:MM». */
export function formatMin(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Экранировать текст для Telegram HTML parse_mode (& < >). */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Русское «1 минута / 2 минуты / 5 минут». */
export function minutesWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} минута`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return `${n} минуты`;
  return `${n} минут`;
}

/**
 * В группах Telegram шлёт команды как `/plate@botname`. Убираем `@suffix`
 * у первого слова, остальной текст не трогаем: «/plate@bot x» → «/plate x».
 */
export function stripBotSuffix(text: string): string {
  if (!text.startsWith("/")) return text;
  return text.replace(/^(\/[A-Za-z0-9_]+)@[A-Za-z0-9_]+/, "$1");
}
