import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

/**
 * Prisma client singleton.
 *
 * Prisma 7 requires a driver adapter; for our SQLite dev datasource that is
 * `@prisma/adapter-better-sqlite3`, pointed at `DATABASE_URL`. In production
 * (Postgres) swap the adapter accordingly.
 *
 * We cache the instance on `globalThis` so Next.js's dev hot-reload doesn't
 * spin up a new client (and a new connection pool) on every module reload.
 */
function createPrismaClient() {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
