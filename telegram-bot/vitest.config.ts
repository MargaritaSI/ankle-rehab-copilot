import path from "node:path";
import {
  defineWorkersConfig,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig(async () => {
  const migrationsPath = path.join(__dirname, "migrations");
  const migrations = await readD1Migrations(migrationsPath);

  return {
    test: {
      poolOptions: {
        workers: {
          // НЕ читаем wrangler.toml напрямую: там [ai]-биндинг, который
          // vitest-pool-workers/miniflare не поднимает в тестовой среде
          // (__WRANGLER_EXTERNAL_AI_WORKER). Юнит-тесты AI не вызывают.
          miniflare: {
            compatibilityDate: "2024-09-23",
            compatibilityFlags: ["nodejs_compat"],
            d1Databases: ["DB"],
            bindings: { TEST_MIGRATIONS: migrations },
          },
        },
      },
    },
  };
});
