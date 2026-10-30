/**
 * Слой работы с D1 — порт db.py.
 *
 * 7 таблиц + fsm_state: users, sessions, reflections, goals, food_entries,
 * food_states. Поинты = session_count (количество выполнений упражнений).
 */

export interface UserRow {
  tg_id: number;
  daily_goal_min: number;
  reminder_interval_min: number;
  mode: string;
  reminders_on: number;
  last_reminder_at: string | null;
  reminder_start_min: number;
  reminder_end_min: number;
  last_morning_at: string | null;
  last_evening_at: string | null;
  sex: string;
  age: number;
  height_cm: number;
  weight_kg: number;
  activity_level: number;
  last_food_push_at: string | null;
  timezone: string;
  /** ISO UTC старта прогулки (/walk) или null, если прогулка не идёт. */
  walk_started_at: string | null;
  walk_warned: number;
  created_at: string;
}

export interface GoalRow {
  id: number;
  tg_id: number;
  title: string;
  period: string;
  target: number;
  points: number;
  created_at: string;
  completed_at: string | null;
}

export interface FoodEntryRow {
  id: number;
  tg_id: number;
  category: string;
  name: string;
  protein_g: number;
  kcal: number;
  water_ml: number;
  ts: string;
}

const DEFAULT_DAILY_GOAL_MIN = 60;
const DEFAULT_REMINDER_INTERVAL_MIN = 60;

