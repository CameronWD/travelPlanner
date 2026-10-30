/**
 * One-time backfill of Google place IDs onto rows that still carry
 * OpenStreetMap coordinates (Branch 2, Places).
 *
 *   npm run backfill:places              # dry run (default)
 *   npm run backfill:places -- --execute # write accept/new rows
 *
 * Every row is looked up with the same server helpers the app uses and printed
 * with its verdict. Only `accept` (the new point is within tolerance of the old
 * one) and `new` (the row had no point) are written. Item opening hours, link
 * and business status are filled only when empty; hours go to the Item family
 * and never cross a Surprise. Enterprise detail calls bypass the app's daily
 * cap (takeGoogleQuota), so raise the console quota first. No Activity rows.
 */
import "./load-env";
import { db } from "@/lib/db";
import { fetchVenueDetails, geocodePlaceDetailed, hasServerKey, locateVenue, type GeoCandidate } from "@/lib/geocode";
import type { LatLng } from "@/lib/geo";
import { formatRow, hasAnchor, verdict, type BackfillKind, type BackfillVerdict } from "@/lib/backfill-places";
import { itemFamilyRecipientsForSave, writeItemFamily } from "@/lib/item-family";
import { serializeOpeningHours } from "@/lib/validations/opening-hours";
import { safeWebHref } from "@/lib/url";
import { resolveHomeTimezone, resolveStopTimezone } from "@/lib/tz-point";
import { dbTargetLine } from "./lib/script-guards";

const KINDS: BackfillKind[] = ["item", "stop", "accommodation", "transport-dep", "transport-arr", "marker", "home"];

interface Candidate {
  kind: BackfillKind;
  id: string;
  query: string;
  old: LatLng | null;
  anchor: string;
  lookup: () => Promise<GeoCandidate | null>;
  write: (found: GeoCandidate, v: BackfillVerdict) => Promise<void>;
}

const point = (lat: number | null, lng: number | null): LatLng | null => (lat != null && lng != null ? { lat, lng } : null);
const join = (...parts: (string | null | undefined)[]) => parts.map((p) => p?.trim()).filter(Boolean).join(", ");

let detailCalls = 0;
const detailOutcomes = { filled: 0, empty: 0, failed: 0 };

async function fillItemDetails(itemId: string, placeId: string): Promise<void> {
  const item = await db.item.findUnique({
    where: { id: itemId },
    select: { id: true, tripId: true, sourceItemId: true, stopId: true, openingHours: true, link: true },
  });
  if (!item) return;
  detailCalls++;
  const details = await fetchVenueDetails(placeId);
  if (!details) {
    detailOutcomes.failed++;
    throw new Error("Google returned no details");
  }
  if (!details.openingHours && !details.website && !details.businessStatus) detailOutcomes.empty++;
  else detailOutcomes.filled++;
  const hours = item.openingHours ? null : serializeOpeningHours(details.openingHours);
  const link = item.link ? null : safeWebHref(details.website);
  await db.$transaction(async (tx) => {
    await tx.item.update({
      where: { id: item.id },
      data: {
        ...(hours ? { openingHours: hours } : {}),
        ...(link ? { link } : {}),
        ...(details.businessStatus ? { businessStatus: details.businessStatus } : {}),
      },
    });
    if (!hours) return;
    const recipients = await itemFamilyRecipientsForSave(item, { stopId: item.stopId }, tx);
    if (recipients.length === 0) return;
    const empty = await tx.item.findMany({
      where: { id: { in: recipients }, openingHours: null },
      select: { id: true },
    });
    await writeItemFamily(tx, empty.map((r) => r.id), { openingHours: hours });
  });
}

