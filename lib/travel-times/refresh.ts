import "server-only";
import { db } from "@/lib/db";
import { hasServerKey } from "@/lib/google-fetch";
import { takeGoogleQuota } from "@/lib/google-usage";
import { computeRoute } from "@/lib/routes";
import { loadSurpriseVisibility } from "@/lib/surprise-visibility";
import {
  dayHops, driveKey, effectiveLocalMode, hopKeys, itemDeparture, parseHopKey, pointKey, transportEnds,
  type HopItem, type Pt,
} from "@/lib/travel-times/hops";
import { saveTravelTime, settledTravelKeys } from "@/lib/travel-times/store";

export const ROUTES_DAILY_CAP = 165;
const MAX_CALLS_PER_RUN = 40;
const CONCURRENCY = 4;

export type RefreshCounts = { wanted: number; fetched: number; skippedQuota: number; failed: number };

type PlanStop = { id: string; forkId: string | null; localTravelMode: string | null; lat: number | null; lng: number | null; timezone: string | null };
type PlanItem = HopItem & { forkId: string | null };
type PlanTransport = {
  forkId: string | null;
  mode: string;
  fromStopId: string | null;
  toStopId: string | null;
  depLat: number | null;
  depLng: number | null;
  arrLat: number | null;
  arrLng: number | null;
  depIsHome: boolean;
  arrIsHome: boolean;
};

function groupByFork<T extends { forkId: string | null }>(rows: T[]): Map<string | null, T[]> {
  const out = new Map<string | null, T[]>();
  for (const r of rows) out.set(r.forkId, [...(out.get(r.forkId) ?? []), r]);
  return out;
}

function planKeys(
  items: PlanItem[],
  transports: PlanTransport[],
  stopsById: Map<string, PlanStop>,
  home: Pt | null,
  hiddenViews: Set<string>[],
  now: Date,
  into: Set<string>,
): void {
  // Rule 12 skips a pair on two Stops a Transport joins: changing place mid-day is that Transport's job.
  const joined = new Set<string>();
  for (const t of transports) {
    if (t.fromStopId && t.toStopId && t.fromStopId !== t.toStopId) {
      joined.add(`${t.fromStopId}|${t.toStopId}`);
      joined.add(`${t.toStopId}|${t.fromStopId}`);
    }
  }

  for (const hidden of hiddenViews) {
    for (const { from, to } of dayHops(items.filter((i) => !hidden.has(i.id)))) {
      if (from.stopId && to.stopId && from.stopId !== to.stopId && joined.has(`${from.stopId}|${to.stopId}`)) continue;
      const stop = from.stopId ? stopsById.get(from.stopId) : undefined;
      const mode = stop ? effectiveLocalMode(stop, transports) : "TRANSIT";
      const departure = stop?.timezone ? itemDeparture(from, stop.timezone) : null;
      const a = { lat: from.lat!, lng: from.lng! };
      const b = { lat: to.lat!, lng: to.lng! };
      for (const k of hopKeys(a, b, mode, departure, now)) into.add(k);
    }
  }

  for (const t of transports) {
    const ends = transportEnds(t, stopsById, home);
    if (ends && pointKey(ends.from) !== pointKey(ends.to)) into.add(driveKey(ends.from, ends.to));
  }
}

async function hiddenItemViews(tripId: string, now: Date): Promise<Set<string>[]> {
  const everyoneMasked = await loadSurpriseVisibility(tripId, null, { now });
  if (everyoneMasked.hiddenItemIds.length === 0) return [new Set()];
  const members = await db.tripMember.findMany({ where: { tripId }, select: { userId: true } });
  const perTraveller = await Promise.all(members.map((mb) => loadSurpriseVisibility(tripId, mb.userId, { now })));
  const views = new Map<string, Set<string>>([["", new Set()]]);
  for (const v of [everyoneMasked, ...perTraveller]) {
    const ids = [...v.hiddenItemIds].sort();
    views.set(ids.join("|"), new Set(ids));
  }
  return [...views.values()];
}

async function wantedKeys(tripId: string, now: Date): Promise<string[] | null> {
  const trip = await db.trip.findUnique({ where: { id: tripId, deletedAt: null }, select: { homeLat: true, homeLng: true } });
  if (!trip) return null;
  const [stops, items, transports, views] = await Promise.all([
    db.stop.findMany({
      where: { tripId },
      select: { id: true, forkId: true, localTravelMode: true, lat: true, lng: true, timezone: true },
    }),
    db.item.findMany({
      where: { tripId, date: { not: null }, lat: { not: null }, lng: { not: null } },
      select: { id: true, forkId: true, stopId: true, date: true, startTime: true, endTime: true, sortOrder: true, lat: true, lng: true },
    }),
    db.transport.findMany({
      where: { tripId },
      select: {
        forkId: true, mode: true, fromStopId: true, toStopId: true,
        depLat: true, depLng: true, arrLat: true, arrLng: true, depIsHome: true, arrIsHome: true,
      },
    }),
    hiddenItemViews(tripId, now),
  ]);

  const home = trip.homeLat != null && trip.homeLng != null ? { lat: trip.homeLat, lng: trip.homeLng } : null;
  const stopsById = new Map(stops.map((s) => [s.id, s]));
  const itemsByPlan = groupByFork(items);
  const transportsByPlan = groupByFork(transports);
  const keys = new Set<string>();
  for (const plan of new Set([...itemsByPlan.keys(), ...transportsByPlan.keys()])) {
    planKeys(itemsByPlan.get(plan) ?? [], transportsByPlan.get(plan) ?? [], stopsById, home, views, now, keys);
  }
  return [...keys];
}

export async function refreshTripTravelTimes(tripId: string, opts: { now?: Date } = {}): Promise<RefreshCounts> {
  const now = opts.now ?? new Date();
  const counts: RefreshCounts = { wanted: 0, fetched: 0, skippedQuota: 0, failed: 0 };
  const keys = await wantedKeys(tripId, now);
  if (!keys || keys.length === 0) return counts;

  const settled = await settledTravelKeys(keys, now);
  const missing = keys.filter((k) => !settled.has(k)).sort();
  counts.wanted = missing.length;
  if (!hasServerKey()) return counts;

  const queue = missing.slice(0, MAX_CALLS_PER_RUN);
  const batch = queue.length;
  let attempted = 0;
  let refused = false;

  async function fetchOne(key: string): Promise<void> {
    const req = parseHopKey(key);
    if (!req) return;
    try {
      const res = await computeRoute(req.from, req.to, req.mode, req.departure ?? undefined);
      if (res.status === "ok") {
        await saveTravelTime(key, { mode: req.mode, status: "OK", minutes: res.minutes, distanceM: Math.round(res.distanceM), polyline: res.polyline || null });
      } else {
        await saveTravelTime(key, { mode: req.mode, status: res.status === "none" ? "NONE" : "ERROR", minutes: null, distanceM: null, polyline: null });
      }
      if (res.status === "error") counts.failed++;
      else counts.fetched++;
    } catch {
      counts.failed++;
    }
  }

  async function worker(): Promise<void> {
    while (!refused) {
      const key = queue.shift();
      if (key === undefined) return;
      if (!(await takeGoogleQuota("routes", ROUTES_DAILY_CAP))) {
        refused = true;
        return;
      }
      attempted++;
      await fetchOne(key);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (refused) counts.skippedQuota = batch - attempted;
  return counts;
}
