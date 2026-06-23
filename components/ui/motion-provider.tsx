"use client";

import { MotionConfig } from "motion/react";

/**
 * App-wide Motion configuration. `reducedMotion="user"` makes every Motion
 * component honour the OS "reduce motion" setting (transforms/layout animation
 * are skipped; opacity still cross-fades). This is the single accessibility
 * switch for all library-driven motion in the app.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
