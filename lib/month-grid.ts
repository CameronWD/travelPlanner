/**
 * Pure month-grid projection — Monday-first weeks of calendar days.
 * No React, no Prisma. Fully unit-testable.
 */

import { addDays, parseISODate, startOfMonthISO, endOfMonthISO } from "@/lib/dates";

/** Display-only weekday header labels (Monday-first). The grid ordering itself
 *  is enforced by `mondayIndex`, not by this array. */
export const MONTH_GRID_WEEKDAYS = [
  "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun",
] as const;

export interface MonthGridDay {
  dateISO: string;
  /** True when the day belongs to the anchored month (false for padding days). */
  inMonth: boolean;
}

/** Monday-indexed weekday (Mon=0 … Sun=6) for a YYYY-MM-DD string. */
function mondayIndex(dateISO: string): number {
  // getUTCDay(): Sun=0 … Sat=6. Shift so Mon=0 … Sun=6.
  return (parseISODate(dateISO).getUTCDay() + 6) % 7;
}

/**
 * Build the weeks (each exactly 7 cells, Monday-first) covering the month that
 * contains `monthAnchorISO`. Leading/trailing cells are real dates from the
 * adjacent months, flagged `inMonth: false`.
 */
export function buildMonthGrid(monthAnchorISO: string): MonthGridDay[][] {
  const monthStart = startOfMonthISO(monthAnchorISO);
  const monthEnd = endOfMonthISO(monthAnchorISO);
  const monthPrefix = monthStart.slice(0, 7);

  // Grid starts on the Monday on/before the 1st, ends on the Sunday on/after the last.
  const gridStart = addDays(monthStart, -mondayIndex(monthStart));
  const gridEnd = addDays(monthEnd, 6 - mondayIndex(monthEnd));

  const weeks: MonthGridDay[][] = [];
  let cursor = gridStart;
  while (cursor <= gridEnd) {
    const week: MonthGridDay[] = [];
    for (let i = 0; i < 7; i++) {
      week.push({ dateISO: cursor, inMonth: cursor.slice(0, 7) === monthPrefix });
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}
