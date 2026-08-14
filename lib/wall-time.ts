/**
 * Wall-clock time handling for transport endpoints (things-to-fix P0-1).
 *
 * A `datetime-local` string ("2026-07-01T08:00") is a WALL-CLOCK time in the
 * endpoint Stop's timezone — it must never be parsed with `new Date()`, whose
 * offset-less parse depends on the process timezone (UTC on Vercel, the dev
 * machine's zone locally).
 */
import { zonedWallTimeToInstant } from "@/lib/tz";

export const WALL_TIME_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?$/;

/** Convert a parsed transport time to an instant. Dates pass through; wall-time
 * strings are interpreted in `timeZone`; anything else is null. */
export function wallTimeToInstant(
  value: Date | string | null | undefined,
  timeZone: string,
): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  const m = WALL_TIME_RE.exec(value.trim());
  if (!m) return null;
  return zonedWallTimeToInstant(m[1], m[2], timeZone);
}
