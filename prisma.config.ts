import "dotenv/config";
import { defineConfig, env } from "@prisma/config";

/**
 * Prisma 7 config. The datasource connection URL and the seed command live
 * here (no longer in schema.prisma). `.env` is loaded via `dotenv/config`
 * above because Prisma 7's CLI does not auto-load it.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
