import { z } from "zod";
import { isRealCalendarDate } from "@/lib/dates";

/**
 * Shared zod primitives for calendar dates and wall-clock times. Every zod
 * schema that takes a YYYY-MM-DD date or an HH:MM time uses these, so a date
 * that matches the format but names no real day (2026-02-30) is refused at
 * every door — forms, actions and MCP tools alike.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * A YYYY-MM-DD string naming a real calendar date, with the caller's messages.
 * A string that fails the format reports only `formatMessage` — the calendar
 * check runs only on well-formed input, so one bad value yields one message.
 */
export function isoDateWith(formatMessage: string, realMessage: string) {
  return z
    .string()
    .regex(ISO_DATE_RE, formatMessage)
    .refine((s) => !ISO_DATE_RE.test(s) || isRealCalendarDate(s), realMessage);
}

/** A YYYY-MM-DD string naming a real calendar date. */
export const isoDate = isoDateWith("Date must be in YYYY-MM-DD format", "Date must be a real calendar date");

/** An HH:MM 24-hour wall-clock time. */
export const hhmm = z.string().regex(HHMM_RE, "Time must be in HH:MM format (24h)");
