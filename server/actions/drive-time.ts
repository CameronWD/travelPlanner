"use server";

import { db } from "@/lib/db";
import { requirePlanAccess } from "@/lib/guards";
import { planScope } from "@/lib/plan-scope";
import { loadSurpriseVisibility } from "@/lib/surprise-visibility";
import { driveTimeOf, type DriveTime } from "@/lib/travel-times/drive-fit";
import { homePointOf, located, samePoint, type Pt } from "@/lib/travel-times/hops";
import { driveTimeNow } from "@/lib/travel-times/refresh";

export type DriveEnd = { home: true } | { stopId: string } | { lat: number; lng: number };

type Shaped = { kind: "home" } | { kind: "stop"; stopId: string } | { kind: "point"; at: Pt };

function shapeOf(end: unknown): Shaped | null {
  if (typeof end !== "object" || end === null) return null;
  const e = end as Record<string, unknown>;
  if (e.home === true) return { kind: "home" };
  if (typeof e.stopId === "string" && e.stopId) return { kind: "stop", stopId: e.stopId };
  const { lat, lng } = e;
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 ? { kind: "point", at: { lat, lng } } : null;
}

export async function driveTimeForEnds(tripId: string, forkId: string | null, from: DriveEnd, to: DriveEnd): Promise<DriveTime | null> {
  const { user, plan } = await requirePlanAccess(tripId, typeof forkId === "string" && forkId ? forkId : undefined);
  const fromEnd = shapeOf(from);
  const toEnd = shapeOf(to);
  if (!fromEnd || !toEnd) return null;

  const [trip, v] = await Promise.all([
    db.trip.findUnique({
      where: { id: tripId, deletedAt: null },
      select: { homeLat: true, homeLng: true, drivingWindingFactor: true, drivingAvgSpeedKph: true },
    }),
    loadSurpriseVisibility(tripId, user.id),
  ]);
  if (!trip) return null;
  const home = homePointOf(trip);
  const hidden = new Set(v.hiddenStopIds);

  async function locate(end: Shaped): Promise<Pt | null> {
    if (end.kind === "home") return home;
    if (end.kind === "point") return end.at;
    if (hidden.has(end.stopId)) return null;
    const stop = await db.stop.findFirst({ where: { id: end.stopId, tripId, ...planScope(plan) }, select: { lat: true, lng: true } });
    return stop ? located(stop.lat, stop.lng) : null;
  }

  const [a, b] = await Promise.all([locate(fromEnd), locate(toEnd)]);
  if (!a || !b || samePoint(a, b)) return null;
  const windingFactor = trip.drivingWindingFactor;
  return driveTimeOf(await driveTimeNow(a, b, { windingFactor, avgSpeedKph: trip.drivingAvgSpeedKph }), windingFactor);
}
