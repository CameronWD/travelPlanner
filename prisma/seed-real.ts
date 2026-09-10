import { pathToFileURL } from "node:url";
import { buildChristmasEurope2026, summariseRealTrip } from "../lib/real-trip/christmas-europe-2026";
import { ensureRealUser, assertNoExistingRealTrip, persistRealTrip } from "./real/persist";

/**
 * Seeds Cam's real "Christmas in Europe 2026" trip under his account.
 *
 * ADDITIVE — it never deletes. If a trip of the same name already exists the
 * run aborts rather than wiping or duplicating it.
 *
 * Note: neither this module nor `./real/persist` imports `@/lib/db` at the
 * top level — `db` throws at module-evaluation time if DATABASE_URL isn't
 * set, and this sandbox has no local Postgres (the only DATABASE_URL ever
 * available here points at production). The dry-run path below never touches
 * `db`, so it needs no credentials and can't reach a database, real or
 * otherwise.
 *
 *   npm run db:seed:real:dry   # print what would be written, touch nothing
 *   npm run db:seed:real       # write it
 */
export async function seedReal(opts: { dryRun?: boolean } = {}): Promise<void> {
  const trip = buildChristmasEurope2026();

  if (opts.dryRun) {
    console.log("\n--- DRY RUN — nothing will be written ---\n");
    console.log(summariseRealTrip(trip));
    console.log("\n--- end dry run ---\n");
    return;
  }

  await assertNoExistingRealTrip(trip.name);
  const user = await ensureRealUser();
  await persistRealTrip(trip, user);
  console.log(`\n✅ Seeded "${trip.name}" for ${user.email}.\n`);
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const dryRun = process.argv.includes("--dry-run");
  seedReal({ dryRun })
    .then(async () => {
      // Dry runs never open a connection, so there's nothing to disconnect —
      // and importing `@/lib/db` here would defeat the point of a dry run.
      if (!dryRun) {
        const { db } = await import("../lib/db");
        await db.$disconnect();
      }
    })
    .catch(async (err) => {
      console.error(err);
      if (!dryRun) {
        const { db } = await import("../lib/db");
        await db.$disconnect();
      }
      process.exit(1);
    });
}
