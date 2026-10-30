import type { AiBinding } from "./ai";

export interface Env {
  DB: D1Database;
  DEFAULT_TZ: string;
  TELEGRAM_BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  /** Cloudflare Workers AI — embeddings для поиска по базе (bge-m3, бесплатно). */
  AI: AiBinding;
  /** Nebius — генерация ответа frontier-моделью (DeepSeek-V4-Pro). Секрет Worker'а. */
  NEBIUS_API_KEY: string;
  /** Секрет для guarded-роутов /admin/* (заливка KB и тест-запрос). Отдельно от вебхука. */
  INGEST_SECRET?: string;
  /**
   * Telegram user id владельца — единственный, кому /leg отдаёт personal-чанки
   * (scope='personal': данные про конкретного пациента). Секрет Worker'а:
   * `wrangler secret put OWNER_TG_ID`. Не задан → personal-чанки не получает никто.
   */
  OWNER_TG_ID?: string;
}
