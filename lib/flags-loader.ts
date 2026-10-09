/**
 * `get_flags`'s loader (spec 2026-10-09, Task 10) — the Summary page's own
 * `detectFlags` input assembly, extracted so a caller with just a `tripId`
 * (the Claude connection's `get_flags` tool) can get the same Flags the
 * Summary page shows.
 *
 * Self-contained: does its own Prisma queries and its own `getTripProjection`
 * round trip (server/actions/stops.ts). The Summary page
 * (app/(app)/trips/[tripId]/summary/page.tsx) deliberately does NOT call this
 * — it computes the projection from Stops/Transports it already fetched in
 * one wave (spec 2026-10-06 §C, pinned by "reads Stops once ... not with a
 * second round of reads" in its test); calling this loader from there would
 * reintroduce exactly the second round trip that spec removed. This loader
 * is for a caller that has no such existing read to reuse. Real plan only.
 *
 * A date-less trip has no day window that `detectFlags` can reason about, so
 * this returns `[]` for one — same as `loadHomePlanningData`'s Sketching
 * branch (lib/desktop-home-loader.ts).
 */
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { REAL_PLAN } from "@/lib/plan-scope";
import { getTripProjection } from "@/server/actions/stops";
import { tripHomeBase } from "@/lib/home-base";
import {
  detectFlags,
  type Flag,
  type FlagStop,
  type FlagTransport,
  type FlagAccommodation,
  type FlagItem,
} from "@/lib/flags";

export async function loadFlags(tripId: string): Promise<Flag[]> {
  await requireTripAccess(tripId);

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: {
      startDate: true,
      endDate: true,
      hardEndDate: true,
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

  const stops = allStops.filter((s) => s.arriveDate !== null);
  const roughStops = allStops.filter((s) => s.arriveDate === null);

  // First/last stop by sortOrder across ALL stops (dated + rough) — same
  // merged, sorted list the Summary page builds for the home-connection flag.
  const allStopsSorted = [...stops, ...roughStops]
    .map((s) => ({ id: s.id, name: s.name, sortOrder: s.sortOrder ?? 0 }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const homeFirstStop = allStopsSorted[0] ?? null;
  const homeLastStop = allStopsSorted[allStopsSorted.length - 1] ?? null;

  return detectFlags({
    stops: stops as FlagStop[],
    transports: transports as FlagTransport[],
    accommodations: accommodations as FlagAccommodation[],
    items: items as FlagItem[],
    tripStart: startDate,
    tripEnd: endDate,
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
