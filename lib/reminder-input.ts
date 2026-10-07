import type { ActionFailure, FieldErrors } from "@/lib/action-result";

/**
 * The Add a Reminder dialog's client-side gate (spec 2026-10-06 §R): the
 * same rules and messages as `reminderSchema` (lib/validations/reminder.ts)
 * without shipping zod to the browser. The server action still parses with
 * the schema; lib/reminder-input.test.ts pins the two together.
 */
export function checkReminderInput(input: { title: string; date: string }):
  | { success: true; data: { title: string; date: string } }
  | ActionFailure {
  const errors: FieldErrors = {};
  const title = input.title.trim();
  if (title.length < 1) errors.title = ["Reminder title is required"];
  else if (title.length > 200) errors.title = ["Title must be 200 characters or fewer"];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) errors.date = ["Reminder date must be a date (YYYY-MM-DD)"];
  if (Object.keys(errors).length > 0) return { success: false, errors };
  return { success: true, data: { title, date: input.date } };
}
