/**
 * Day titles — pure helpers (no db, no React).
 *
 * CONTEXT.md "Day title": an optional name a Traveller gives one day of a
 * Stop's stay. It belongs to one owning Stop, as *that Stop's Nth day*
 * (`dayIndex`, 0-based offset from the Stop's arriveDate) — so it rides with
 * its Stop when the Stop is re-dated, exactly like a scheduled Item's offset
 * (ADR 0038). A title whose day no longer exists (the Stop shortened past
 * it) is kept but not shown, and returns if the stay grows back.
 *
 * A Changeover day (ADR 0049) carries at most one Day title, owned by
 * whichever Stop set it. `titlesByDate` resolves that: if two Stops both
 * have a title landing on the same calendar date, the earlier-arriving Stop
 * wins.
 */

import { addDays, daysBetween, isDateWithin } from "@/lib/dates";

export interface DayTitleRow {
  stopId: string;
  dayIndex: number;
  title: string;
}

export interface StopSpan {
  id: string;
  arriveDate: string | null;
  departDate: string | null;
}

/**
 * dayIndex of `dateISO` within the Stop's stay (arrive..depart inclusive), or
 * null if the Stop is rough (no dates) or the date falls outside the stay.
 */
export function dayIndexFor(stop: StopSpan, dateISO: string): number | null {
  if (!stop.arriveDate || !stop.departDate) return null;
  if (!isDateWithin(dateISO, stop.arriveDate, stop.departDate)) return null;
  return daysBetween(stop.arriveDate, dateISO);
}

/**
 * Map dateISO → { title, ownerStopId } for every title whose day exists in
 * its Stop's stay (arrive..depart inclusive). Hidden (out-of-stay) titles are
 * omitted. If two Stops title the same date (changeover), the
 * earlier-arriving Stop wins.
 */
export function titlesByDate(
  stops: StopSpan[],
  titles: DayTitleRow[],
): Map<string, { title: string; stopId: string }> {
  const stopsById = new Map(stops.map((s) => [s.id, s]));
  // Internal working map also tracks the owning Stop's arriveDate, so a
  // later-processed title from an earlier-arriving Stop can still win —
  // the outcome must not depend on input order.
  const working = new Map<string, { title: string; stopId: string; arriveDate: string }>();

  for (const row of titles) {
    const stop = stopsById.get(row.stopId);
    if (!stop || !stop.arriveDate || !stop.departDate) continue;

    const dateISO = addDays(stop.arriveDate, row.dayIndex);
    if (!isDateWithin(dateISO, stop.arriveDate, stop.departDate)) continue; // hidden — day no longer exists

    const existing = working.get(dateISO);
    if (existing && existing.arriveDate <= stop.arriveDate) continue; // existing owner arrives no later — it wins

    working.set(dateISO, { title: row.title, stopId: row.stopId, arriveDate: stop.arriveDate });
  }

  const result = new Map<string, { title: string; stopId: string }>();
  for (const [date, v] of working) {
    result.set(date, { title: v.title, stopId: v.stopId });
  }
  return result;
}
