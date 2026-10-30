-- ============================================================================
-- Addsport bot — initial schema. Полный порт SCHEMA из db.py.
-- Плюс fsm_state (FSM в D1 вместо MemoryStorage).
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    tg_id INTEGER PRIMARY KEY,
    daily_goal_min INTEGER NOT NULL DEFAULT 60,
    reminder_interval_min INTEGER NOT NULL DEFAULT 60,
    mode TEXT NOT NULL DEFAULT 'useful_first',
    reminders_on INTEGER NOT NULL DEFAULT 1,
    last_reminder_at TIMESTAMP,
    reminder_start_min INTEGER NOT NULL DEFAULT 480,
    reminder_end_min INTEGER NOT NULL DEFAULT 1410,
    last_morning_at TEXT,
    last_evening_at TEXT,
    sex TEXT NOT NULL DEFAULT 'f',
    age INTEGER NOT NULL DEFAULT 35,
    height_cm INTEGER NOT NULL DEFAULT 173,
    weight_kg INTEGER NOT NULL DEFAULT 62,
    activity_level INTEGER NOT NULL DEFAULT 1,
    last_food_push_at TEXT,
    timezone TEXT NOT NULL DEFAULT 'Europe/Amsterdam',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tg_id INTEGER NOT NULL,
    exercise_ids TEXT NOT NULL,
    minutes INTEGER NOT NULL,
    mode TEXT,
    situation TEXT,
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_ts ON sessions(tg_id, ts);

CREATE TABLE IF NOT EXISTS reflections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tg_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tg_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    period TEXT NOT NULL,
    target INTEGER NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(tg_id);

CREATE TABLE IF NOT EXISTS food_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tg_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    protein_g INTEGER NOT NULL DEFAULT 0,
    kcal INTEGER NOT NULL DEFAULT 0,
    water_ml INTEGER NOT NULL DEFAULT 0,
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_food_user_ts ON food_entries(tg_id, ts);

CREATE TABLE IF NOT EXISTS food_states (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tg_id INTEGER NOT NULL,
    level INTEGER NOT NULL,
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_food_states_user_ts ON food_states(tg_id, ts);

CREATE TABLE IF NOT EXISTS fsm_state (
    tg_id INTEGER PRIMARY KEY,
    state TEXT,
    data TEXT NOT NULL DEFAULT '{}',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
