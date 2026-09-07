import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma client singleton.
 *
 * Prisma 7 requires a driver adapter. We use @prisma/adapter-pg, which talks to
 * any Postgres over TCP — a local docker-compose Postgres in dev, and Neon's
 * pooled connection string in production. DATABASE_URL is the *pooled* URL used
 * by the running app; migrations use the direct URL (see prisma.config.ts).
 *
 * We cache the instance on globalThis so Next.js's dev hot-reload doesn't spin
 * up a new client (and a new pool) on every module reload.
 */
function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. The app cannot run without Postgres — set it in .env (see .env.example) or the deployment environment.",
    );
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
