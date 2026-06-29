/**
 * Pure "Make it fit" engine. No Prisma/React. Computes trim plans, drop
 * candidates, and faithful "resulting end" previews by replicating the apply
 * behaviour of setStopNights/applyStopDates (ripple) and deleteStop (no ripple).
 * See CONTEXT.md ("Make it fit") and ADR 0013.
 */
import { addDays, daysBetween, nightsBetween } from "@/lib/dates";
import { flowDates, computeProjectedEnd, type FlowStop, type ProjectionStop } from "@/lib/firm-up";

export interface FitStop {
  id: string;
  name: string;
  arriveDate: string | null;
  departDate: string | null;
  nights: number | null;
  pinned: boolean;
  sortOrder: number;
}

/** Nights the projected end runs past the hard end date (0 if on/under, or if either is null). */
export function nightsOver(projectedEnd: string | null, hardEndDate: string | null): number {
  if (!projectedEnd || !hardEndDate) return 0;
  const slack = daysBetween(projectedEnd, hardEndDate); // hardEnd - projectedEnd
  return slack < 0 ? -slack : 0;
}

/** Effective current nights of a stop: scheduled → from dates; rough → nights ?? 1. */
export function currentNights(s: FitStop): number {
  if (s.arriveDate && s.departDate) return nightsBetween(s.arriveDate, s.departDate);
  return Math.max(0, s.nights ?? 1);
}

/** A stop is flexible (trim/drop eligible) iff it is not pinned. */
export function isFlexible(s: FitStop): boolean {
  return !s.pinned;
}

function toProjectionStop(s: FitStop): ProjectionStop {
  return { id: s.id, arriveDate: s.arriveDate, departDate: s.departDate, nights: s.nights, pinned: s.pinned, sortOrder: s.sortOrder };
}

export interface SimResult {
  /** Working copy after trims, keyed by id (with rippled dates). */
  byId: Record<string, FitStop>;
  projectedEnd: string | null;
}

/**
 * Replicate applying `trims` (in sort order) via setStopNights/applyStopDates:
 *  - scheduled stop: depart = arrive + nights, then ripple the contiguous
 *    following dated run from the new depart (flowDates, pins held).
 *  - rough stop: set nights only.
 * Returns the working copy + the projected end computed over it.
 */
export function simulateAfterTrims(
  stops: readonly FitStop[],
  anchor: string | null,
  trims: ReadonlyArray<{ id: string; nights: number }>,
): SimResult {
  const work = stops.map((s) => ({ ...s })).sort((a, b) => a.sortOrder - b.sortOrder);
  const idxById = new Map(work.map((s, i) => [s.id, i]));
  const trimById = new Map(trims.map((t) => [t.id, t.nights]));

  for (const stop of work) {
    if (!trimById.has(stop.id)) continue;
    const n = Math.max(0, trimById.get(stop.id)!);
    const idx = idxById.get(stop.id)!;
    if (stop.arriveDate && stop.departDate) {
      stop.departDate = addDays(stop.arriveDate, n);
      const run: FitStop[] = [];
      for (let j = idx + 1; j < work.length; j++) {
        if (!work[j].arriveDate) break;
        run.push(work[j]);
      }
      if (run.length > 0) {
        const flowStops: FlowStop[] = run.map((r) => ({
          id: r.id,
          nights: r.arriveDate && r.departDate ? nightsBetween(r.arriveDate, r.departDate) : r.nights,
          pinned: r.pinned,
          arriveDate: r.arriveDate,
          departDate: r.departDate,
        }));
        const { results } = flowDates(flowStops, stop.departDate);
        for (const res of results) {
          if (res.pinned) continue;
          const target = work[idxById.get(res.id)!];
          target.arriveDate = res.arriveDate;
          target.departDate = res.departDate;
          target.nights = nightsBetween(res.arriveDate, res.departDate);
        }
      }
    } else {
      stop.nights = n;
    }
  }

  const projectedEnd = computeProjectedEnd(work.map(toProjectionStop), anchor);
  const byId: Record<string, FitStop> = {};
  for (const s of work) byId[s.id] = s;
  return { byId, projectedEnd };
}
