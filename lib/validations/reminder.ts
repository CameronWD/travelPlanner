import { z } from "zod";

/**
 * Zod schema for creating / updating a Reminder.
 *
 * - title: non-empty trimmed string, max 200 chars
 * - fireAt: ISO 8601 date string that must be parseable as a valid Date
 * - targetType / targetId: optional free-form strings (link to a trip entity)
 */
export const reminderSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Reminder title is required")
    .max(200, "Title must be 200 characters or fewer"),
  fireAt: z.string().refine(
    (val) => {
      const d = new Date(val);
      return !isNaN(d.getTime());
    },
    { message: "fireAt must be a valid ISO date string" },
  ),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
});

export type ReminderInput = z.infer<typeof reminderSchema>;
