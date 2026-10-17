import { z } from "zod";
import { isRealCalendarDate } from "@/lib/dates";
import {
  MAX_CLOSED_DATES, MAX_SEASONS, MAX_SPANS_PER_DAY, isEmptyOpeningHours, type OpeningHours,
} from "@/lib/opening-hours";
import { safeWebHref } from "@/lib/url";
import { hhmm, isoDate } from "@/lib/validations/primitives";

/**
 * CONTEXT.md "Opening hours" (spec 2026-10-17 R4): the zod side of
 * lib/opening-hours.ts. Every door that writes `Item.openingHours` (the Item
 * dialog, set_opening_hours) validates with `openingHoursSchema` and stores
 * `serializeOpeningHours`. Every reader parses with `parseOpeningHours`, which
 * treats anything unreadable as not known.
 */

const CLOSE_RE = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;
const MONTH_DAY_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** "MM-DD" naming a real day in some year (02-29 allowed). */
export const monthDaySchema = z
  .string()
  .regex(MONTH_DAY_RE, "Use MM-DD")
  .refine((s) => !MONTH_DAY_RE.test(s) || isRealCalendarDate(`2000-${s}`), "Not a real day of the year");

const spanSchema = z
  .tuple([hhmm, z.string().regex(CLOSE_RE, "Closing time must be HH:MM (24:00 for midnight)")])
  .refine(([open, close]) => open < close, "Closing time must be after opening time");

export const daySpansSchema = z
  .array(spanSchema)
  .max(MAX_SPANS_PER_DAY, `At most ${MAX_SPANS_PER_DAY} opening spans a day`)
  .refine((spans) => spans.every((s, i) => i === 0 || spans[i - 1][1] <= s[0]), "Spans must be in order and must not overlap");

/** Absent weekday = not known; [] = closed. */
export const weekHoursSchema = z.strictObject({
  sun: daySpansSchema.optional(),
  mon: daySpansSchema.optional(),
  tue: daySpansSchema.optional(),
  wed: daySpansSchema.optional(),
  thu: daySpansSchema.optional(),
  fri: daySpansSchema.optional(),
  sat: daySpansSchema.optional(),
});

export const openingSeasonSchema = z.strictObject({
  label: z.string().trim().min(1).max(40, "Season name must be 40 characters or fewer").optional(),
  from: monthDaySchema,
  to: monthDaySchema,
  week: weekHoursSchema,
});

export const openingHoursSchema = z.strictObject({
  week: weekHoursSchema.default({}),
  seasons: z.array(openingSeasonSchema).max(MAX_SEASONS, `At most ${MAX_SEASONS} seasons`).default([]),
  closed: z.array(z.union([isoDate, monthDaySchema])).max(MAX_CLOSED_DATES, `At most ${MAX_CLOSED_DATES} closed dates`).default([]),
  source: z
    .string()
    .trim()
    .refine((v) => safeWebHref(v) !== null, "Source must be a web address (http/https)")
    .optional(),
});

export type OpeningHoursInput = z.input<typeof openingHoursSchema>;

/** The stored column → the model, or null when empty, unreadable or invalid (= not known). */
export function parseOpeningHours(raw: string | null | undefined): OpeningHours | null {
  if (!raw) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = openingHoursSchema.safeParse(json);
  return parsed.success && !isEmptyOpeningHours(parsed.data) ? parsed.data : null;
}

/** The model → the stored column; empty hours store as null. */
export function serializeOpeningHours(oh: OpeningHours | null | undefined): string | null {
  return oh && !isEmptyOpeningHours(oh) ? JSON.stringify(oh) : null;
}
