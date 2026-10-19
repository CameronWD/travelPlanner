/**
 * R8: a Review includes the current Flags restated as Findings, computed as
 * everyone sees them (the caller passes Flags detected with every Surprise
 * hidden, lib/review/input.ts). Each Flag maps by its id's rule prefix to one
 * of R8's categories and a short title; its message becomes the detail. The
 * Flag id is kept as `flagId`, so it matches itself in the next Review
 * (lib/review/key.ts). A drift test fails on a Flag id with no rule here.
 *
 * A tight connection with a retime is about the later Item and carries its fix
 * (spec 2026-10-18 A3). It still keys on the Flag's own day (`flagTarget`,
 * lib/review/key.ts), so retimed or not it matches itself across Reviews and a
 * Dismissal stays put, including on Findings stored before the retarget.
 */
import type { Flag } from "@/lib/flags";
import type { FindingCategory, FindingDraft } from "@/lib/review/types";

/** Rule prefix (lib/flags.ts ids are `<prefix>-<target>` or the bare prefix). */
const RULES: readonly { prefix: string; category: FindingCategory; title: string }[] = [
  { prefix: "item-closed", category: "CLOSURE", title: "Closed that day" },
  { prefix: "item-before-open", category: "CLOSURE", title: "Before opening" },
  { prefix: "item-after-close", category: "CLOSURE", title: "After closing" },
  { prefix: "item-late-slot", category: "TICKET", title: "Late for the slot" },
  { prefix: "book-by-overdue", category: "BOOKING", title: "Book-by date passed" },
  { prefix: "book-by-soon", category: "BOOKING", title: "Book by soon" },
  { prefix: "still-to-book", category: "BOOKING", title: "Still to book" },
  { prefix: "stop-no-accom", category: "BOOKING", title: "Nowhere to stay" },
  { prefix: "accom-gap", category: "BOOKING", title: "Nights without a place to stay" },
  { prefix: "empty-day", category: "LOGISTICS", title: "Empty day" },
  { prefix: "transport-dep-mismatch", category: "LOGISTICS", title: "Departure doesn't line up" },
  { prefix: "transport-arr-mismatch", category: "LOGISTICS", title: "Arrival doesn't line up" },
  { prefix: "short-stay", category: "LOGISTICS", title: "Very short stay" },
  { prefix: "backtrack", category: "LOGISTICS", title: "Backtracking" },
  { prefix: "item-overlap", category: "LOGISTICS", title: "Overlapping plans" },
  { prefix: "packed-day", category: "LOGISTICS", title: "Packed day" },
  { prefix: "spread-day", category: "LOGISTICS", title: "Spread-out day" },
  { prefix: "long-drive", category: "LOGISTICS", title: "Long driving day" },
  { prefix: "tight", category: "LOGISTICS", title: "Tight connection" },
  { prefix: "missing-connection", category: "LOGISTICS", title: "Missing connection" },
  { prefix: "missing-home-outbound", category: "LOGISTICS", title: "No way there from home" },
  { prefix: "missing-home-return", category: "LOGISTICS", title: "No way home" },
  { prefix: "return-after-hard-end", category: "LOGISTICS", title: "Home after the end date" },
  { prefix: "hard-end-over", category: "LOGISTICS", title: "Past the end date" },
  { prefix: "hard-end-approaching", category: "LOGISTICS", title: "Close to the end date" },
  { prefix: "rough-stops", category: "LOGISTICS", title: "Stops without dates" },
];

export function flagsToFindings(flags: readonly Flag[]): FindingDraft[] {
  return flags.map((f) => {
    const rule = RULES.find((r) => f.id === r.prefix || f.id.startsWith(`${r.prefix}-`));
    const retimed = f.retime
      ? {
          targetType: "ITEM" as const,
          targetId: f.retime.itemId,
          flagTarget: { targetType: f.targetType, ...(f.targetId ? { targetId: f.targetId } : {}) },
          suggestedFix: { kind: "item.times" as const, itemId: f.retime.itemId, startTime: f.retime.startTime, endTime: f.retime.endTime },
        }
      : { targetType: f.targetType, ...(f.targetId ? { targetId: f.targetId } : {}) };
    return {
      severity: f.severity,
      category: rule?.category ?? "LOGISTICS",
      ...retimed,
      ...(f.date ? { date: f.date } : {}),
      title: rule?.title ?? "Flag",
      detail: f.message,
      origin: "FLAG",
      flagId: f.id,
    };
  });
}
