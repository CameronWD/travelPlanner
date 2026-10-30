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
 * changed since the plan. Item opening hours, link and business status are
 * fetched at execute time, only for planned venue matches, and fill only
 * what is empty; hours go to the Item family and never cross a Surprise.
 * Enterprise detail calls bypass the app's daily cap (takeGoogleQuota), so
 * raise the console quotas first. No Activity rows.
 */
import "./load-env";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { hasServerKey, lookUpPlace, lookUpVenue, type GeoCandidate, type Lookup, type VenueMatch } from "@/lib/geocode";
import type { LatLng } from "@/lib/geo";
import {
  KINDS,
  PLAN_FILE,
  errorStreak,
  formatRow,
  hasAnchor,
  needsDetails,
  plannedHomeTimezone,
  plannedSet,
  plannedStopTimezone,
  readPlan,
  verdict,
  type BackfillKind,
  type BackfillVerdict,
  type Plan,
  type PlanRow,
} from "@/lib/backfill-places";
import { applyPlanRow, fillItemDetails } from "@/lib/backfill-places-apply";
import { dbTargetLine } from "./lib/script-guards";

const REFUSING = "Google is refusing lookups: check the Geocoding/Places quotas.";

type Found = GeoCandidate | VenueMatch;

interface Candidate {
  kind: BackfillKind;
  id: string;
  query: string;
  old: LatLng | null;
  anchor: string;
  lookup: () => Promise<Lookup<Found>>;
  plan: (found: Found, v: BackfillVerdict) => Pick<PlanRow, "set" | "details">;
}

const point = (lat: number | null, lng: number | null): LatLng | null => (lat != null && lng != null ? { lat, lng } : null);
const join = (...parts: (string | null | undefined)[]) => parts.map((p) => p?.trim()).filter(Boolean).join(", ");
const matchedOf = (f: Found) => ("matched" in f ? f.matched : undefined);

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
      { kind: "transport-dep" as const, place: r.depPlace, placeId: r.depPlaceId, old: point(r.depLat, r.depLng) },
      { kind: "transport-arr" as const, place: r.arrPlace, placeId: r.arrPlaceId, old: point(r.arrLat, r.arrLng) },
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
      lookup: () => lookUpPlace(name),
      plan: (f, v) => ({ set: plannedSet("home", f, plannedHomeTimezone(r, v, f)), details: false }),
    });
  }

  return out;
}

async function dryRun(planPath: string) {
  console.log(dbTargetLine(process.env, true));
  if (!hasServerKey()) {
    console.error("GOOGLE_MAPS_SERVER_KEY is not set; nothing to look up. Aborting.");
    process.exitCode = 1;
    return;
  }

  const candidates = await collect();
  const tally = new Map(KINDS.map((k) => [k, { scanned: 0, accept: 0, new: 0, "too-far": 0, "address-only": 0, "no-match": 0, error: 0, "no-anchor": 0 }]));
  const streak = errorStreak();
  const rows: PlanRow[] = [];

  for (const c of candidates) {
    const anchored = hasAnchor(c.anchor, c.old);
    const result = anchored ? await c.lookup() : null;
    const found = result?.status === "ok" ? result.candidate : null;
    const matched = found ? matchedOf(found) : undefined;
    const v: BackfillVerdict = !result ? "no-anchor" : result.status === "error" ? "error" : verdict(c.kind, c.old, found && { ...found, matched });
    console.log(formatRow({ kind: c.kind, id: c.id, query: c.query, old: c.old, next: found && { ...found, matched }, verdict: v }));
    const t = tally.get(c.kind)!;
    t.scanned++;
    t[v]++;
    if (result && streak.record(result.status === "error")) {
      console.error(`\n${REFUSING}\nStopped after 5 failed lookups in a row. No plan written.`);
      process.exitCode = 1;
      return;
    }
    if (found && (v === "accept" || v === "new")) {
      rows.push({ kind: c.kind, id: c.id, query: c.query, verdict: v, matched: matched ?? null, address: found.address, old: c.old, ...c.plan(found, v) });
    }
  }

  console.log("\nkind · scanned / accept / new / too-far / address-only / no-match / error / no anchor (skipped)");
  for (const k of KINDS) {
    const t = tally.get(k)!;
    console.log(`${k} · ${t.scanned} / ${t.accept} / ${t.new} / ${t["too-far"]} / ${t["address-only"]} / ${t["no-match"]} / ${t.error} / ${t["no-anchor"]}`);
  }

  const plan: Plan = { version: 1, createdAt: new Date().toISOString(), rows };
  writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  const details = rows.filter((r) => r.details).length;
  console.log(`\nPlan: ${rows.length} rows to write, ${details} Enterprise detail calls at execute. Written to ${planPath}`);
  console.log("Read it, then apply it within 24 hours: npm run backfill:places -- --execute");
}

async function execute(planPath: string) {
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

  const counts = { written: 0, changed: 0, failed: 0 };
  const details = { calls: 0, filled: 0, empty: 0, failed: 0 };
  const streak = errorStreak();

  for (const row of rows) {
    let outcome: "written" | "changed";
    try {
      outcome = await applyPlanRow(row);
    } catch (err) {
      counts.failed++;
      console.error(`${row.kind} ${row.id}: write failed, row left unchanged:`, err);
      continue;
    }
    counts[outcome]++;
    if (outcome === "changed") {
      console.log(`${row.kind} ${row.id} · SKIPPED · changed since the plan (or already written)`);
      continue;
    }
    console.log(`${row.kind} ${row.id} · WRITTEN`);
    const placeId = row.set.placeId;
    if (!row.details || typeof placeId !== "string") continue;
    details.calls++;
    const filled = await fillItemDetails(row.id, placeId).catch(() => "failed" as const);
    details[filled]++;
    if (filled === "failed") console.error(`  item ${row.id}: coordinates and place ID committed; details failed`);
    if (streak.record(filled === "failed")) {
      console.error(`\n${REFUSING}\nStopped after 5 failed detail calls in a row. Re-run the same command to resume: rows already written are skipped.`);
      process.exitCode = 1;
      break;
    }
  }

  console.log(`\nRows: ${counts.written} written / ${counts.changed} skipped (changed since the plan) / ${counts.failed} failed`);
  console.log(`Enterprise detail calls: ${details.calls} (${details.filled} filled / ${details.empty} empty / ${details.failed} failed)`);
}

async function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf("--execute");
  if (at === -1) return dryRun(path.resolve(PLAN_FILE));
  const named = args[at + 1];
  return execute(path.resolve(named && !named.startsWith("--") ? named : PLAN_FILE));
}

main()
  .then(() => process.exit(typeof process.exitCode === "number" ? process.exitCode : 0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
