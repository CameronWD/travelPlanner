"use server";

import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTripAccess, requireRowAccess, type RowKind } from "@/lib/guards";
import { addNoteSchema, type AddNoteInput } from "@/lib/validations/note";
import { recordActivity } from "@/server/actions/activity";
import { requireOutsideSurprise } from "@/lib/surprise-guard";
import { entityLabel } from "@/lib/activity";
import { type ActionResult, validationResult } from "@/lib/action-result";

/**
 * ARCH-TEN-9: targetType → RowKind for the four kinds requireRowAccess
 * covers. JOURNAL (a date) and other target types keep their existing
 * requireOutsideSurprise handling below — requireRowAccess has no row for
 * them.
 */
function kindFor(targetType: "STOP" | "ITEM" | "TRANSPORT" | "ACCOMMODATION"): RowKind {
  switch (targetType) {
    case "STOP":
      return "stop";
    case "ITEM":
      return "item";
    case "TRANSPORT":
      return "transport";
    case "ACCOMMODATION":
      return "accommodation";
  }
}

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
  const { row, surpriseOf } = await requireRowAccess("note", noteId);
  return { ...row, surpriseOf };
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
  if (targetType === "STOP" || targetType === "ITEM" || targetType === "TRANSPORT" || targetType === "ACCOMMODATION") {
    const { row } = await requireRowAccess(kindFor(targetType), targetId);
    if (row.tripId !== tripId) notFound();
  } else {
    await requireOutsideSurprise(user.id, { target: { targetType, targetId } });
  }

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
