import { z } from "zod";
import { isoDate } from "@/lib/validations/primitives";

/**
 * Zod schema for the *shape* of a journal-entry save request: date format,
 * plus a trimmed body. Deliberately does NOT enforce a length cap here —
 * spec K's 500-char limit applies only to new or changed text, which this
 * schema has no way to judge on its own (it never sees what's already
 * stored). `server/actions/journal.ts` composes this with
 * `journalBodyExceedsLimit` below, which does have that context.
 */
export const saveJournalEntrySchema = z.object({
  date: isoDate,
  body: z.string().trim(),
});

export { journalBodyExceedsLimit } from "@/lib/journal-window";
