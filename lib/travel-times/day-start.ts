import { zonedWallTimeToInstant } from "@/lib/tz";
import { effectiveLocalMode, located, samePoint, type HopItem, type hopStopsById, type LocalMode, type Pt } from "@/lib/travel-times/hops";

export const START_LEAVES_BEFORE_MIN = 30;

export type StartAccommodationRow = {
  id: string;
  stopId?: string | null;
  checkIn: string;
  checkOut: string;
  lat?: number | null;
  lng?: number | null;
};

export type DayStartHop = { accommodationId: string; toItemId: string; from: Pt; to: Pt; localMode: LocalMode; departure: Date | null };

export function wokeAt<T extends StartAccommodationRow>(accommodations: readonly T[], date: string): T | null {
  let best: T | null = null;
  for (const a of accommodations) {
    if (a.checkIn < date && a.checkOut >= date && (!best || a.checkIn > best.checkIn)) best = a;
  }
  return best;
}

export function dayStartHop(input: {
  date: string;
  items: HopItem[];
  accommodations: readonly StartAccommodationRow[];
  stopsById: ReturnType<typeof hopStopsById>;
  planTransports: { mode: string; fromStopId: string | null; toStopId: string | null }[];
}): DayStartHop | null {
  const bed = wokeAt(input.accommodations, input.date);
  const from = bed && located(bed.lat, bed.lng);
  if (!bed || !from) return null;

  const first = input.items
    .filter((it) => it.date === input.date && located(it.lat, it.lng))
    .sort((a, b) => {
      const ta = a.startTime ?? "99:99";
      const tb = b.startTime ?? "99:99";
      if (ta !== tb) return ta < tb ? -1 : 1;
      return a.sortOrder - b.sortOrder;
    })[0];
  if (!first || (first.stopId && first.stopId !== bed.stopId)) return null;

  const to = located(first.lat, first.lng)!;
  if (samePoint(from, to)) return null;

  const stop = bed.stopId ? input.stopsById.get(bed.stopId) : undefined;
  const leaves = stop?.timezone && first.startTime ? zonedWallTimeToInstant(input.date, first.startTime, stop.timezone) : null;
  return {
    accommodationId: bed.id,
    toItemId: first.id,
    from,
    to,
    localMode: stop ? effectiveLocalMode(stop, input.planTransports) : "TRANSIT",
    departure: leaves && !Number.isNaN(leaves.getTime()) ? new Date(leaves.getTime() - START_LEAVES_BEFORE_MIN * 60_000) : null,
  };
}
