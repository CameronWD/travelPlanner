/**
 * npm run usage:report -- <trip id or slug> [--tz <IANA zone>]
 *
 * Prints a Trip's Usage as plain text: the same figures as the Usage section
 * on the Admin screen. READ-ONLY: it only calls readUsageOverview,
 * readUsageTripReport and two findFirst/findUnique lookups, which issue
 * SELECTs and nothing else. Like feedback:pull it reads production when
 * .env.production.local exists (see scripts/load-env.ts).
 */

import "./load-env";

import { db } from "../lib/db";
import { readUsageOverview, readUsageTripReport } from "../lib/usage/report";
import { renderUsageReport, resolveReportZone } from "../lib/usage/report-text";

function parseArgs(argv: string[]): { ref: string | null; tz: string | null } {
  let ref: string | null = null;
  let tz: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--tz") tz = argv[++i] ?? "";
    else if (!ref) ref = argv[i];
  }
  return { ref, tz };
}

async function findTrip(ref: string): Promise<{ id: string; name: string } | null> {
  const direct = await db.trip.findFirst({
    where: { OR: [{ id: ref }, { slug: ref }] },
    select: { id: true, name: true },
  });
  if (direct) return direct;
  const old = await db.tripSlug.findUnique({ where: { slug: ref }, select: { trip: { select: { id: true, name: true } } } });
  return old?.trip ?? null;
}

async function main() {
  const { ref, tz } = parseArgs(process.argv.slice(2));
  if (!ref) {
    console.error("Usage: npm run usage:report -- <trip id or slug> [--tz <IANA zone>]");
    await db.$disconnect();
    process.exit(1);
  }

  const resolved = resolveReportZone(tz, Intl.DateTimeFormat().resolvedOptions().timeZone);
  if ("error" in resolved) {
    console.error(resolved.error);
    await db.$disconnect();
    process.exit(1);
  }
  const timeZone = resolved.zone;

  const trip = await findTrip(ref);
  if (!trip) {
    console.error(`No Trip matches ${ref}.`);
    await db.$disconnect();
    process.exit(1);
  }

  const [overview, report] = await Promise.all([readUsageOverview(), readUsageTripReport(trip.id, timeZone)]);
  console.log(renderUsageReport(trip, overview, report, timeZone));

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});
