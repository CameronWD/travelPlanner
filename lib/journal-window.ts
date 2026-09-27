/**
 * Journal writability window (spec K / ADR 0058).
 *
 * A Traveller may write a Journal entry for any Trip day that has "arrived":
 * the Trip's local "today" has reached it, judged in the Trip's own
 * reference timezone (the same `todayISOInZone(currentTripTimezone(...))`
 * the Home page uses). The window opens on day 1 (never for days still
 * ahead) and — deliberately — never closes once a day has arrived, so a
 * missed day can always be caught up, even long after the Trip has ended.
 *
 * A date-less Trip (`startDate` null) has no Journal days at all: there is
 * nothing for "today" to have arrived relative to.
 */

import { addDays, daysBetween } from "@/lib/dates";

/** Server-enforced cap on a Journal note's length for new or changed text. */
export const JOURNAL_NOTE_MAX = 500;

export interface JournalWindowInput {
  startDate: string | null;
  endDate: string | null;
  /** Trip-local "today" (YYYY-MM-DD) — see module docblock for how callers compute it. */
  today: string;
}

/**
 * The last writable day: `today`, clamped to the Trip's end so the window
 * never runs ahead of a Trip that has already finished (nor, via the
 * `today < startDate` guard below, ahead of a Trip that hasn't started).
 * `endDate` is soft (spec: "auto-extends to cover scheduled stops"); a Trip
 * with a start but no end falls back to treating the start as the end, in
 * keeping with `lib/trip-phase.ts`'s `endDate ?? startDate`.
 */
function lastWritableDate(input: JournalWindowInput): string | null {
  const { startDate, endDate, today } = input;
  if (!startDate) return null;
  const end = endDate ?? startDate;
  return today < end ? today : end;
}

/**
 * Trip days a Traveller may write for: start..min(today, end), inclusive, in
 * the Trip's local "today". Empty before day 1 or for a date-less Trip.
 */
export function journalWritableDates(input: JournalWindowInput): string[] {
  const { startDate, today } = input;
  const last = lastWritableDate(input);
  if (!startDate || last === null || today < startDate) return [];

  const count = daysBetween(startDate, last);
  if (count < 0) return [];
  const dates: string[] = [];
  for (let i = 0; i <= count; i++) {
    dates.push(addDays(startDate, i));
  }
  return dates;
}

export function canWriteJournal(
  input: JournalWindowInput & { date: string },
): boolean {
  const { startDate, today, date } = input;
  const last = lastWritableDate(input);
  if (!startDate || last === null || today < startDate) return false;
  return date >= startDate && date <= last;
}
