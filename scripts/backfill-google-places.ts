/**
 * One-time backfill of Google place IDs onto rows that still carry
 * OpenStreetMap coordinates (Branch 2, Places).
 *
 *   npm run backfill:places                          # dry run: looks up, prints, writes the plan file
 *   npm run backfill:places -- --execute [plan.json] # applies that plan (default ./backfill-places-plan.json)
 *
 * The dry run looks every row up with the same server helpers the app uses,
 * prints it with its verdict and writes the rows it would change (accept and
 * new) to the plan file, with the exact columns to set. Nothing else is
 * written. --execute applies exactly that file, with no location lookups;
 * it refuses a missing plan or one older than 24 hours, and skips a row that
 * changed since the plan (its place, point or looked-up text). Re-running it
 * resumes, retrying details that failed. Item opening hours, link and
 * business status are fetched at execute time, only for planned venue
 * matches, and fill only
 * what is empty; hours go to the Item family and never cross a Surprise.
 * Enterprise detail calls bypass the app's daily cap (takeGoogleQuota), so
 * raise the console quotas first. No Activity rows.
 */
import "./load-env";
import { readFileSync } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { hasServerKey, lookUpPlace, lookUpVenue } from "@/lib/geocode";
import type { LatLng } from "@/lib/geo";
import { PLAN_FILE, needsDetails, plannedHomeTimezone, plannedSet, plannedStopTimezone, readPlan, type Out } from "@/lib/backfill-places";
import { dryRun, type Candidate } from "@/lib/backfill-places-dry-run";
import { executePlan } from "@/lib/backfill-places-apply";
import { dbTargetLine } from "./lib/script-guards";

const terminal: Out = { log: (line) => console.log(line), error: (line) => console.error(line) };

const point = (lat: number | null, lng: number | null): LatLng | null => (lat != null && lng != null ? { lat, lng } : null);
const join = (...parts: (string | null | undefined)[]) => parts.map((p) => p?.trim()).filter(Boolean).join(", ");