function nowSql(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

// ============================================================================
// USERS
// ============================================================================

export async function ensureUser(db: D1Database, tgId: number): Promise<UserRow> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO users (tg_id, daily_goal_min, reminder_interval_min)
       VALUES (?, ?, ?)`,
    )
    .bind(tgId, DEFAULT_DAILY_GOAL_MIN, DEFAULT_REMINDER_INTERVAL_MIN)
    .run();
  const user = await db
    .prepare("SELECT * FROM users WHERE tg_id = ?")
    .bind(tgId)
    .first<UserRow>();
  if (!user) throw new Error(`Failed to ensure user ${tgId}`);
  return user;
}

export async function getUser(db: D1Database, tgId: number): Promise<UserRow | null> {
  return await db
    .prepare("SELECT * FROM users WHERE tg_id = ?")
    .bind(tgId)
    .first<UserRow>();
}

const USER_FIELDS_ALLOWED = new Set([
  "daily_goal_min",
  "reminder_interval_min",
  "mode",
  "reminders_on",
  "reminder_start_min",
  "reminder_end_min",
  "sex",
  "age",
  "height_cm",
  "weight_kg",
  "activity_level",
  "timezone",
]);

export async function updateUser(
  db: D1Database,
  tgId: number,
  fields: Partial<UserRow>,
): Promise<void> {
  const keys = Object.keys(fields).filter((k) => USER_FIELDS_ALLOWED.has(k));
  if (keys.length === 0) return;
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  const values = keys.map((k) => (fields as Record<string, unknown>)[k]);
  await db
    .prepare(`UPDATE users SET ${setClause} WHERE tg_id = ?`)
    .bind(...(values as Array<string | number | null>), tgId)
    .run();
}

export async function listUserIds(db: D1Database): Promise<number[]> {
  const r = await db.prepare("SELECT tg_id FROM users").all<{ tg_id: number }>();
  return r.results.map((row) => row.tg_id);
}

export async function usersForTick(db: D1Database): Promise<UserRow[]> {
  const r = await db
    .prepare(
      `SELECT * FROM users WHERE reminders_on = 1`,
    )
    .all<UserRow>();
  return r.results;
}

export async function markReminded(db: D1Database, tgId: number): Promise<void> {
  await db
    .prepare("UPDATE users SET last_reminder_at = ? WHERE tg_id = ?")
    .bind(nowSql(), tgId)
    .run();
}

export async function setLastMorning(
  db: D1Database,
  tgId: number,
  todayStr: string,
): Promise<void> {
  await db
    .prepare("UPDATE users SET last_morning_at = ? WHERE tg_id = ?")
    .bind(todayStr, tgId)
    .run();
}

export async function setLastEvening(
  db: D1Database,
  tgId: number,
  todayStr: string,
): Promise<void> {
  await db
    .prepare("UPDATE users SET last_evening_at = ? WHERE tg_id = ?")
    .bind(todayStr, tgId)
    .run();
}

// ── Подзапросы-батч для планировщика (см. Budget) ─────────────────────────
// db.batch([...]) = ОДИН subrequest независимо от числа выражений, поэтому
// тик копит UPDATE-ы и сливает их одним вызовом в конце стадии.

export function stmtMarkReminded(db: D1Database, tgId: number): D1PreparedStatement {
  return db.prepare("UPDATE users SET last_reminder_at = ? WHERE tg_id = ?").bind(nowSql(), tgId);
}

export function stmtSetLastMorning(
  db: D1Database,
  tgId: number,
  todayStr: string,
): D1PreparedStatement {
  return db.prepare("UPDATE users SET last_morning_at = ? WHERE tg_id = ?").bind(todayStr, tgId);
}

export function stmtSetLastEvening(
  db: D1Database,
  tgId: number,
  todayStr: string,
): D1PreparedStatement {
  return db.prepare("UPDATE users SET last_evening_at = ? WHERE tg_id = ?").bind(todayStr, tgId);
}

export function stmtMarkFoodPushed(
  db: D1Database,
  tgId: number,
  todayStr: string,
): D1PreparedStatement {
  return db.prepare("UPDATE users SET last_food_push_at = ? WHERE tg_id = ?").bind(todayStr, tgId);
}

export function stmtDisableReminders(db: D1Database, tgId: number): D1PreparedStatement {
  return db.prepare("UPDATE users SET reminders_on = 0 WHERE tg_id = ?").bind(tgId);
}

/** Юзер заблокировал бота (403 в личке) — больше не тратим на него квоту. */
export async function disableReminders(db: D1Database, tgId: number): Promise<void> {
  await stmtDisableReminders(db, tgId).run();
}

// ============================================================================
// SESSIONS
// ============================================================================

export async function logSession(
  db: D1Database,
  tgId: number,
  exerciseIds: string[],
  minutes: number,
  mode: string | null = null,
  situation: string | null = null,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO sessions (tg_id, exercise_ids, minutes, mode, situation) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(tgId, JSON.stringify(exerciseIds), minutes, mode, situation)
    .run();
}

export async function sessionCount(db: D1Database, tgId: number): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM sessions WHERE tg_id = ?")
    .bind(tgId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function totalMinutes(db: D1Database, tgId: number): Promise<number> {
  const row = await db
    .prepare("SELECT COALESCE(SUM(minutes), 0) AS m FROM sessions WHERE tg_id = ?")
    .bind(tgId)
    .first<{ m: number }>();
  return row?.m ?? 0;
}

/** Минуты в диапазоне [since, now), включая сегодня. */
export async function rangeMinutes(
  db: D1Database,
  tgId: number,
  sinceSql: string,
): Promise<number> {
  const row = await db
    .prepare(
      "SELECT COALESCE(SUM(minutes), 0) AS m FROM sessions WHERE tg_id = ? AND ts >= ?",
    )
    .bind(tgId, sinceSql)
    .first<{ m: number }>();
  return row?.m ?? 0;
}

/** Минуты по дням за последние N дней. */
export async function minutesPerDay(
  db: D1Database,
  tgId: number,
  days: number = 7,
): Promise<Array<{ date: string; minutes: number }>> {
  const out: Array<{ date: string; minutes: number }> = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000);
    const dateStr = d.toISOString().slice(0, 10);
    const start = `${dateStr} 00:00:00`;
    const end = `${dateStr} 23:59:59`;
    const row = await db
      .prepare(
        "SELECT COALESCE(SUM(minutes), 0) AS m FROM sessions WHERE tg_id = ? AND ts >= ? AND ts <= ?",
      )
      .bind(tgId, start, end)
      .first<{ m: number }>();
    out.push({ date: dateStr, minutes: row?.m ?? 0 });
  }
  return out;
}

/** Сводка по дням: сегодня / неделя / месяц. */
export async function stats(
  db: D1Database,
  tgId: number,
): Promise<{ today: number; week: number; month: number }> {
  const now = new Date();
  const todayStart = `${now.toISOString().slice(0, 10)} 00:00:00`;
  const weekStart = new Date(now.getTime() - 6 * 86_400_000)
    .toISOString()
    .slice(0, 10) + " 00:00:00";
  const monthStart = new Date(now.getTime() - 29 * 86_400_000)
    .toISOString()
    .slice(0, 10) + " 00:00:00";

  return {
    today: await rangeMinutes(db, tgId, todayStart),
    week: await rangeMinutes(db, tgId, weekStart),
    month: await rangeMinutes(db, tgId, monthStart),
  };
}

/** Узор дней: ▓ ▒ ░ █ за последние N дней. */
export async function dailyPattern(
  db: D1Database,
  tgId: number,
  days: number = 7,
): Promise<string> {
  const data = await minutesPerDay(db, tgId, days);
  return data
    .map(({ minutes }) => {
      if (minutes === 0) return "░";
      if (minutes < 15) return "▒";
      if (minutes < 45) return "▓";
      return "█";
    })
    .join("");
}

// ============================================================================
// REFLECTIONS
// ============================================================================

export async function logReflection(
  db: D1Database,
  tgId: number,
  kind: string,
  text: string,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO reflections (tg_id, kind, text) VALUES (?, ?, ?)",
    )
    .bind(tgId, kind, text)
    .run();
}

export async function countReflections(
  db: D1Database,
  tgId: number,
  sinceSql: string,
): Promise<number> {
  const row = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM reflections WHERE tg_id = ? AND ts >= ?",
    )
    .bind(tgId, sinceSql)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

// ============================================================================
// GOALS
// ============================================================================

const GOAL_PERIOD_TARGETS: Record<string, number> = { week: 14, month: 60 };
const GOAL_PERIOD_DAYS: Record<string, number> = { week: 7, month: 30 };

export async function createGoal(
  db: D1Database,
  tgId: number,
  title: string,
  period: string,
): Promise<number> {
  const target = GOAL_PERIOD_TARGETS[period] ?? 14;
  const r = await db
    .prepare(
      "INSERT INTO goals (tg_id, title, period, target) VALUES (?, ?, ?, ?)",
    )
    .bind(tgId, title, period, target)
    .run();
  return (r.meta.last_row_id as number) ?? 0;
}

export async function listActiveGoals(
  db: D1Database,
  tgId: number,
): Promise<GoalRow[]> {
  const r = await db
    .prepare(
      `SELECT * FROM goals
       WHERE tg_id = ? AND completed_at IS NULL
       ORDER BY created_at DESC`,
    )
    .bind(tgId)
    .all<GoalRow>();
  const now = Date.now();
  return r.results.filter((g) => {
    const days = GOAL_PERIOD_DAYS[g.period] ?? 30;
    const created = Date.parse(g.created_at);
    if (Number.isNaN(created)) return false;
    return now - created < days * 86_400_000;
  });
}

export async function deleteGoal(
  db: D1Database,
  goalId: number,
  tgId: number,
): Promise<void> {
  await db
    .prepare("DELETE FROM goals WHERE id = ? AND tg_id = ?")
    .bind(goalId, tgId)
    .run();
}

export async function incrementActiveGoals(
  db: D1Database,
  tgId: number,
): Promise<GoalRow[]> {
  const now = Date.now();
  const r = await db
    .prepare(
      "SELECT * FROM goals WHERE tg_id = ? AND completed_at IS NULL",
    )
    .bind(tgId)
    .all<GoalRow>();
  const justCompleted: GoalRow[] = [];
  for (const g of r.results) {
    const days = GOAL_PERIOD_DAYS[g.period] ?? 30;
    const created = Date.parse(g.created_at);
    if (Number.isNaN(created)) continue;
    if (now - created >= days * 86_400_000) continue; // просрочена
    const newPoints = g.points + 1;
    if (newPoints >= g.target) {
      await db
        .prepare("UPDATE goals SET points = ?, completed_at = ? WHERE id = ?")
        .bind(newPoints, nowSql(), g.id)
        .run();
      justCompleted.push({ ...g, points: newPoints, completed_at: nowSql() });
    } else {
      await db
        .prepare("UPDATE goals SET points = ? WHERE id = ?")
        .bind(newPoints, g.id)
        .run();
    }
  }
  return justCompleted;
}

// ============================================================================
// FOOD
// ============================================================================

export async function logFood(
  db: D1Database,
  tgId: number,
  category: string,
  name: string,
  proteinG: number = 0,
  kcal: number = 0,
  waterMl: number = 0,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO food_entries (tg_id, category, name, protein_g, kcal, water_ml, ts)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(tgId, category, name, proteinG, kcal, waterMl, nowSql())
    .run();
}

export interface FoodSummary {
  protein_g: number;
  kcal: number;
  water_ml: number;
  sweets_count: number;
  fried_count: number;
  total: number;
}

export async function foodToday(db: D1Database, tgId: number): Promise<FoodSummary> {
  const today = new Date().toISOString().slice(0, 10);
  const start = `${today} 00:00:00`;
  const r = await db
    .prepare(
      `SELECT category, protein_g, kcal, water_ml FROM food_entries
       WHERE tg_id = ? AND ts >= ?`,
    )
    .bind(tgId, start)
    .all<FoodEntryRow>();
  const summary: FoodSummary = {
    protein_g: 0,
    kcal: 0,
    water_ml: 0,
    sweets_count: 0,
    fried_count: 0,
    total: 0,
  };
  for (const e of r.results) {
    summary.protein_g += e.protein_g;
    summary.kcal += e.kcal;
    summary.water_ml += e.water_ml;
    summary.total += 1;
    if (e.category === "sweets") summary.sweets_count += 1;
    else if (e.category === "fried") summary.fried_count += 1;
  }
  return summary;
}

export async function logFoodState(
  db: D1Database,
  tgId: number,
  level: number,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO food_states (tg_id, level, ts) VALUES (?, ?, ?)",
    )
    .bind(tgId, level, nowSql())
    .run();
}

export async function latestFoodState(
  db: D1Database,
  tgId: number,
): Promise<{ level: number; ts: string } | null> {
  return await db
    .prepare(
      "SELECT level, ts FROM food_states WHERE tg_id = ? ORDER BY ts DESC LIMIT 1",
    )
    .bind(tgId)
    .first<{ level: number; ts: string }>();
}

export async function lastFoodEntryAt(
  db: D1Database,
  tgId: number,
): Promise<string | null> {
  const row = await db
    .prepare(
      "SELECT ts FROM food_entries WHERE tg_id = ? ORDER BY ts DESC LIMIT 1",
    )
    .bind(tgId)
    .first<{ ts: string }>();
  return row?.ts ?? null;
}

export async function markFoodPushed(
  db: D1Database,
  tgId: number,
  todayStr: string,
): Promise<void> {
  await db
    .prepare("UPDATE users SET last_food_push_at = ? WHERE tg_id = ?")
    .bind(todayStr, tgId)
    .run();
}

/** D1: максимум 100 bound-параметров на запрос — IN-списки режем кусками. */
export const IN_CHUNK = 90;

export interface FoodAggregate {
  /** Белок с `sinceSql` (локальная полночь юзера в UTC). */
  protein_g: number;
  /** Последняя запись о еде в пределах lookback (иначе null). */
  last_ts: string | null;
}

const FOOD_LOOKBACK_MS = 7 * 86_400_000;

/**
 * Один агрегирующий запрос на всех кандидатов одной таймзоны: белок с
 * `sinceSql` ("YYYY-MM-DD HH:MM:SS", UTC) и время последней записи (за 7 суток
 * до `sinceSql` — дальше «давно» и так > 3 ч). Юзеров без записей в Map нет.
 * ids ≤ IN_CHUNK.
 */
export async function foodAggregateForUsers(
  db: D1Database,
  tgIds: number[],
  sinceSql: string,
): Promise<Map<number, FoodAggregate>> {
  const out = new Map<number, FoodAggregate>();
  if (tgIds.length === 0) return out;
  if (tgIds.length > IN_CHUNK) throw new Error("foodAggregateForUsers: too many ids");
  const sinceMs = Date.parse(sinceSql.replace(" ", "T") + "Z");
  const lookback = new Date(sinceMs - FOOD_LOOKBACK_MS)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
  const marks = tgIds.map(() => "?").join(",");
  const r = await db
    .prepare(
      `SELECT tg_id,
              COALESCE(SUM(CASE WHEN ts >= ? THEN protein_g ELSE 0 END), 0) AS protein_g,
              MAX(ts) AS last_ts
       FROM food_entries
       WHERE tg_id IN (${marks}) AND ts >= ?
       GROUP BY tg_id`,
    )
    .bind(sinceSql, ...tgIds, lookback)
    .all<{ tg_id: number; protein_g: number; last_ts: string | null }>();
  for (const row of r.results) {
    out.set(row.tg_id, { protein_g: row.protein_g, last_ts: row.last_ts });
  }
  return out;
}

/** Дневник ноги сразу для нескольких юзеров за [fromDay..toDay] — один запрос. */
export async function diaryRowsForUsers(
  db: D1Database,
  tgIds: number[],
  fromDay: string,
  toDay: string,
): Promise<LegDiaryRow[]> {
  if (tgIds.length === 0) return [];
  if (tgIds.length > IN_CHUNK) throw new Error("diaryRowsForUsers: too many ids");
  const marks = tgIds.map(() => "?").join(",");
  const r = await db
    .prepare(
      `SELECT * FROM leg_diary WHERE tg_id IN (${marks}) AND day >= ? AND day <= ? ORDER BY day ASC`,
    )
    .bind(...tgIds, fromDay, toDay)
    .all<LegDiaryRow>();
  return r.results;
}

/** Все открытые окна утро/вечер всех групп (одним запросом) — для тика. */
export async function openWindowsToCloseAll(
  db: D1Database,
  cutoffIso: string,
): Promise<GroupWindowRow[]> {
  const r = await db
    .prepare(
      `SELECT * FROM group_windows
       WHERE closed = 0 AND kind IN ('morning','evening')
         AND message_id IS NOT NULL AND posted_at <= ?`,
    )
    .bind(cutoffIso)
    .all<GroupWindowRow>();
  return r.results;
}

// ── Бюджет subrequest'ов одного cron-тика ────────────────────────────────
// Free-план: ≤ 50 subrequest'ов на вызов (D1-запрос, db.batch и каждый fetch к
// Telegram — по одному). Лимит 45 оставляет запас на скрытые ретраи Telegram
// (429 / HTML→plain). Каждая стадия тика обязана вызвать take() ДО обращения
// к D1/Telegram и остановиться, если take() вернул false.
export const SUBREQUEST_LIMIT = 45;
export const MAX_SENDS_PER_TICK = 35;

export class Budget {
  used = 0;
  sends = 0;
  constructor(
    public readonly limit: number = SUBREQUEST_LIMIT,
    public readonly maxSends: number = MAX_SENDS_PER_TICK,
  ) {}

  /** Без ограничений — для прямых вызовов стадий из тестов / обработчиков. */
  static unlimited(): Budget {
    return new Budget(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  }

  get left(): number {
    return this.limit - this.used;
  }

  get sendsLeft(): number {
    return this.maxSends - this.sends;
  }

  /** Резервирует n subrequest'ов; send=true — среди них одно сообщение юзеру/группе. */
  take(n = 1, send = false): boolean {
    if (this.used + n > this.limit) return false;
    if (send && this.sends >= this.maxSends) return false;
    this.used += n;
    if (send) this.sends += 1;
    return true;
  }

  /** Безусловно учесть уже сделанные вызовы (путь ошибки: release/disable). */
  spend(n = 1): void {
    this.used += n;
  }
}

// ── Групповые «окна» ─────────────────────────────────────────────────────

export interface GroupChatRow {
  chat_id: number;
  title: string | null;
  timezone: string;
  morning_min: number;
  evening_min: number;
  plate_min: number;
  enabled: number;
  created_at: string;
}

export type GroupWindowKind = "morning" | "evening" | "plate" | "weekly";

export interface GroupWindowRow {
  id: number;
  chat_id: number;
  day: string;
  kind: GroupWindowKind;
  message_id: number | null;
  posted_at: string | null;
  closed: number;
}

export interface GroupCheckinRow {
  window_id: number;
  tg_id: number;
  first_name: string | null;
  state: "in" | "done";
  ts: string;
}

/** Включить группу (или переактивировать, обновив название). TZ/время не трогаем. */
export async function upsertGroupChat(
  db: D1Database,
  chatId: number,
  title: string | null,
  defaultTz: string,
): Promise<GroupChatRow> {
  await db
    .prepare(
      `INSERT INTO group_chats (chat_id, title, timezone) VALUES (?, ?, ?)
       ON CONFLICT(chat_id) DO UPDATE SET title = excluded.title, enabled = 1`,
    )
    .bind(chatId, title, defaultTz)
    .run();
  const row = await getGroupChat(db, chatId);
  if (!row) throw new Error(`Failed to upsert group ${chatId}`);
  return row;
}

export async function getGroupChat(
  db: D1Database,
  chatId: number,
): Promise<GroupChatRow | null> {
  return await db
    .prepare("SELECT * FROM group_chats WHERE chat_id = ?")
    .bind(chatId)
    .first<GroupChatRow>();
}

export async function listEnabledGroups(db: D1Database): Promise<GroupChatRow[]> {
  const r = await db
    .prepare("SELECT * FROM group_chats WHERE enabled = 1")
    .all<GroupChatRow>();
  return r.results;
}

export async function disableGroupChat(db: D1Database, chatId: number): Promise<void> {
  await db.prepare("UPDATE group_chats SET enabled = 0 WHERE chat_id = ?").bind(chatId).run();
}

/**
 * «Занять» слот (chat, day, kind). true — слот наш (строки не было), можно
 * постить; false — уже занят (постили раньше). Закрытым по умолчанию создаём
 * plate/weekly — их закрывать не нужно.
 */
export async function claimGroupWindow(
  db: D1Database,
  chatId: number,
  day: string,
  kind: GroupWindowKind,
  postedAtIso: string,
): Promise<number | null> {
  const closed = kind === "morning" || kind === "evening" ? 0 : 1;
  const r = await db
    .prepare(
      `INSERT OR IGNORE INTO group_windows (chat_id, day, kind, posted_at, closed)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(chatId, day, kind, postedAtIso, closed)
    .run();
  if (!r.meta.changes) return null;
  return r.meta.last_row_id;
}

