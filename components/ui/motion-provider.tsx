"use client";

import { LazyMotion, MotionConfig, domAnimation } from "motion/react";

/**
 * App-wide Motion configuration.
 * - `LazyMotion features={domAnimation} strict` (spec 2026-10-06 §Q): every
 *   component renders `m.*` with the animation features only; a stray
 *   `motion.*` throws in development. Layout animation (`layout`,
 *   `layoutId`) is the larger `domMax`, loaded only where used
 *   (components/ui/layout-motion.tsx).
 * - `reducedMotion="user"` makes every Motion component honour the OS
 *   "reduce motion" setting (transforms/layout animation are skipped;
 *   opacity still cross-fades). This is the single accessibility switch for
 *   all library-driven motion in the app.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
