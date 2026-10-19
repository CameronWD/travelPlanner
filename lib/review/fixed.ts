/**
 * Fixed in the plan (spec 2026-10-18 A4). An Open Finding restating a Flag
 * reads FIXED while its Flag no longer fires against the current plan, and
 * Open again (with that Flag) once it returns. Pure: the live Flags come from
 * lib/review/live-flags.ts. `live` null means they are unknown (a Trip
 * without dates has no Flags at all), so nothing reads FIXED. Applied and
 * Dismissed always win, and a model Finding is never FIXED.
 *
 * Some Flags change id as they worsen (lib/flags.ts): Book by soon becomes
 * Book-by date passed, Close to the end date becomes Past the end date. That
 * is not fixed, so a Finding whose Flag has escalated stays Open, with the
 * worse Flag as its live one.
 */
import type { Flag } from "@/lib/flags";
import { flagIdOfKey } from "@/lib/review/key";
import type { FindingShownState, FindingState, SuggestedFix } from "@/lib/review/types";

/** Flag id prefix, and the prefix its Flag takes once it worsens. */
const ESCALATIONS: readonly [from: string, to: string][] = [
  ["book-by-soon", "book-by-overdue"],
  ["hard-end-approaching", "hard-end-over"],
];

function escalatedId(flagId: string): string | null {
  for (const [from, to] of ESCALATIONS) {
    if (flagId === from) return to;
    if (flagId.startsWith(`${from}-`)) return `${to}${flagId.slice(from.length)}`;
  }
  return null;
}

export function shownState(
  f: { origin: string; state: FindingState; key: string },
  live: ReadonlyMap<string, Flag> | null,
): { state: FindingShownState; liveFlag: Flag | null } {
  const flagId = f.origin === "FLAG" && f.state === "OPEN" && live ? flagIdOfKey(f.key) : null;
  if (!flagId || !live) return { state: f.state, liveFlag: null };
  const escalated = escalatedId(flagId);
  const liveFlag = live.get(flagId) ?? (escalated ? live.get(escalated) : undefined) ?? null;
  return liveFlag ? { state: "OPEN", liveFlag } : { state: "FIXED", liveFlag: null };
}

/**
 * The stored fix still worth offering (spec 2026-10-18 A3). A tight
 * connection's retime was worked out when the Review ran; once the plan has
 * moved on, its live Flag proposes another time (or none), and the stored one
 * would be wrong. So it is offered only while the live Flag proposes exactly
 * it. Every other fix, and a Finding with no live Flag, is left as it is.
 */
export function offeredFix<F extends SuggestedFix>(fix: F | null, liveFlag: Flag | null): F | null {
  if (!fix || fix.kind !== "item.times" || !liveFlag?.id.startsWith("tight-")) return fix;
  const r = liveFlag.retime;
  return r && r.itemId === fix.itemId && r.startTime === fix.startTime && r.endTime === fix.endTime ? fix : null;
}
