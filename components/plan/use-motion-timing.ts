"use client";

import { useReducedMotion, type Transition } from "motion/react";

/** MOTION.md: under reduced motion everything is instant or an 80ms fade. */
export const REDUCED_FADE: Transition = { duration: 0.08 };
/** An exit that gets out of the way at once, so what replaces it lands within 80ms. */
export const REDUCED_EXIT: Transition = { duration: 0 };

/**
 * `MotionConfig reducedMotion="user"` only skips transform and layout
 * animation; opacity and height still run at their full length. Pass every
 * JS transition through this so reduced motion gets an 80ms fade instead
 * (`exit` for a leaving element: gone at once).
 */
export function useMotionTiming(): { reduced: boolean; t(spec: Transition, kind?: "enter" | "exit"): Transition } {
  const reduced = Boolean(useReducedMotion());
  return {
    reduced,
    t: (spec, kind = "enter") => (reduced ? (kind === "exit" ? REDUCED_EXIT : REDUCED_FADE) : spec),
  };
}
