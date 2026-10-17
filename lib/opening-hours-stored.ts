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
import { parseOpeningHours } from "@/lib/validations/opening-hours";
import type { OpeningHours } from "@/lib/opening-hours";

/** A row's `openingHours` column (the stored JSON string, or null), parsed in place. */
export function withOpeningHours<T extends { openingHours: string | null }>(
  row: T,
): Omit<T, "openingHours"> & { openingHours: OpeningHours | null } {
  return { ...row, openingHours: parseOpeningHours(row.openingHours) };
}
