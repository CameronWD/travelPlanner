/**
 * A plan's projected end, hard end date and deadline (ADR 0068), computed
 * from rows a loader already holds (spec 2026-10-06 §C) — so a page that has
 * read its Stops and Transports doesn't read them again for the projection.
 * Pure. getTripProjection (server/actions/stops.ts) wraps it for callers
 * that haven't read anything yet.
 */
import { computeProjectedEnd, type ProjectionStop } from "@/lib/firm-up";
import { resolveTripDeadline, type DeadlineLeg, type TripDeadline } from "@/lib/trip-deadline";

export interface ProjectionTrip {
  startDate: string | null;
  hardEndDate: string | null;
  roundTrip: boolean | null;
}

export interface TripProjection {
  projectedEnd: string | null;
  hardEndDate: string | null;
  deadline: TripDeadline | null;
}

/** `stops`: every Stop of the plan (dated and rough), any order. */
export function computeProjection({
  trip,
  stops,
  transports,
}: {
  trip: ProjectionTrip | null;
  stops: readonly (ProjectionStop & { timezone?: string | null })[];
  transports: readonly DeadlineLeg[];
}): TripProjection {
  const hardEndDate = trip?.hardEndDate ?? null;
  return {
    projectedEnd: computeProjectedEnd(stops, trip?.startDate ?? null),
    hardEndDate,
    deadline: resolveTripDeadline({ stops, transports, hardEndDate, roundTrip: trip?.roundTrip ?? true }),
  };
}
