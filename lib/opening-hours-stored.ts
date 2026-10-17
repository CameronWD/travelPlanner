/**
 * CONTEXT.md "Opening hours" at the database edge.
 *
 * Task D.2 brief vs Section S (see d-as-built.md — authoritative): the brief
 * assumed `Item.openingHours` was a `Json?` column and asked this module to
 * provide `readStoredOpeningHours`/`storedOpeningHours`/`StoredOpeningHours`
 * (Prisma JSON helpers) and its own `openingHoursFamilyWhere`. S instead
 * stores the column as a JSON *string* (`String?`) and already ships the
 * read/write pair as `parseOpeningHours`/`serializeOpeningHours`
 * (lib/validations/opening-hours.ts) and the family helpers
 * `openingHoursFamilyRoot`/`openingHoursFamilyWhere` (lib/opening-hours.ts).
 * Per the D.2 ruling, this module reuses those rather than re-creating them;
 * the one thing the brief asked for that S doesn't already provide is a
 * small convenience to parse a row's column in place.
 */
import { openingHoursSchema, parseOpeningHours } from "@/lib/validations/opening-hours";
import { isEmptyOpeningHours, type OpeningHours } from "@/lib/opening-hours";

/** A row's `openingHours` column (the stored JSON string, or null), parsed in place. */
export function withOpeningHours<T extends { openingHours: string | null }>(
  row: T,
): Omit<T, "openingHours"> & { openingHours: OpeningHours | null } {
  return { ...row, openingHours: parseOpeningHours(row.openingHours) };
}

/**
 * Task D.11: the Claude connection's reads (lib/mcp/reads/plan-shapes.ts)
 * build a thing's `openingHours` from two different inputs depending on which
 * reader fed the row — get_trip_plan and the narrow reads select the column
 * straight from Prisma (the stored JSON string), while get_day's items arrive
 * already parsed (`withOpeningHours`, lib/day-reads.ts, via `buildDayModel`).
 * `parseOpeningHours` alone only handles the first; this widens it to accept
 * either, so both readers land on the same shape. Anything else unreadable —
 * a bad stored value, an invalid already-parsed shape — reads as not known,
 * same as `parseOpeningHours`.
 */
export function readStoredOpeningHours(raw: unknown): OpeningHours | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string") return parseOpeningHours(raw);
  const parsed = openingHoursSchema.safeParse(raw);
  return parsed.success && !isEmptyOpeningHours(parsed.data) ? parsed.data : null;
}
