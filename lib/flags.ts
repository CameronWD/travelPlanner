/**
 * Pure flag-detection engine for the Trip Planner.
 *
 * PURE — no Prisma, no React, no network calls. Fully unit-testable.
 *
 * Accepts plain typed inputs (mirroring Prisma shapes but framework-free)
 * and returns a list of Flag objects describing potential issues.
 */

import { nightsBetween, isDateWithin, addDays } from "@/lib/dates";
import { instantToZonedDateISO } from "@/lib/tz";
import { haversineKm, type LatLng } from "@/lib/geo";

// ---------------------------------------------------------------------------
// Flag shape
// ---------------------------------------------------------------------------

export type FlagSeverity = "warning" | "info";
export type FlagTargetType =
  | "STOP"
  | "TRANSPORT"
  | "ACCOMMODATION"
  | "DAY"
  | "TRIP";

export interface Flag {
  id: string;
  severity: FlagSeverity;
  message: string;
  targetType: FlagTargetType;
  /** Id of the entity this flag points to, if applicable. */
  targetId?: string;
  /** For DAY flags: the ISO date string. */
  date?: string;
}

// ---------------------------------------------------------------------------
// Minimal input shapes (mirror Prisma; no Prisma import)
// ---------------------------------------------------------------------------

export interface FlagStop {
  id: string;
  name: string;
  arriveDate: string; // YYYY-MM-DD
  departDate: string; // YYYY-MM-DD
  timezone: string; // IANA
  lat?: number | null;
  lng?: number | null;
  sortOrder: number;
}

export interface FlagTransport {
  id: string;
  fromStopId?: string | null;
  toStopId?: string | null;
  depAt?: Date | string | null;
  arrAt?: Date | string | null;
  mode: string;
}

export interface FlagAccommodation {
  id: string;
  stopId: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  name: string;
}

export interface FlagItem {
  id: string;
  stopId?: string | null;
  date?: string | null; // YYYY-MM-DD
  startTime?: string | null; // HH:MM
  endTime?: string | null; // HH:MM
}

