"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { REAL_PLAN } from "@/lib/plan-scope";
import { orderPlanStops } from "@/lib/plan-order";
import { todayISOInZone, currentTripTimezone } from "@/lib/tz";
import { canWriteJournal, JOURNAL_NOTE_MAX, type JournalWindowInput } from "@/lib/journal-window";
import {
  saveJournalEntrySchema,
  journalBodyExceedsLimit,
} from "@/lib/validations/journal";
import { type ActionResult, validationResult, fail } from "@/lib/action-result";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type JournalActionResult = ActionResult;

export interface SaveJournalEntryOpts {
  /**
   * Set alongside the body — e.g. a "Keep off Share links" switch next to
   * the editor — so the Traveller doesn't need a second round trip. Omit to
   * leave `hiddenFromShares` untouched (existing rows) or default (`false`,
   * new rows).
   */
  hiddenFromShares?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function revalidateJournalPaths(tripId: string, date: string) {
  revalidatePath(`/trips/${tripId}/day/${date}`);
  revalidatePath(`/trips/${tripId}/journal`);
}

/**
 * Load the Trip's Journal writability window: its start/end dates and its
 * Trip-local "today", computed exactly the way the Home page does —
 * `todayISOInZone(currentTripTimezone(orderPlanStops(stops)))` over the
 * real plan's (forkId null) dated Stops in canonical plan order (ADR 0038).
 * Exported so `server/actions/attachments.ts` can apply the identical
 * window check to Journal photo uploads rather than duplicating it.
 */
export async function loadJournalWindow(tripId: string): Promise<JournalWindowInput> {
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: {
      startDate: true,
      endDate: true,
      stops: {
        where: { ...REAL_PLAN, arriveDate: { not: null } },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          sortOrder: true,
          timezone: true,
          arriveDate: true,
          departDate: true,
        },
      },
    },
  });
  if (!trip) notFound();

  const today = todayISOInZone(currentTripTimezone(orderPlanStops(trip.stops)));
  return { startDate: trip.startDate, endDate: trip.endDate, today };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Upsert the current Traveller's journal entry for a specific (tripId, date).
 *
 * Journal entries are per-Traveller (ARCH-DAT-6): each Traveller keeps their
 * own entry for a given day rather than sharing one row, so two Travellers
 * writing about the same day never clobber each other.
 *
 * - Access-checked: user must be a member of the trip.
 * - Validates date (YYYY-MM-DD) and trims the body.
 * - Window-checked (spec K / ADR 0058): refused when the day hasn't arrived
 *   yet in the Trip's local "today", or for a date-less Trip.
 * - Length-checked (spec K): new or changed text over JOURNAL_NOTE_MAX (500)
 *   chars is refused. A legacy entry already longer than that stays
 *   editable, but only by shortening — resaving it unchanged is exempt.
 * - Empty body: deletes the row when `hiddenFromShares` is false (or there
 *   is nothing to delete); when `hiddenFromShares` is true, keeps the row
 *   — and the Traveller's "off Share links" choice — with `body: ""`.
 * - Non-empty body → upsert by (tripId, date, authorId), scoped to the
 *   current user so it can never overwrite another Traveller's entry.
 */
export async function saveJournalEntry(
  tripId: string,
  date: string,
  body: string,
  opts?: SaveJournalEntryOpts,
): Promise<JournalActionResult> {
  const { user } = await requireTripAccess(tripId);

  const parsed = saveJournalEntrySchema.safeParse({ date, body });
  if (!parsed.success) {
    return validationResult(parsed.error);
  }
  const { date: validDate, body: trimmedBody } = parsed.data;

  const window = await loadJournalWindow(tripId);
  if (!canWriteJournal({ ...window, date: validDate })) {
    return fail({ date: ["The Journal isn't open for this day yet."] });
  }

  const existing = await db.journalEntry.findUnique({
    where: {
      tripId_date_authorId: { tripId, date: validDate, authorId: user.id },
    },
    select: { body: true, hiddenFromShares: true },
  });

  if (journalBodyExceedsLimit(trimmedBody, existing?.body ?? "")) {
    return fail({
      body: [`Journal entry must be ${JOURNAL_NOTE_MAX} characters or fewer`],
    });
  }

  const hiddenPatch =
    opts?.hiddenFromShares !== undefined
      ? { hiddenFromShares: opts.hiddenFromShares }
      : {};

  if (trimmedBody === "") {
    if (!existing) {
      // Nothing stored, nothing to do.
      return { success: true };
    }
    if (existing.hiddenFromShares) {
      // Keep the row — and the Traveller's "off Share links" choice — but
      // blank the text.
      await db.journalEntry.update({
        where: {
          tripId_date_authorId: { tripId, date: validDate, authorId: user.id },
        },
        data: { body: "", ...hiddenPatch },
      });
    } else {
      await db.journalEntry.deleteMany({
        where: { tripId, date: validDate, authorId: user.id },
      });
    }
    revalidateJournalPaths(tripId, validDate);
    return { success: true };
  }

  await db.journalEntry.upsert({
    where: {
      tripId_date_authorId: { tripId, date: validDate, authorId: user.id },
    },
    create: {
      tripId,
      date: validDate,
      body: trimmedBody,
      authorId: user.id,
      ...hiddenPatch,
    },
    update: {
      body: trimmedBody,
      ...hiddenPatch,
    },
  });

  revalidateJournalPaths(tripId, validDate);
  return { success: true };
}

/**
 * Delete the current Traveller's own journal entry for a specific
 * (tripId, date) pair.
 *
 * - Access-checked: user must be a member of the trip.
 * - Scoped to `authorId: user.id` — a Traveller can only remove their own
 *   entry, never another Traveller's.
 * - Does NOT delete associated photos (managed separately as Attachments).
 */
export async function deleteJournalEntry(
  tripId: string,
  date: string,
): Promise<JournalActionResult> {
  const { user } = await requireTripAccess(tripId);

  await db.journalEntry.deleteMany({
    where: { tripId, date, authorId: user.id },
  });

  revalidateJournalPaths(tripId, date);
  return { success: true };
}

/**
 * Set (or clear) the current Traveller's "Keep off Share links" switch for
 * their own entry on a date (spec L / ADR 0051 amendment). Upserts so the
 * switch can be set even before the Traveller has written any text for the
 * day — `body` defaults to "" on create. Not window- or length-checked:
 * toggling visibility of an already-writable day's entry carries none of
 * the risk either check guards against.
 */
export async function setJournalShareHidden(
  tripId: string,
  date: string,
  hidden: boolean,
): Promise<JournalActionResult> {
  const { user } = await requireTripAccess(tripId);

  await db.journalEntry.upsert({
    where: {
      tripId_date_authorId: { tripId, date, authorId: user.id },
    },
    create: {
      tripId,
      date,
      body: "",
      authorId: user.id,
      hiddenFromShares: hidden,
    },
    update: {
      hiddenFromShares: hidden,
    },
  });

  revalidateJournalPaths(tripId, date);
  return { success: true };
}
