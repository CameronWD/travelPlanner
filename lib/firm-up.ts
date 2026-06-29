import { addDays, nightsBetween } from "./dates";

export interface FlowStop {
  id: string;
  nights: number | null;
  pinned: boolean;
  /** Present (and authoritative) when pinned or already scheduled. */
  arriveDate: string | null;
  departDate: string | null;
}

export interface FlowResult {
  id: string;
  arriveDate: string;
  departDate: string;
  pinned: boolean;
  /** True when the computed dates differ from the stop's current dates. */
  changed: boolean;
}

export interface FlowConflict {
  stopId: string;
  message: string;
}

/**
 * Flow calendar dates forward through an ordered list of stops.
 *
 * Non-pinned stops take `arrive = cursor`, `depart = arrive + nights` (a null
 * nights count defaults to 1), advancing the cursor with same-day handoff.
 * A pinned stop is an immovable boundary: its dates are kept as-is and the
 * cursor resumes from its depart date. If the running cursor has already passed
 * a pinned stop's arrive date, the flexible stops before it don't fit — a
 * conflict is reported (the pin is still honoured). Slack before a pin is left
 * as free days.
 */
export function flowDates(
  stops: readonly FlowStop[],
  anchorDate: string,
): { results: FlowResult[]; conflicts: FlowConflict[] } {
  const results: FlowResult[] = [];
  const conflicts: FlowConflict[] = [];
  let cursor = anchorDate;

  for (const stop of stops) {
    if (stop.pinned && stop.arriveDate && stop.departDate) {
      if (cursor > stop.arriveDate) {
        conflicts.push({
          stopId: stop.id,
          message: `Earlier stops run to ${cursor}, past this pinned arrival of ${stop.arriveDate}.`,
        });
      }
      results.push({
        id: stop.id,
        arriveDate: stop.arriveDate,
        departDate: stop.departDate,
        pinned: true,
        changed: false,
      });
      cursor = stop.departDate;
    } else {
      const nights = Math.max(0, stop.nights ?? 1);
      const arriveDate = cursor;
      const departDate = addDays(arriveDate, nights);
      results.push({
        id: stop.id,
        arriveDate,
        departDate,
        pinned: false,
        changed: arriveDate !== stop.arriveDate || departDate !== stop.departDate,
      });
      cursor = departDate;
    }
  }

  return { results, conflicts };
}

/** Nights of remaining slack at/under which the plan is "approaching" the hard end date. */
export const HARD_END_APPROACHING_NIGHTS = 2;

export interface ProjectionStop {
  id: string;
  arriveDate: string | null;
  departDate: string | null;
  nights: number | null;
  pinned: boolean;
  sortOrder: number;
}

/**
 * Project where the trip currently ends: every stop's nights flowed forward
 * from the anchor (rough stops included), reusing flowDates. Scheduled stops
 * keep their real dates (treated as fixed boundaries so gaps are preserved);
 * only rough stops flow. Returns the latest depart date, or null when there's
 * nothing to anchor to (no start date and no scheduled stop).
 */
export function computeProjectedEnd(
  stops: readonly ProjectionStop[],
  anchorDate: string | null,
): string | null {
  if (stops.length === 0) return null;
  const ordered = [...stops].sort((a, b) => a.sortOrder - b.sortOrder);

  let anchor = anchorDate;
  if (!anchor) {
    let earliest: string | null = null;
    for (const s of ordered) {
      if (s.arriveDate && (earliest === null || s.arriveDate < earliest)) earliest = s.arriveDate;
    }
    anchor = earliest;
  }
  if (!anchor) return null;

  const flowStops: FlowStop[] = ordered.map((s) => {
    const scheduled = Boolean(s.arriveDate && s.departDate);
    return {
      id: s.id,
      nights: scheduled
        ? nightsBetween(s.arriveDate as string, s.departDate as string)
        : Math.max(0, s.nights ?? 1),
      pinned: scheduled || s.pinned,
      arriveDate: s.arriveDate,
      departDate: s.departDate,
    };
  });

  const { results } = flowDates(flowStops, anchor);
  let end: string | null = null;
  for (const r of results) {
    if (end === null || r.departDate > end) end = r.departDate;
  }
  return end;
}
