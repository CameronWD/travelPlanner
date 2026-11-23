/**
 * Day-to-day motion (ADR 0063, amended by ADR 0065). Below lg the carousel
 * (components/trip/day/day-carousel.tsx) scrolls the body itself, so no day
 * change runs a view transition there. From lg a day change made in the app
 * is typed by direction and the body crossfades in place
 * (DAY_BODY_TRANSITION_WIDE), as does the header's text, unless it is part of
 * a quick run of presses or reduced motion is on: those are untyped and cut.
 * Untyped navigations (browser back/forward, router.refresh(), the push that
 * lands a day already on screen) map to "none".
 */
export const DAY_FORWARD = "day-forward";
export const DAY_BACK = "day-back";

export const DAY_FADE = "day-fade";

export const DAY_BODY_TRANSITION_WIDE = {
  enter: { [DAY_FORWARD]: DAY_FADE, [DAY_BACK]: DAY_FADE, default: "none" },
  exit: { [DAY_FORWARD]: DAY_FADE, [DAY_BACK]: DAY_FADE, default: "none" },
  default: "none",
} as const;

export function dayTransitionType(fromISO: string, toISO: string): typeof DAY_FORWARD | typeof DAY_BACK {
  return toISO > fromISO ? DAY_FORWARD : DAY_BACK;
}

/**
 * The Day header's changing text (date, eyebrow, Day title, sub line)
 * crossfades in place on every typed day change (spec 2026-09-29 D4); below
 * lg nothing types a day change, so it swaps. The arrows sit outside it and
 * never move.
 */
export const DAY_TEXT = "day-text";

export const DAY_TEXT_TRANSITION = {
  enter: { [DAY_FORWARD]: DAY_TEXT, [DAY_BACK]: DAY_TEXT, default: "none" },
  exit: { [DAY_FORWARD]: DAY_TEXT, [DAY_BACK]: DAY_TEXT, default: "none" },
  default: "none",
} as const;
