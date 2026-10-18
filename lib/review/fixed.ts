/**
 * Fixed in the plan (spec 2026-10-18 A4). An Open Finding restating a Flag
 * reads FIXED while its Flag no longer fires against the current plan, and
 * Open again (with that Flag) once it returns. Pure: the live Flags come from
 * lib/review/live-flags.ts. `live` null means they are unknown (a Trip
 * without dates has no Flags at all), so nothing reads FIXED. Applied and
 * Dismissed always win, and a model Finding is never FIXED.
 */
import type { Flag } from "@/lib/flags";
import { flagIdOfKey } from "@/lib/review/key";
import type { FindingShownState, FindingState } from "@/lib/review/types";

export function shownState(
  f: { origin: string; state: FindingState; key: string },
  live: ReadonlyMap<string, Flag> | null,
): { state: FindingShownState; liveFlag: Flag | null } {
  const flagId = f.origin === "FLAG" && f.state === "OPEN" && live ? flagIdOfKey(f.key) : null;
  if (!flagId || !live) return { state: f.state, liveFlag: null };
  const liveFlag = live.get(flagId) ?? null;
  return liveFlag ? { state: "OPEN", liveFlag } : { state: "FIXED", liveFlag: null };
}
