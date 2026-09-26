/**
 * Self-contained SERVER loader for a Trip's "Next steps", for a caller that
 * hasn't already fetched a trip's stops/transports/etc for some other reason
 * (unlike the trip Home — see components/trip/home/phase-planning.tsx, which
 * has, and calls the pure `buildTripNextSteps` from lib/next-steps-builder.ts
 * directly with data it already loaded). Used by the trips list's featured
 * card.
 *
 * Does its own Prisma queries, then calls `buildTripNextSteps` — the ONE
 * place the Flags+nudges→steps logic lives, so this loader and the trip Home
 * can never drift apart. Returns `[]` for a date-less trip, or one not in the
 * "planning"/"final-prep" phase, exactly like the trip Home (which only
 * renders a Next steps card in those phases).
 */
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { REAL_PLAN } from "@/lib/plan-scope";
import { orderPlanStops } from "@/lib/plan-order";
import { computeTripPhase } from "@/lib/trip-phase";
import type { FlagStop, FlagTransport, FlagAccommodation, FlagItem } from "@/lib/flags";
import type { NextStep } from "@/lib/next-steps";
import { tripHomeBase } from "@/lib/home-base";
import { getTripProjection } from "@/server/actions/stops";
import { buildTripNextSteps } from "@/lib/next-steps-builder";

/**
 * Load a Trip's Next steps from scratch. `[]` when the trip has no dates yet,
 * or isn't in the "planning"/"final-prep" phase — the trip Home only shows a
 * Next steps card in those phases, so there's nothing to report otherwise.
 */
export async function loadNextSteps(tripId: string, today: string): Promise<NextStep[]> {
  await requireTripAccess(tripId);

  const trip = await db.trip.findUnique({
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
      chaptersEnabled: true,
    },
  });
  if (!trip?.startDate) return [];

  const phase = computeTripPhase({ startDate: trip.startDate, endDate: trip.endDate, today });
  if (phase !== "planning" && phase !== "final-prep") return [];

  const startDate = trip.startDate;
  const endDate = trip.endDate ?? startDate;
  const tripBasePath = `/trips/${tripId}`;

  const [
    datedStopsRaw,
    roughStopCount,
    allStops,
    transports,
    accommodations,
    items,
    undatedChapterCount,
    packingCount,
    pretripCount,
    projection,
  ] = await Promise.all([
    db.stop.findMany({
      where: { tripId, ...REAL_PLAN, arriveDate: { not: null } },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, lat: true, lng: true, timezone: true, arriveDate: true, departDate: true, sortOrder: true },
    }),
    db.stop.count({ where: { tripId, ...REAL_PLAN, arriveDate: null } }),
    db.stop.findMany({
      where: { tripId, ...REAL_PLAN },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    db.transport.findMany({
      where: { tripId, ...REAL_PLAN },
      select: { id: true, mode: true, fromStopId: true, toStopId: true, depAt: true, arrAt: true, depIsHome: true, arrIsHome: true },
    }),
    db.accommodation.findMany({
      where: { tripId, ...REAL_PLAN },
      select: { id: true, stopId: true, name: true, checkIn: true, checkOut: true },
    }),
    db.item.findMany({
      where: { tripId, ...REAL_PLAN },
      select: { id: true, stopId: true, category: true, date: true, startTime: true, endTime: true, lat: true, lng: true },
    }),
    trip.chaptersEnabled
      ? db.chapter.count({ where: { tripId, ...REAL_PLAN, startDate: null } })
      : Promise.resolve(0),
    db.checklistItem.count({ where: { tripId, kind: "PACKING" } }),
    db.checklistItem.count({ where: { tripId, kind: "PRETRIP" } }),
    getTripProjection(tripId),
  ]);

  const datedStops = orderPlanStops(
    datedStopsRaw.map((s) => ({ ...s, arriveDate: s.arriveDate!, departDate: s.departDate! })),
  );
  const flagStops: FlagStop[] = datedStops.map((s) => ({ ...s, timezone: s.timezone ?? "UTC" }));

  return buildTripNextSteps({
    tripBasePath,
    phase,
    tripStart: startDate,
    tripEnd: endDate,
    roundTrip: trip.roundTrip,
    home: tripHomeBase(trip),
    datedStops: flagStops,
    roughStopCount,
    allStops,
    transports: transports as FlagTransport[],
    accommodations: accommodations as FlagAccommodation[],
    items: items as FlagItem[],
    projectedEnd: projection.projectedEnd,
    hardEndDate: projection.hardEndDate,
    drivingWindingFactor: trip.drivingWindingFactor,
    drivingAvgSpeedKph: trip.drivingAvgSpeedKph,
    undatedChapterCount,
    hasPackingList: packingCount > 0,
    hasPretripList: pretripCount > 0,
  });
}