export async function setGroupWindowMessage(
  db: D1Database,
  windowId: number,
  messageId: number,
): Promise<void> {
  await db
    .prepare("UPDATE group_windows SET message_id = ? WHERE id = ?")
    .bind(messageId, windowId)
    .run();
}

/** Отдать слот обратно (отправка не удалась — на следующем тике повторим). */
export async function releaseGroupWindow(db: D1Database, windowId: number): Promise<void> {
  await db.prepare("DELETE FROM group_windows WHERE id = ?").bind(windowId).run();
}

export async function getGroupWindow(
  db: D1Database,
  windowId: number,
): Promise<GroupWindowRow | null> {
  return await db
    .prepare("SELECT * FROM group_windows WHERE id = ?")
    .bind(windowId)
    .first<GroupWindowRow>();
}

/** Открытые окна утро/вечер, опубликованные не позже cutoffIso. */
export async function openWindowsToClose(
  db: D1Database,
  chatId: number,
  cutoffIso: string,
): Promise<GroupWindowRow[]> {
  const r = await db
    .prepare(
      `SELECT * FROM group_windows
       WHERE chat_id = ? AND closed = 0 AND kind IN ('morning','evening')
         AND message_id IS NOT NULL AND posted_at <= ?`,
    )
    .bind(chatId, cutoffIso)
    .all<GroupWindowRow>();
  return r.results;
}

