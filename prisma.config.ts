import "dotenv/config";
import { defineConfig } from "@prisma/config";

/**
 * Prisma 7 config. The datasource connection URL and the seed command live
 * here (no longer in schema.prisma). `.env` is loaded via `dotenv/config`
 * above because Prisma 7's CLI does not auto-load it.
 *
 * Migrations run against the DIRECT (unpooled) connection. Neon's pooled
 * endpoint (PgBouncer) can't run all migration statements; the running app
 * uses the pooled DATABASE_URL via the driver adapter in lib/db.ts. Locally,
 * DIRECT_URL and DATABASE_URL are the same docker Postgres.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  },
});
