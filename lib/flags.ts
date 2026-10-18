/**
 * Pure flag-detection engine for the Trip Planner.
 *
 * PURE — no Prisma, no React, no network calls. Fully unit-testable.
 *
 * Accepts plain typed inputs (mirroring Prisma shapes but framework-free)
 * and returns a list of Flag objects describing potential issues.
 */

import { nightsBetween, isDateWithin, addDays, daysBetween, formatLongDate, formatISODate, formatDayLabel, parseISODate } from "@/lib/dates";
import { uncoveredNights } from "@/lib/accommodation-coverage";
import { HARD_END_APPROACHING_NIGHTS } from "@/lib/firm-up"; // threshold lives alongside computeProjectedEnd
import { instantToZonedDateISO } from "@/lib/tz";
import { haversineKm, estimateDriveMinutes, type LatLng } from "@/lib/geo";
import { hasOutboundLeg, hasReturnLeg, findReturnLeg, type HomeBase } from "@/lib/home-base";
import { deadlineNoun, type TripDeadline } from "@/lib/trip-deadline";
import { hoursOn, type DayHours, type OpeningHours } from "@/lib/opening-hours";
import { defaultStartFromSlot } from "@/lib/slot-time";
import { activeBookBy } from "@/lib/booking-state";

// ---------------------------------------------------------------------------
// Flag shape
// ---------------------------------------------------------------------------

type FlagSeverity = "warning" | "info";
type FlagTargetType =
  | "STOP"
  | "TRANSPORT"
  | "ACCOMMODATION"
  | "ITEM"
  | "DAY"
  | "TRIP";

export interface Flag {
  id: string;
  severity: FlagSeverity;
  message: string;
  targetType: FlagTargetType;
  /** Id of the entity this flag points to, if applicable. */
  targetId?: string;
  /** For DAY flags: the ISO date string. For ITEM flags: the Item's day, when it has one. */
  date?: string;
  /** The Stop the plan editor opens to fix this (spec 2026-10-06 §F) — set where targetId isn't a Stop. */
  stopId?: string;
  /** A missing leg: the ends a new Transport would join; "home" is the Home base (spec 2026-10-06 §F). */
  connection?: { from: string; to: string };
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
  /** CONTEXT.md "Booking state" (the stored, effective state) and its book-by date, "YYYY-MM-DD" (spec 2026-10-17 R2). */
  bookingState?: string | null;
  bookBy?: string | null;
}

export interface FlagAccommodation {
  id: string;
  stopId: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  name: string;
  /** CONTEXT.md "Booking state" (the stored, effective state) and its book-by date, "YYYY-MM-DD" (spec 2026-10-17 R2). */
  bookingState?: string | null;
  bookBy?: string | null;
}

