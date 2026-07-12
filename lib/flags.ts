/**
 * Pure flag-detection engine for the Trip Planner.
 *
 * PURE — no Prisma, no React, no network calls. Fully unit-testable.
 *
 * Accepts plain typed inputs (mirroring Prisma shapes but framework-free)
 * and returns a list of Flag objects describing potential issues.
 */

import { nightsBetween, isDateWithin, addDays, daysBetween } from "@/lib/dates";
import { HARD_END_APPROACHING_NIGHTS } from "@/lib/firm-up"; // threshold lives alongside computeProjectedEnd
import { instantToZonedDateISO } from "@/lib/tz";
import { haversineKm, estimateDriveMinutes, type LatLng } from "@/lib/geo";
import { hasOutboundLeg, hasReturnLeg, type HomeBase } from "@/lib/home-base";

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
  depIsHome?: boolean | null;
  arrIsHome?: boolean | null;
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
  lat?: number | null;
  lng?: number | null;
}

export interface DetectFlagsInput {
  stops: FlagStop[];
  transports: FlagTransport[];
  accommodations: FlagAccommodation[];
  items: FlagItem[];
  tripStart: string; // YYYY-MM-DD
  tripEnd: string; // YYYY-MM-DD
  roughStopCount?: number;
  /** Projected end date (rough nights flowed forward); see computeProjectedEnd. */
  projectedEnd?: string | null;
  /** Optional traveller-set hard end date. */
  hardEndDate?: string | null;
  /** Per-trip drive-estimate config; defaults suit mixed/winding roads. */
  drivingWindingFactor?: number;
  drivingAvgSpeedKph?: number;
  /** Home base for detecting missing home-connection legs. */
  home?: HomeBase | null;
  /** Whether the trip is a round trip (return leg back to home expected). */
  roundTrip?: boolean;
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

export const LONG_DRIVE_DAY_THRESHOLD_MIN = 300; // 5 hours

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
// Rule 9: Geographic spread day (info)
//
// A day on which the located items are farther apart than SPREAD_DAY_THRESHOLD_KM.
// Only items with both a date and finite lat/lng are considered.
// One flag per qualifying date, keyed on the MAX pairwise haversine distance.
// ---------------------------------------------------------------------------

export const SPREAD_DAY_THRESHOLD_KM = 25;

export function flagSpreadDays(items: FlagItem[]): Flag[] {
  // Collect located items (date + finite lat/lng required)
  const locatedByDate = new Map<string, LatLng[]>();

  for (const item of items) {
    if (
      !item.date ||
      item.lat == null ||
      item.lng == null ||
      !isFinite(item.lat) ||
      !isFinite(item.lng)
    ) {
      continue;
    }
    const pts = locatedByDate.get(item.date) ?? [];
    pts.push({ lat: item.lat, lng: item.lng });
    locatedByDate.set(item.date, pts);
  }

  const flags: Flag[] = [];

  for (const [date, pts] of locatedByDate) {
    if (pts.length < 2) continue;

    // Compute max pairwise distance
    let maxKm = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const d = haversineKm(pts[i], pts[j]);
        if (d > maxKm) maxKm = d;
      }
    }

