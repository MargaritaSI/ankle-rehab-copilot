-- ============================================================================
-- Leg-RAG: база знаний по восстановлению ноги (чанки статей + эмбеддинги).
-- Источники реальные (см. scripts/leg_kb_chunks.json). Поиск — косинус в Worker.
-- embedding хранится как JSON-массив float (Cloudflare Workers AI bge-m3, 1024).
-- ============================================================================

CREATE TABLE IF NOT EXISTS leg_kb (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic TEXT NOT NULL,
    source_title TEXT NOT NULL,
    source_url TEXT NOT NULL,
    chunk_idx INTEGER NOT NULL DEFAULT 0,
    text TEXT NOT NULL,
    embedding TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_leg_kb_topic ON leg_kb(topic);
