/**
 * How the wide-screen Day carousel keeps up with quick presses (arrows, keys,
 * chips). Pure so it can be tested without a browser: jsdom has no view
 * transitions, and the race these settle only shows in one.
 */

/** Presses closer than this are one quick run: after the first, each cuts instead of crossfading. */
export const QUICK_PRESS_MS = 200;

/**
 * React holds a transition's commit until a running view transition ends, so
 * crossfading every press of a quick run lets the heading fall behind the
 * strip and catch up in jumps.
 */
export function isQuickPress(lastAt: number | null, now: number): boolean {
  return lastAt != null && now - lastAt < QUICK_PRESS_MS;
}

export type AfterPush = "none" | "push" | "reconcile";

/**
 * From lg one push is in flight at a time, and presses meanwhile only move
 * the day in view: when it ends, the latest day is pushed (`push`), unless a
 * press is still waiting to commit, whose commit pushes it. Below lg every
 * settle pushes and supersedes, so a day shown that is not the day in view
 * only means the push ended without landing (`reconcile`: park back).
 */
export function afterPush({ wide, pushed, shown, view, committing }: { wide: boolean; pushed: string; shown: string; view: string; committing: boolean }): AfterPush {
  if (shown === view) return "none";
  if (wide && committing) return "none";
  if (wide && view !== pushed) return "push";
  return "reconcile";
}
