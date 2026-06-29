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
        const flowStops: FlowStop[] = run.map((rs) => ({
          id: rs.id,
          nights: rs.arriveDate && rs.departDate ? nightsBetween(rs.arriveDate, rs.departDate) : rs.nights,
          pinned: rs.pinned,
          arriveDate: rs.arriveDate,
          departDate: rs.departDate,
        }));
        const { results } = flowDates(flowStops, stop.departDate);
        for (const res of results) {
          // Pins are immovable: flowDates already advanced its cursor past the
          // pin's depart, so downstream stops still flow correctly — we just
          // don't rewrite the pin's own dates.
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

export interface TrimItem {
  id: string;
  name: string;
  fromNights: number;
  toNights: number;
}
export interface TrimPlan {
  items: TrimItem[]; // only stops whose nights change
  resultingEnd: string | null;
  fits: boolean;
  /** Nights still over after trimming everything to the floor (0 when it fits). */
  shortBy: number;
}

const TRIM_FLOOR = 1;

/**
 * Build a proportional trim plan: distribute the needed reduction across
 * flexible stops in proportion to their trimmable headroom, floored at
 * TRIM_FLOOR, then verify against the ripple-faithful simulation and greedily
 * trim the stop with the most remaining headroom until it fits or all floored.
 */
export function buildTrimPlan(stops: readonly FitStop[], anchor: string | null, hardEndDate: string | null): TrimPlan {
  const baseEnd = computeProjectedEnd(stops.map(toProjectionStop), anchor);
  const over = nightsOver(baseEnd, hardEndDate);
  if (over === 0 || !hardEndDate) {
    return { items: [], resultingEnd: baseEnd, fits: true, shortBy: 0 };
  }

  const flex = stops.filter(isFlexible).sort((a, b) => a.sortOrder - b.sortOrder);
  const target = new Map<string, number>();
  for (const f of flex) target.set(f.id, currentNights(f));

  const totalTrimmable = flex.reduce((sum, f) => sum + Math.max(0, currentNights(f) - TRIM_FLOOR), 0);

  if (totalTrimmable > 0) {
    let remaining = over;
    for (const f of flex) {
      if (remaining <= 0) break;
      const headroom = Math.max(0, currentNights(f) - TRIM_FLOOR);
      if (headroom === 0) continue;
      const share = Math.min(headroom, remaining, Math.round((headroom / totalTrimmable) * over));
      target.set(f.id, currentNights(f) - share);
      remaining -= share;
    }
  }

  const trimsFrom = (): { id: string; nights: number }[] =>
    flex.filter((f) => target.get(f.id)! !== currentNights(f)).map((f) => ({ id: f.id, nights: target.get(f.id)! }));

  const evaluate = () => {
    const r = simulateAfterTrims(stops, anchor, trimsFrom());
    return { end: r.projectedEnd, over: nightsOver(r.projectedEnd, hardEndDate) };
  };

  // Greedy top-up: trim the flexible stop with the most remaining headroom, one
  // night at a time, until it fits or every flexible stop is at the floor. When
  // a downstream pin absorbs the slack, a step may not reduce stillOver; the
  // loop still converges (bounded by `guard`).
  let guard = 0;
  let { end, over: stillOver } = evaluate();
  while (stillOver > 0 && guard++ < 1000) {
    let pick: FitStop | null = null;
    let best = 0;
    for (const f of flex) {
      const headroom = target.get(f.id)! - TRIM_FLOOR;
      if (headroom > best) { best = headroom; pick = f; }
    }
    if (!pick) break; // all at the floor — can't trim further
    target.set(pick.id, target.get(pick.id)! - 1);
    ({ end, over: stillOver } = evaluate());
  }

  const items: TrimItem[] = flex
    .filter((f) => target.get(f.id)! !== currentNights(f))
    .map((f) => ({ id: f.id, name: f.name, fromNights: currentNights(f), toNights: target.get(f.id)! }));

  return { items, resultingEnd: end, fits: stillOver === 0, shortBy: stillOver };
}

export interface DropCandidate {
  id: string;
  name: string;
  nights: number;
  resultingEnd: string | null;
  fits: boolean;
  recommended: boolean;
}

/**
 * For each flexible stop, the projected end if it were dropped (no re-flow,
 * matching deleteStop). Recommends the single best candidate: the one that fits
 * with the latest end (closest to the date); else the one that reduces most.
 */
export function buildDropCandidates(stops: readonly FitStop[], anchor: string | null, hardEndDate: string | null): DropCandidate[] {
  const flex = stops.filter(isFlexible).sort((a, b) => a.sortOrder - b.sortOrder);
  const cands: DropCandidate[] = flex.map((f) => {
    const remaining = stops.filter((x) => x.id !== f.id).map(toProjectionStop);
    const end = computeProjectedEnd(remaining, anchor);
    const fits = Boolean(hardEndDate && end && end <= hardEndDate);
    return { id: f.id, name: f.name, nights: currentNights(f), resultingEnd: end, fits, recommended: false };
  });

  const fitting = cands.filter((c) => c.fits && c.resultingEnd);
  let rec: DropCandidate | undefined;
  if (fitting.length > 0) {
    rec = fitting.reduce((bestC, c) => (c.resultingEnd! > bestC.resultingEnd! ? c : bestC));
  } else {
    const withEnd = cands.filter((c) => c.resultingEnd);
    rec = withEnd.length ? withEnd.reduce((bestC, c) => (c.resultingEnd! < bestC.resultingEnd! ? c : bestC)) : undefined;
  }
  if (rec) rec.recommended = true;
  return cands;
}
