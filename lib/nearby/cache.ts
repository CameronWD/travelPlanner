import "server-only";
import { db } from "@/lib/db";
import { formatISODate } from "@/lib/dates";
import type { LatLng } from "@/lib/geo";
import type { NearbyKind } from "./kinds";
import type { NearbyPlace } from "./search";

const KEEP_MS = 2 * 24 * 60 * 60 * 1000;
const ERROR_COOLDOWN_MS = 15 * 60 * 1000;

export type CachedNearby = { status: "OK"; results: NearbyPlace[] } | { status: "ERROR"; results: [] };

export function nearbyCacheKey(point: LatLng, kind: NearbyKind, now: Date = new Date()): string {
  return `${formatISODate(now)}|${kind}|${point.lat.toFixed(3)},${point.lng.toFixed(3)}`;
}

export async function cachedNearby(key: string): Promise<CachedNearby | null> {
  const row = await db.nearbyCache.findUnique({ where: { key } });
  if (!row) return null;
  if (row.status === "OK" && Array.isArray(row.results)) return { status: "OK", results: row.results as unknown as NearbyPlace[] };
  if (Date.now() - row.fetchedAt.getTime() > ERROR_COOLDOWN_MS) return null;
  return { status: "ERROR", results: [] };
}

export async function saveNearby(key: string, status: "OK" | "ERROR", results: NearbyPlace[]): Promise<void> {
  const data = { status, results: results as unknown as object[] };
  await db.nearbyCache.upsert({ where: { key }, create: { key, ...data }, update: { ...data, fetchedAt: new Date() } });
  await db.nearbyCache.deleteMany({ where: { fetchedAt: { lt: new Date(Date.now() - KEEP_MS) } } }).catch(() => undefined);
}
