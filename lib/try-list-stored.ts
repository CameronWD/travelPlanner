/**
 * CONTEXT.md "Try list" at the database edge: a row's `tryList` column (the
 * stored JSON string, or null) parsed in place, as withOpeningHours does for
 * hours. Server-side (parseTryList is zod).
 */
import { parseTryList } from "@/lib/validations/try-list";
import type { TryList } from "@/lib/try-list";

export function withTryList<T extends { tryList: string | null }>(
  row: T,
): Omit<T, "tryList"> & { tryList: TryList | null } {
  return { ...row, tryList: parseTryList(row.tryList) };
}