    if (maxKm > SPREAD_DAY_THRESHOLD_KM) {
      flags.push({
        id: `spread-day-${date}`,
        severity: "info",
        message: `Your plans on ${date} are spread out (~${Math.round(maxKm)} km apart) — check it's doable.`,
        targetType: "DAY",
        date,
      });
    }
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Rule 10: Long driving day (warning)
//
// Accumulates total driving time per calendar day (in the destination stop's
// timezone). Uses real dep→arr times when both are present; otherwise falls
// back to estimateDriveMinutes. Only CAR legs are considered.
// ---------------------------------------------------------------------------

export function flagLongDrivingDays(
  stops: FlagStop[],
  transports: FlagTransport[],
  opts: { windingFactor: number; avgSpeedKph: number },
): Flag[] {
  const byId = new Map(stops.map((s) => [s.id, s]));
  const minsByDate = new Map<string, number>();

  for (const t of transports) {
    if (t.mode !== "CAR") continue;
    const from = t.fromStopId ? byId.get(t.fromStopId) : undefined;
    const to = t.toStopId ? byId.get(t.toStopId) : undefined;
    if (!from || !to || !hasCoords(from) || !hasCoords(to)) continue;

    const dep = toDate(t.depAt ?? null);
    const arr = toDate(t.arrAt ?? null);
    const minutes =
      dep && arr && arr.getTime() > dep.getTime()
        ? (arr.getTime() - dep.getTime()) / 60000
        : estimateDriveMinutes(haversineKm(from, to), opts);

    const driveDate = dep ? instantToZonedDateISO(dep, to.timezone) : to.arriveDate;
    if (!driveDate) continue;

    minsByDate.set(driveDate, (minsByDate.get(driveDate) ?? 0) + minutes);
  }

  const flags: Flag[] = [];
  for (const [date, mins] of minsByDate) {
    if (mins > LONG_DRIVE_DAY_THRESHOLD_MIN) {
      const hrs = Math.round((mins / 60) * 10) / 10;
      flags.push({
        id: `long-drive-${date}`,
        severity: "warning",
        message: `Long driving day on ${date}: ~${hrs}h behind the wheel — check it's doable.`,
        targetType: "DAY",
        date,
      });
    }
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Rule 12: Tight / impossible connections (warning / info)
//
// For consecutive same-day items that BOTH have startTime+endTime and lat+lng:
// estimate travel time (walk if ≤ MAX_WALK_MIN at WALK_KMH, else drive via
// estimateDriveMinutes); gap = nextStart − prevEnd minutes.
//   gap < travel                         → warning
//   travel ≤ gap < travel + BUFFER       → info "tight"
// One flag per offending pair, DAY-targeted.
// ---------------------------------------------------------------------------

export const TIGHT_CONNECTION_BUFFER_MIN = 15;
const WALK_KMH = 4.5;
const MAX_WALK_MIN = 30;

function hhmmToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function flagTightConnections(
  items: FlagItem[],
  transports: FlagTransport[],
  opts: { windingFactor: number; avgSpeedKph: number },
): Flag[] {
  // Build a direction-agnostic set of stop pairs connected by a transport leg.
  const connectedStopPairs = new Set<string>();
  for (const t of transports) {
    if (t.fromStopId && t.toStopId && t.fromStopId !== t.toStopId) {
      connectedStopPairs.add(`${t.fromStopId}-${t.toStopId}`);
      connectedStopPairs.add(`${t.toStopId}-${t.fromStopId}`);
    }
  }

  // Collect fully-timed, located items grouped by date
  const byDate = new Map<
    string,
    (FlagItem & { lat: number; lng: number; startTime: string; endTime: string })[]
  >();
  for (const it of items) {
    if (!it.date || !it.startTime || !it.endTime || it.lat == null || it.lng == null) continue;
    const arr = byDate.get(it.date) ?? [];
    arr.push(
      it as FlagItem & { lat: number; lng: number; startTime: string; endTime: string },
    );
    byDate.set(it.date, arr);
  }

  const flags: Flag[] = [];
  for (const [date, dayItems] of byDate) {
    const sorted = [...dayItems].sort(
      (a, b) => hhmmToMin(a.startTime) - hhmmToMin(b.startTime),
    );
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const next = sorted[i];

      // Skip pairs that are at different stops connected by a transport leg —
      // changing location mid-day is the transport's job, not a walk-feasibility problem.
      if (
        prev.stopId &&
        next.stopId &&
        prev.stopId !== next.stopId &&
        connectedStopPairs.has(`${prev.stopId}-${next.stopId}`)
      ) {
        continue;
      }

      const km = haversineKm({ lat: prev.lat, lng: prev.lng }, { lat: next.lat, lng: next.lng });
      const walkMin = (km / WALK_KMH) * 60;
      const travel = walkMin <= MAX_WALK_MIN ? walkMin : estimateDriveMinutes(km, opts);
      const gap = hhmmToMin(next.startTime) - hhmmToMin(prev.endTime);
      if (gap < travel) {
        flags.push({
          id: `tight-${prev.id}-${next.id}`,
          severity: "warning",
          message: `Tight on ${date}: only ${Math.max(0, Math.round(gap))} min between activities, but ~${Math.round(travel)} min to get there.`,
          targetType: "DAY",
          date,
        });
      } else if (gap < travel + TIGHT_CONNECTION_BUFFER_MIN) {
        flags.push({
          id: `tight-${prev.id}-${next.id}`,
          severity: "info",
          message: `Cutting it close on ${date}: ${Math.round(gap)} min between activities (~${Math.round(travel)} min to get there).`,
          targetType: "DAY",
          date,
        });
      }
    }
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Rule 11: Hard end date (warning when over, info when approaching)
//
// Compares the trip's projected end against an optional traveller-set hard end
// date. Advisory only — see ADR 0013.
// ---------------------------------------------------------------------------

export function flagHardEndDate(
  projectedEnd: string | null | undefined,
  hardEndDate: string | null | undefined,
): Flag[] {
  if (!projectedEnd || !hardEndDate) return [];
  const slack = daysBetween(projectedEnd, hardEndDate); // hardEnd - projectedEnd, in nights
  if (slack < 0) {
    const over = -slack;
    return [
      {
        id: "hard-end-over",
        severity: "warning" as const,
        message: `Your plan runs ${over} night${over === 1 ? "" : "s"} past your hard end date (${hardEndDate}).`,
        targetType: "TRIP" as const,
      },
    ];
  }
  if (slack <= HARD_END_APPROACHING_NIGHTS) {
    const message =
      slack === 0
        ? `Your plan ends right on your hard end date (${hardEndDate}).`
        : `Your plan ends within ${slack} night${slack === 1 ? "" : "s"} of your hard end date (${hardEndDate}).`;
    return [{ id: "hard-end-approaching", severity: "info" as const, message, targetType: "TRIP" as const }];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Rule 14: Accommodation coverage gap (warning)
//
// For each scheduled stop with >= 1 night that HAS at least one accommodation,
// count how many nights are not covered by any accommodation booking.
// (Zero-accommodation stops are handled by flagStopsWithoutAccommodation.)
// ---------------------------------------------------------------------------

export function flagAccommodationCoverageGaps(
  stops: FlagStop[],
  accommodations: FlagAccommodation[],
): Flag[] {
  const byStop = new Map<string, FlagAccommodation[]>();
  for (const a of accommodations) {
    const arr = byStop.get(a.stopId) ?? [];
    arr.push(a);
    byStop.set(a.stopId, arr);
  }
  const flags: Flag[] = [];
  for (const stop of stops) {
    const nights = nightsBetween(stop.arriveDate, stop.departDate);
    if (nights < 1) continue;
    const accoms = byStop.get(stop.id) ?? [];
    if (accoms.length === 0) continue; // zero-accommodation handled elsewhere
    let uncovered = 0;
    for (let d = 0; d < nights; d++) {
      const night = addDays(stop.arriveDate, d);
      const covered = accoms.some((a) => a.checkIn <= night && night < a.checkOut);
      if (!covered) uncovered++;
    }
    if (uncovered > 0) {
      flags.push({
        id: `accom-gap-${stop.id}`,
        severity: "warning",
        message: `${stop.name} has ${uncovered} night${uncovered === 1 ? "" : "s"} without accommodation booked.`,
        targetType: "STOP",
        targetId: stop.id,
      });
    }
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Rule 13: Missing connection between consecutive stops (info)
//
// For each pair of consecutive stops (by sortOrder) that have no transport
// linking them in either direction, fire an info flag on the TRANSPORT target
// type to prompt the user to book a connection.
// ---------------------------------------------------------------------------

export function flagMissingConnections(stops: FlagStop[], transports: FlagTransport[]): Flag[] {
  const sorted = [...stops].sort((a, b) => a.sortOrder - b.sortOrder);
  const linked = new Set<string>();
  for (const t of transports) {
    if (t.fromStopId && t.toStopId) linked.add(`${t.fromStopId}|${t.toStopId}`);
  }
  const flags: Flag[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (linked.has(`${a.id}|${b.id}`) || linked.has(`${b.id}|${a.id}`)) continue;
    flags.push({
      id: `missing-connection-${a.id}-${b.id}`,
      severity: "info",
      message: `No transport booked between ${a.name} and ${b.name}.`,
      targetType: "TRANSPORT",
    });
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Rule 15: Missing home connection (info)
//
// Checks whether the trip has a transport leg departing from the home base
// to the first stop (outbound) and, for round trips, one arriving back home
// from the last stop. Silent when no home base is set or no stops exist.
// ---------------------------------------------------------------------------

export function flagMissingHomeConnection(
  stops: { id: string; name: string; sortOrder: number }[],
  transports: Pick<FlagTransport, "depIsHome" | "arrIsHome" | "fromStopId" | "toStopId">[],
  home: HomeBase | null,
  roundTrip: boolean,
): Flag[] {
  if (!home || stops.length === 0) return [];
  const sorted = [...stops].sort((a, b) => a.sortOrder - b.sortOrder);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const flags: Flag[] = [];
  if (!hasOutboundLeg(transports, first.id)) {
    flags.push({
      id: "missing-home-outbound",
      severity: "info",
      message: `No transport booked from ${home.name} to ${first.name}.`,
      targetType: "TRANSPORT",
    });
  }
  if (roundTrip && !hasReturnLeg(transports, last.id)) {
    flags.push({
      id: "missing-home-return",
      severity: "info",
      message: `No transport booked from ${last.name} back to ${home.name}.`,
      targetType: "TRANSPORT",
    });
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Rule 16: Return leg after hard end date (warning)
//
// If a transport arriving home (arrIsHome=true) has an arrAt timestamp after
// the trip's hard end date, warn the traveller.
// ---------------------------------------------------------------------------

export function flagReturnLegAfterHardEnd(
  transports: Pick<FlagTransport, "arrIsHome" | "fromStopId" | "arrAt">[],
  hardEndDate: string | null | undefined,
): Flag[] {
  if (!hardEndDate) return [];
  const ret = transports.find((t) => t.arrIsHome && t.arrAt);
  if (!ret || !ret.arrAt) return [];
  const landISO = new Date(ret.arrAt).toISOString().slice(0, 10);
  if (landISO <= hardEndDate) return [];
  return [
    {
      id: "return-after-hard-end",
      severity: "warning",
      message: `Your return flight lands (${landISO}) after your hard end date (${hardEndDate}).`,
      targetType: "TRIP",
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
 *   8. Rough stops (info)
 *   9. Geographic spread day (info)
 *   10. Long driving day (warning)
 *   11. Hard end date (warning/info)
 *   12. Tight / impossible connections (warning/info)
 *   13. Missing connection between consecutive stops (info)
 */
export function detectFlags({
  stops,
  transports,
  accommodations,
  items,
  tripStart,
  tripEnd,
  roughStopCount,
  projectedEnd,
  hardEndDate,
  drivingWindingFactor,
  drivingAvgSpeedKph,
  home,
  roundTrip,
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
    ...flagSpreadDays(items),
    ...flagTightConnections(items, transports, {
      windingFactor: drivingWindingFactor ?? 1.5,
      avgSpeedKph: drivingAvgSpeedKph ?? 80,
    }),
    ...flagLongDrivingDays(stops, transports, {
      windingFactor: drivingWindingFactor ?? 1.5,
      avgSpeedKph: drivingAvgSpeedKph ?? 80,
    }),
    ...flagHardEndDate(projectedEnd, hardEndDate),
    ...flagMissingConnections(stops, transports),
    ...flagAccommodationCoverageGaps(stops, accommodations),
    ...flagMissingHomeConnection(stops, transports, home ?? null, roundTrip ?? true),
    ...flagReturnLegAfterHardEnd(transports, hardEndDate),
  ];
}
