/**
 * R10: a new Review matches its Findings to the previous DONE Review's by
 * key (lib/review/key.ts: category + target), one-to-one. First pass: same
 * key and same title. Second pass: same key, in the order raised. A match
 * carries history:
 *   - Dismissed stays Dismissed, keeping who and when;
 *   - Applied found again is Open (the fix didn't hold);
 *   - Open stays Open.
 * Either way, the match keeps `firstFoundAt` and names its `previousId`.
 * An unmatched previous Finding that was Open becomes No longer found
 * (`goneIds`). An unmatched Dismissed or Applied one keeps that state on
 * its own Review: it records a person's decision. Pure.
 */
import { findingKey } from "@/lib/review/key";
import type { FindingDraft, FindingState } from "@/lib/review/types";

export interface PreviousFinding {
  id: string;
  key: string;
  title: string;
  state: FindingState;
  stateById: string | null;
  stateAt: Date | null;
  firstFoundAt: Date;
}

export interface MatchedFinding {
  draft: FindingDraft;
  key: string;
  state: "OPEN" | "DISMISSED";
  stateById: string | null;
  stateAt: Date | null;
  previousId: string | null;
  /** Null: first found by this Review (the store stamps now). */
  firstFoundAt: Date | null;
}

export function matchFindings(
  previous: readonly PreviousFinding[],
  drafts: readonly FindingDraft[],
): { findings: MatchedFinding[]; goneIds: string[] } {
  const unused = new Map<string, PreviousFinding[]>();
  for (const p of previous) unused.set(p.key, [...(unused.get(p.key) ?? []), p]);
  const take = (key: string, pick: (p: PreviousFinding) => boolean): PreviousFinding | undefined => {
    const list = unused.get(key);
    const at = list?.findIndex(pick) ?? -1;
    return at === -1 ? undefined : list!.splice(at, 1)[0];
  };

  const keyed = drafts.map((draft) => ({ draft, key: findingKey(draft) }));
  const pairs = new Map<number, PreviousFinding>();
  keyed.forEach(({ draft, key }, i) => {
    const p = take(key, (q) => q.title === draft.title);
    if (p) pairs.set(i, p);
  });
  keyed.forEach(({ key }, i) => {
    if (pairs.has(i)) return;
    const p = take(key, () => true);
    if (p) pairs.set(i, p);
  });

  const findings = keyed.map(({ draft, key }, i): MatchedFinding => {
    const p = pairs.get(i);
    if (!p) return { draft, key, state: "OPEN", stateById: null, stateAt: null, previousId: null, firstFoundAt: null };
    const dismissed = p.state === "DISMISSED";
    return {
      draft,
      key,
      state: dismissed ? "DISMISSED" : "OPEN",
      stateById: dismissed ? p.stateById : null,
      stateAt: dismissed ? p.stateAt : null,
      previousId: p.id,
      firstFoundAt: p.firstFoundAt,
    };
  });

  const matched = new Set([...pairs.values()].map((p) => p.id));
  const goneIds = previous.filter((p) => !matched.has(p.id) && p.state === "OPEN").map((p) => p.id);
  return { findings, goneIds };
}
