"use server";

import { db } from "@/lib/db";
import { requireTripAccess, requireRowAccess } from "@/lib/guards";
import { reminderSchema, type ReminderInput } from "@/lib/validations/reminder";
import {
  type ActionResult,
  type FieldErrors,
  fail,
  validationResult,
} from "@/lib/action-result";
import { recordActivity } from "@/server/actions/activity";
import { recordUpdate } from "@/lib/activity-guard";
import { requireOutsideSurprise, type SurpriseRoot } from "@/lib/surprise-guard";
import { entityLabel } from "@/lib/activity";
import { loadSurpriseVisibility } from "@/lib/surprise-visibility";
import { revalidateTrip, revalidateTripsList } from "@/lib/revalidate";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type ReminderActionResult = ActionResult<{ id?: string }>;

/**
 * A Reminder as the Home card (and a Stop card) render it: a title against a
 * calendar date. `stopId`/`stopName` are set when the Reminder is about a
 * Stop (Task 7) — `stopName` is the related Stop's name, joined at read time
 * so the Home card can render a chip without a second round trip. Both are
 * `null` (never omitted) for a Reminder about the Trip as a whole.
 */
export interface ReminderItem {
  id: string;
  title: string;
  date: string;
  stopId: string | null;
  stopName: string | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Look up a Reminder and verify the current user has access to its trip and
 * is not surprised by the Stop it is about (CONTEXT.md Surprise). Returns the
 * reminder (with the fields needed to record Activity, the viewer and the
 * live Surprise it is inside) or throws notFound().
 */
async function requireReminderAccess(reminderId: string): Promise<{
  id: string;
  tripId: string;
  title: string;
  date: string;
  stopId: string | null;
  stop: { name: string } | null;
  viewerId: string;
  surpriseOf: SurpriseRoot | null;
}> {
  const { row, user, surpriseOf } = await requireRowAccess("reminder", reminderId);
  return { ...row, viewerId: user.id, surpriseOf };
}

/** Diff row — the "about" Stop by name, never by id. */
function activityRow(r: { title: string; date: string; stop: { name: string } | null }) {
  return { title: r.title, date: r.date, stopName: r.stop?.name ?? null };
}

/**
 * Guard against a cross-trip `stopId` (Task 7): without this, a member of
 * trip A could pass a Stop id from trip B, silently linking the two — trip
 * A's Home card would then render trip B's Stop name, and a delete on trip
 * B's Stop (onDelete: SetNull) would reach into trip A's Reminder. Returns
 * `null` when `stopId` is absent (nothing to check) or belongs to this trip;
 * otherwise a field-error dict ready to hand back to the caller.
 */
async function assertStopOnTrip(
  stopId: string | undefined,
  tripId: string,
): Promise<FieldErrors | null> {
  if (stopId === undefined) return null;
  const stop = await db.stop.findFirst({
    where: { id: stopId, tripId },
    select: { id: true },
  });
  return stop ? null : { stopId: ["That Stop isn't on this trip"] };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Reminders for a trip dated on or after `fromDate`, soonest first.
 *
 * Called by the trip Home (server side) so the card can render in any Phase.
 * Access-checked: `requireTripAccess` is the first statement. Surprise (ADR
 * 0051): a Reminder about a Stop hidden from the viewer stays in the database.
 */
export async function listRemindersForTrip(
  tripId: string,
  fromDate: string,
): Promise<ReminderItem[]> {
  const { user } = await requireTripAccess(tripId);
  const v = await loadSurpriseVisibility(tripId, user.id);

  const rows = await db.reminder.findMany({
    where: { tripId, date: { gte: fromDate }, ...v.where.reminder },
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
  const { user } = await requireTripAccess(tripId);

  const parsed = reminderSchema.safeParse(input);
  if (!parsed.success) {
    return validationResult(parsed.error);
  }

  const { title, date, stopId } = parsed.data;

  const stopError = await assertStopOnTrip(stopId, tripId);
  if (stopError) {
    return fail(stopError);
  }
  await requireOutsideSurprise(user.id, { stopId });

  const reminder = await db.reminder.create({
    // `stopId` is omitted entirely (never sent as `undefined`) when absent —
    // that leaves the column NULL, which is what "about the Trip as a whole"
    // means (see the Reminder model doc comment). Sending the key explicitly
    // as `undefined` would be equivalent at the DB level but would break the
    // exact-shape assertions callers rely on for the no-Stop case.
    data: { tripId, title, date, ...(stopId !== undefined ? { stopId } : {}) },
    select: { id: true },
  });

  await recordActivity({
    tripId,
    verb: "CREATED",
    entityType: "REMINDER",
    entityId: reminder.id,
    entityLabel: entityLabel("REMINDER", { title }),
  });

  revalidateTrip(tripId, "plan", "lists");
  revalidateTripsList();
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

  const stopError = await assertStopOnTrip(stopId, reminder.tripId);
  if (stopError) {
    return fail(stopError);
  }
  await requireOutsideSurprise(reminder.viewerId, { stopId });

  const after = await db.reminder.update({
    where: { id },
    // Same omit-when-absent rule as addReminder: no `stopId` in the input
    // means "leave it as it is", not "clear it" — this schema has no way to
    // explicitly null it out (cuid().optional(), not .nullable()).
    data: { title, date, ...(stopId !== undefined ? { stopId } : {}) },
    select: { title: true, date: true, stop: { select: { name: true } } },
  });

  // Checklists and Reminders sit outside any Plan (plan: null): always recorded.
  await recordUpdate("REMINDER", {
    tripId: reminder.tripId,
    plan: null,
    entityId: id,
    before: activityRow(reminder),
    after: activityRow(after),
  });

  revalidateTrip(reminder.tripId, "plan", "lists");
  revalidateTripsList();
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

  await recordActivity({
    tripId: reminder.tripId,
    verb: "DELETED",
    entityType: "REMINDER",
    entityId: id,
    entityLabel: entityLabel("REMINDER", { title: reminder.title }),
    surpriseOf: reminder.surpriseOf,
  });

  revalidateTrip(reminder.tripId, "plan", "lists");
  revalidateTripsList();
  return { success: true };
}
