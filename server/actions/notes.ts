"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";
import { addNoteSchema, type AddNoteInput } from "@/lib/validations/note";
import { recordActivity } from "@/server/actions/activity";
import { requireOutsideSurprise } from "@/lib/surprise-guard";
import { entityLabel } from "@/lib/activity";
import { type ActionResult, validationResult } from "@/lib/action-result";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type NoteActionResult = ActionResult;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Look up a note and verify the current user is a member of its trip and is
 * not surprised by what it is on (CONTEXT.md Surprise). Returns the note with
 * the live Surprise it is inside, or throws notFound().
 */
async function requireNoteAccess(noteId: string) {
  const note = await db.note.findUnique({
    where: { id: noteId },
    select: { id: true, tripId: true, authorId: true, targetType: true, targetId: true },
  });
  if (!note) {
    notFound();
  }
  // Any trip member can manage notes (read/delete)
  const { user } = await requireTripAccess(note.tripId);
  const surpriseOf = await requireOutsideSurprise(user.id, { target: note });
  return { ...note, surpriseOf };
}

/**
 * Revalidate relevant trip pages after a note mutation.
 */
function revalidateNotePaths(tripId: string) {
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/wishlist`);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Add a note to any trip entity.
 *
 * - Access-checked: user must be a member of the trip.
 * - Validates body (non-empty, trimmed, max 2000), targetType, and targetId.
 * - Sets authorId to the current user.
 */
export async function addNote(
  tripId: string,
  input: AddNoteInput,
): Promise<NoteActionResult> {
  const { user } = await requireTripAccess(tripId);

  const parsed = addNoteSchema.safeParse(input);
  if (!parsed.success) {
    return validationResult(parsed.error);
  }

  const { targetType, targetId, body } = parsed.data;
  await requireOutsideSurprise(user.id, { target: { targetType, targetId } });

  const created = await db.note.create({
    data: {
      tripId,
      authorId: user.id,
      targetType,
      targetId,
      body,
    },
  });

  await recordActivity({ tripId, verb: "NOTED", entityType: "NOTE", entityId: created.id, entityLabel: entityLabel("NOTE", created as unknown as Record<string, unknown>), changes: { excerpt: body.slice(0, 80) } });
  revalidateNotePaths(tripId);
  return { success: true };
}

/**
 * Delete a note.
 *
 * - Access-checked: user must be a member of the note's trip (either traveller
 *   can tidy up — not author-only).
 */
export async function deleteNote(noteId: string): Promise<NoteActionResult> {
  const note = await requireNoteAccess(noteId);

  await db.note.delete({ where: { id: noteId } });
  await recordActivity({ tripId: note.tripId, verb: "DELETED", entityType: "NOTE", entityId: noteId, entityLabel: "note", surpriseOf: note.surpriseOf });

  revalidateNotePaths(note.tripId);
  return { success: true };
}