export async function closeGroupWindow(db: D1Database, windowId: number): Promise<void> {
  await db.prepare("UPDATE group_windows SET closed = 1 WHERE id = ?").bind(windowId).run();
}

export async function getGroupCheckin(
  db: D1Database,
  windowId: number,
  tgId: number,
): Promise<GroupCheckinRow | null> {
  return await db
    .prepare("SELECT * FROM group_checkins WHERE window_id = ? AND tg_id = ?")
    .bind(windowId, tgId)
    .first<GroupCheckinRow>();
}

/** state 'done' перекрывает 'in' и обратно не понижается. */
export async function upsertGroupCheckin(
  db: D1Database,
  windowId: number,
  tgId: number,
  firstName: string,
  state: "in" | "done",
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO group_checkins (window_id, tg_id, first_name, state)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(window_id, tg_id) DO UPDATE SET
         first_name = excluded.first_name,
         state = CASE WHEN group_checkins.state = 'done' OR excluded.state = 'done'
                      THEN 'done' ELSE 'in' END`,
    )
    .bind(windowId, tgId, firstName, state)
    .run();
}

export async function listGroupCheckins(
  db: D1Database,
  windowId: number,
): Promise<GroupCheckinRow[]> {
  const r = await db
    .prepare("SELECT * FROM group_checkins WHERE window_id = ? ORDER BY id")
    .bind(windowId)
    .all<GroupCheckinRow>();
  return r.results;
}

/** Недельные агрегаты по окнам утро/вечер за [fromDay..toDay] (включительно). */
export async function groupWeekStats(
  db: D1Database,
  chatId: number,
  fromDay: string,
  toDay: string,
): Promise<{ windows: number; participations: number; people: number }> {
  const w = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM group_windows
       WHERE chat_id = ? AND kind IN ('morning','evening') AND day BETWEEN ? AND ?`,
    )
    .bind(chatId, fromDay, toDay)
    .first<{ n: number }>();
  const c = await db
    .prepare(
      `SELECT COUNT(*) AS n, COUNT(DISTINCT c.tg_id) AS p
       FROM group_checkins c JOIN group_windows w ON w.id = c.window_id
       WHERE w.chat_id = ? AND w.kind IN ('morning','evening') AND w.day BETWEEN ? AND ?`,
    )
    .bind(chatId, fromDay, toDay)
    .first<{ n: number; p: number }>();
  return { windows: w?.n ?? 0, participations: c?.n ?? 0, people: c?.p ?? 0 };
}

