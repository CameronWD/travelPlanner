import { z } from "zod";
import { isoDateWith } from "@/lib/validations/primitives";

export const REMINDER_ONE_THING = "A Reminder is about one thing at most: a Stop, a thing to do or a Transport leg.";

/**
 * One about id. "" is read as unset (as lib/reminder-about.ts aboutCount
 * reads it), never a value: writing "" would fail the foreign key, and it
 * must not count toward the one-thing rule. On an update a patch naming
 * "" still names the key, so replaceAbout clears the whole about.
 */
const aboutId = z.preprocess((v) => (v === "" ? undefined : v), z.string().cuid().optional());

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
 * - notes: optional detail shown in the app, never in the Digest (spec F8)
 * - stopId / itemId / transportId: what the Reminder is about — at most one
 *   (spec F8; the DB CHECK "Reminder_about_one_thing_check" agrees). All
 *   omitted means "about the Trip as a whole".
 *
 * `reminderFieldsSchema` is the plain object (lib/reminder-input.test.ts
 * omits fields from it); `reminderSchema` adds the one-thing rule.
 */
export const reminderFieldsSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Reminder title is required")
    .max(200, "Title must be 200 characters or fewer"),
  date: isoDateWith("Reminder date must be a date (YYYY-MM-DD)", "Reminder date must be a real date"),
  notes: z.string().trim().max(2000, "Notes must be 2000 characters or fewer").optional(),
  stopId: aboutId,
  itemId: aboutId,
  transportId: aboutId,
});

export const reminderSchema = reminderFieldsSchema.refine(
  (r) => [r.stopId, r.itemId, r.transportId].filter(Boolean).length <= 1,
  { message: REMINDER_ONE_THING },
);

export type ReminderInput = z.infer<typeof reminderSchema>;
