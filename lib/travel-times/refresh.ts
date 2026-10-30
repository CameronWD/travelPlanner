import "server-only";
import { db } from "@/lib/db";
import { hasServerKey } from "@/lib/google-fetch";
import { takeGoogleQuota } from "@/lib/google-usage";
import { computeRoute } from "@/lib/routes";
import { loadSurpriseVisibility } from "@/lib/surprise-visibility";
import {
  ITEM_HOP_ORDER, carLegs, driveKey, hopInputs, hopKeys, parseHopKey, planHops, pointKey,
  type HopItem,
} from "@/lib/travel-times/hops";
import { saveTravelTime, settledTravelKeys } from "@/lib/travel-times/store";

export const ROUTES_DAILY_CAP = 165;
const MAX_CALLS_PER_RUN = 40;
const CONCURRENCY = 4;

export type RefreshCounts = { wanted: number; fetched: number; skippedQuota: number; failed: number };

type PlanItem = HopItem & { forkId: string | null };

function groupByFork<T extends { forkId: string | null }>(rows: T[]): Map<string | null, T[]> {
  const out = new Map<string | null, T[]>();
  for (const r of rows) out.set(r.forkId, [...(out.get(r.forkId) ?? []), r]);
  return out;
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

// The real plan first, then each Fork; WALK first within a plan, since the resolver tries the walk first.
function fetchOrder(keysByPlan: Set<string>[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const keys of keysByPlan) {
    const fresh = [...keys].filter((k) => !seen.has(k));
    const walk = fresh.filter((k) => k.startsWith("WALK|")).sort();
    const rest = fresh.filter((k) => !k.startsWith("WALK|")).sort();
    for (const k of [...walk, ...rest]) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
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
      orderBy: [...ITEM_HOP_ORDER],
    }),
    db.transport.findMany({
      where: { tripId },
      select: {
        id: true, forkId: true, mode: true, fromStopId: true, toStopId: true,
        depLat: true, depLng: true, arrLat: true, arrLng: true, depIsHome: true, arrIsHome: true,
      },
    }),
    hiddenItemViews(tripId, now),
  ]);

  const home = trip.homeLat != null && trip.homeLng != null ? { lat: trip.homeLat, lng: trip.homeLng } : null;
  const stopsById = new Map(stops.map((s) => [s.id, s]));
  const itemsByPlan = groupByFork<PlanItem>(items);
  const transportsByPlan = groupByFork(transports);
  const forkIds = [...new Set([...itemsByPlan.keys(), ...transportsByPlan.keys()])].filter((f): f is string => f !== null).sort();

  const keysByPlan = [null, ...forkIds].map((plan) => {
    const planItems = itemsByPlan.get(plan) ?? [];
    const planTransports = transportsByPlan.get(plan) ?? [];
    const keys = new Set<string>();
    for (const hidden of views) {
      for (const pair of planHops(planItems.filter((i) => !hidden.has(i.id)), planTransports)) {
        const hop = hopInputs(pair, { stopsById, planTransports });
        if (hop) for (const k of hopKeys(hop.from, hop.to, hop.localMode, hop.departure, now)) keys.add(k);
      }
    }
    for (const leg of carLegs(planTransports, stopsById, home)) {
      if (pointKey(leg.from) !== pointKey(leg.to)) keys.add(driveKey(leg.from, leg.to));
    }
    return keys;
  });
  return fetchOrder(keysByPlan);
}

export async function refreshTripTravelTimes(tripId: string, opts: { now?: Date; dryRun?: boolean } = {}): Promise<RefreshCounts> {
  const now = opts.now ?? new Date();
  const counts: RefreshCounts = { wanted: 0, fetched: 0, skippedQuota: 0, failed: 0 };
  const keys = await wantedKeys(tripId, now);
  if (!keys || keys.length === 0) return counts;

  const settled = await settledTravelKeys(keys, now);
  const missing = keys.filter((k) => !settled.has(k));
  counts.wanted = missing.length;
  if (opts.dryRun || !hasServerKey()) return counts;

  const queue = missing.slice(0, MAX_CALLS_PER_RUN).flatMap((key) => {
    const req = parseHopKey(key);
    return req ? [{ key, ...req }] : [];
  });
  const batch = queue.length;
  let attempted = 0;
  let refused = false;

  async function fetchOne({ key, mode, from, to, departure }: (typeof queue)[number]): Promise<void> {
    try {
      const res = await computeRoute(from, to, mode, departure ?? undefined);
      if (res.status === "ok") {
        await saveTravelTime(key, { mode, status: "OK", minutes: res.minutes, distanceM: Math.round(res.distanceM), polyline: res.polyline || null });
      } else {
        await saveTravelTime(key, { mode, status: res.status === "none" ? "NONE" : "ERROR", minutes: null, distanceM: null, polyline: null });
      }
      if (res.status === "error") counts.failed++;
      else counts.fetched++;
    } catch {
      counts.failed++;
    }
  }

  async function worker(): Promise<void> {
    while (!refused) {
      const next = queue.shift();
      if (next === undefined) return;
      if (!(await takeGoogleQuota("routes", ROUTES_DAILY_CAP))) {
        refused = true;
        return;
      }
      attempted++;
      await fetchOne(next);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (refused) counts.skippedQuota = batch - attempted;
  return counts;
}
