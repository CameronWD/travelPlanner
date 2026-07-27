import { config } from "dotenv";

/**
 * Seed the real "Christmas in Europe 2026" trip into a *remote* database
 * (Neon prod).
 *
 * Why this exists: `npm run db:seed:real` reads whatever DATABASE_URL is in the
 * shell, and `tsx` does not load .env — so it hits local docker Postgres, never
 * Neon. This wrapper loads .env.production.local FIRST, then runs the seed.
 *
 *   npm run db:seed:real:prod
 *
 * Env (all optional):
 *   SEED_PROD_ENV_FILE  env file to load (default ".env.production.local")
 *   DATABASE_URL        if already exported, wins over the env file
 *
 * The trip is owned by REAL_USER.email (prisma/real/persist.ts) — the real
 * account you sign into the deploy with — so no post-seed ownership grant is
 * needed (unlike the demo suite, which is owned by you@/partner@example.com).
 *
 * Re-running is safe: seedReal() wipes the trip by name and recreates it.
 *
 * NOTE: storage stays on whatever STORAGE_DRIVER the env file sets. If prod is
 * "local", the cover-gradient blob is ephemeral on Vercel and 404s — cosmetic,
 * unrelated to seeding. Trip / stop / transport / cost / checklist text seeds fine.
 */

const ENV_FILE = process.env.SEED_PROD_ENV_FILE || ".env.production.local";
config({ path: ENV_FILE });

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error(`No DATABASE_URL after loading "${ENV_FILE}". Aborting.`);
  }
  const masked = process.env.DATABASE_URL.replace(/:\/\/[^@]*@/, "://***@").replace(/\?.*$/, "");
  console.log(`⚠️  Seeding "Christmas in Europe 2026" to REMOTE DB: ${masked}`);

  // Dynamic imports so lib/db reads DATABASE_URL *after* the env file is loaded.
  const { db } = await import("../lib/db");
  const { seedReal } = await import("./seed-real");

  try {
    await seedReal();
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