/**
 * Юзер, которого бот видит впервые в группе, не должен начать получать личные
 * напоминания (он их не просил и бот не может писать первым): создаём строку
 * с reminders_on = 0. Уже существующих не трогаем.
 */
export async function ensureUserQuiet(db: D1Database, tgId: number): Promise<UserRow> {
  const existing = await getUser(db, tgId);
  if (existing) return existing;
  const u = await ensureUser(db, tgId);
  await db.prepare("UPDATE users SET reminders_on = 0 WHERE tg_id = ?").bind(tgId).run();
  return { ...u, reminders_on: 0 };
}


// ============================================================================
// ДНЕВНИК НОГИ (leg_diary) + ТАЙМЕР ПРОГУЛКИ
// ============================================================================

export interface LegDiaryRow {
  id: number;
  tg_id: number;
  day: string;
  score: number | null;
  swelling: number;
  walk_min: number;
  note: string | null;
  ts: string;
}

export async function getDiaryDay(
  db: D1Database,
  tgId: number,
  day: string,
): Promise<LegDiaryRow | null> {
  return await db
    .prepare("SELECT * FROM leg_diary WHERE tg_id = ? AND day = ?")
    .bind(tgId, day)
    .first<LegDiaryRow>();
}

/** Оценка 1..5 за день; повторный вызов перезаписывает. */
export async function upsertDiaryScore(
  db: D1Database,
  tgId: number,
  day: string,
  score: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO leg_diary (tg_id, day, score) VALUES (?, ?, ?)
       ON CONFLICT(tg_id, day) DO UPDATE SET score = excluded.score`,
    )
    .bind(tgId, day, score)
    .run();
}

/** Переключает отметку отёка за день, возвращает новое значение (1/0). */
export async function toggleDiarySwelling(
  db: D1Database,
  tgId: number,
  day: string,
): Promise<number> {
  await db
    .prepare(
      `INSERT INTO leg_diary (tg_id, day, swelling) VALUES (?, ?, 1)
       ON CONFLICT(tg_id, day) DO UPDATE SET swelling = 1 - swelling`,
    )
    .bind(tgId, day)
    .run();
  const row = await getDiaryDay(db, tgId, day);
  return row?.swelling ?? 0;
}

export async function addDiaryWalk(
  db: D1Database,
  tgId: number,
  day: string,
  minutes: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO leg_diary (tg_id, day, walk_min) VALUES (?, ?, ?)
       ON CONFLICT(tg_id, day) DO UPDATE SET walk_min = walk_min + excluded.walk_min`,
    )
    .bind(tgId, day, minutes)
    .run();
}

