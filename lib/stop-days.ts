/**
 * Per-stop day grouping for the plan editor — PURE, framework-free.
 *
 * Two different grouping strategies live here, for two different callers:
 *
 * - `buildStopDays` buckets ONE Stop's already-known Items into calendar-day
 *   rows, arrive → depart inclusive. Items dated outside that Stop's stay are
 *   excluded: ADR 0038 un-slots those back to things-to-do, so any that
 *   appear here are transient and must not invent extra day rows.
 * - `groupScheduledItemsByStop` decides, for a WHOLE plan's Stops, which
 *   Items each Stop card should even be handed in the first place — grouped
 *   by DATE COVERAGE, not by `stopId`. On a Changeover day (ADR 0049) that
 *   deliberately puts the same Item under both adjoining Stops' cards; Item
 *   *ownership* (what `lib/budget.ts` counts a Cost against) is untouched by
 *   this grouping. `stop-day-list.tsx` calls `buildStopDays` on whatever this
 *   function handed it.
 */

import { enumerateTripDays } from "@/lib/itinerary";

export interface StopDayItem {
  id: string;
  title: string;
  category: string;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  address?: string | null;
  link?: string | null;
  booking?: string | null;
  notes?: string | null;
  stopId?: string | null;
}

export interface StopDay {
  /** YYYY-MM-DD */
  dateISO: string;
  /** Items with a startTime, sorted ascending by startTime. */
  timed: StopDayItem[];
  /** Items without a startTime, input order preserved. */
  untimed: StopDayItem[];
}

export function buildStopDays(
  arriveDate: string,
  departDate: string,
  items: StopDayItem[],
): StopDay[] {
  const byDate = new Map<string, StopDayItem[]>();
  for (const it of items) {
    if (!it.date) continue;
    const existing = byDate.get(it.date) ?? [];
    existing.push(it);
    byDate.set(it.date, existing);
  }
  return enumerateTripDays(arriveDate, departDate).map((dateISO) => {
    const dayItems = byDate.get(dateISO) ?? [];
    return {
      dateISO,
      timed: dayItems
        .filter((i) => Boolean(i.startTime))
        .sort((a, b) => (a.startTime! < b.startTime! ? -1 : a.startTime! > b.startTime! ? 1 : 0)),
      untimed: dayItems.filter((i) => !i.startTime),
    };
  });
}

export interface GroupableStop {
  id: string;
  arriveDate: string | null;
  departDate: string | null;
}

/**
 * Which Items each Stop card shows, keyed by stop id.
 *
 * Grouped by DATE COVERAGE, not by `stopId`. On a **Changeover day** — one
 * calendar day two consecutive Stops both claim — that puts the same Item
 * under both cards, which is the point (ADR 0049 rule 1). Ownership is
 * untouched: the Items come back carrying whatever `stopId` they had, and
 * `lib/budget.ts` still counts their Cost against exactly one Stop.
 *
 * Rough Stops are skipped: with no dates they cover no days.
 */
export function groupScheduledItemsByStop(
  stops: GroupableStop[],
  items: StopDayItem[],
): Map<string, StopDayItem[]> {
  const grouped = new Map<string, StopDayItem[]>();
  for (const stop of stops) {
    if (!stop.arriveDate || !stop.departDate) continue;
    grouped.set(
      stop.id,
      items.filter(
        (i) => !!i.date && i.date >= stop.arriveDate! && i.date <= stop.departDate!,
      ),
    );
  }
  return grouped;
}
