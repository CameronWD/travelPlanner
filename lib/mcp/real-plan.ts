/**
 * Real plan only (constraints.md, final review finding 3): every MCP tool
 * that takes the id of a plan row (a Stop, thing to do, Chapter,
 * Accommodation, Transport or Cost) checks it here before calling the
 * action. Many actions look rows up by id alone, so a Fork's row would
 * otherwise be read or changed through the Claude connection.
 *
 * A thin wrapper over `requireRowAccess` (lib/guards.ts, spec 2026-10-14 card
 * C) with `realPlanOnly: true`: a missing row, or one owned by a Fork
 * (`forkId: null` scopes to the real plan), reads as `notFound()` before the
 * access check runs, and a non-member's id then fails `requireTripAccess`
 * with the same `notFound()`. `runTool` maps both to the one `NOT_FOUND_TEXT`.
 * A Traveller surprised by the Surprise a Stop, thing to do, Accommodation
 * or Cost is inside (CONTEXT.md Surprise) gets the same `notFound()` — all of
 * that per-kind logic now lives once in `requireRowAccess` itself.
 */
import { requireRowAccess, type RowKind } from "@/lib/guards";

export type RealPlanKind = Extract<RowKind, "stop" | "item" | "chapter" | "accommodation" | "transport" | "cost">;

/** Throws `notFound()` unless `id` is a real-plan row of `kind` on a Trip the acting Traveller can access. */
export async function requireRealPlanRow(kind: RealPlanKind, id: string): Promise<{ tripId: string }> {
  const { row } = await requireRowAccess(kind, id, { realPlanOnly: true });
  return { tripId: row.tripId };
}

/** `requireRealPlanRow` for each optional id, in order; an absent (undefined or null) id is skipped. */
export async function requireRealPlanRows(refs: [RealPlanKind, string | null | undefined][]): Promise<void> {
  for (const [kind, id] of refs) {
    if (id != null) await requireRealPlanRow(kind, id);
  }
}
