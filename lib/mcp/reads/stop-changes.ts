/**
 * What a Stop-dating write moved (spec 2026-10-16 F6). A date edit can push
 * the Stops after it (ADR 0038), a move swaps two, Firm up dates many, and
 * the lone-Stop rule (ADR 0073) can date the last one. The write tools
 * snapshot the real plan's Stops before the action and compare afterwards,
 * so their result names every Stop that changed. The edited Stop is read
 * through get_stop. The others are read through `readMcpStops`, which
 * shows a Surprise Stop hidden from the caller as its shell: an edit may
 * ripple into a Surprise (CONTEXT.md), and the read-back must not report
 * "Not found" for a write that succeeded, nor show what the Surprise holds.
 *
 * Callers start the tracker only after their own access check.
 */
import { db } from "@/lib/db";
import { REAL_PLAN } from "@/lib/plan-scope";
import { loadStopForMcp, readMcpStops } from "./entities";
import type { McpStop } from "./plan-shapes";

const SNAPSHOT_SELECT = {
  id: true, sortOrder: true, arriveDate: true, departDate: true, nights: true, pinned: true, chapterId: true, timezone: true,
} as const;

export interface StopSnapshot {
  id: string; sortOrder: number; arriveDate: string | null; departDate: string | null;
  nights: number | null; pinned: boolean; chapterId: string | null; timezone: string | null;
}

const COMPARED = Object.keys(SNAPSHOT_SELECT) as (keyof StopSnapshot)[];

export async function snapshotPlanStops(tripId: string): Promise<StopSnapshot[]> {
  return db.stop.findMany({ where: { tripId, ...REAL_PLAN }, orderBy: { sortOrder: "asc" }, select: SNAPSHOT_SELECT });
}

/** Ids in `after` (its order) whose snapshot differs from `before`, or that are new. */
export function changedStopIds(before: readonly StopSnapshot[], after: readonly StopSnapshot[]): string[] {
  const was = new Map(before.map((s) => [s.id, s]));
  return after
    .filter((s) => {
      const b = was.get(s.id);
      return !b || COMPARED.some((k) => b[k] !== s[k]);
    })
    .map((s) => s.id);
}

export function stopTracker() {
  let tripId = "";
  let before: StopSnapshot[] = [];
  const changedIds = async () => changedStopIds(before, await snapshotPlanStops(tripId));
  return {
    async start(id: string): Promise<void> {
      tripId = id;
      before = await snapshotPlanStops(id);
    },
    async stopAndShifted(stopId: string): Promise<{ stop: McpStop; shifted: McpStop[] }> {
      const others = (await changedIds()).filter((id) => id !== stopId);
      const [stop, shifted] = await Promise.all([loadStopForMcp(stopId), readMcpStops(tripId, others)]);
      return { stop, shifted };
    },
    async changed(): Promise<McpStop[]> {
      return readMcpStops(tripId, await changedIds());
    },
  };
}

/** The action's flow conflicts, when there are any (they say why a date edit overlaps). */
export function conflictsOf(done: { conflicts?: readonly unknown[] }): { conflicts?: readonly unknown[] } {
  return done.conflicts && done.conflicts.length > 0 ? { conflicts: done.conflicts } : {};
}
