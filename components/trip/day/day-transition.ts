/**
 * Day-to-day motion (ADR 0063): the body slides in the direction of travel.
 * Every input — arrows, strip, keyboard, swipe — tags its navigation with one
 * of these transition types; the body's <ViewTransition> maps them to the CSS
 * classes in app/globals.css. Untyped navigations (browser back/forward,
 * router.refresh(), a section switch landing on a day) map to "none".
 */
export const DAY_FORWARD = "day-forward";
export const DAY_BACK = "day-back";

export const DAY_BODY_TRANSITION = {
  enter: { [DAY_FORWARD]: DAY_FORWARD, [DAY_BACK]: DAY_BACK, default: "none" },
  exit: { [DAY_FORWARD]: DAY_FORWARD, [DAY_BACK]: DAY_BACK, default: "none" },
  default: "none",
} as const;

export function dayTransitionType(fromISO: string, toISO: string): typeof DAY_FORWARD | typeof DAY_BACK {
  return toISO > fromISO ? DAY_FORWARD : DAY_BACK;
}

/**
 * The Day header's changing text (date, eyebrow, Day title, sub line)
 * crossfades in place on a typed day change, in step with the body slide
 * (spec 2026-09-29 D4). The arrows sit outside it and never move.
 */
export const DAY_TEXT = "day-text";

export const DAY_TEXT_TRANSITION = {
  enter: { [DAY_FORWARD]: DAY_TEXT, [DAY_BACK]: DAY_TEXT, default: "none" },
  exit: { [DAY_FORWARD]: DAY_TEXT, [DAY_BACK]: DAY_TEXT, default: "none" },
  default: "none",
} as const;
