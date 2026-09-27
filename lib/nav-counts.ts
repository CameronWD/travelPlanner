/**
 * Plan and Wishlist counts for the trip nav (sidebar rows ≥1280px; see
 * docs/specs/2026-09-27-beta-feedback.md §A). Self-contained — a caller that
 * hasn't already fetched a trip's stops/transports/etc for some other reason
 * (like lib/next-steps-loader.ts) — so it can be dropped into the nav's own
 * Suspense boundary without any other page having to thread this data down.
 *
 * Plan count = number of Flags on the real plan. Reuses the same
 * `detectFlags` call the Summary page makes (app/(app)/trips/[tripId]/summary/page.tsx)
 * with a minimal select, so the sidebar number can never drift from what the
 * Summary page's own Flags list shows. (Deliberately NOT
 * lib/next-steps-builder.ts's buildTripNextSteps, which omits the home/
 * round-trip flags and is phase-gated — this count is neither.)
 *
 * Wishlist count reuses WISHLIST_IDEA_WHERE, the same predicate the Wishlist
 * page's own query is built from (ADR 0022), so the two can never disagree.
 *
 * Wrapped in React `cache()` so the Plan and Wishlist rows (and anything else
 * that asks in the same request) share one query set; render from inside
 * `<Suspense fallback={null}>` so the nav never waits on it.
 */
import { cache } from "react";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { REAL_PLAN, WISHLIST_IDEA_WHERE } from "@/lib/plan-scope";
import { detectFlags } from "@/lib/flags";
import type { FlagStop, FlagTransport, FlagAccommodation, FlagItem } from "@/lib/flags";
import { tripHomeBase } from "@/lib/home-base";
import { getTripProjection } from "@/server/actions/stops";

export interface NavCounts {
  flags: number;
  wishlist: number;
}

export const loadNavCounts = cache(async (tripId: string): Promise<NavCounts> => {
  await requireTripAccess(tripId);

  const [trip, wishlist] = await Promise.all([
    db.trip.findUnique({
      where: { id: tripId },
      select: {
        startDate: true,
        endDate: true,
        roundTrip: true,
        homeName: true,
        homeLat: true,
        homeLng: true,
        homeCountryCode: true,
        drivingWindingFactor: true,
        drivingAvgSpeedKph: true,
      },
    }),
    db.item.count({ where: { tripId, ...REAL_PLAN, ...WISHLIST_IDEA_WHERE } }),
  ]);

  // A date-less trip's Summary shows no Flags at all (just the "no dates
  // yet" notice) — match that here rather than calling detectFlags with a
  // start/end it doesn't have.
  if (!trip?.startDate || !trip.endDate) {
    return { flags: 0, wishlist };
  }

  const [stops, transports, accommodations, items, roughStops, projection] = await Promise.all([
    db.stop.findMany({
      where: { tripId, ...REAL_PLAN, arriveDate: { not: null } },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        country: true,
        lat: true,
        lng: true,
        timezone: true,
        arriveDate: true,
        departDate: true,
        sortOrder: true,
        pinned: true,
        nights: true,
      },
    }),
    db.transport.findMany({
      where: { tripId, ...REAL_PLAN },
      select: {
        id: true,
        mode: true,
        fromStopId: true,
        toStopId: true,
        depAt: true,
        arrAt: true,
        depIsHome: true,
        arrIsHome: true,
      },
    }),
    db.accommodation.findMany({
      where: { tripId, ...REAL_PLAN },
      select: { id: true, stopId: true, name: true, checkIn: true, checkOut: true },
    }),
    db.item.findMany({
      where: { tripId, ...REAL_PLAN },
      select: {
        id: true,
        stopId: true,
        category: true,
        date: true,
        startTime: true,
        endTime: true,
        lat: true,
        lng: true,
      },
    }),
    db.stop.findMany({
      where: { tripId, ...REAL_PLAN, arriveDate: null },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, sortOrder: true },
    }),
    getTripProjection(tripId),
  ]);

  // First/last stop by sortOrder across ALL stops (dated + rough) — mirrors
  // the Summary page's own merge, for flagMissingHomeConnection.
  const allStopsSorted = [
    ...stops.map((s) => ({ id: s.id, name: s.name, sortOrder: s.sortOrder ?? 0 })),
    ...roughStops.map((s) => ({ id: s.id, name: s.name, sortOrder: s.sortOrder ?? 0 })),
  ].sort((a, b) => a.sortOrder - b.sortOrder);

  const flags = detectFlags({
    stops: stops as FlagStop[],
    transports: transports as FlagTransport[],
    accommodations: accommodations as FlagAccommodation[],
    items: items as FlagItem[],
    tripStart: trip.startDate,
    tripEnd: trip.endDate,
    roughStopCount: roughStops.length,
    projectedEnd: projection.projectedEnd,
    hardEndDate: projection.hardEndDate,
    drivingWindingFactor: trip.drivingWindingFactor,
    drivingAvgSpeedKph: trip.drivingAvgSpeedKph,
    home: tripHomeBase(trip),
    roundTrip: trip.roundTrip ?? undefined,
    homeFirstStop: allStopsSorted[0] ?? null,
    homeLastStop: allStopsSorted[allStopsSorted.length - 1] ?? null,
  });

  return { flags: flags.length, wishlist };
});
