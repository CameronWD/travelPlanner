import { z } from "zod";
import { MAX_TRY_ENTRIES, MAX_TRY_TEXT, type TryList } from "@/lib/try-list";

/**
 * CONTEXT.md "Try list" (spec 2026-10-17 R6): the zod side of lib/try-list.ts.
 * Every door that writes `Item.tryList` (the Item dialog, set_try_list,
 * tick_try_entry) validates with these and stores `serializeTryList`. Every
 * reader parses with `parseTryList`, which treats anything unreadable as no list.
 */

const tryEntryIdSchema = z.string().regex(/^[a-z0-9]{1,32}$/, "Not a Try list entry id");

export const tryEntryTextSchema = z
  .string()
  .trim()
  .min(1, "Write something to try")
  .max(MAX_TRY_TEXT, `Keep each one to ${MAX_TRY_TEXT} characters or fewer`);

const TOO_MANY = `At most ${MAX_TRY_ENTRIES} things to try`;

function idsUnique(entries: readonly { id?: string }[]): boolean {
  const ids = entries.flatMap((e) => (e.id ? [e.id] : []));
  return new Set(ids).size === ids.length;
}

/** The stored shape: every entry has its own id and its tick. */
export const tryListSchema = z
  .array(z.strictObject({ id: tryEntryIdSchema, text: tryEntryTextSchema, tried: z.boolean() }))
  .max(MAX_TRY_ENTRIES, TOO_MANY)
  .refine(idsUnique, "Each entry needs its own id");

/** What a writer sends: an id names an existing entry; a tick is optional (lib/try-list.ts applyTryListInput). */
export const tryListInputSchema = z
  .array(z.strictObject({ id: tryEntryIdSchema.optional(), text: tryEntryTextSchema, tried: z.boolean().optional() }))
  .max(MAX_TRY_ENTRIES, TOO_MANY)
  .refine(idsUnique, "The same entry appears twice");

/** The stored column → the model, or null when empty, unreadable or invalid (= no list). */
export function parseTryList(raw: string | null | undefined): TryList | null {
  if (!raw) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = tryListSchema.safeParse(json);
  return parsed.success && parsed.data.length > 0 ? parsed.data : null;
}

/** The model → the stored column; an empty list stores as null. */
export function serializeTryList(list: TryList | null | undefined): string | null {
  return list && list.length > 0 ? JSON.stringify(list.map(({ id, text, tried }) => ({ id, text, tried }))) : null;
}
