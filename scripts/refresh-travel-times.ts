/**
 * Fills the TravelTime cache for every live Trip (Branch 3, Travel times).
 * Run after the places backfill.
 *
 *   npm run travel-times:refresh              # dry run: how many keys each Trip needs; no Routes calls, no writes
 *   npm run travel-times:refresh -- --execute # fetches them
 *
 * Trips still to come, under way or undated go first, finished ones last.
 * --execute refreshes each Trip until a pass fetches nothing or Google's app
 * quota for the day (ROUTES_DAILY_CAP) refuses; it stops at the first refusal,
 * and the rest fill on a later run or after their next plan write.
 */
import "./load-env";
import { db } from "@/lib/db";
import { formatISODate } from "@/lib/dates";
import { hasServerKey } from "@/lib/google-fetch";
import { refreshTripTravelTimes, type RefreshCounts } from "@/lib/travel-times/refresh";
import { dbTargetLine } from "./lib/script-guards";
import { refreshOrder } from "./lib/travel-times-order";

async function main() {
  const execute = process.argv.slice(2).includes("--execute");
  console.log(dbTargetLine(process.env, !execute));
  if (execute && !hasServerKey()) {
    console.error("GOOGLE_MAPS_SERVER_KEY is not set: nothing can be fetched.");
    process.exitCode = 1;
    return;
  }

  const trips = refreshOrder(
    await db.trip.findMany({ where: { deletedAt: null }, select: { id: true, name: true, endDate: true }, orderBy: { createdAt: "asc" } }),
    formatISODate(new Date()),
  );
  const total: RefreshCounts = { wanted: 0, fetched: 0, skippedQuota: 0, failed: 0 };

  for (const trip of trips) {
    if (!execute) {
      const { wanted } = await refreshTripTravelTimes(trip.id, { dryRun: true });
      console.log(`${trip.name} (${trip.id}): needs ${wanted}`);
      total.wanted += wanted;
      continue;
    }

    const sum: RefreshCounts = { wanted: 0, fetched: 0, skippedQuota: 0, failed: 0 };
    for (let pass = 0; ; pass++) {
      const run = await refreshTripTravelTimes(trip.id);
      if (pass === 0) sum.wanted = run.wanted;
      sum.fetched += run.fetched;
      sum.failed += run.failed;
      sum.skippedQuota = run.skippedQuota;
      if (run.skippedQuota > 0 || run.fetched === 0) break;
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

  console.log(
    execute
      ? `Total: wanted ${total.wanted}, fetched ${total.fetched}, failed ${total.failed}, skipped (quota) ${total.skippedQuota}`
      : `Total: ${total.wanted} keys to fetch. Re-run with --execute to fetch them.`,
  );
}

main()
  .then(() => process.exit(typeof process.exitCode === "number" ? process.exitCode : 0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
