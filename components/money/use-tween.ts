"use client";

import * as React from "react";
import { animate } from "motion/react";

/**
 * Tweens a plain number to `value` via `motion`'s imperative `animate()`
 * (rAF-driven, not a DOM/CSS animation) — used for the Cost tile total and
 * the paid bar's percentage/amount labels (MOTION.md M2–M4, M9). `skip`
 * (reduced motion, or a static/first-render gate the caller computes) makes
 * it return `value` immediately with no tween. A later change to `value`
 * tweens from whatever is currently shown, not from `from`.
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
): number {
  const { from, duration, delay, ease, skip } = opts;
  const [shown, setShown] = React.useState(skip ? value : (from ?? value));
  const cur = React.useRef(shown);

  React.useEffect(() => {
    if (skip) {
      cur.current = value;
      // Deferred a microtask rather than called synchronously in the effect
      // body (react-hooks/set-state-in-effect) — same idiom used elsewhere
      // in this codebase (e.g. promote-fork-dialog.tsx).
      void Promise.resolve().then(() => setShown(value));
      return;
    }
    const controls = animate(cur.current, value, {
      duration,
      delay,
      ease,
      onUpdate: (v) => {
        cur.current = v;
        setShown(v);
      },
    });
    return () => controls.stop();
    // duration/delay/ease are stable per call site; only value/skip drive re-tweening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, skip]);

  return skip ? value : shown;
}