export interface FlagItem {
  id: string;
  stopId?: string | null;
  date?: string | null; // YYYY-MM-DD
  startTime?: string | null; // HH:MM
  endTime?: string | null; // HH:MM
  lat?: number | null;
  lng?: number | null;
  /** The Item's title, for the planning Flags' wording (spec 2026-10-17 R7). */
  title?: string | null;
  /** CONTEXT.md "Opening hours", already parsed (lib/opening-hours-stored.ts withOpeningHours); read in the Stop's local time, like startTime. */
  openingHours?: OpeningHours | null;
  /** CONTEXT.md "Slot time": the ticket's time ("HH:mm") and how early to be there (minutes). */
  slotTime?: string | null;
  arriveByMinutes?: number | null;
  /** CONTEXT.md "Booking state" (the stored, effective state) and its book-by date, "YYYY-MM-DD" (spec 2026-10-17 R2). */
  bookingState?: string | null;
  bookBy?: string | null;
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
  /**
   * The Trip's deadline (ADR 0068) from resolveTripDeadline — a dated return
   * leg's departure, else the Hard end date. Omitted (undefined): derived from
   * `hardEndDate`. Provided (even null): it wins.
   */
  deadline?: TripDeadline | null;
  /** Per-trip drive-estimate config; defaults suit mixed/winding roads. */
  drivingWindingFactor?: number;
  drivingAvgSpeedKph?: number;
  /** Home base for detecting missing home-connection legs. */
  home?: HomeBase | null;
  /** The Trip's Home base IANA timezone (spec 2026-10-14) — a Home-flagged transport end reads its calendar date in this zone. */
  homeTimezone?: string | null;
  /** Whether the trip is a round trip (return leg back to home expected). */
  roundTrip?: boolean;
  /**
   * First stop by sortOrder across ALL stops (dated + rough).
   * When provided, flagMissingHomeConnection uses this instead of deriving
   * first/last from its `stops` param — ensuring alignment with phase-planning
   * nudges which also use all stops.
   */
  homeFirstStop?: { id: string; name: string } | null;
  /**
   * Last stop by sortOrder across ALL stops (dated + rough).
   * See homeFirstStop above.
   */
  homeLastStop?: { id: string; name: string } | null;
  /**
   * Surprise (CONTEXT.md, ADR 0051): Stops the viewer may not see inside. The
   * caller has already left their Accommodation and Items out, so a Flag about
   * that inside would be false and would point at the Surprise: no
   * no-accommodation or coverage Flag for these Stops, and no empty, overlap,
   * packed or spread Flag on their days (arrive date to depart date). Their
   * outside (dates, Transport) still flags as normal.
   */
  hiddenStopIds?: readonly string[];
  /**
   * Surprise (ADR 0051): Items the viewer may not see (a hidden root Item's
   * placeholder, every Item inside a hidden Stop). The planning Flags
   * (spec 2026-10-17 R7) never name them.
   */
  hiddenItemIds?: readonly string[];
  /**
   * The Trip's own today (lib/trip-today.ts tripTodayISO), "YYYY-MM-DD". The
   * book-by and still-to-book Flags (spec 2026-10-17 R7) count from it;
   * omitted, they stay silent.
   */
  today?: string | null;
  /** Every Stop's name, rough ones included, so a leg to a rough Stop still names it. Omitted: the dated `stops`. */
  stopNames?: ReadonlyMap<string, string>;
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
  /** The Trip's Home base timezone (spec 2026-10-14) — a Home-flagged end lands on this zone's calendar date instead of its Stop fallback. */
  homeTimezone?: string | null,
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
      const depTz = (t.depIsHome && homeTimezone) || tzOf(fromStop);
      const depDay = instantToZonedDateISO(depDate, depTz);
      if (depDay >= tripStart && depDay <= tripEnd) activeDays.add(depDay);
    }
    const arrDate = toDate(t.arrAt);
    if (arrDate) {
      const toStop = t.toStopId ? stopById.get(t.toStopId) : undefined;
      const arrTz = (t.arrIsHome && homeTimezone) || tzOf(toStop ?? (t.fromStopId ? stopById.get(t.fromStopId) : undefined));
      const arrDay = instantToZonedDateISO(arrDate, arrTz);
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
          stopId: fromStop.id,
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
            stopId: toStop.id,
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
          ? `Same-day stop in ${stop.name}: no overnight stay.`
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
      message: `${count} stop${count === 1 ? "" : "s"} still rough. Set their dates to add them to the itinerary.`,
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
        message: `Your plans on ${date} are spread out (~${Math.round(maxKm)} km apart). Check it's doable.`,
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
        message: `Long driving day on ${date}: ~${hrs}h behind the wheel. Check it's doable.`,
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
// Rule 11: The Trip's deadline (warning when over, info when approaching)
//
// Compares the projected end against the Trip's deadline — a dated return
// leg's departure, else the traveller-set Hard end date (ADR 0013, 0068).
// A bare string is a Hard end date. Advisory only.
// ---------------------------------------------------------------------------

export function flagHardEndDate(
  projectedEnd: string | null | undefined,
  deadline: TripDeadline | string | null | undefined,
): Flag[] {
  const d: TripDeadline | null =
    typeof deadline === "string" ? { kind: "hard-end", date: deadline } : (deadline ?? null);
  if (!projectedEnd || !d) return [];
  // Hard end keeps its historic wording; the return leg reads as the trip home.
  const ref = d.kind === "hard-end" ? `hard end date (${d.date})` : `${deadlineNoun(d)} (${formatLongDate(d.date)})`;
  const slack = daysBetween(projectedEnd, d.date); // deadline - projectedEnd, in nights
  if (slack < 0) {
    const over = -slack;
    return [
      {
        id: "hard-end-over",
        severity: "warning" as const,
        message: `Your plan runs ${over} night${over === 1 ? "" : "s"} past your ${ref}.`,
        targetType: "TRIP" as const,
      },
    ];
  }
  // R7 (controller ruling, 2026-10-05): a dated return leg is never
  // "approaching" — ending on, or ahead of, the day you fly is the plan
  // working, not a warning sign. Only the hard-end deadline keeps the
  // approaching window; a return leg only ever fires "over", above.
  if (d.kind === "hard-end" && slack <= HARD_END_APPROACHING_NIGHTS) {
    const message =
      slack === 0
        ? `Your plan ends right on your ${ref}.`
        : `Your plan ends within ${slack} night${slack === 1 ? "" : "s"} of your ${ref}.`;
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
    const uncovered = uncoveredNights(stop, accoms);
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
      connection: { from: a.id, to: b.id },
    });
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Rule 15: Missing home connection (info)
//
// Checks whether the trip has the outbound/return leg as lib/home-base.ts
// defines it (by shape, ADR 0032 amendment) — arriving at the first stop and,
// for round trips, departing the last stop. Silent when no home base is set
// or no stops exist.
// ---------------------------------------------------------------------------

export function flagMissingHomeConnection(
  stops: { id: string; name: string; sortOrder: number }[],
  transports: Pick<FlagTransport, "depIsHome" | "arrIsHome" | "fromStopId" | "toStopId">[],
  home: HomeBase | null,
  roundTrip: boolean,
  overrides?: {
    firstStop?: { id: string; name: string } | null;
    lastStop?: { id: string; name: string } | null;
  },
): Flag[] {
  if (!home || stops.length === 0) return [];
  // Use caller-supplied first/last (all stops by sortOrder) when provided;
  // fall back to deriving from the supplied stops array.
  let first: { id: string; name: string };
  let last: { id: string; name: string };
  if (overrides?.firstStop && overrides?.lastStop) {
    first = overrides.firstStop;
    last = overrides.lastStop;
  } else {
    const sorted = [...stops].sort((a, b) => a.sortOrder - b.sortOrder);
    first = sorted[0];
    last = sorted[sorted.length - 1];
  }
  const flags: Flag[] = [];
  if (!hasOutboundLeg(transports, first.id)) {
    flags.push({
      id: "missing-home-outbound",
      severity: "info",
      message: `No transport booked from ${home.name} to ${first.name}.`,
      targetType: "TRANSPORT",
      connection: { from: "home", to: first.id },
    });
  }
  if (roundTrip && !hasReturnLeg(transports, last.id)) {
    flags.push({
      id: "missing-home-return",
      severity: "info",
      message: `No transport booked from ${last.name} back to ${home.name}.`,
      targetType: "TRANSPORT",
      connection: { from: last.id, to: "home" },
    });
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Rule 16: Return leg after hard end date (warning)
//
// If the return leg — as lib/home-base.ts defines it (by shape, ADR 0032
// amendment) — has an arrAt timestamp after the trip's hard end date, warn
// the traveller.
// ---------------------------------------------------------------------------

export function flagReturnLegAfterHardEnd(
  transports: Pick<FlagTransport, "arrIsHome" | "fromStopId" | "toStopId" | "arrAt">[],
  hardEndDate: string | null | undefined,
  lastStopId: string | null,
  /** The Trip's Home base timezone (spec 2026-10-14) — an arrIsHome leg lands on this zone's calendar date instead of the raw UTC one. */
  homeTimezone?: string | null,
): Flag[] {
  if (!hardEndDate) return [];
  const ret = findReturnLeg(transports, lastStopId);
  if (!ret || !ret.arrAt) return [];
  const landDate = new Date(ret.arrAt);
  const landISO = ret.arrIsHome && homeTimezone ? instantToZonedDateISO(landDate, homeTimezone) : formatISODate(landDate);
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
// Planning Flags (spec 2026-10-17 R7): what they may look at
//
// Plan placements only (a Wishlist idea has neither a Stop nor a day) and
// nothing the viewer cannot see. Deliberately not `outsideHidden`: an Item of
// a visible Stop on the Changeover day it shares with a hidden Stop still
// flags. Placeholders are masked already (no hours, slot or booking), so the
// id filter is a second line of defence.
// ---------------------------------------------------------------------------

function planningSubjects(
  items: FlagItem[],
  accommodations: FlagAccommodation[],
  hiddenStops: ReadonlySet<string>,
  hiddenItemIds: readonly string[] | undefined,
): { items: FlagItem[]; accommodations: FlagAccommodation[] } {
  const hiddenItems = new Set(hiddenItemIds ?? []);
  return {
    items: items.filter(
      (i) => (i.stopId || i.date) && !hiddenItems.has(i.id) && !(i.stopId && hiddenStops.has(i.stopId)),
    ),
    accommodations: accommodations.filter((a) => !hiddenStops.has(a.stopId)),
  };
}

function itemTitle(item: FlagItem): string | null {
  return item.title?.trim() || null;
}

function itemTarget(item: FlagItem): Pick<Flag, "targetType" | "targetId" | "date" | "stopId"> {
  return {
    targetType: "ITEM",
    targetId: item.id,
    ...(item.date ? { date: item.date } : {}),
    ...(item.stopId ? { stopId: item.stopId } : {}),
  };
}

function itemFlag(item: FlagItem, id: string, severity: FlagSeverity, message: string): Flag {
  return { id, severity, message, ...itemTarget(item) };
}

// ---------------------------------------------------------------------------
// Rule 17: Closed that day (warning)
//
// The Item's day is closed by its Opening hours: a closed date, the governing
// season's weekday, or the usual week's. Silent when the hours, the weekday
// or the date is not known (hoursOn returns null).
// ---------------------------------------------------------------------------

const WEEKDAYS_PLURAL = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"] as const;

function closedMessage(name: string, date: string, day: DayHours): string {
  if (day.by === "closed-date") return `${name} is closed on ${formatDayLabel(date)}.`;
  const weekdays = WEEKDAYS_PLURAL[parseISODate(date).getUTCDay()];
  if (day.by === "season") {
    return day.seasonLabel
      ? `${name} is closed on ${weekdays} (${day.seasonLabel}).`
      : `${name} is closed on ${weekdays} at that time of year.`;
  }
  return `${name} is closed on ${weekdays}.`;
}

export function flagClosedOnDay(items: FlagItem[]): Flag[] {
  const flags: Flag[] = [];
  for (const item of items) {
    if (!item.date) continue;
    const day = hoursOn(item.openingHours, item.date);
    if (!day?.closed) continue;
    const name = itemTitle(item) ?? "This thing to do";
    flags.push(itemFlag(item, `item-closed-${item.id}`, "warning", closedMessage(name, item.date, day)));
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Rules 18–19: Before opening / After closing (warnings)
//
// Read in the Stop's local time on the Item's day. The governing span is the
// first that has not closed by the Item's start:
//   - start before it opens            → Before opening ("opens"/"reopens at")
//   - no span left (start ≥ last close) → After closing ("this starts …")
//   - an end after its close            → After closing ("this ends …")
//   - no end, start within CLOSING_SOON_MIN of its close → After closing
// An end at or before the start runs into the next day: no end check.
// A closed day is Closed that day's job; an unknown day stays silent.
// ---------------------------------------------------------------------------

export const CLOSING_SOON_MIN = 30;

const clock = (hhmm: string) => (hhmm === "24:00" ? "midnight" : hhmm);

export function flagOutsideOpeningHours(items: FlagItem[]): Flag[] {
  const flags: Flag[] = [];
  for (const item of items) {
    if (!item.date || !item.startTime) continue;
    const day = hoursOn(item.openingHours, item.date);
    if (!day || day.closed || day.spans.length === 0) continue;
    const name = itemTitle(item) ?? "This thing to do";
    const start = hhmmToMin(item.startTime);
    const end = item.endTime ? hhmmToMin(item.endTime) : null;
    const spans = day.spans.map(([open, close]) => ({ open, close, openMin: hhmmToMin(open), closeMin: hhmmToMin(close) }));
    const at = spans.findIndex((s) => s.closeMin > start);
    if (at === -1) {
      const last = spans[spans.length - 1];
      flags.push(itemFlag(item, `item-after-close-${item.id}`, "warning", `${name} closes at ${clock(last.close)}; this starts ${item.startTime}.`));
      continue;
    }
    const span = spans[at];
    if (start < span.openMin) {
      const verb = at === 0 ? "opens" : "reopens";
      flags.push(itemFlag(item, `item-before-open-${item.id}`, "warning", `${name} ${verb} at ${span.open}; this starts ${item.startTime}.`));
    }
    if (end !== null) {
      if (end > start && end > span.closeMin) {
        flags.push(itemFlag(item, `item-after-close-${item.id}`, "warning", `${name} closes at ${clock(span.close)}; this ends ${item.endTime}.`));
      }
    } else if (start >= span.openMin && span.closeMin - start <= CLOSING_SOON_MIN) {
      const left = span.closeMin - start;
      flags.push(itemFlag(item, `item-after-close-${item.id}`, "warning", `${name} closes at ${clock(span.close)}, ${left} minute${left === 1 ? "" : "s"} after this starts.`));
    }
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Rule 20: Late for the slot (warning)
//
// The Item starts after its slot less the arrive-by margin (the same
// "be there" time the Item form defaults the start to, clamped at 00:00).
// Covers a start the Traveller moved, or a slot changed after the start was
// defaulted (spec 2026-10-17, Branch 1 as built, C.2).
// ---------------------------------------------------------------------------

export function flagLateForSlot(items: FlagItem[]): Flag[] {
  const flags: Flag[] = [];
  for (const item of items) {
    if (!item.startTime || !item.slotTime) continue;
    const beThere = defaultStartFromSlot(item.slotTime, item.arriveByMinutes);
    if (!beThere || hhmmToMin(item.startTime) <= hhmmToMin(beThere)) continue;
    const name = itemTitle(item) ?? "This thing to do";
    const message = item.arriveByMinutes
      ? `${name} starts ${item.startTime}, but the ${item.slotTime} slot needs you there by ${beThere}.`
      : `${name} starts ${item.startTime}, after its ${item.slotTime} slot.`;
    flags.push(itemFlag(item, `item-late-slot-${item.id}`, "warning", message));
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Rule 21: Book by soon (info) / Overdue (warning)
//
// An Item, leg or stay still To book with a book-by date: overdue once the
// date has passed (Trip-local today), soon within BOOK_BY_SOON_DAYS.
// Nothing once the thing itself has happened (its day is past).
// ---------------------------------------------------------------------------

export const BOOK_BY_SOON_DAYS = 7;

export interface BookingContext {
  today: string;
  stops: FlagStop[];
  stopNames?: ReadonlyMap<string, string>;
  home?: HomeBase | null;
  homeTimezone?: string | null;
}

interface BookingSubjectRow {
  id: string;
  /** Named mid-sentence: an Item's title, a stay's name, "the train from Paris to Rome". */
  label: string;
  bookingState?: string | null;
  bookBy?: string | null;
  /** When it happens: an Item's day, a leg's local departure day, a check-in. */
  when: string | null;
  target: Pick<Flag, "targetType" | "targetId" | "date" | "stopId">;
}

const MODE_NOUN: Record<string, string> = { FLIGHT: "flight", TRAIN: "train", BUS: "bus", CAR: "drive", FERRY: "ferry", OTHER: "transport" };

function legLabel(t: FlagTransport, names: ReadonlyMap<string, string>, home: HomeBase | null | undefined): string {
  const end = (isHome: boolean | null | undefined, stopId: string | null | undefined) =>
    isHome ? (home?.name ?? null) : stopId ? (names.get(stopId) ?? null) : null;
  const from = end(t.depIsHome, t.fromStopId);
  const to = end(t.arrIsHome, t.toStopId);
  return `the ${MODE_NOUN[t.mode] ?? "transport"}${from ? ` from ${from}` : ""}${to ? ` to ${to}` : ""}`;
}

/** A leg's departure day in its own zone: the Home base's for a Home end, else its Stop's (lib/desktop-home-loader.ts reads it the same way). */
function legDepartureDay(t: FlagTransport, stopById: Map<string, FlagStop>, homeTimezone: string | null | undefined): string | null {
  const dep = toDate(t.depAt);
  if (!dep) return null;
  const from = t.fromStopId ? stopById.get(t.fromStopId) : undefined;
  const to = t.toStopId ? stopById.get(t.toStopId) : undefined;
  return instantToZonedDateISO(dep, (t.depIsHome && homeTimezone) || from?.timezone || to?.timezone || "UTC");
}

function bookingSubjects(
  items: FlagItem[],
  transports: FlagTransport[],
  accommodations: FlagAccommodation[],
  ctx: BookingContext,
): BookingSubjectRow[] {
  const stopById = new Map(ctx.stops.map((s) => [s.id, s]));
  const names = ctx.stopNames ?? new Map(ctx.stops.map((s) => [s.id, s.name]));
  return [
    ...items.map((i) => ({
      id: i.id, label: itemTitle(i) ?? "a thing to do", bookingState: i.bookingState, bookBy: i.bookBy,
      when: i.date ?? null, target: itemTarget(i),
    })),
    ...transports.map((t) => {
      const stopId = t.fromStopId ?? t.toStopId;
      return {
        id: t.id, label: legLabel(t, names, ctx.home), bookingState: t.bookingState, bookBy: t.bookBy,
        when: legDepartureDay(t, stopById, ctx.homeTimezone),
        target: { targetType: "TRANSPORT" as const, targetId: t.id, ...(stopId ? { stopId } : {}) },
      };
    }),
    ...accommodations.map((a) => ({
      id: a.id, label: a.name, bookingState: a.bookingState, bookBy: a.bookBy, when: a.checkIn,
      target: { targetType: "ACCOMMODATION" as const, targetId: a.id, stopId: a.stopId },
    })),
  ];
}

export function flagBookByDates(
  input: { items: FlagItem[]; transports: FlagTransport[]; accommodations: FlagAccommodation[] } & BookingContext,
): Flag[] {
  const flags: Flag[] = [];
  for (const s of bookingSubjects(input.items, input.transports, input.accommodations, input)) {
    const bookBy = activeBookBy(s.bookingState, s.bookBy);
    if (!bookBy) continue;
    if (s.when && s.when < input.today) continue; // it has happened: nothing left to book
    const day = formatDayLabel(bookBy);
    const n = daysBetween(input.today, bookBy);
    if (n < 0) {
      flags.push({ id: `book-by-overdue-${s.id}`, severity: "warning", message: `Book ${s.label} now: its book-by date (${day}) has passed.`, ...s.target });
    } else if (n <= BOOK_BY_SOON_DAYS) {
      const message =
        n === 0
          ? `Book ${s.label} today: it's the book-by date.`
          : `Book ${s.label} by ${n === 1 ? `tomorrow (${day})` : `${day}, in ${n} days`}.`;
      flags.push({ id: `book-by-soon-${s.id}`, severity: "info", message, ...s.target });
    }
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Rule 22: Still to book close to the day (info)
//
// A leg or stay still To book with no book-by date (a dated one is Rule 21's)
// whose own day (local departure, check-in) is within
// STILL_TO_BOOK_WITHIN_DAYS of today. Items are not included (spec R7: "a To
// book leg or stay"); a leg with no departure time stays silent (the
// unbooked-transport nudge covers it).
// ---------------------------------------------------------------------------

export const STILL_TO_BOOK_WITHIN_DAYS = 14;

const dayFromToday = (n: number, date: string) =>
  n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days (${formatDayLabel(date)})`;

export function flagStillToBookSoon(
  input: { transports: FlagTransport[]; accommodations: FlagAccommodation[] } & BookingContext,
): Flag[] {
  const flags: Flag[] = [];
  for (const s of bookingSubjects([], input.transports, input.accommodations, input)) {
    if (s.bookingState !== "TO_BOOK" || activeBookBy(s.bookingState, s.bookBy) || !s.when) continue;
    const n = daysBetween(input.today, s.when);
    if (n < 0 || n > STILL_TO_BOOK_WITHIN_DAYS) continue;
    const when = dayFromToday(n, s.when);
    const message =
      s.target.targetType === "TRANSPORT"
        ? `${s.label.charAt(0).toUpperCase()}${s.label.slice(1)} is still to book and leaves ${when}.`
        : `${s.label} is still to book and you check in ${when}.`;
    flags.push({ id: `still-to-book-${s.id}`, severity: "info", message, ...s.target });
  }
  return flags;
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
 *   11. Trip deadline — return leg or hard end date (warning/info)
 *   12. Tight / impossible connections (warning/info)
 *   13. Missing connection between consecutive stops (info)
 *   17. Closed that day (warning)
 *   18–19. Before opening / After closing (warning)
 *   20. Late for the slot (warning)
 *   21. Book by soon (info) / Overdue (warning)
 *   22. Still to book close to the day (info)
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
  deadline,
  drivingWindingFactor,
  drivingAvgSpeedKph,
  home,
  homeTimezone,
  roundTrip,
  homeFirstStop,
  homeLastStop,
  hiddenStopIds,
  hiddenItemIds,
  today,
  stopNames,
}: DetectFlagsInput): Flag[] {
  const hidden = new Set(hiddenStopIds ?? []);
  const hiddenStops = stops.filter((s) => hidden.has(s.id));
  const insideVisible = stops.filter((s) => !hidden.has(s.id));
  const onHiddenDay = (f: Flag) =>
    f.date !== undefined && hiddenStops.some((s) => s.arriveDate <= f.date! && f.date! <= s.departDate);
  const outsideHidden = (flags: Flag[]) => (hiddenStops.length === 0 ? flags : flags.filter((f) => !onHiddenDay(f)));
  const planning = planningSubjects(items, accommodations, hidden, hiddenItemIds);
  // Same last-Stop derivation flagMissingHomeConnection uses: the caller-supplied
  // override (all stops, dated + rough) when given, else the last of the
  // supplied `stops` by sortOrder.
  const lastStopId =
    homeLastStop?.id ??
    (stops.length > 0 ? [...stops].sort((a, b) => a.sortOrder - b.sortOrder)[stops.length - 1].id : null);
  const effectiveDeadline: TripDeadline | null =
    deadline !== undefined ? deadline : hardEndDate ? { kind: "hard-end", date: hardEndDate } : null;
  return [
    ...flagStopsWithoutAccommodation(insideVisible, accommodations),
    ...outsideHidden(flagEmptyDays(stops, transports, accommodations, items, tripStart, tripEnd, homeTimezone)),
    ...flagTransportDateMismatches(stops, transports),
    ...flagVeryShortStays(stops),
    ...flagRouteBacktracking(stops),
    ...outsideHidden(flagItemTimeOverlaps(items)),
    ...outsideHidden(flagPackedDays(items)),
    ...flagRoughStops(roughStopCount ?? 0),
    ...outsideHidden(flagSpreadDays(items)),
    ...outsideHidden(flagTightConnections(items, transports, {
      windingFactor: drivingWindingFactor ?? 1.5,
      avgSpeedKph: drivingAvgSpeedKph ?? 80,
    })),
    ...flagLongDrivingDays(stops, transports, {
      windingFactor: drivingWindingFactor ?? 1.5,
      avgSpeedKph: drivingAvgSpeedKph ?? 80,
    }),
    ...flagHardEndDate(projectedEnd, effectiveDeadline),
    ...flagMissingConnections(stops, transports),
    ...flagAccommodationCoverageGaps(insideVisible, accommodations),
    ...flagMissingHomeConnection(stops, transports, home ?? null, roundTrip ?? true, {
      firstStop: homeFirstStop ?? null,
      lastStop: homeLastStop ?? null,
    }),
    // ADR 0068: while the return leg IS the deadline this would compare the leg with itself.
    ...(effectiveDeadline?.kind === "return-leg" ? [] : flagReturnLegAfterHardEnd(transports, hardEndDate, lastStopId, homeTimezone)),
    // Spec 2026-10-17 R7: the planning Flags, on what the viewer can see.
    ...flagClosedOnDay(planning.items),
    ...flagOutsideOpeningHours(planning.items),
    ...flagLateForSlot(planning.items),
    ...(today
      ? flagBookByDates({ items: planning.items, transports, accommodations: planning.accommodations, today, stops, stopNames, home, homeTimezone })
      : []),
    ...(today
      ? flagStillToBookSoon({ transports, accommodations: planning.accommodations, today, stops, stopNames, home, homeTimezone })
      : []),
  ];
}
