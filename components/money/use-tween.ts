"use client";

import * as React from "react";
import { animate, useMotionValue, type MotionValue } from "motion/react";

/**
 * Tweens a plain number to `value` via `motion`'s imperative `animate()`,
 * writing into a `MotionValue` rather than React state — MOTION.md: "on a
 * motion value, don't use React state per frame." Callers derive display
 * text with `useTransform` and bind it to a `<motion.span>` (Motion writes
 * the DOM text directly on change, no React re-render per frame). Used for
 * the Cost tile total and the paid bar's percentage/amount labels
 * (MOTION.md M2–M4, M9).
 *
 * `skip` (reduced motion, or a static/first-render gate the caller computes)
 * jumps the motion value straight to `value`, no tween. A later change to
 * `value` while not skipped tweens from wherever the motion value currently
 * sits — EXCEPT the transition out of `skip` (true → false), which restarts
 * from `opts.from`: `skip` was true while `MoneyEntrance` sat at "pending"
 * (matching the server-rendered markup), so the motion value's current
 * position is already the final `value`, not a real starting point — without
 * this, the first "play" tween would animate from `value` to `value`, i.e.
 * not visibly at all.
 */
export function useTween(
  value: number,
  opts: {
    from?: number;
    duration: number;
    delay?: number;
    ease?: [number, number, number, number];
    skip: boolean;
  },
): MotionValue<number> {
  const { from, duration, delay, ease, skip } = opts;
  const mv = useMotionValue(skip ? value : (from ?? value));
  const prevSkip = React.useRef(skip);

  React.useEffect(() => {
    const wasSkip = prevSkip.current;
    prevSkip.current = skip;

    if (skip) {
      mv.set(value);
      return;
    }

    if (wasSkip && from !== undefined) {
      mv.set(from);
    }

    const controls = animate(mv, value, { duration, delay, ease });
    return () => controls.stop();
    // duration/delay/ease are stable per call site; only value/skip drive re-tweening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, skip]);

  return mv;
}