export interface DetectFlagsInput {
  stops: FlagStop[];
  transports: FlagTransport[];
  accommodations: FlagAccommodation[];
  items: FlagItem[];
  tripStart: string; // YYYY-MM-DD
  tripEnd: string; // YYYY-MM-DD
  roughStopCount?: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function tzOf(stop: FlagStop | undefined | null): string {
  return stop?.timezone ?? "UTC";
}

// ---------------------------------------------------------------------------
// Rule 1: Stop without accommodation (warning)
//
// A Stop that has at least 1 night but no Accommodation linked to it.
// Skipped for 0-night (same-day) stops.
// ---------------------------------------------------------------------------

export function flagStopsWithoutAccommodation(
  stops: FlagStop[],
  accommodations: FlagAccommodation[],
): Flag[] {
  const stopIdWithAccom = new Set(accommodations.map((a) => a.stopId));

  return stops
    .filter((stop) => {
      const nights = nightsBetween(stop.arriveDate, stop.departDate);
      return nights >= 1 && !stopIdWithAccom.has(stop.id);
    })
    .map((stop) => ({
      id: `stop-no-accom-${stop.id}`,
      severity: "warning" as const,
      message: `No accommodation found for ${stop.name}.`,
      targetType: "STOP" as const,
      targetId: stop.id,
    }));
}

// ---------------------------------------------------------------------------
// Rule 2: Empty day (info)
//
// A day in [tripStart, tripEnd] with NO items, NO transport departure/arrival,
// and NO accommodation check-in/check-out on that day.
// ---------------------------------------------------------------------------

export function flagEmptyDays(
  stops: FlagStop[],
  transports: FlagTransport[],
  accommodations: FlagAccommodation[],
  items: FlagItem[],
  tripStart: string,
  tripEnd: string,
): Flag[] {
  // Collect all days that have at least one event.
  const activeDays = new Set<string>();

  // Items with a date
  for (const item of items) {
    if (item.date && item.date >= tripStart && item.date <= tripEnd) {
      activeDays.add(item.date);
    }
  }

  // Accommodation check-in / check-out days
  for (const acc of accommodations) {
    if (acc.checkIn >= tripStart && acc.checkIn <= tripEnd) {
      activeDays.add(acc.checkIn);
    }
    if (acc.checkOut >= tripStart && acc.checkOut <= tripEnd) {
      activeDays.add(acc.checkOut);
    }
  }

  // Transport: departure days (tz-aware) + arrival days
  const stopById = new Map(stops.map((s) => [s.id, s]));
  for (const t of transports) {
    const depDate = toDate(t.depAt);
    if (depDate) {
      const fromStop = t.fromStopId ? stopById.get(t.fromStopId) : undefined;
      const depDay = instantToZonedDateISO(depDate, tzOf(fromStop));
      if (depDay >= tripStart && depDay <= tripEnd) activeDays.add(depDay);
    }
    const arrDate = toDate(t.arrAt);
    if (arrDate) {
      const toStop = t.toStopId ? stopById.get(t.toStopId) : undefined;
      const arrDay = instantToZonedDateISO(
        arrDate,
        tzOf(toStop ?? (t.fromStopId ? stopById.get(t.fromStopId) : undefined)),
      );
      if (arrDay >= tripStart && arrDay <= tripEnd) activeDays.add(arrDay);
    }
  }

  // Walk every day in the trip and collect empty ones
  const flags: Flag[] = [];
  let current = tripStart;
  while (current <= tripEnd) {
    if (!activeDays.has(current)) {
      flags.push({
        id: `empty-day-${current}`,
        severity: "info",
        message: `Nothing scheduled on ${current}.`,
        targetType: "DAY",
        date: current,
      });
    }
    current = addDays(current, 1);
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Rule 3: Transport date mismatch (warning)
//
// Two sub-checks:
//   a) Transport departure day (tz-aware) falls OUTSIDE the fromStop's
//      [arriveDate, departDate].
//   b) Transport arrival day falls AFTER the toStop's departDate (i.e. you
//      arrive after you've already left that stop).
//
// Both are checked only when the relevant data is present.
// ---------------------------------------------------------------------------

export function flagTransportDateMismatches(
  stops: FlagStop[],
  transports: FlagTransport[],
): Flag[] {
  const stopById = new Map(stops.map((s) => [s.id, s]));
  const flags: Flag[] = [];

  for (const t of transports) {
    const depDate = toDate(t.depAt);
    if (!depDate) continue;

    const fromStop = t.fromStopId ? stopById.get(t.fromStopId) : undefined;
    if (fromStop) {
      const depDay = instantToZonedDateISO(depDate, tzOf(fromStop));
      if (!isDateWithin(depDay, fromStop.arriveDate, fromStop.departDate)) {
        flags.push({
          id: `transport-dep-mismatch-${t.id}`,
          severity: "warning",
          message: `Transport departure on ${depDay} is outside ${fromStop.name}'s stay (${fromStop.arriveDate} – ${fromStop.departDate}).`,
          targetType: "TRANSPORT",
          targetId: t.id,
        });
      }
    }

    // Check arrival vs toStop
    const arrDate = toDate(t.arrAt);
    if (arrDate && t.toStopId) {
      const toStop = stopById.get(t.toStopId);
      if (toStop) {
        const arrDay = instantToZonedDateISO(arrDate, tzOf(toStop));
        // Flag if transport arrives AFTER the toStop has already departed
        if (arrDay > toStop.departDate) {
          flags.push({
            id: `transport-arr-mismatch-${t.id}`,
            severity: "warning",
            message: `Transport arrives on ${arrDay}, after ${toStop.name}'s stay ends on ${toStop.departDate}.`,
            targetType: "TRANSPORT",
            targetId: t.id,
          });
        }
      }
    }
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Rule 4: Very short stay (info)
//
// A Stop with 0 nights (same-day) or 1 night.
// ---------------------------------------------------------------------------

export function flagVeryShortStays(stops: FlagStop[]): Flag[] {
  return stops
    .filter((stop) => nightsBetween(stop.arriveDate, stop.departDate) <= 1)
    .map((stop) => {
      const nights = nightsBetween(stop.arriveDate, stop.departDate);
      const message =
        nights === 0
          ? `Same-day stop in ${stop.name} — no overnight stay.`
          : `Only 1 night in ${stop.name}.`;
      return {
        id: `short-stay-${stop.id}`,
        severity: "info" as const,
        message,
        targetType: "STOP" as const,
        targetId: stop.id,
      };
    });
}

// ---------------------------------------------------------------------------
// Rule 5: Route backtracking (info)
//
// For three consecutive stops A → B → C (all with coords):
//   if haversine(A,C) < haversine(A,B) AND haversine(B,C) > haversine(A,C)
// then B is a detour back toward A — potential backtracking.
//
// Conservative: only fires when ALL THREE stops have coordinates, and only
// when B is clearly out-of-direction (the C→A distance is genuinely shorter
// than the A→B leg, indicating reversal).
// ---------------------------------------------------------------------------

function hasCoords(stop: FlagStop): stop is FlagStop & LatLng {
  return (
    typeof stop.lat === "number" &&
    typeof stop.lng === "number" &&
    !isNaN(stop.lat) &&
    !isNaN(stop.lng)
  );
}

export function flagRouteBacktracking(stops: FlagStop[]): Flag[] {
  if (stops.length < 3) return [];

  // Sort by sortOrder for sequential comparison
  const sorted = [...stops].sort((a, b) => a.sortOrder - b.sortOrder);
  const flags: Flag[] = [];

  for (let i = 0; i < sorted.length - 2; i++) {
    const A = sorted[i];
    const B = sorted[i + 1];
    const C = sorted[i + 2];

    if (!hasCoords(A) || !hasCoords(B) || !hasCoords(C)) continue;

    const dAB = haversineKm(A, B);
    const dAC = haversineKm(A, C);
    const dBC = haversineKm(B, C);

    // Backtracking heuristic: you went out to B and came back toward A.
    // Fire only when:
    //   1. B is further from A than C is (dAB > dAC) — B is a detour
    //   2. B-to-C is further than A-to-C — going C from B is longer than going C from A
    if (dAB > dAC && dBC > dAC) {
      flags.push({
        id: `backtrack-${B.id}`,
        severity: "info",
        message: `${B.name} may be a backtrack: it's further from ${A.name} than ${C.name} is, and you return toward ${A.name} for ${C.name}.`,
        targetType: "STOP",
        targetId: B.id,
      });
    }
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Rule 6: Item time overlap (warning)
//
// Two timed items on the same day whose [startTime, endTime] intervals overlap.
// Items without an endTime have no duration and are ignored. One flag per day.
// ---------------------------------------------------------------------------

export function flagItemTimeOverlaps(items: FlagItem[]): Flag[] {
  const byDate = new Map<string, { start: string; end: string }[]>();
  for (const item of items) {
    if (!item.date || !item.startTime || !item.endTime) continue;
    const list = byDate.get(item.date) ?? [];
    list.push({ start: item.startTime, end: item.endTime });
    byDate.set(item.date, list);
  }

  const flags: Flag[] = [];
  for (const [date, intervals] of byDate) {
    const sorted = [...intervals].sort((a, b) => (a.start < b.start ? -1 : 1));
    let overlaps = false;
    for (let i = 1; i < sorted.length; i++) {
      // Overlap when the next item starts strictly before the previous ends.
      if (sorted[i].start < sorted[i - 1].end) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) {
      flags.push({
        id: `item-overlap-${date}`,
        severity: "warning",
        message: `Two or more items overlap in time on ${date}.`,
        targetType: "DAY",
        date,
      });
    }
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Rule 7: Packed day (info)
//
// More than PACKED_DAY_THRESHOLD timed items scheduled on one day.
// ---------------------------------------------------------------------------

export const PACKED_DAY_THRESHOLD = 6;

export function flagPackedDays(items: FlagItem[]): Flag[] {
  const countByDate = new Map<string, number>();
  for (const item of items) {
    if (!item.date || !item.startTime) continue; // timed items only
    countByDate.set(item.date, (countByDate.get(item.date) ?? 0) + 1);
  }

  const flags: Flag[] = [];
  for (const [date, count] of countByDate) {
    if (count > PACKED_DAY_THRESHOLD) {
      flags.push({
        id: `packed-day-${date}`,
        severity: "info",
        message: `Busy day: ${count} items scheduled on ${date}.`,
        targetType: "DAY",
        date,
      });
    }
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Rule 8: Rough stops (info)
//
// Stops without dates that haven't been placed on the itinerary yet.
// ---------------------------------------------------------------------------

export function flagRoughStops(count: number): Flag[] {
  if (count <= 0) return [];
  return [
    {
      id: "rough-stops",
      severity: "info" as const,
      message: `${count} stop${count === 1 ? "" : "s"} still rough — set their dates to add them to the itinerary.`,
      targetType: "TRIP" as const,
    },
  ];
}

// ---------------------------------------------------------------------------
// Main: detectFlags
// ---------------------------------------------------------------------------

/**
 * Run all flag rules against the given trip data and return all detected flags.
 *
 * Rules applied (in order):
 *   1. Stop without accommodation (warning)
 *   2. Empty day (info)
 *   3. Transport date mismatch (warning)
 *   4. Very short stay (info)
 *   5. Route backtracking (info)
 *   6. Item time overlap (warning)
 *   7. Packed day (info)
 */
export function detectFlags({
  stops,
  transports,
  accommodations,
  items,
  tripStart,
  tripEnd,
  roughStopCount,
}: DetectFlagsInput): Flag[] {
  return [
    ...flagStopsWithoutAccommodation(stops, accommodations),
    ...flagEmptyDays(stops, transports, accommodations, items, tripStart, tripEnd),
    ...flagTransportDateMismatches(stops, transports),
    ...flagVeryShortStays(stops),
    ...flagRouteBacktracking(stops),
    ...flagItemTimeOverlaps(items),
    ...flagPackedDays(items),
    ...flagRoughStops(roughStopCount ?? 0),
  ];
}
