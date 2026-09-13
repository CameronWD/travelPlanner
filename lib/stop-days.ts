/**
 * Per-stop day bucketing for the plan editor — PURE, framework-free.
 *
 * Groups a scheduled Stop's scheduled Items (date != null) into one bucket per
 * calendar day of the stay, arrive → depart inclusive. Items dated outside the
 * stay are excluded: ADR 0038 un-slots those back to things-to-do, so any that
 * appear here are transient and must not invent extra day rows.
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
