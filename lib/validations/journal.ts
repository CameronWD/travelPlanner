import { z } from "zod";

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

export { journalBodyExceedsLimit } from "@/lib/journal-window";
