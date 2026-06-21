import { z } from "zod";

/**
 * Zod schema for saving a journal entry.
 *
 * - date: YYYY-MM-DD format
 * - body: trimmed string, max 5000 chars; empty string is allowed (signals delete)
 */
export const saveJournalEntrySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  body: z
    .string()
    .trim()
    .max(5000, "Journal entry must be 5000 characters or fewer"),
});

export type SaveJournalEntryInput = z.input<typeof saveJournalEntrySchema>;
export type SaveJournalEntryOutput = z.output<typeof saveJournalEntrySchema>;
