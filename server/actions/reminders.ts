"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { reminderSchema, type ReminderInput } from "@/lib/validations/reminder";
import { type ActionResult, validationResult } from "@/lib/action-result";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type ReminderActionResult = ActionResult<{ id?: string }>;

/**
 * A Reminder as the Home card (and a Stop card) render it: a title against a
 * calendar date. `stopId`/`stopName` are set when the Reminder is about a
 * Stop (Task 7) — `stopName` is the related Stop's name, joined at read time
 * so the Home card can render a chip without a second round trip.
 */
export interface ReminderItem {
  id: string;
  title: string;
  date: string;
  stopId?: string | null;
  stopName?: string | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Look up a Reminder and verify the current user has access to its trip.
 * Returns the reminder (with id + tripId) or throws notFound().
 */
async function requireReminderAccess(
  reminderId: string,
): Promise<{ id: string; tripId: string }> {
  const reminder = await db.reminder.findUnique({
    where: { id: reminderId },
    select: { id: true, tripId: true },
  });
  if (!reminder) {
    notFound();
  }
  await requireTripAccess(reminder.tripId);
  return reminder;
}

/**
 * Reminders now render on the trip Home in every Phase, not only on Today —
 * both paths have to be revalidated or a freshly-written note is invisible
 * on the very screen it was written from.
 */
function revalidateReminderPaths(tripId: string) {
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/today`);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Reminders for a trip dated on or after `fromDate`, soonest first.
 *
 * Called by the trip Home (server side) so the card can render in any Phase.
 * Access-checked: `requireTripAccess` is the first statement.
 */
export async function listRemindersForTrip(
  tripId: string,
  fromDate: string,
): Promise<ReminderItem[]> {
  await requireTripAccess(tripId);

  const rows = await db.reminder.findMany({
    where: { tripId, date: { gte: fromDate } },
    orderBy: { date: "asc" },
    take: 20,
    select: {
      id: true,
      title: true,
      date: true,
      stopId: true,
      stop: { select: { name: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    date: r.date,
    stopId: r.stopId,
    stopName: r.stop?.name ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Add a new reminder to a trip.
 *
 * - Access-checked: user must be a trip member.
 * - Validates title (non-empty) + date ("YYYY-MM-DD", no time component).
 */
export async function addReminder(
  tripId: string,
  input: ReminderInput,
): Promise<ReminderActionResult> {
  await requireTripAccess(tripId);

  const parsed = reminderSchema.safeParse(input);
  if (!parsed.success) {
    return validationResult(parsed.error);
  }

  const { title, date, stopId } = parsed.data;

  const reminder = await db.reminder.create({
    // `stopId` is omitted entirely (never sent as `undefined`) when absent —
    // that leaves the column NULL, which is what "about the Trip as a whole"
    // means (see the Reminder model doc comment). Sending the key explicitly
    // as `undefined` would be equivalent at the DB level but would break the
    // exact-shape assertions callers rely on for the no-Stop case.
    data: { tripId, title, date, ...(stopId !== undefined ? { stopId } : {}) },
    select: { id: true },
  });

  revalidateReminderPaths(tripId);
  return { success: true, id: reminder.id };
}

/**
 * Update a reminder's title and/or date.
 *
 * - Access-checked via requireReminderAccess → requireTripAccess.
 */
export async function updateReminder(
  id: string,
  input: ReminderInput,
): Promise<ReminderActionResult> {
  const reminder = await requireReminderAccess(id);

  const parsed = reminderSchema.safeParse(input);
  if (!parsed.success) {
    return validationResult(parsed.error);
  }

  const { title, date, stopId } = parsed.data;

  await db.reminder.update({
    where: { id },
    // Same omit-when-absent rule as addReminder: no `stopId` in the input
    // means "leave it as it is", not "clear it" — this schema has no way to
    // explicitly null it out (cuid().optional(), not .nullable()).
    data: { title, date, ...(stopId !== undefined ? { stopId } : {}) },
  });

  revalidateReminderPaths(reminder.tripId);
  return { success: true };
}

/**
 * Delete a reminder.
 *
 * - Access-checked via requireReminderAccess → requireTripAccess.
 */
export async function deleteReminder(id: string): Promise<ReminderActionResult> {
  const reminder = await requireReminderAccess(id);

  await db.reminder.delete({ where: { id } });

  revalidateReminderPaths(reminder.tripId);
  return { success: true };
}
