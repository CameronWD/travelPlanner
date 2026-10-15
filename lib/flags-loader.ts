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
import { planScope, type PlanId } from "@/lib/plan-scope";
import { getTripProjection } from "@/server/actions/stops";
import { loadSurpriseVisibility } from "@/lib/surprise-visibility";
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
  /** Rough duration while dateless, or the dated Stop's own override (ADR 0038); optional — only `loadFlagRows`' own select guarantees it. */
  nights?: number | null;
  /** Dates fixed by a real booking/event; ripple never moves it; optional — see `nights` above. */
  pinned?: boolean;
}

export interface FlagsAssemblyInput {
  trip: {
    drivingWindingFactor: number;
    drivingAvgSpeedKph: number;
    homeName: string | null;
    homeLat: number | null;
    homeLng: number | null;
    homeCountryCode: string | null;
    /** The Trip's Home base IANA timezone (spec 2026-10-14) — a Home-flagged transport end reads its calendar date in this zone. */
    homeTimezone?: string | null;
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
  /** Surprise Stops hidden from the viewer: no Flag about their inside (lib/flags.ts). */
  hiddenStopIds?: readonly string[];
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
  hiddenStopIds,
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
    homeTimezone: trip.homeTimezone,
    roundTrip: trip.roundTrip ?? undefined,
    homeFirstStop,
    homeLastStop,
    hiddenStopIds,
  });
}

// ---------------------------------------------------------------------------
// Row loader — one read of the Flag ingredients, shared by every caller
// ---------------------------------------------------------------------------

/** The Trip fields every `detectFlags` caller needs (TB-01: all ten, every time). */
const FLAG_TRIP_SELECT = {
  startDate: true,
  endDate: true,
  drivingWindingFactor: true,
  drivingAvgSpeedKph: true,
  homeName: true,
  homeLat: true,
  homeLng: true,
  homeCountryCode: true,
  homeTimezone: true,
  roundTrip: true,
} as const;

const FLAG_STOP_SELECT = {
  id: true,
  name: true,
  lat: true,
  lng: true,
  timezone: true,
  arriveDate: true,
  departDate: true,
  sortOrder: true,
  nights: true,
  pinned: true,
} as const;

const FLAG_TRANSPORT_SELECT = {
  id: true,
  fromStopId: true,
  toStopId: true,
  depAt: true,
  arrAt: true,
  mode: true,
  depIsHome: true,
  arrIsHome: true,
} as const;

const FLAG_ACCOMMODATION_SELECT = {
  id: true,
  stopId: true,
  checkIn: true,
  checkOut: true,
  name: true,
} as const;

const FLAG_ITEM_SELECT = {
  id: true,
  stopId: true,
  category: true,
  date: true,
  startTime: true,
  endTime: true,
  lat: true,
  lng: true,
} as const;

export type FlagRows = {
  trip: FlagsAssemblyInput["trip"] & { startDate: string | null; endDate: string | null };
  allStops: RawAllStopRow[];
  transports: FlagTransport[];
  accommodations: FlagAccommodation[];
  items: FlagItem[];
  /** Surprise Stops hidden from the viewer: no Flag about their inside (lib/flags.ts). */
  hiddenStopIds: readonly string[];
};

/**
 * Read a Plan's Flag ingredients — the Trip's Home/driving fields and all
 * four plan collections — in one `Promise.all`, through the viewer's
 * Surprise visibility fragments. `null` when the trip has no dates yet
 * (same as `loadHomePlanningData`'s Sketching branch): there is no day
 * window for `detectFlags` to reason about, so there's nothing to read.
 *
 * Does NOT call `requireTripAccess` — every caller already has (or is) the
 * access check for its own page/action.
 */
export async function loadFlagRows(tripId: string, viewerId: string, plan?: PlanId): Promise<FlagRows | null> {
  const trip = await db.trip.findUnique({ where: { id: tripId }, select: FLAG_TRIP_SELECT });
  if (!trip?.startDate || !trip.endDate) return null;

  const v = await loadSurpriseVisibility(tripId, viewerId);

  const [allStops, transports, accommodations, items] = await Promise.all([
    db.stop.findMany({
      where: { tripId, ...planScope(plan) },
      orderBy: { sortOrder: "asc" },
      select: FLAG_STOP_SELECT,
    }),
    db.transport.findMany({
      where: { tripId, ...planScope(plan) },
      orderBy: { sortOrder: "asc" },
      select: FLAG_TRANSPORT_SELECT,
    }),
    db.accommodation.findMany({
      where: { tripId, ...planScope(plan), ...v.where.accommodation },
      select: FLAG_ACCOMMODATION_SELECT,
    }),
    db.item.findMany({
      where: { tripId, ...planScope(plan), ...v.where.item },
      select: FLAG_ITEM_SELECT,
    }),
  ]);

  // A hidden root Item still holds its slot (CONTEXT.md Surprise: the
  // surprised Traveller sees it from outside), so its placeholder counts here
  // exactly as readPlan's mergePlanItems counts it on Summary — masked to the
  // Flag fields, no title/category/location. Visibility spans every Fork, so
  // only this Plan's placeholders belong.
  const placeholders = v.placeholderItems
    .filter((p) => p.forkId === (plan ?? null))
    .map((p) => ({
      id: p.id,
      stopId: p.stopId,
      category: p.category,
      date: p.date,
      startTime: p.startTime,
      endTime: p.endTime,
      lat: null,
      lng: null,
    }));

  return {
    trip,
    allStops,
    transports: transports as FlagTransport[],
    accommodations: accommodations as FlagAccommodation[],
    items: [...items, ...placeholders] as FlagItem[],
    hiddenStopIds: v.hiddenStopIds,
  };
}

/** `flagsFromRows`, fed straight from `loadFlagRows`'s rows and a `TripProjection`. */
export function flagsForRows(rows: FlagRows, projection: TripProjection): Flag[] {
  return flagsFromRows({
    trip: rows.trip,
    allStops: rows.allStops,
    transports: rows.transports,
    accommodations: rows.accommodations,
    items: rows.items,
    tripStart: rows.trip.startDate!,
    tripEnd: rows.trip.endDate!,
    projection,
    hiddenStopIds: rows.hiddenStopIds,
  });
}

// ---------------------------------------------------------------------------
// Thin, self-contained loader (get_flags)
// ---------------------------------------------------------------------------

/**
 * Load a Trip's Flags from just a `tripId`: its own access check, its own
 * `loadFlagRows` read, its own `getTripProjection` round trip, real plan
 * only. The Summary page does NOT call this — see the file doc comment
 * above.
 *
 * Surprise (ADR 0051): `viewerId` is the Traveller asking (the acting
 * Traveller, for a Claude connection). Accommodations and Items are read
 * through their visibility fragments, as the Summary page reads them, so
 * nothing inside a Surprise hidden from them is read or named.
 */
export async function loadFlags(tripId: string, viewerId: string): Promise<Flag[]> {
  await requireTripAccess(tripId);

  // One wave (spec 2026-10-06 §C): the row read and the projection don't
  // depend on each other, so they go out together; the projection is simply
  // discarded below when the trip turns out to have no dates.
  const [rows, projection] = await Promise.all([loadFlagRows(tripId, viewerId), getTripProjection(tripId)]);
  if (!rows) return [];

  return flagsForRows(rows, projection);
}
