"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { saveJournalEntrySchema } from "@/lib/validations/journal";
import { type ActionResult, validationResult } from "@/lib/action-result";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type JournalActionResult = ActionResult;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function revalidateJournalPaths(tripId: string, date: string) {
  revalidatePath(`/trips/${tripId}/day/${date}`);
  revalidatePath(`/trips/${tripId}/journal`);
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
 * - Validates date (YYYY-MM-DD) and body (trimmed, max 5000 chars).
 * - Empty body after trim → a pure no-op. It neither deletes an existing
 *   entry nor creates an empty one — blanking the editor must never
 *   silently destroy prose. Removing an entry is a separate, explicit
 *   action (see `deleteJournalEntry`).
 * - Non-empty body → upsert by (tripId, date, authorId), scoped to the
 *   current user so it can never overwrite another Traveller's entry.
 */
export async function saveJournalEntry(
  tripId: string,
  date: string,
  body: string,
): Promise<JournalActionResult> {
  const { user } = await requireTripAccess(tripId);

  const parsed = saveJournalEntrySchema.safeParse({ date, body });
  if (!parsed.success) {
    return validationResult(parsed.error);
  }

  const { date: validDate, body: trimmedBody } = parsed.data;

  if (trimmedBody === "") {
    // Empty body is a no-op — it must not delete an existing entry and
    // must not create an empty row. See deleteJournalEntry for removal.
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
    },
    update: {
      body: trimmedBody,
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
