/**
 * `get_flags`'s loader (spec 2026-10-09, Task 10), split in two so a caller
 * that already has its own rows never pays for a second set of queries:
 *
 * - `flagsFromRows` — PURE. The Summary page's own `detectFlags` input
 *   assembly (app/(app)/trips/[tripId]/summary/page.tsx), extracted verbatim
 *   so the page and `get_flags` can never drift apart. Takes rows (and a
 *   `TripProjection`) the caller already has; does no I/O of its own.
 * - `loadFlags` — does its own Prisma queries (real plan only) and its own
 *   `getTripProjection` round trip, then calls `flagsFromRows`. For a caller
 *   with no existing read to reuse (the Claude connection's `get_flags`
 *   tool).
 *
 * The Summary page does NOT call `loadFlags` — it computes the projection
 * from Stops/Transports it already fetched in one wave (spec 2026-10-06 §C,
 * pinned by its own "reads Stops once ... not with a second round of reads"
 * test) and passes that `TripProjection` straight to `flagsFromRows`, so
 * `getTripProjection` still never runs on that page. `loadFlags` is for a
 * caller that has no such existing read to reuse.
 *
 * A date-less trip has no day window that `detectFlags` can reason about, so
 * `loadFlags` returns `[]` for one — same as `loadHomePlanningData`'s
 * Sketching branch (lib/desktop-home-loader.ts).
 */
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { REAL_PLAN } from "@/lib/plan-scope";
import { getTripProjection } from "@/server/actions/stops";
import type { TripProjection } from "@/lib/trip-projection";
import { tripHomeBase } from "@/lib/home-base";
import {
  detectFlags,
  type Flag,
  type FlagStop,
  type FlagTransport,
  type FlagAccommodation,
  type FlagItem,
} from "@/lib/flags";

// ---------------------------------------------------------------------------
// Pure assembler
// ---------------------------------------------------------------------------

interface RawAllStopRow {
  id: string;
  name: string;
  lat?: number | null;
  lng?: number | null;
  timezone?: string | null;
  arriveDate: string | null;
  departDate: string | null;
  sortOrder: number;
}

export interface FlagsAssemblyInput {
  trip: {
    drivingWindingFactor: number;
    drivingAvgSpeedKph: number;
    homeName: string | null;
    homeLat: number | null;
    homeLng: number | null;
    homeCountryCode: string | null;
    roundTrip: boolean | null;
  };
  /** ALL Stops of the plan — dated and rough together, any order. */
  allStops: RawAllStopRow[];
  transports: FlagTransport[];
  accommodations: FlagAccommodation[];
  items: FlagItem[];
  tripStart: string; // YYYY-MM-DD
  tripEnd: string; // YYYY-MM-DD
  projection: TripProjection;
}

/**
 * Assemble `detectFlags`'s input from raw (Prisma-shaped) rows and an
 * already-computed `TripProjection`, and run it. No I/O — callers that
 * already hold these rows (the Summary page) call this directly; `loadFlags`
 * below is for a caller that doesn't.
 */
export function flagsFromRows({
  trip,
  allStops,
  transports,
  accommodations,
  items,
  tripStart,
  tripEnd,
  projection,
}: FlagsAssemblyInput): Flag[] {
  const stops = allStops.filter((s) => s.arriveDate !== null);
  const roughStops = allStops.filter((s) => s.arriveDate === null);

  // First/last stop by sortOrder across ALL stops (dated + rough) — the
  // home-connection flag needs this, matching phase-planning's nudges.
  const allStopsSorted = [...stops, ...roughStops]
    .map((s) => ({ id: s.id, name: s.name, sortOrder: s.sortOrder ?? 0 }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const homeFirstStop = allStopsSorted[0] ?? null;
  const homeLastStop = allStopsSorted[allStopsSorted.length - 1] ?? null;

  return detectFlags({
    stops: stops as FlagStop[],
    transports,
    accommodations,
    items,
    tripStart,
    tripEnd,
    roughStopCount: roughStops.length,
    projectedEnd: projection.projectedEnd,
    hardEndDate: projection.hardEndDate,
    deadline: projection.deadline,
    drivingWindingFactor: trip.drivingWindingFactor,
    drivingAvgSpeedKph: trip.drivingAvgSpeedKph,
    home: tripHomeBase(trip),
    roundTrip: trip.roundTrip ?? undefined,
    homeFirstStop,
    homeLastStop,
  });
}

// ---------------------------------------------------------------------------
// Thin, self-contained loader (get_flags)
// ---------------------------------------------------------------------------

/**
 * Load a Trip's Flags from just a `tripId`: its own queries, its own
 * `getTripProjection` round trip, real plan only. The Summary page does NOT
 * call this — see the file doc comment above.
 */
export async function loadFlags(tripId: string): Promise<Flag[]> {
  await requireTripAccess(tripId);

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: {
      startDate: true,
      endDate: true,
      drivingWindingFactor: true,
      drivingAvgSpeedKph: true,
      homeName: true,
      homeLat: true,
      homeLng: true,
      homeCountryCode: true,
      roundTrip: true,
    },
  });
  // detectFlags needs a dated window; a date-less trip has none to reason
  // about (same as loadHomePlanningData's Sketching branch).
  if (!trip?.startDate || !trip.endDate) return [];

  const { startDate, endDate } = trip;

  const [allStops, transports, accommodations, items, projection] = await Promise.all([
    db.stop.findMany({
      where: { tripId, ...REAL_PLAN },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, lat: true, lng: true, timezone: true, arriveDate: true, departDate: true, sortOrder: true },
    }),
    db.transport.findMany({
      where: { tripId, ...REAL_PLAN },
      orderBy: { sortOrder: "asc" },
      select: { id: true, fromStopId: true, toStopId: true, depAt: true, arrAt: true, mode: true, depIsHome: true, arrIsHome: true },
    }),
    db.accommodation.findMany({
      where: { tripId, ...REAL_PLAN },
      select: { id: true, stopId: true, checkIn: true, checkOut: true, name: true },
    }),
    db.item.findMany({
      where: { tripId, ...REAL_PLAN },
      select: { id: true, stopId: true, category: true, date: true, startTime: true, endTime: true, lat: true, lng: true },
    }),
    getTripProjection(tripId),
  ]);

  return flagsFromRows({
    trip,
    allStops,
    transports: transports as FlagTransport[],
    accommodations: accommodations as FlagAccommodation[],
    items: items as FlagItem[],
    tripStart: startDate,
    tripEnd: endDate,
    projection,
  });
}
