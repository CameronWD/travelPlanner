import "server-only";
import { db } from "@/lib/db";
import type { TravelLookup, TravelMode, TravelTimeStatus } from "@/lib/travel-times/hops";

export type TravelTimeRow = {
  mode: TravelMode;
  status: TravelTimeStatus;
  minutes: number | null;
  distanceM: number | null;
  polyline: string | null;
};

const ERROR_COOLDOWN_MS = 24 * 60 * 60_000;

export async function loadTravelTimes(keys: string[]): Promise<TravelLookup> {
  const lookup: TravelLookup = new Map();
  if (keys.length === 0) return lookup;
  const rows = await db.travelTime.findMany({
    where: { key: { in: [...new Set(keys)] } },
    select: { key: true, status: true, minutes: true, distanceM: true, polyline: true },
  });
  for (const r of rows) {
    lookup.set(r.key, { status: r.status as TravelTimeStatus, minutes: r.minutes, distanceM: r.distanceM, polyline: r.polyline });
  }
  return lookup;
}

export async function settledTravelKeys(keys: string[], now: Date): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const rows = await db.travelTime.findMany({
    where: { key: { in: keys } },
    select: { key: true, status: true, fetchedAt: true },
  });
  return new Set(
    rows
      .filter((r) => r.status !== "ERROR" || now.getTime() - r.fetchedAt.getTime() < ERROR_COOLDOWN_MS)
      .map((r) => r.key),
  );
}

export async function saveTravelTime(key: string, row: TravelTimeRow): Promise<void> {
  await db.travelTime.upsert({
    where: { key },
    create: { key, ...row },
    update: { ...row, fetchedAt: new Date() },
  });
}