/** Записи за [fromDay..toDay] включительно, по возрастанию даты. */
export async function listDiaryRange(
  db: D1Database,
  tgId: number,
  fromDay: string,
  toDay: string,
): Promise<LegDiaryRow[]> {
  const r = await db
    .prepare(
      "SELECT * FROM leg_diary WHERE tg_id = ? AND day >= ? AND day <= ? ORDER BY day ASC",
    )
    .bind(tgId, fromDay, toDay)
    .all<LegDiaryRow>();
  return r.results;
}

/** Все, у кого идёт прогулка — независимо от reminders_on. */
export async function usersWalking(db: D1Database): Promise<UserRow[]> {
  const r = await db
    .prepare("SELECT * FROM users WHERE walk_started_at IS NOT NULL")
    .all<UserRow>();
  return r.results;
}

export async function startWalk(
  db: D1Database,
  tgId: number,
  startedIso: string,
): Promise<void> {
  await db
    .prepare("UPDATE users SET walk_started_at = ?, walk_warned = 0 WHERE tg_id = ?")
    .bind(startedIso, tgId)
    .run();
}

/**
 * Сбрасывает прогулку. Возвращает true, если она реально шла (атомарно:
 * два параллельных стопа не запишут минуты дважды).
 */
export async function clearWalk(db: D1Database, tgId: number): Promise<boolean> {
  const r = await db
    .prepare(
      "UPDATE users SET walk_started_at = NULL, walk_warned = 0 WHERE tg_id = ? AND walk_started_at IS NOT NULL",
    )
    .bind(tgId)
    .run();
  return (r.meta?.changes ?? 0) > 0;
}

export async function markWalkWarned(db: D1Database, tgId: number): Promise<void> {
  await db.prepare("UPDATE users SET walk_warned = 1 WHERE tg_id = ?").bind(tgId).run();
}
