import { parseISODate } from "@/lib/dates";

/**
 * CONTEXT.md "Opening hours" (spec 2026-10-17 R4): the usual weekly hours,
 * seasons that replace them for a recurring date range, and closed dates. Read
 * in the Item's Stop's local time, like its start time. Stored as a JSON
 * string on `Item.openingHours` (validated by lib/validations/opening-hours.ts).
 * This module is the zod-free model and resolver, so cards can call `hoursOn`.
 *
 * Shape rules:
 *  - a weekday key ABSENT = not known; `[]` = closed; else 1–2 ordered spans;
 *  - a span is [open, close] "HH:mm", open < close, close may be "24:00";
 *  - a season is "MM-DD".."MM-DD", inclusive, and spans the year end when from > to;
 *  - a closed date is "YYYY-MM-DD" (that day) or "MM-DD" (that day every year).
 */

export const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const; // index = Date#getUTCDay()
export type Weekday = (typeof WEEKDAYS)[number];
export type HoursSpan = [open: string, close: string];
export type WeekHours = Partial<Record<Weekday, HoursSpan[]>>;

export interface OpeningSeason {
  label?: string;
  from: string; // "MM-DD"
  to: string; // "MM-DD"
  week: WeekHours;
}

export interface OpeningHours {
  week: WeekHours;
  seasons: OpeningSeason[];
  closed: string[]; // "YYYY-MM-DD" or "MM-DD"
  source?: string; // where the hours came from (set_opening_hours' source link)
}

export interface DayHours {
  closed: boolean;
  spans: HoursSpan[];
  /** What decided the day: a closed date, the governing season, or the usual week. */
  by: "closed-date" | "season" | "week";
  seasonLabel: string | null;
}

export const MAX_SPANS_PER_DAY = 2;
export const MAX_SEASONS = 12;
export const MAX_CLOSED_DATES = 200;

const DAY_MS = 86_400_000;

/** 0-based day of a leap year for an "MM-DD" — only for comparing season lengths. */
function leapDayOfYear(monthDay: string): number {
  const [m, d] = monthDay.split("-").map(Number);
  return Math.round((Date.UTC(2000, m - 1, d) - Date.UTC(2000, 0, 1)) / DAY_MS);
}

function seasonLength(s: Pick<OpeningSeason, "from" | "to">): number {
  const a = leapDayOfYear(s.from);
  const b = leapDayOfYear(s.to);
  return b >= a ? b - a + 1 : 366 - a + b + 1;
}

/** Whether a season's recurring range covers an "MM-DD" (inclusive; from > to spans the year end). */
export function seasonCovers(season: Pick<OpeningSeason, "from" | "to">, monthDay: string): boolean {
  const { from, to } = season;
  return from <= to ? from <= monthDay && monthDay <= to : monthDay >= from || monthDay <= to;
}

/** The season governing a date: the shortest that covers it; on a tie, the first listed. */
export function seasonOn(oh: OpeningHours, dateISO: string): OpeningSeason | null {
  const monthDay = dateISO.slice(5);
  let best: OpeningSeason | null = null;
  for (const s of oh.seasons) {
    if (!seasonCovers(s, monthDay)) continue;
    if (best === null || seasonLength(s) < seasonLength(best)) best = s;
  }
  return best;
}

export function isClosedDate(oh: OpeningHours, dateISO: string): boolean {
  const monthDay = dateISO.slice(5);
  return oh.closed.some((c) => c === dateISO || c === monthDay);
}

function dayHours(spans: HoursSpan[], by: DayHours["by"], seasonLabel: string | null): DayHours {
  return { closed: spans.length === 0, spans: spans.map(([o, c]) => [o, c]), by, seasonLabel };
}

/**
 * The hours on one calendar date: a closed date first, then the governing
 * season's entry for the weekday, then the usual week's. `null` = not known
 * (no hours, or the weekday entered nowhere), so callers (Flags) stay silent.
 */
export function hoursOn(oh: OpeningHours | null | undefined, dateISO: string): DayHours | null {
  if (!oh) return null;
  if (isClosedDate(oh, dateISO)) return { closed: true, spans: [], by: "closed-date", seasonLabel: null };
  const weekday = WEEKDAYS[parseISODate(dateISO).getUTCDay()];
  const season = seasonOn(oh, dateISO);
  const inSeason = season?.week[weekday];
  if (season && inSeason !== undefined) return dayHours(inSeason, "season", season.label ?? null);
  const usual = oh.week[weekday];
  if (usual !== undefined) return dayHours(usual, "week", null);
  return null;
}

/** Nothing entered (a source link alone says nothing) — stored as null. */
export function isEmptyOpeningHours(oh: OpeningHours): boolean {
  return WEEKDAYS.every((d) => oh.week[d] === undefined) && oh.seasons.length === 0 && oh.closed.length === 0;
}

/**
 * Opening hours belong to the place, so a thing to do and the copies placed
 * from it share them. Each row holds its own copy (copied on place by
 * ideaCopyData), and a write goes to the whole family: the root (the source
 * idea, or the Item itself) and every Item placed from it. That way reads never
 * join, and a copy keeps its hours if the idea is deleted (sourceItemId SetNull).
 */
export function openingHoursFamilyRoot(item: { id: string; sourceItemId: string | null }): string {
  return item.sourceItemId ?? item.id;
}

export function openingHoursFamilyWhere(tripId: string, rootId: string) {
  return { tripId, OR: [{ id: rootId }, { sourceItemId: rootId }] as [{ id: string }, { sourceItemId: string }] };
}
