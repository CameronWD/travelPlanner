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

function revalidateReminderPaths(tripId: string) {
  revalidatePath(`/trips/${tripId}/today`);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Add a new reminder to a trip.
 *
 * - Access-checked: user must be a trip member.
 * - Validates title (non-empty) + fireAt (parseable ISO date).
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

  const { title, fireAt, targetType, targetId } = parsed.data;

  const reminder = await db.reminder.create({
    data: {
      tripId,
      title,
      fireAt: new Date(fireAt),
      targetType: targetType ?? null,
      targetId: targetId ?? null,
    },
    select: { id: true },
  });

  revalidateReminderPaths(tripId);
  return { success: true, id: reminder.id };
}

/**
 * Update a reminder's title and/or fireAt.
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

  const { title, fireAt, targetType, targetId } = parsed.data;

  await db.reminder.update({
    where: { id },
    data: {
      title,
      fireAt: new Date(fireAt),
      targetType: targetType ?? null,
      targetId: targetId ?? null,
    },
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
