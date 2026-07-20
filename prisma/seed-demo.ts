import { pathToFileURL } from "node:url";
import { db } from "../lib/db";
import { todayISO } from "../lib/dates";
import { buildDemo } from "../lib/demo";
import { ensureUsers, wipeDemo, persistGlobe, persistTrip } from "./demo/persist";

/**
 * Rich demo seeder — builds the full demo suite (6 trips + a shared Globe) from
 * the pure builders in lib/demo/ and persists it. Idempotent: wipeDemo() clears
 * any prior demo trips (by name) and the demo users' Globe before recreating.
 *
 *   Run with:  npm run db:seed:demo   (needs a running Postgres)
 */
export async function seedDemo(): Promise<void> {
  const data = buildDemo(todayISO());
  const users = await ensureUsers();
  await wipeDemo();
  const markerIds = await persistGlobe(data.globe, users);
  for (const trip of data.trips) await persistTrip(trip, users, markerIds);
  console.log(`\n✅ Seeded ${data.trips.length} demo trips + a shared Globe (${data.globe.markers.length} markers).`);
  console.log(`   ${data.trips.map((t) => t.name).join(", ")}`);
  console.log(`   Sign in as you@example.com and open the trips.\n`);
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  seedDemo()
    .then(() => db.$disconnect())
    .catch(async (err) => {
      console.error(err);
      await db.$disconnect();
      process.exit(1);
    });
}
