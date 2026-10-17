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
import { recordActivity } from "@/lib/activity-record";
import { recordUpdate } from "@/lib/activity-guard";
import { requireOutsideSurprise } from "@/lib/surprise-guard";
import { entityLabel } from "@/lib/activity";
import { revalidateTrip, revalidateTripsList } from "@/lib/revalidate";
import { applyPatch, type Patch } from "@/lib/patch";
import {
  ABOUT_KEYS,
  replaceAbout,
  reminderTransportLabel,
  REMINDER_TRANSPORT_SELECT,
  type ReminderTransportRow,
} from "@/lib/reminder-about";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type ReminderActionResult = ActionResult<{ id?: string }>;

export type { ReminderItem } from "@/lib/reminder-reads";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** What Activity diffs on a Reminder: its text, and what it is about by name. */
type AboutRow = {
  title: string;
  date: string;
  notes: string | null;
  stop: { name: string } | null;
  item: { title: string } | null;
  transport: ReminderTransportRow | null;
};

/** The select for an update's `after` row: what Activity diffs. */
const ACTIVITY_SELECT = {
  title: true,
  date: true,
  notes: true,
  stop: { select: { name: true } },
  item: { select: { title: true } },
  transport: { select: REMINDER_TRANSPORT_SELECT },
} as const;

/**
 * Look up a Reminder and verify the current user has access to its trip and
 * is not surprised by the Stop or Item it is about (CONTEXT.md Surprise).
 * Returns the reminder (with the fields needed to record Activity, the
 * viewer and the live Surprise it is inside) or throws notFound().
 */
async function requireReminderAccess(reminderId: string) {
  const { row, user, surpriseOf } = await requireRowAccess("reminder", reminderId);
  return { ...row, viewerId: user.id, surpriseOf };
}

/** Diff row — what the Reminder is about by name, never by id. */
function activityRow(r: AboutRow) {
  return {
    title: r.title,
    date: r.date,
    notes: r.notes ?? null,
    about: r.stop?.name ?? r.item?.title ?? (r.transport ? reminderTransportLabel(r.transport) : null),
  };
}

/**
 * Guard against a cross-trip about id (Task 7, spec F8): without it a
 * Traveller on trip A could pass trip B's Stop / Item / leg id, linking the
 * two — trip A's Home card would render trip B's name, and a delete there
 * (onDelete: SetNull) would reach into trip A's Reminder. An Item or leg
 * must also be the real plan's (a Reminder hangs off the real plan only).
 * Returns null when nothing is named or all belong; else the field-error
 * dict for the caller.
 */
async function assertAboutOnTrip(
  about: { stopId?: string; itemId?: string; transportId?: string },
  tripId: string,
): Promise<FieldErrors | null> {
  if (about.stopId !== undefined) {
    const stop = await db.stop.findFirst({ where: { id: about.stopId, tripId }, select: { id: true } });
    if (!stop) return { stopId: ["That Stop isn't on this trip"] };
  }
  if (about.itemId !== undefined) {
    const item = await db.item.findFirst({ where: { id: about.itemId, tripId, forkId: null }, select: { id: true } });
    if (!item) return { itemId: ["That thing to do isn't on this trip"] };
  }
  if (about.transportId !== undefined) {
    const leg = await db.transport.findFirst({ where: { id: about.transportId, tripId, forkId: null }, select: { id: true } });
    if (!leg) return { transportId: ["That Transport leg isn't on this trip"] };
  }
  return null;
}

/**
 * The Surprise a Reminder's about could be inside: an Item's own (or its
 * Stop's), else a Stop's. Transport is outside every Surprise, so a leg (or
 * nothing) refs no Stop and the guard passes.
 */
function surpriseRef(about: { stopId?: string; itemId?: string }) {
  return about.itemId !== undefined ? { itemId: about.itemId } : { stopId: about.stopId };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Add a new reminder to a trip.
 *
 * - Access-checked: user must be a trip member.
 * - Validates title (non-empty), date ("YYYY-MM-DD", no time component),
 *   notes, and at most one thing to be about (spec F8).
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

  const { title, date, notes, stopId, itemId, transportId } = parsed.data;

  const aboutError = await assertAboutOnTrip({ stopId, itemId, transportId }, tripId);
  if (aboutError) {
    return fail(aboutError);
  }
  await requireOutsideSurprise(user.id, surpriseRef({ stopId, itemId }));

  const reminder = await db.reminder.create({
    // Omit-when-absent (never `undefined`): an unset about leaves the column
    // NULL — "about the Trip as a whole" (the Reminder model doc comment) —
    // and empty notes are no notes. Callers pin the exact shape.
    data: {
      tripId,
      title,
      date,
      ...(notes ? { notes } : {}),
      ...(stopId !== undefined ? { stopId } : {}),
      ...(itemId !== undefined ? { itemId } : {}),
      ...(transportId !== undefined ? { transportId } : {}),
    },
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
 * Update a Reminder (PATCH, ADR 0075): title, date and notes merge onto the
 * held row (null or "" clears the notes). A patch naming any of stopId /
 * itemId / transportId replaces the whole about (lib/reminder-about.ts
 * replaceAbout) — the others are cleared, so the one-thing CHECK never
 * trips; null (or "") on all of them makes it about the Trip as a whole. A
 * patch naming none leaves the about as it is.
 *
 * - Access-checked via requireReminderAccess → requireRowAccess.
 */
export async function updateReminder(
  id: string,
  patch: Patch<ReminderInput>,
): Promise<ReminderActionResult> {
  const reminder = await requireReminderAccess(id);
  const aboutNamed = ABOUT_KEYS.some((k) => patch[k] !== undefined);

  const parsed = reminderSchema.safeParse(
    applyPatch<ReminderInput>(
      { title: reminder.title, date: reminder.date, notes: reminder.notes },
      replaceAbout(patch),
    ),
  );
  if (!parsed.success) {
    return validationResult(parsed.error);
  }

  const { title, date, notes, stopId, itemId, transportId } = parsed.data;

  if (aboutNamed) {
    const aboutError = await assertAboutOnTrip({ stopId, itemId, transportId }, reminder.tripId);
    if (aboutError) {
      return fail(aboutError);
    }
    await requireOutsideSurprise(reminder.viewerId, surpriseRef({ stopId, itemId }));
  }

  const after = await db.reminder.update({
    where: { id },
    data: {
      title,
      date,
      ...(patch.notes !== undefined ? { notes: notes ? notes : null } : {}),
      ...(aboutNamed ? { stopId: stopId ?? null, itemId: itemId ?? null, transportId: transportId ?? null } : {}),
    },
    select: ACTIVITY_SELECT,
  });

  // Checklists and Reminders sit outside any Plan (plan: null): always
  // recorded. A Reminder moved off a Surprise keeps the BEFORE state's root,
  // so the surprised Traveller never reads where it came from; otherwise the
  // root is resolved from the saved row (one moved INTO a Surprise).
  await recordUpdate("REMINDER", {
    tripId: reminder.tripId,
    plan: null,
    entityId: id,
    before: activityRow(reminder),
    after: activityRow(after),
    surpriseOf: reminder.surpriseOf,
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
