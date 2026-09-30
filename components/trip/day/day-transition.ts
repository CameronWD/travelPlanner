/**
 * Day-to-day motion (ADR 0063, amended by ADR 0065). Adjacent days scroll in
 * the carousel (components/trip/day/day-carousel.tsx) and navigate typed
 * day-settle: the body is already in place, so it maps to "none", while the
 * heading text still crossfades. A far jump from the strip is typed by
 * direction and runs the full-width page-turn in app/globals.css. Untyped
 * navigations (browser back/forward, router.refresh(), a section switch
 * landing on a day) map to "none".
 */
export const DAY_FORWARD = "day-forward";
export const DAY_BACK = "day-back";
export const DAY_SETTLE = "day-settle";

export const DAY_BODY_TRANSITION = {
  enter: { [DAY_FORWARD]: DAY_FORWARD, [DAY_BACK]: DAY_BACK, [DAY_SETTLE]: "none", default: "none" },
  exit: { [DAY_FORWARD]: DAY_FORWARD, [DAY_BACK]: DAY_BACK, [DAY_SETTLE]: "none", default: "none" },
  default: "none",
} as const;

export function dayTransitionType(fromISO: string, toISO: string): typeof DAY_FORWARD | typeof DAY_BACK {
  return toISO > fromISO ? DAY_FORWARD : DAY_BACK;
}

/**
 * The Day header's changing text (date, eyebrow, Day title, sub line)
 * crossfades in place on every typed day change (spec 2026-09-29 D4). The
 * arrows sit outside it and never move.
 */
export const DAY_TEXT = "day-text";

export const DAY_TEXT_TRANSITION = {
  enter: { [DAY_FORWARD]: DAY_TEXT, [DAY_BACK]: DAY_TEXT, [DAY_SETTLE]: DAY_TEXT, default: "none" },
  exit: { [DAY_FORWARD]: DAY_TEXT, [DAY_BACK]: DAY_TEXT, [DAY_SETTLE]: DAY_TEXT, default: "none" },
  default: "none",
} as const;
