/**
 * Pure roll-up model for the Plan overview strip. No Prisma/React.
 * See CONTEXT.md (Hard end date, Projected end) and ADR 0013.
 */
import { computeProjectedEnd, HARD_END_APPROACHING_NIGHTS, type ProjectionStop } from "@/lib/firm-up";
import { nightsBetween, daysBetween } from "@/lib/dates";

export type HardEndState = "unset" | "dormant" | "ok" | "approaching" | "over";

export interface PlanSummaryInput {
  stops: ProjectionStop[];
  /** Trip start date (anchor), or null. */
  startDate: string | null;
  hardEndDate: string | null;
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
  hardEndDate: string | null;
  hardEndState: HardEndState;
  /** hardEnd − projectedEnd in nights; positive = spare, negative = over; null when unset/dormant. */
  hardEndSlackNights: number | null;
}

export function summarizePlan({ stops, startDate, hardEndDate }: PlanSummaryInput): PlanSummary {
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
  if (!hardEndDate) {
    hardEndState = "unset";
  } else if (!projectedEnd) {
    hardEndState = "dormant";
  } else {
    const slack = daysBetween(projectedEnd, hardEndDate);
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
    hardEndDate,
    hardEndState,
    hardEndSlackNights,
  };
}
