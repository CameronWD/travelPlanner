import { pathToFileURL } from "node:url";
import { db } from "../lib/db";
import { buildChristmasEurope2026 } from "../lib/real-trip/christmas-europe-2026";
import { ensureRealUser, wipeRealTrip, persistRealTrip } from "./real/persist";

/**
 * Seeds Cameron & Xanthia's real "Christmas in Europe 2026" trip into the local
 * Postgres under Cameron's account. Idempotent: wipeRealTrip() clears any prior
 * trip of the same name before recreating.
 *
 *   Run with:  npm run db:seed:real   (needs a running Postgres)
 */
export async function seedReal(): Promise<void> {
  const trip = buildChristmasEurope2026();
  const user = await ensureRealUser();
  await wipeRealTrip();
  await persistRealTrip(trip, user);
  console.log(
    `\n✅ Seeded "${trip.name}" — ${trip.stops.length} stops, ${trip.transports.length} transports, ${trip.checklist?.length ?? 0} checklist items — for ${user.email}.\n`,
  );
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  seedReal()
    .then(() => db.$disconnect())
    .catch(async (err) => {
      console.error(err);
      await db.$disconnect();
      process.exit(1);
    });
}
