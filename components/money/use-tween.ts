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
 * jumps the motion value straight to `value`, no tween.
 *
 * `restartOn`, when it flips false → true, resets the motion value to
 * `opts.from` before tweening — e.g. `MoneyEntrance`'s `phase` becoming
 * `"play"` (pass `phase === "play"`). This is deliberately a *separate*
 * signal from `skip`'s own true → false transition: `skip` also flips false
 * once the caller's `first`-style "is this still the initial commit" flag
 * settles, even for a "static" session where nothing should ever replay —
 * and at that point the motion value is already sitting at the correct
 * resting `value` (not a real starting point), so resetting it to `from`
 * there would visibly (and incorrectly) un-fill and re-fill a bar that was
 * never meant to animate at all. Restarting only on `restartOn`'s edge keeps
 * that "static" transition a true no-op (animate(value, value) — nothing to
 * see) while still correctly kicking off the "play" mount's entrance once,
 * from a real starting point.
 */
export function useTween(
  value: number,
  opts: {
    from?: number;
    duration: number;
    delay?: number;
    ease?: [number, number, number, number];
    skip: boolean;
    restartOn?: boolean;
  },
): MotionValue<number> {
  const { from, duration, delay, ease, skip, restartOn = false } = opts;
  const mv = useMotionValue(skip ? value : (from ?? value));
  const prevRestartOn = React.useRef(restartOn);

  React.useEffect(() => {
    const wasRestartOn = prevRestartOn.current;
    prevRestartOn.current = restartOn;

    if (skip) {
      mv.set(value);
      return;
    }

    if (restartOn && !wasRestartOn && from !== undefined) {
      mv.set(from);
    }

    const controls = animate(mv, value, { duration, delay, ease });
    return () => controls.stop();
    // duration/delay/ease are stable per call site; only value/skip/restartOn drive re-tweening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, skip, restartOn]);

  return mv;
}

/**
 * Like `useTween`, but every tween after the `restartOn` edge (see above)
 * runs as a *spring* instead. The paid bar's fill (MOTION.md M3: the mount's
 * own fill-in tweens 700ms with `--ease-pop`, 120ms delay; M4: every later
 * paid-total change springs) needed this rather than plain `useTween` driven
 * through a `motion.div`'s `initial`/`animate`/`transition` props, because
 * `initial` only applies at the component's literal mount — which, because
 * `MoneyEntrance` deliberately stays "pending" through hydration, is *never*
 * the moment `phase` is actually `"play"`; by the time it resolves, `initial`
 * has already been decided (as `false`) and won't retroactively replay.
 * Driving `scaleX` from a `MotionValue` sidesteps that entirely: the value is
 * just set/animated imperatively, independent of when the component happened
 * to mount.
 *
 * `first` is the caller's own "is this still the mount's first fill-in" flag
 * (PaidBar's own `first` state) — not `skip`, and not `restartOn`/the
 * caller's entrance `phase`, which stays `"play"` for the rest of the
 * session and would otherwise keep picking the tween forever.
 */
export function useTweenThenSpring(
  value: number,
  opts: {
    skip: boolean;
    restartOn?: boolean;
    first: boolean;
    duration: number;
    delay?: number;
    ease?: [number, number, number, number];
    springStiffness: number;
    springDamping: number;
  },
): MotionValue<number> {
  const { skip, restartOn = false, first, duration, delay, ease, springStiffness, springDamping } = opts;
  const mv = useMotionValue(skip ? value : 0);
  const prevRestartOn = React.useRef(restartOn);

  React.useEffect(() => {
    const wasRestartOn = prevRestartOn.current;
    prevRestartOn.current = restartOn;

    if (skip) {
      mv.set(value);
      return;
    }

    if (restartOn && !wasRestartOn) {
      // Coming out of "pending" into "play": nothing has actually moved yet,
      // so start fresh from 0 rather than wherever `mv` was parked.
      mv.set(0);
    }

    const controls = animate(
      mv,
      value,
      first ? { duration, delay, ease } : { type: "spring", stiffness: springStiffness, damping: springDamping },
    );
    return () => controls.stop();
    // duration/delay/ease/spring* are stable per call site; only value/skip/restartOn/first drive re-tweening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, skip, restartOn, first]);

  return mv;
}
