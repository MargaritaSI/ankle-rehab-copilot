-- ============================================================================
-- Вечерний дневник ноги (1–5) и таймер прогулки /walk.
-- ============================================================================

CREATE TABLE IF NOT EXISTS leg_diary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tg_id INTEGER NOT NULL,
    day TEXT NOT NULL,                       -- YYYY-MM-DD, локальная дата юзера
    score INTEGER,                           -- 1..5, NULL пока не ответила
    swelling INTEGER NOT NULL DEFAULT 0,
    walk_min INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tg_id, day)
);

CREATE INDEX IF NOT EXISTS idx_leg_diary_user_day ON leg_diary(tg_id, day);

ALTER TABLE users ADD COLUMN walk_started_at TEXT;
ALTER TABLE users ADD COLUMN walk_warned INTEGER NOT NULL DEFAULT 0;
