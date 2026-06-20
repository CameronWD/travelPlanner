/**
 * Calendar-date helpers for the Trip Planner.
 *
 * "Calendar dates" are YYYY-MM-DD strings. We parse them as midnight UTC to
 * avoid timezone drift (a date like "2026-07-03" should always be 3 Jul 2026
 * regardless of the viewer's local timezone).
 */

// ---------------------------------------------------------------------------
// Parse / format
// ---------------------------------------------------------------------------

/**
 * Parse a YYYY-MM-DD string to a Date (midnight UTC).
 * Throws if the string isn't the expected format.
 */
export function parseISODate(s: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new RangeError(`Expected YYYY-MM-DD, got: ${s}`);
  }
  return new Date(`${s}T00:00:00Z`);
}

/**
 * Format a Date to a YYYY-MM-DD string (UTC calendar date).
 */
export function formatISODate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Format a YYYY-MM-DD date range into a collapsed string.
 *
 * Examples:
 *   - Same month/year:  "3–6 Jul 2026"
 *   - Different month:  "28 Jun – 4 Jul 2026"
 *   - Different year:   "28 Dec 2025 – 3 Jan 2026"
 */
export function formatDateRange(start: string, end: string): string {
  const s = parseISODate(start);
  const e = parseISODate(end);

  const sd = s.getUTCDate();
  const sm = s.getUTCMonth();
  const sy = s.getUTCFullYear();
  const ed = e.getUTCDate();
  const em = e.getUTCMonth();
  const ey = e.getUTCFullYear();

  if (sy === ey && sm === em) {
    // Same month and year — collapse year and month
    return `${sd}–${ed} ${MONTH_SHORT[sm]} ${sy}`;
  }
  if (sy === ey) {
    // Same year only — collapse year
    return `${sd} ${MONTH_SHORT[sm]} – ${ed} ${MONTH_SHORT[em]} ${sy}`;
  }
  // Different years
  return `${sd} ${MONTH_SHORT[sm]} ${sy} – ${ed} ${MONTH_SHORT[em]} ${ey}`;
}

/**
 * Format a YYYY-MM-DD string to a long date like "Fri 3 Jul 2026".
 */
export function formatLongDate(s: string): string {
  const d = parseISODate(s);
  const day = DAY_SHORT[d.getUTCDay()];
  const date = d.getUTCDate();
  const month = MONTH_SHORT[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${day} ${date} ${month} ${year}`;
}

// ---------------------------------------------------------------------------
// Arithmetic helpers
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;

/**
 * Number of whole nights between two calendar dates (depart - arrive in days).
 * Returns 0 if dates are equal; never negative (returns 0 if arrive > depart).
 */
export function nightsBetween(arriveDate: string, departDate: string): number {
  const arrive = parseISODate(arriveDate);
  const depart = parseISODate(departDate);
  const diff = Math.round((depart.getTime() - arrive.getTime()) / MS_PER_DAY);
  return Math.max(0, diff);
}

/**
 * Number of whole days between two calendar dates (b - a in days).
 * Can be negative if b < a.
 */
export function daysBetween(a: string, b: string): number {
  const da = parseISODate(a);
  const db = parseISODate(b);
  return Math.round((db.getTime() - da.getTime()) / MS_PER_DAY);
}

/**
 * Add `n` days to a YYYY-MM-DD string, returning a new YYYY-MM-DD string.
 */
export function addDays(s: string, n: number): string {
  const d = parseISODate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return formatISODate(d);
}

/**
 * Returns true if `date` is within [start, end] (inclusive on both ends).
 */
export function isDateWithin(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

/**
 * Today's date as a YYYY-MM-DD string (UTC calendar date).
 */
export function todayISO(): string {
  return formatISODate(new Date());
}
