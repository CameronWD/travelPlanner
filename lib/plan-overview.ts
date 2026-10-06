/**
 * Pure roll-up model for the Plan overview strip. No Prisma/React.
 * See CONTEXT.md (Hard end date, Projected end), ADR 0013 and ADR 0068.
 */
import { computeProjectedEnd, HARD_END_APPROACHING_NIGHTS, type ProjectionStop } from "@/lib/firm-up";
import { nightsBetween, daysBetween } from "@/lib/dates";
import type { TripDeadline } from "@/lib/trip-deadline";

export type HardEndState = "unset" | "dormant" | "ok" | "approaching" | "over";

export interface PlanSummaryInput {
  stops: ProjectionStop[];
  /** Trip start date (anchor), or null. */
  startDate: string | null;
  /** The Trip's deadline from resolveTripDeadline — dated return leg, else hard end date (ADR 0068). */
  deadline: TripDeadline | null;
}

export interface PlanSummary {
  stopCount: number;
  roughCount: number;
  scheduledNights: number;
  projectedNights: number;
  /** Left edge of the date span: start date, else earliest scheduled arrive, else null. */
  spanStart: string | null;
  /** Latest scheduled depart, or null when nothing is scheduled. */
  scheduledEnd: string | null;
  projectedEnd: string | null;
  deadline: TripDeadline | null;
  hardEndState: HardEndState;
  /** deadline − projectedEnd in nights; positive = spare, negative = over; null when unset/dormant. */
  hardEndSlackNights: number | null;
}

export function summarizePlan({ stops, startDate, deadline }: PlanSummaryInput): PlanSummary {
  let roughCount = 0;
  let scheduledNights = 0;
  let projectedNights = 0;
  let scheduledEnd: string | null = null;
  let earliestArrive: string | null = null;

  for (const s of stops) {
    const scheduled = Boolean(s.arriveDate && s.departDate);
    if (scheduled) {
      const n = nightsBetween(s.arriveDate as string, s.departDate as string);
      scheduledNights += n;
      projectedNights += n;
      if (scheduledEnd === null || (s.departDate as string) > scheduledEnd) scheduledEnd = s.departDate as string;
      if (earliestArrive === null || (s.arriveDate as string) < earliestArrive) earliestArrive = s.arriveDate as string;
    } else {
      roughCount += 1;
      projectedNights += Math.max(0, s.nights ?? 1);
    }
  }

  const projectedEnd = computeProjectedEnd(stops, startDate ?? null);

  let hardEndState: HardEndState;
  let hardEndSlackNights: number | null = null;
  if (!deadline) {
    hardEndState = "unset";
  } else if (!projectedEnd) {
    hardEndState = "dormant";
  } else {
    const slack = daysBetween(projectedEnd, deadline.date);
    hardEndSlackNights = slack;
    if (slack < 0) hardEndState = "over";
    else if (slack <= HARD_END_APPROACHING_NIGHTS) hardEndState = "approaching";
    else hardEndState = "ok";
  }

  return {
    stopCount: stops.length,
    roughCount,
    scheduledNights,
    projectedNights,
    spanStart: startDate ?? earliestArrive,
    scheduledEnd,
    projectedEnd,
    deadline,
    hardEndState,
    hardEndSlackNights,
  };
}
