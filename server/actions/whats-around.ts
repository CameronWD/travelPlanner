"use server";

import { db } from "@/lib/db";
import type { LatLng } from "@/lib/geo";
import { hasServerKey } from "@/lib/google-fetch";
import { dailyCap } from "@/lib/google-budget";
import { takeGoogleQuota } from "@/lib/google-usage";
import { requireTripAccess } from "@/lib/guards";
import { nearbyKind, type NearbyKind } from "@/lib/nearby/kinds";
import { withOpenStatus } from "@/lib/nearby/open-status";
import { cachedNearby, nearbyCacheKey, saveNearby } from "@/lib/nearby/cache";
import { searchNearby, type NearbyPlace } from "@/lib/nearby/search";
import { requireOutsideSurprise } from "@/lib/surprise-guard";

export type WhatsAroundFrom = { kind: "accommodation" | "stop" | "item"; id: string } | { kind: "device"; lat: number; lng: number };
export type WhatsAroundResult =
  | { status: "ok"; places: NearbyPlace[]; origin: LatLng }
  | { status: "off" | "over-cap" | "unavailable" | "no-point" };

type Located = { tripId: string; lat: number | null; lng: number | null } | null;

async function resolvePoint(tripId: string, userId: string, from: Exclude<WhatsAroundFrom, { kind: "device" }>): Promise<LatLng | null> {
  const select = { tripId: true, lat: true, lng: true } as const;
  let row: Located;
  if (from.kind === "accommodation") row = await db.accommodation.findUnique({ where: { id: from.id }, select });
  else if (from.kind === "stop") row = await db.stop.findUnique({ where: { id: from.id }, select });
  else row = await db.item.findUnique({ where: { id: from.id }, select });
  if (!row || row.tripId !== tripId) return null;
  // Guard before the location check, or a surprised viewer could tell whether a hidden row is located.
  if (from.kind === "accommodation") await requireOutsideSurprise(userId, { accommodationId: from.id });
  else if (from.kind === "stop") await requireOutsideSurprise(userId, { stopId: from.id });
  else await requireOutsideSurprise(userId, { itemId: from.id });
  return row.lat === null || row.lng === null ? null : { lat: row.lat, lng: row.lng };
}

const isCoordinate = (lat: number, lng: number): boolean =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

export async function whatsAround(tripId: string, input: { from: WhatsAroundFrom; nearbyKind: NearbyKind }): Promise<WhatsAroundResult> {
  const { user } = await requireTripAccess(tripId);
  const trip = await db.trip.findUnique({ where: { id: tripId }, select: { whatsAroundEnabled: true } });
  if (!trip?.whatsAroundEnabled) return { status: "off" };
  if (!nearbyKind(input.nearbyKind)) return { status: "no-point" };

  const { from } = input;
  const isDevice = from.kind === "device";
  let origin: LatLng | null;
  if (from.kind === "device") origin = isCoordinate(from.lat, from.lng) ? { lat: from.lat, lng: from.lng } : null;
  else origin = await resolvePoint(tripId, user.id, from);
  if (!origin) return { status: "no-point" };

  const key = isDevice ? null : nearbyCacheKey(origin, input.nearbyKind);
  if (key) {
    const hit = await cachedNearby(key);
    if (hit) return hit.status === "OK" ? { status: "ok", places: withOpenStatus(hit.results, Date.now()), origin } : { status: "unavailable" };
  }

  if (!hasServerKey()) return { status: "unavailable" };
  if (!(await takeGoogleQuota("nearby-search", dailyCap("nearby-search")))) return { status: "over-cap" };

  const places = await searchNearby(origin, input.nearbyKind);
  if (key) await saveNearby(key, places ? "OK" : "ERROR", places ?? []);
  return places ? { status: "ok", places: withOpenStatus(places, Date.now()), origin } : { status: "unavailable" };
}
