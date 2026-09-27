import { z } from "zod";
import { JOURNAL_NOTE_MAX } from "@/lib/journal-window";

/**
 * Zod schema for the *shape* of a journal-entry save request: date format,
 * plus a trimmed body. Deliberately does NOT enforce a length cap here —
 * spec K's 500-char limit applies only to new or changed text, which this
 * schema has no way to judge on its own (it never sees what's already
 * stored). `server/actions/journal.ts` composes this with
 * `journalBodyExceedsLimit` below, which does have that context.
 */
export const saveJournalEntrySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  body: z.string().trim(),
});

export type SaveJournalEntryInput = z.input<typeof saveJournalEntrySchema>;
export type SaveJournalEntryOutput = z.output<typeof saveJournalEntrySchema>;

/**
 * Whether a Journal body should be refused for length (spec K): new or
 * changed text is capped at `JOURNAL_NOTE_MAX` (500) chars. A legacy entry
 * already longer than that stays editable — but only by shortening: saving
 * it back byte-for-byte unchanged is exempt from the cap (it isn't "new or
 * changed"), while any edit that is still over the cap is refused.
 */
export function journalBodyExceedsLimit(
  body: string,
  existingBody: string,
): boolean {
  return body.length > JOURNAL_NOTE_MAX && body !== existingBody;
}
