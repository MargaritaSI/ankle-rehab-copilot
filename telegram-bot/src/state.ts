import type { D1Database } from "@cloudflare/workers-types";

export class StateManager {
  constructor(
    private db: D1Database,
    private tgId: number,
  ) {}

  async getState(): Promise<string | null> {
    const row = await this.db
      .prepare("SELECT state FROM fsm_state WHERE tg_id = ?")
      .bind(this.tgId)
      .first<{ state: string | null }>();
    return row?.state ?? null;
  }

  async getData(): Promise<Record<string, unknown>> {
    const row = await this.db
      .prepare("SELECT data FROM fsm_state WHERE tg_id = ?")
      .bind(this.tgId)
      .first<{ data: string }>();
    if (!row) return {};
    try {
      return JSON.parse(row.data) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  async setState(state: string | null): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO fsm_state (tg_id, state, data, updated_at)
         VALUES (?, ?, '{}', CURRENT_TIMESTAMP)
         ON CONFLICT(tg_id) DO UPDATE SET
           state = excluded.state,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(this.tgId, state)
      .run();
  }

  async updateData(patch: Record<string, unknown>): Promise<void> {
    const current = await this.getData();
    const merged = { ...current, ...patch };
    await this.db
      .prepare(
        `INSERT INTO fsm_state (tg_id, state, data, updated_at)
         VALUES (?, NULL, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(tg_id) DO UPDATE SET
           data = excluded.data,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(this.tgId, JSON.stringify(merged))
      .run();
  }

  async clear(): Promise<void> {
    await this.db
      .prepare("DELETE FROM fsm_state WHERE tg_id = ?")
      .bind(this.tgId)
      .run();
  }
}