async function collect(): Promise<Candidate[]> {
  const out: Candidate[] = [];

  const items = await db.item.findMany({
    where: { placeId: null, trip: { deletedAt: null }, OR: [{ address: { not: "" } }, { lat: { not: null } }] },
    select: { id: true, title: true, address: true, lat: true, lng: true },
  });
  for (const r of items) {
    const old = point(r.lat, r.lng);
    out.push({
      kind: "item",
      id: r.id,
      query: join(r.title, r.address),
      anchor: r.address ?? "",
      old,
      lookup: () => locateVenue(r.title, r.address ?? "", { near: old ?? undefined }),
      write: async (f) => {
        await db.item.update({
          where: { id: r.id },
          data: { lat: f.lat, lng: f.lng, placeId: f.placeId, ...(f.countryCode ? { countryCode: f.countryCode } : {}) },
        });
        if (!f.placeId) return;
        try {
          await fillItemDetails(r.id, f.placeId);
        } catch (err) {
          console.error(`  item ${r.id}: coordinates and place ID committed; details failed:`, err);
        }
      },
    });
  }

  const stops = await db.stop.findMany({
    where: { placeId: null, trip: { deletedAt: null } },
    select: { id: true, name: true, country: true, timezone: true, lat: true, lng: true },
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
      lookup: () => geocodePlaceDetailed(query, { near: old ?? undefined }),
      write: async (f, v) => {
        const timezone =
          v === "new" && !r.timezone
            ? resolveStopTimezone({ lat: f.lat, lng: f.lng, countryCode: f.countryCode, country: r.country })
            : null;
        await db.stop.update({
          where: { id: r.id },
          data: {
            lat: f.lat,
            lng: f.lng,
            placeId: f.placeId,
            ...(f.countryCode ? { countryCode: f.countryCode } : {}),
            ...(timezone ? { timezone } : {}),
          },
        });
      },
    });
  }

  const stays = await db.accommodation.findMany({
    where: { placeId: null, trip: { deletedAt: null }, OR: [{ address: { not: "" } }, { lat: { not: null } }] },
    select: { id: true, name: true, address: true, lat: true, lng: true },
  });
  for (const r of stays) {
    const old = point(r.lat, r.lng);
    out.push({
      kind: "accommodation",
      id: r.id,
      query: join(r.name, r.address),
      anchor: r.address ?? "",
      old,
      lookup: () => locateVenue(r.name, r.address ?? "", { near: old ?? undefined }),
      write: async (f) => {
        await db.accommodation.update({ where: { id: r.id }, data: { lat: f.lat, lng: f.lng, placeId: f.placeId } });
      },
    });
  }

  const transports = await db.transport.findMany({
    where: { trip: { deletedAt: null }, OR: [{ depPlace: { not: null }, depPlaceId: null }, { arrPlace: { not: null }, arrPlaceId: null }] },
    select: { id: true, depPlace: true, depPlaceId: true, depLat: true, depLng: true, arrPlace: true, arrPlaceId: true, arrLat: true, arrLng: true },
  });
  for (const r of transports) {
    if (r.depPlace && !r.depPlaceId) {
      const place = r.depPlace;
      out.push({
        kind: "transport-dep",
        id: r.id,
        query: place,
        anchor: place,
        old: point(r.depLat, r.depLng),
        lookup: () => geocodePlaceDetailed(place),
        write: async (f) => {
          await db.transport.update({ where: { id: r.id }, data: { depLat: f.lat, depLng: f.lng, depPlaceId: f.placeId } });
        },
      });
    }
    if (r.arrPlace && !r.arrPlaceId) {
      const place = r.arrPlace;
      out.push({
        kind: "transport-arr",
        id: r.id,
        query: place,
        anchor: place,
        old: point(r.arrLat, r.arrLng),
        lookup: () => geocodePlaceDetailed(place),
        write: async (f) => {
          await db.transport.update({ where: { id: r.id }, data: { arrLat: f.lat, arrLng: f.lng, arrPlaceId: f.placeId } });
        },
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
      lookup: () => locateVenue(r.title, join(r.city, r.country), { near: old ?? undefined }),
      write: async (f) => {
        await db.marker.update({
          where: { id: r.id },
          data: { lat: f.lat, lng: f.lng, placeId: f.placeId, ...(f.countryCode ? { countryCode: f.countryCode } : {}) },
        });
      },
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
      lookup: () => geocodePlaceDetailed(name),
      write: async (f, v) => {
        const homeTimezone =
          v === "new" && !r.homeTimezone
            ? resolveHomeTimezone({ lat: f.lat, lng: f.lng, countryCode: f.countryCode })
            : null;
        await db.trip.update({
          where: { id: r.id },
          data: {
            homeLat: f.lat,
            homeLng: f.lng,
            homePlaceId: f.placeId,
            ...(f.countryCode ? { homeCountryCode: f.countryCode } : {}),
            ...(homeTimezone ? { homeTimezone } : {}),
          },
        });
      },
    });
  }

  return out;
}

async function main() {
  const execute = process.argv.includes("--execute");
  console.log(dbTargetLine(process.env, !execute));
  if (!hasServerKey()) {
    console.error("GOOGLE_MAPS_SERVER_KEY is not set; nothing to look up. Aborting.");
    process.exitCode = 1;
    return;
  }

  const candidates = await collect();
  const tally = new Map<BackfillKind, Record<"scanned" | BackfillVerdict, number>>(
    KINDS.map((k) => [k, { scanned: 0, accept: 0, new: 0, "too-far": 0, "no-match": 0, "no-anchor": 0 }]),
  );

  for (const c of candidates) {
    const anchored = hasAnchor(c.anchor, c.old);
    const found = anchored ? await c.lookup() : null;
    const v: BackfillVerdict = anchored ? verdict(c.kind, c.old, found) : "no-anchor";
    console.log(formatRow({ kind: c.kind, id: c.id, query: c.query, old: c.old, next: found, verdict: v }));
    const t = tally.get(c.kind)!;
    t.scanned++;
    t[v]++;
    if (execute && found && (v === "accept" || v === "new")) {
      try {
        await c.write(found, v);
      } catch (err) {
        console.error(`  ${c.kind} ${c.id}: write failed, row left unchanged:`, err);
      }
    }
  }

  console.log("\nkind · scanned / accept / new / too-far / no-match / no anchor (skipped)");
  for (const k of KINDS) {
    const t = tally.get(k)!;
    console.log(`${k} · ${t.scanned} / ${t.accept} / ${t.new} / ${t["too-far"]} / ${t["no-match"]} / ${t["no-anchor"]}`);
  }
  console.log(`Enterprise detail calls: ${detailCalls}`);
  console.log(`Item details: ${detailOutcomes.filled} filled / ${detailOutcomes.empty} empty / ${detailOutcomes.failed} failed`);
  if (!execute) console.log("\nDry run — re-run with --execute to apply.");
}

main()
  .then(() => process.exit(typeof process.exitCode === "number" ? process.exitCode : 0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
