import { config } from "dotenv";

/**
 * Seed the demo suite into a *remote* database (Neon prod) and grant a real
 * account ownership of every demo trip.
 *
 * Why this exists: `npm run db:seed:demo` reads whatever DATABASE_URL is in the
 * shell, and `tsx` does not load .env — so it hits local docker Postgres, never
 * Neon. This wrapper loads .env.production.local FIRST, then runs the seed, then
 * adds SEED_PROD_OWNER_EMAIL as an owner of each demo trip (the seeded trips are
 * owned by you@/partner@, which can't sign in on prod).
 *
 *   npm run db:seed:demo:prod
 *
 * Env (all optional):
 *   SEED_PROD_ENV_FILE     env file to load (default ".env.production.local")
 *   SEED_PROD_OWNER_EMAIL  account to make owner (default cammark.williams@gmail.com)
 *   DATABASE_URL           if already exported, wins over the env file
 *
 * NOTE: storage stays on whatever STORAGE_DRIVER the env file sets. Prod is
 * "local", so attachment/cover blobs are ephemeral on Vercel and images 404 —
 * pre-existing, unrelated to seeding. Trip/stop/cost/note text seeds fine.
 *
 * Re-running is safe: seedDemo() wipes demo-named trips + the demo users' globe
 * and recreates them (your real globe is never touched), and the ownership grant
 * is re-applied afterwards.
 */

const ENV_FILE = process.env.SEED_PROD_ENV_FILE || ".env.production.local";
config({ path: ENV_FILE });

const OWNER_EMAIL = process.env.SEED_PROD_OWNER_EMAIL || "cammark.williams@gmail.com";

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error(`No DATABASE_URL after loading "${ENV_FILE}". Aborting.`);
  }
  const masked = process.env.DATABASE_URL.replace(/:\/\/[^@]*@/, "://***@").replace(/\?.*$/, "");
  console.log(`⚠️  Seeding demo suite to REMOTE DB: ${masked}`);

  // Dynamic imports so lib/db reads DATABASE_URL *after* the env file is loaded.
  const { db } = await import("../lib/db");
  const { seedDemo } = await import("./seed-demo");
  const { DEMO_TRIP_NAMES } = await import("../lib/demo");

  try {
    await seedDemo();

    const owner = await db.user.findUnique({
      where: { email: OWNER_EMAIL },
      select: { id: true },
    });

    if (!owner) {
      console.warn(
        `\n⚠️  Owner "${OWNER_EMAIL}" not found on this DB — trips seeded but no ownership granted. Sign in once to create the account, then re-run.`,
      );
      return;
    }

    const trips = await db.trip.findMany({
      where: { name: { in: DEMO_TRIP_NAMES } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    for (const t of trips) {
      await db.tripMember.upsert({
        where: { tripId_userId: { tripId: t.id, userId: owner.id } },
        update: { role: "owner" },
        create: { tripId: t.id, userId: owner.id, role: "owner" },
      });
    }
    console.log(`\n✅ Granted "${OWNER_EMAIL}" owner on ${trips.length} demo trips.`);
    console.log(`   Refresh the deploy and open /trips.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
