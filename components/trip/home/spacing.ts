/**
 * One card-spacing rule for every Home phase (spec §E, feedback cmuhvvx2a:
 * "The spacing between cards on the home screen isn't consistent?"): 14px
 * gaps between cards/tiles on phones, 18px at `lg` (≥1024px) — rows and
 * columns alike, including under any cover. Every phone phase tree
 * (phase-sketching/planning/travelling/past) and the desktop Home tree
 * (components/trip/home/desktop/*) import these instead of writing their own
 * `gap-*` value, so there is exactly one source for the rule.
 *
 * This governs the gap BETWEEN cards/tiles only — spacing inside a single
 * card's own content is a different concern and out of scope here.
 */

/** A vertical stack of cards/tiles: `flex flex-col` with the rule's gap. */
export const HOME_STACK = "flex flex-col gap-3.5 lg:gap-[18px]";

/** Just the gap classes, for a `grid` (or any other) container that needs
 * its own layout classes alongside the rule's gap. */
export const HOME_GRID_GAP = "gap-3.5 lg:gap-[18px]";

/** The rule's `lg` value alone, for a grid that only ever renders at `lg`+
 * (e.g. the desktop-only Home grids, which sit under a `hidden …
 * lg:flex` ancestor) — a phone value would never apply there, so there is
 * nothing to pair it with. Still the same 18px, from the same source. */
export const HOME_GRID_GAP_DESKTOP_ONLY = "gap-[18px]";
