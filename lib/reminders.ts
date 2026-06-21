/**
 * lib/reminders.ts — Pure helpers for Reminder logic.
 *
 * These are dependency-free so they can be tested without a database or
 * environment variables.
 */

export interface ReminderLike {
  fireAt: Date;
  sent: boolean;
}

/**
 * Given an array of reminders and a reference time, return those that are
 * due to fire (fireAt <= now) and have not yet been sent.
 *
 * Pure function — no side effects, no I/O.
 */
export function selectDueReminders<T extends ReminderLike>(
  reminders: T[],
  now: Date,
): T[] {
  return reminders.filter((r) => r.fireAt <= now && !r.sent);
}
