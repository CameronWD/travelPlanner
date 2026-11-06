/**
 * Fills Regions (and Transport end countries) on rows that already carry a
 * Google place ID, then warms the public holiday feed cache.
 *
 *   npm run regions:fill              # dry run: looks up and prints, writes nothing
 *   npm run regions:fill -- --execute # writes only rows whose Region (and country) is still empty
 *
 * One Place Details lookup (Essentials) per row. The holiday feeds are public
 * (no key, no quota), so the warm runs in both modes.
 */
import "./load-env";
import { db } from "@/lib/db";
import { hasServerKey, lookUpRegion } from "@/lib/geocode";
import { refreshHolidayFeeds } from "@/lib/holidays/cache";
import { dbTargetLine } from "./lib/script-guards";
import { distinctCountries, selectTargets, type RegionTarget } from "./lib/fill-regions";

const MAX_CONSECUTIVE_FAILURES = 5;

async function write(target: RegionTarget, found: { countryCode: string; region: string | null }) {
  const { id } = target;
  if (target.kind === "stop") {
    if (found.region) await db.stop.updateMany({ where: { id, region: null }, data: { region: found.region } });
  } else if (target.kind === "home") {
    if (found.region) await db.trip.updateMany({ where: { id, homeRegion: null }, data: { homeRegion: found.region } });
  } else if (target.kind === "transport-dep") {
    if (found.region) await db.transport.updateMany({ where: { id, depRegion: null }, data: { depRegion: found.region } });
    if (target.needsCountry) await db.transport.updateMany({ where: { id, depCountryCode: null }, data: { depCountryCode: found.countryCode } });
  } else {
    if (found.region) await db.transport.updateMany({ where: { id, arrRegion: null }, data: { arrRegion: found.region } });
    if (target.needsCountry) await db.transport.updateMany({ where: { id, arrCountryCode: null }, data: { arrCountryCode: found.countryCode } });
  }
}

async function main() {
  const execute = process.argv.slice(2).includes("--execute");
  console.log(dbTargetLine(process.env, !execute));
  if (!hasServerKey()) {
    console.error("GOOGLE_MAPS_SERVER_KEY is not set; nothing to look up. Aborting.");
    process.exitCode = 1;
    return;
  }

  const live = { trip: { deletedAt: null } };
  const stops = await db.stop.findMany({ where: live, select: { id: true, name: true, placeId: true, region: true, countryCode: true } });
  const trips = await db.trip.findMany({
    where: { deletedAt: null },
    select: { id: true, homeName: true, homePlaceId: true, homeRegion: true, homeCountryCode: true },
  });
  const transports = await db.transport.findMany({
    where: live,
    select: {
      id: true,
      depPlace: true,
      depPlaceId: true,
      depRegion: true,
      depCountryCode: true,
      depIsHome: true,
      arrPlace: true,
      arrPlaceId: true,
      arrRegion: true,
      arrCountryCode: true,
      arrIsHome: true,
    },
  });

  const targets = selectTargets({ stops, trips, transports });
  const countries: (string | null)[] = [
    ...stops.map((s) => s.countryCode),
    ...trips.map((t) => t.homeCountryCode),
    ...transports.flatMap((x) => [x.depCountryCode, x.arrCountryCode]),
  ];

  let filled = 0;
  let missed = 0;
  let failed = 0;
  let streak = 0;
  for (const target of targets) {
    const found = await lookUpRegion(target.placeId);
    if (!found) {
      failed++;
      streak++;
      console.log(`${target.kind} ${target.id} · ${target.label} · lookup failed`);
      if (streak >= MAX_CONSECUTIVE_FAILURES) {
        console.error("Google is refusing lookups: check the GetPlace quota.");
        process.exitCode = 1;
        break;
      }
      continue;
    }
    streak = 0;
    countries.push(found.countryCode);
    console.log(`${target.kind} ${target.id} · ${target.label} · → ${found.countryCode} / ${found.region ?? "(no Region)"}`);
    if (!found.region) missed++;
    else filled++;
    if (execute) await write(target, found);
  }

  console.log(
    `${targets.length} rows to fill · ${filled} with a Region · ${missed} without one · ${failed} failed${execute ? " · written" : " · dry run, nothing written"}`,
  );

  const codes = distinctCountries(countries);
  await refreshHolidayFeeds(codes);
  console.log(`Holiday feeds warmed for ${codes.length} countries: ${codes.join(", ")}`);
}

main()
  .then(() => process.exit(typeof process.exitCode === "number" ? process.exitCode : 0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
