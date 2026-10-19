/**
 * The pure half of a `checklist.add` fix (spec 2026-10-18 A2): which choice
 * the Traveller made, the duplicate guard that decides whether Apply adds an
 * entry, marks an existing one Need to buy, or adds nothing, and the copy it
 * returns. server/actions/reviews.ts runs the checklist actions themselves.
 */
import type { ChecklistFix } from "@/lib/review/types";

/** The Packing card's two buttons: Need to pack, or Need to buy. A Pre-trip fix has one button and ignores it. */
export type ChecklistChoice = "PACK" | "BUY";
export const CHECKLIST_CHOICES: readonly ChecklistChoice[] = ["PACK", "BUY"];

/** The columns of a ChecklistItem the guard reads. */
export type ChecklistEntryLike = { id: string; text: string; done: boolean; buy: string | null };

export type ChecklistPlan =
  | { kind: "add"; buy: "NEEDED" | null }
  | { kind: "mark"; itemId: string }
  | { kind: "already"; itemId: string; copy: string };

export const CHECKLIST_FIX_COPY = {
  alreadyPacking: "Already on your packing list.",
  alreadyPretrip: "Already on your pre-trip checklist.",
  alreadyBoth: "Already on your lists.",
  /** Need to buy found the entry there unmarked, and marked it: nothing was added. */
  marked: "Marked Need to buy.",
  choose: "Choose Need to pack or Need to buy.",
} as const;

function normalised(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

/** The same entry: case-insensitive, trimmed, inner whitespace collapsed. */
export function sameEntryText(a: string, b: string): boolean {
  return normalised(a) === normalised(b);
}

/**
 * A2 duplicate guard. `existing` is the fix's own list. Need to pack or
 * Add to pre-trip with the entry there adds nothing; Need to buy marks an
 * unmarked entry, and adds nothing when one is already marked.
 */
export function planChecklistFix(fix: ChecklistFix, choice: ChecklistChoice, existing: readonly ChecklistEntryLike[]): ChecklistPlan {
  const matches = existing.filter((e) => sameEntryText(e.text, fix.text));
  if (fix.list === "PRETRIP") {
    return matches[0] ? { kind: "already", itemId: matches[0].id, copy: CHECKLIST_FIX_COPY.alreadyPretrip } : { kind: "add", buy: null };
  }
  if (choice === "PACK") {
    return matches[0] ? { kind: "already", itemId: matches[0].id, copy: CHECKLIST_FIX_COPY.alreadyPacking } : { kind: "add", buy: null };
  }
  if (!matches[0]) return { kind: "add", buy: "NEEDED" };
  const marked = matches.find((e) => e.buy !== null);
  return marked ? { kind: "already", itemId: marked.id, copy: CHECKLIST_FIX_COPY.alreadyBoth } : { kind: "mark", itemId: matches[0].id };
}
