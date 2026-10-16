import { z } from "zod";
import { isoDateWith } from "@/lib/validations/primitives";

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
 * - stopId: optional — a Reminder may be about a Stop (Task 7); omitted (not
 *   null) means "about the Trip as a whole".
 */
export const reminderSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Reminder title is required")
    .max(200, "Title must be 200 characters or fewer"),
  date: isoDateWith("Reminder date must be a date (YYYY-MM-DD)", "Reminder date must be a real date"),
  stopId: z.string().cuid().optional(),
});

export type ReminderInput = z.infer<typeof reminderSchema>;
