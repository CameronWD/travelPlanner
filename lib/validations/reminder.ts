import { z } from "zod";

/**
 * Zod schema for creating / updating a Reminder.
 *
 * A Reminder is a dated note — it carries a *date and never a time*
 * (CONTEXT.md "Reminder"): TEEPEE dispatches only a few times a day, so a
 * promised 14:30 would be a lie. That is why `date` is a plain "YYYY-MM-DD"
 * string and there is no `fireAt`.
 *
 * - title: non-empty trimmed string, max 200 chars
 * - date: a calendar date, "YYYY-MM-DD"
 */
export const reminderSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Reminder title is required")
    .max(200, "Title must be 200 characters or fewer"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Reminder date must be a date (YYYY-MM-DD)"),
});

export type ReminderInput = z.infer<typeof reminderSchema>;
