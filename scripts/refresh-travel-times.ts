/**
 * Fills the TravelTime cache for every live Trip (Branch 3, Travel times).
 * Run after the places backfill. Each Trip is refreshed until a run fetches
 * nothing new or Google's app quota for the day (ROUTES_DAILY_CAP) refuses;
 * a refused Trip and the ones after it fill on a later run or after their
 * next plan write. Keyless, it only counts what it would fetch.
 *
 *   npm run travel-times:refresh
 */
import "./load-env";
import { db } from "@/lib/db";
import { hasServerKey } from "@/lib/google-fetch";
import { refreshTripTravelTimes, type RefreshCounts } from "@/lib/travel-times/refresh";
import { dbTargetLine } from "./lib/script-guards";

async function main() {
  console.log(dbTargetLine(process.env, !hasServerKey()));
  const trips = await db.trip.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } });
  const total: RefreshCounts = { wanted: 0, fetched: 0, skippedQuota: 0, failed: 0 };

  for (const trip of trips) {
    const sum: RefreshCounts = { wanted: 0, fetched: 0, skippedQuota: 0, failed: 0 };
    for (;;) {
      const run = await refreshTripTravelTimes(trip.id);
      if (sum.wanted === 0) sum.wanted = run.wanted;
      sum.fetched += run.fetched;
      sum.failed += run.failed;
      sum.skippedQuota = run.skippedQuota;
      if (run.skippedQuota > 0 || run.fetched + run.failed === 0) break;
    }
    console.log(`${trip.name} (${trip.id}): wanted ${sum.wanted}, fetched ${sum.fetched}, failed ${sum.failed}, skipped (quota) ${sum.skippedQuota}`);
    total.wanted += sum.wanted;
    total.fetched += sum.fetched;
    total.failed += sum.failed;
    total.skippedQuota += sum.skippedQuota;
    if (sum.skippedQuota > 0) {
      console.log("Daily Routes quota reached: the remaining Trips fill on a later run.");
      break;
    }
  }

  console.log(`Total: wanted ${total.wanted}, fetched ${total.fetched}, failed ${total.failed}, skipped (quota) ${total.skippedQuota}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
