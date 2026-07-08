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
 * Upsert a journal entry for a specific (tripId, date) pair.
 *
 * - Access-checked: user must be a member of the trip.
 * - Validates date (YYYY-MM-DD) and body (trimmed, max 5000 chars).
 * - Empty body after trim → delete the entry if it exists, else no-op.
 * - Non-empty body → upsert by (tripId, date), setting authorId to current user.
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
    // Empty body signals delete — remove the entry if it exists.
    await db.journalEntry.deleteMany({
      where: { tripId, date: validDate },
    });
    revalidateJournalPaths(tripId, validDate);
    return { success: true };
  }

  await db.journalEntry.upsert({
    where: { tripId_date: { tripId, date: validDate } },
    create: {
      tripId,
      date: validDate,
      body: trimmedBody,
      authorId: user.id,
    },
    update: {
      body: trimmedBody,
      authorId: user.id,
    },
  });

  revalidateJournalPaths(tripId, validDate);
  return { success: true };
}

/**
 * Delete a journal entry for a specific (tripId, date) pair.
 *
 * - Access-checked: user must be a member of the trip.
 * - Does NOT delete associated photos (managed separately as Attachments).
 */
export async function deleteJournalEntry(
  tripId: string,
  date: string,
): Promise<JournalActionResult> {
  await requireTripAccess(tripId);

  await db.journalEntry.deleteMany({
    where: { tripId, date },
  });

  revalidateJournalPaths(tripId, date);
  return { success: true };
}