async function collect(): Promise<Candidate[]> {
  const out: Candidate[] = [];

  const items = await db.item.findMany({
    where: { placeId: null, trip: { deletedAt: null }, OR: [{ address: { not: "" } }, { lat: { not: null } }] },
    select: { id: true, title: true, address: true, lat: true, lng: true, stop: { select: { lat: true, lng: true } } },
  });
  for (const r of items) {
    const old = point(r.lat, r.lng);
    const near = old ?? (r.stop ? point(r.stop.lat, r.stop.lng) : null);
    out.push({
      kind: "item",
      id: r.id,
      query: join(r.title, r.address),
      anchor: r.address ?? "",
      old,
      was: { title: r.title, address: r.address },
      lookup: () => lookUpVenue(r.title, r.address ?? "", { near: near ?? undefined }),
      plan: (f) => ({ set: plannedSet("item", f), details: needsDetails("item", r.address, f) }),
    });
  }

  const stops = await db.stop.findMany({
    where: { placeId: null, trip: { deletedAt: null } },
    select: { id: true, name: true, country: true, timezone: true, arriveDate: true, lat: true, lng: true },
  });
  for (const r of stops) {
    const old = point(r.lat, r.lng);
    const query = join(r.name, r.country);
    out.push({
      kind: "stop",
      id: r.id,
      query,
      anchor: query,
      old,
      was: { name: r.name, country: r.country },
      lookup: () => lookUpPlace(query, { near: old ?? undefined }),
      plan: (f, v) => ({ set: plannedSet("stop", f, plannedStopTimezone(r, v, f)), details: false }),
    });
  }

  const stays = await db.accommodation.findMany({
    where: { placeId: null, trip: { deletedAt: null }, OR: [{ address: { not: "" } }, { lat: { not: null } }] },
    select: { id: true, name: true, address: true, lat: true, lng: true, stop: { select: { lat: true, lng: true } } },
  });
  for (const r of stays) {
    const old = point(r.lat, r.lng);
    const near = old ?? point(r.stop.lat, r.stop.lng);
    out.push({
      kind: "accommodation",
      id: r.id,
      query: join(r.name, r.address),
      anchor: r.address ?? "",
      old,
      was: { name: r.name, address: r.address },
      lookup: () => lookUpVenue(r.name, r.address ?? "", { near: near ?? undefined }),
      plan: (f) => ({ set: plannedSet("accommodation", f), details: false }),
    });
  }

  const transports = await db.transport.findMany({
    where: { trip: { deletedAt: null }, OR: [{ depPlace: { not: null }, depPlaceId: null }, { arrPlace: { not: null }, arrPlaceId: null }] },
    select: { id: true, depPlace: true, depPlaceId: true, depLat: true, depLng: true, arrPlace: true, arrPlaceId: true, arrLat: true, arrLng: true },
  });
  for (const r of transports) {
    const ends = [
      { kind: "transport-dep" as const, column: "depPlace", place: r.depPlace, placeId: r.depPlaceId, old: point(r.depLat, r.depLng) },
      { kind: "transport-arr" as const, column: "arrPlace", place: r.arrPlace, placeId: r.arrPlaceId, old: point(r.arrLat, r.arrLng) },
    ];
    for (const end of ends) {
      const place = end.place;
      if (!place || end.placeId) continue;
      out.push({
        kind: end.kind,
        id: r.id,
        query: place,
        anchor: place,
        old: end.old,
        was: { [end.column]: place },
        lookup: () => lookUpPlace(place),
        plan: (f) => ({ set: plannedSet(end.kind, f), details: false }),
      });
    }
  }

  const markers = await db.marker.findMany({
    where: { placeId: null, OR: [{ lat: { not: null } }, { city: { not: "" } }, { country: { not: "" } }] },
    select: { id: true, title: true, city: true, country: true, lat: true, lng: true },
  });
  for (const r of markers) {
    const old = point(r.lat, r.lng);
    out.push({
      kind: "marker",
      id: r.id,
      query: join(r.title, r.city, r.country),
      anchor: join(r.city, r.country),
      old,
      was: { title: r.title, city: r.city, country: r.country },
      lookup: () => lookUpVenue(r.title, join(r.city, r.country), { near: old ?? undefined }),
      plan: (f) => ({ set: plannedSet("marker", f), details: false }),
    });
  }

  const trips = await db.trip.findMany({
    where: { homeName: { not: null }, homePlaceId: null, deletedAt: null },
    select: { id: true, homeName: true, homeTimezone: true, homeLat: true, homeLng: true },
  });
  for (const r of trips) {
    const name = r.homeName as string;
    out.push({
      kind: "home",
      id: r.id,
      query: name,
      anchor: name,
      old: point(r.homeLat, r.homeLng),
      was: { homeName: name },
      lookup: () => lookUpPlace(name),
      plan: (f, v) => ({ set: plannedSet("home", f, plannedHomeTimezone(r, v, f)), details: false }),
    });
  }

  return out;
}

async function runDry(planPath: string) {
  console.log(dbTargetLine(process.env, true));
  if (!hasServerKey()) {
    console.error("GOOGLE_MAPS_SERVER_KEY is not set; nothing to look up. Aborting.");
    process.exitCode = 1;
    return;
  }
  if (!(await dryRun(await collect(), planPath, terminal))) process.exitCode = 1;
}

async function runExecute(planPath: string) {
  console.log(dbTargetLine(process.env, false));
  let text: string | null = null;
  try {
    text = readFileSync(planPath, "utf8");
  } catch {
    text = null;
  }
  const read = readPlan(text, new Date());
  if (!read.ok) {
    console.error(`${planPath}: ${read.error}`);
    process.exitCode = 1;
    return;
  }
  const { rows } = read.plan;
  if (rows.some((r) => r.details) && !hasServerKey()) {
    console.error("GOOGLE_MAPS_SERVER_KEY is not set and the plan fetches venue details. Aborting.");
    process.exitCode = 1;
    return;
  }
  if (!(await executePlan(rows, terminal)).ok) process.exitCode = 1;
}

async function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf("--execute");
  if (at === -1) return runDry(path.resolve(PLAN_FILE));
  const named = args[at + 1];
  return runExecute(path.resolve(named && !named.startsWith("--") ? named : PLAN_FILE));
}

main()
  .then(() => process.exit(typeof process.exitCode === "number" ? process.exitCode : 0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
