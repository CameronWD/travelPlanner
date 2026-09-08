import { z } from "zod";

/**
 * Schema for creating a Feedback note (ADR 0040).
 *
 * `authoredAt` comes from the *client* clock, not the server's: a note may be
 * written offline and flushed much later (ADR 0041), and the inbox orders by
 * when it was written. `clientKey` is generated once when the note is written
 * and reused on every retry — it is the sole duplicate guard.
 */
const optionalText = (max: number) =>
  z.string().trim().max(max).nullish().transform((v) => (v ? v : null));

export const createFeedbackNoteSchema = z.object({
  clientKey: z.string().trim().min(1, "clientKey is required").max(64),
  body: z
    .string()
    .trim()
    .min(1, "Feedback cannot be empty")
    .max(4000, "Feedback must be 4000 characters or fewer"),
  route: z.string().trim().min(1, "route is required").max(512),
  pageLabel: z.string().trim().min(1, "pageLabel is required").max(120),
  tripId: optionalText(64),
  tripName: optionalText(200),
  viewport: optionalText(32),
  userAgent: optionalText(512),
  authoredAt: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), "authoredAt must be an ISO timestamp"),
});

export type CreateFeedbackNoteInput = z.input<typeof createFeedbackNoteSchema>;
export type CreateFeedbackNoteOutput = z.output<typeof createFeedbackNoteSchema>;
