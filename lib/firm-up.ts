import { addDays } from "./dates";

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
