import "server-only";
import { db } from "@/lib/db";
import { formatISODate } from "@/lib/dates";
import type { LatLng } from "@/lib/geo";
import type { NearbyKind } from "./kinds";
import type { NearbyPlace } from "./search";

export type CachedNearby = { status: "OK"; results: NearbyPlace[] } | { status: "ERROR"; results: [] };

export function nearbyCacheKey(point: LatLng, kind: NearbyKind, now: Date = new Date()): string {
  return `${formatISODate(now)}|${kind}|${point.lat.toFixed(3)},${point.lng.toFixed(3)}`;
}

export async function cachedNearby(key: string): Promise<CachedNearby | null> {
  const row = await db.nearbyCache.findUnique({ where: { key } });
  if (!row) return null;
  if (row.status === "OK" && Array.isArray(row.results)) return { status: "OK", results: row.results as unknown as NearbyPlace[] };
  return { status: "ERROR", results: [] };
}

export async function saveNearby(key: string, status: "OK" | "ERROR", results: NearbyPlace[]): Promise<void> {
  const data = { status, results: results as unknown as object[] };
  await db.nearbyCache.upsert({ where: { key }, create: { key, ...data }, update: { ...data, fetchedAt: new Date() } });
}
