// Single source of truth for the app's motion vocabulary. Durations are in
// SECONDS (Motion's unit). Keep this small and reuse it everywhere so motion
// stays consistent and tunable from one place.
import type { Transition } from "motion/react";

export const DURATION = {
  /** Taps / pops. */
  fast: 0.12,
  /** Standard enter / route transition. */
  base: 0.2,
  /** Exit — slightly quicker than enter. */
  exit: 0.15,
  /** Budget grand-total count-up. */
  countUp: 0.7,
} as const;

/** Emphasized easing reused from the existing tp-slide CSS curve. */
export const EASE_EMPHASIZED: [number, number, number, number] = [0.32, 0.72, 0, 1];
/** Gentle ease-out for plain fades. */
export const EASE_OUT: [number, number, number, number] = [0, 0, 0.2, 1];

/** Per-item delay used by mount stagger. */
export const STAGGER_STEP = 0.03;

/** Spring for satisfying pops (vote, checklist tick). */
export const SPRING_POP = {
  type: "spring",
  stiffness: 500,
  damping: 28,
  mass: 0.6,
} as const satisfies Transition;
