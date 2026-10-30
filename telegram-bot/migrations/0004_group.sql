-- ============================================================================
-- Групповые «окна»: люди в одной Telegram-группе практикуют вместе в два
-- фиксированных окна (09:00 и 20:00 локально). Бот постит, люди жмут кнопки,
-- бот считает. Без ИИ, без рейтингов.
-- ============================================================================

CREATE TABLE IF NOT EXISTS group_chats (
    chat_id INTEGER PRIMARY KEY,
    title TEXT,
    timezone TEXT NOT NULL DEFAULT 'Europe/Amsterdam',
    morning_min INTEGER NOT NULL DEFAULT 540,   -- 09:00
    evening_min INTEGER NOT NULL DEFAULT 1200,  -- 20:00
    plate_min INTEGER NOT NULL DEFAULT 1020,    -- 17:00
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS group_windows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    day TEXT NOT NULL,              -- YYYY-MM-DD, локальная дата группы
    kind TEXT NOT NULL,             -- morning | evening | plate | weekly
    message_id INTEGER,
    posted_at TEXT,                 -- ISO UTC момента открытия
    closed INTEGER NOT NULL DEFAULT 0,
    UNIQUE (chat_id, day, kind)
);

CREATE INDEX IF NOT EXISTS idx_group_windows_open ON group_windows(closed, kind);

CREATE TABLE IF NOT EXISTS group_checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    window_id INTEGER NOT NULL,
    tg_id INTEGER NOT NULL,
    first_name TEXT,
    state TEXT NOT NULL,            -- in | done
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (window_id, tg_id)
);
