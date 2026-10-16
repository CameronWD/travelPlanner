import type { ActionFailure, FieldErrors } from "@/lib/action-result";
import { isRealCalendarDate } from "@/lib/dates";

/**
 * The Add a Reminder dialog's client-side gate (spec 2026-10-06 §R, F8): the
 * same rules and messages as `reminderFieldsSchema` (lib/validations/
 * reminder.ts) for title, date and notes, without shipping zod to the
 * browser. The about ids are never typed: they come from a fixed prop or the
 * picker (lib/reminder-about.ts aboutFromPick), so there is nothing to gate.
 * The server action still parses with the schema; lib/reminder-input.test.ts
 * pins the two together.
 */
export function checkReminderInput(input: { title: string; date: string; notes?: string }):
  | { success: true; data: { title: string; date: string; notes?: string } }
  | ActionFailure {
  const errors: FieldErrors = {};
  const title = input.title.trim();
  const notes = input.notes?.trim();
  if (title.length < 1) errors.title = ["Reminder title is required"];
  else if (title.length > 200) errors.title = ["Title must be 200 characters or fewer"];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) errors.date = ["Reminder date must be a date (YYYY-MM-DD)"];
  else if (!isRealCalendarDate(input.date)) errors.date = ["Reminder date must be a real date"];
  if (notes !== undefined && notes.length > 2000) errors.notes = ["Notes must be 2000 characters or fewer"];
  if (Object.keys(errors).length > 0) return { success: false, errors };
  return { success: true, data: { title, date: input.date, ...(notes !== undefined ? { notes } : {}) } };
}
