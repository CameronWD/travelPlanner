/**
 * Real plan only (constraints.md, final review finding 3): every MCP tool
 * that takes the id of a plan row (a Stop, thing to do, Chapter,
 * Accommodation, Transport or Cost) checks it here before calling the
 * action. Many actions look rows up by id alone, so a Fork's row would
 * otherwise be read or changed through the Claude connection.
 *
 * Same shape as the tools' own PATCH loaders: a missing row, or one owned
 * by a Fork (`forkId: null` scopes to the real plan), reads as `notFound()`
 * before the access check runs, and a non-member's id then fails
 * `requireTripAccess` with the same `notFound()`. `runTool` maps both to
 * the one `NOT_FOUND_TEXT`.
 */
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireTripAccess } from "@/lib/guards";

export type RealPlanKind = "stop" | "item" | "chapter" | "accommodation" | "transport" | "cost";

function findRealPlanRow(kind: RealPlanKind, id: string): Promise<{ tripId: string } | null> {
  const args = { where: { id, forkId: null }, select: { tripId: true } } as const;
  switch (kind) {
    case "stop":
      return db.stop.findUnique(args);
    case "item":
      return db.item.findUnique(args);
    case "chapter":
      return db.chapter.findUnique(args);
    case "accommodation":
      return db.accommodation.findUnique(args);
    case "transport":
      return db.transport.findUnique(args);
    case "cost":
      return db.cost.findUnique(args);
  }
}

/** Throws `notFound()` unless `id` is a real-plan row of `kind` on a Trip the acting Traveller can access. */
export async function requireRealPlanRow(kind: RealPlanKind, id: string): Promise<{ tripId: string }> {
  const row = await findRealPlanRow(kind, id);
  if (!row) notFound();
  await requireTripAccess(row.tripId);
  return row;
}

/** `requireRealPlanRow` for each optional id, in order; an absent (undefined or null) id is skipped. */
export async function requireRealPlanRows(refs: [RealPlanKind, string | null | undefined][]): Promise<void> {
  for (const [kind, id] of refs) {
    if (id != null) await requireRealPlanRow(kind, id);
  }
}
