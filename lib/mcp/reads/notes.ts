/**
 * Notes as the Claude connection reads them (get_notes; get_item's
 * `notesOnItem`; add_note's read-back, spec 2026-10-16 F2/F6). A Note is a
 * comment a Traveller left on a Stop, thing to do, Transport or Accommodation
 * (CONTEXT.md Note): said, never edited. Surprise (ADR 0051): Notes inside a
 * Surprise hidden from the acting Traveller stay in the database.
 */
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRowAccess, requireTripAccess } from "@/lib/guards";
import { loadSurpriseVisibility, type SurpriseVisibility } from "@/lib/surprise-visibility";
import { travellerName, TRAVELLER_SELECT } from "@/lib/traveller";

export interface McpNote {
  id: string;
  targetType: string;
  targetId: string;
  body: string;
  author: string;
  createdAt: string;
}

/** Notes on the Trip, oldest first, filtered by `where`. Callers have checked access. */
export async function readMcpNotes(
  tripId: string,
  v: SurpriseVisibility,
  where: { id?: string; targetType?: string; targetId?: string } = {},
): Promise<McpNote[]> {
  const rows = await db.note.findMany({
    where: { tripId, ...where, ...v.where.note },
    orderBy: { createdAt: "asc" },
    select: { id: true, targetType: true, targetId: true, body: true, createdAt: true, author: { select: TRAVELLER_SELECT } },
  });
  return rows.map((n) => ({
    id: n.id, targetType: n.targetType, targetId: n.targetId, body: n.body,
    author: travellerName(n.author), createdAt: n.createdAt.toISOString(),
  }));
}

export async function loadNotesForMcp(tripId: string): Promise<{ notes: McpNote[] }> {
  const { user } = await requireTripAccess(tripId);
  const v = await loadSurpriseVisibility(tripId, user.id);
  return { notes: await readMcpNotes(tripId, v) };
}

/** One Note in get_notes' shape. The Note guard refuses a Note inside a Surprise hidden from the caller. */
export async function loadNoteForMcp(noteId: string): Promise<McpNote> {
  const { row, user } = await requireRowAccess("note", noteId);
  const v = await loadSurpriseVisibility(row.tripId, user.id);
  const [note] = await readMcpNotes(row.tripId, v, { id: noteId });
  if (!note) notFound();
  return note;
}
