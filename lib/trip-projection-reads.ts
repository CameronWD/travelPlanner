import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { planScope, type PlanId } from "@/lib/plan-scope";
import { computeProjection } from "@/lib/trip-projection";
import type { TripDeadline } from "@/lib/trip-deadline";

/**
 * Compute a plan's projected end, its hard end date and its deadline (a dated
 * return leg's departure, else the hard end date — ADR 0068) in one round
 * trip, for the Flag detector on the Summary, Home and nav counts, and Make
 * it fit. Stops and transports are read in plan scope, so a Fork resolves its
 * own deadline. A lib read (spec 2026-10-14 card 3.N), no longer a published
 * action.
 */
export async function getTripProjection(
  tripId: string,
  forkId?: PlanId,
): Promise<{ projectedEnd: string | null; hardEndDate: string | null; deadline: TripDeadline | null }> {
  await requireTripAccess(tripId);
  const [trip, stops, transports] = await Promise.all([
    db.trip.findUnique({ where: { id: tripId }, select: { startDate: true, hardEndDate: true, roundTrip: true } }),
    db.stop.findMany({
      where: { tripId, ...planScope(forkId) },
      orderBy: { sortOrder: "asc" },
      select: { id: true, arriveDate: true, departDate: true, nights: true, pinned: true, sortOrder: true, timezone: true },
    }),
    db.transport.findMany({
      where: { tripId, ...planScope(forkId) },
      select: { mode: true, fromStopId: true, toStopId: true, depAt: true, arrIsHome: true },
    }),
  ]);
  return computeProjection({ trip, stops, transports });
}
