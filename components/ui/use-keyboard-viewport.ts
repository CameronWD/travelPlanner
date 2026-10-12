"use client";

import * as React from "react";

export interface KeyboardViewport {
  keyboardOpen: boolean;
  visibleHeight: number;
  bottomInset: number;
}

export const KEYBOARD_THRESHOLD_PX = 120;

/** Pure: derive the state from raw numbers (exported for tests and reuse). */
export function readKeyboardViewport(
  innerHeight: number,
  vv: { height: number; offsetTop: number; scale?: number } | null,
): KeyboardViewport {
  if (!vv) return { keyboardOpen: false, visibleHeight: innerHeight, bottomInset: 0 };
  // Pinch-zoom also shrinks visualViewport.height relative to innerHeight —
  // without this guard a zoomed-in page reads as a keyboard. Only a gap at
  // ~1x scale is actually the on-screen keyboard.
  const atNormalScale = Math.abs((vv.scale ?? 1) - 1) < 0.01;
  return {
    keyboardOpen: atNormalScale && innerHeight - vv.height > KEYBOARD_THRESHOLD_PX,
    visibleHeight: Math.round(vv.height),
    bottomInset: Math.max(0, Math.round(innerHeight - (vv.height + vv.offsetTop))),
  };
}

// visibleHeight is 0 here (rather than innerHeight) because consumers only
// read heights once keyboardOpen is true; this is the disabled/unavailable
// state, never rendered as an open keyboard.
const CLOSED: KeyboardViewport = { keyboardOpen: false, visibleHeight: 0, bottomInset: 0 };

/*
 * iOS Safari overlays the on-screen keyboard: the layout viewport and dvh keep
 * their size, only window.visualViewport shrinks. Phone sheets use this to sit
 * on the keyboard instead of behind it (spec 2026-10-11-phone-keyboard-sheets).
 *
 * Subscribes to window.visualViewport while `enabled`; closed state when
 * disabled or unavailable (SSR, old browsers, tests that don't stub it) —
 * today's behaviour exactly.
 */
export function useKeyboardViewport(enabled = true): KeyboardViewport {
  const [state, setState] = React.useState<KeyboardViewport>(CLOSED);

  // A layout effect, not a passive one: it reads the viewport once,
  // synchronously, before the browser paints — so a dialog or sheet opened
  // while the keyboard is already up never shows a frame at the closed
  // geometry behind it, then subscribes for later changes. It never runs on
  // the server (React 19 no longer warns about useLayoutEffect in SSR), so
  // the server render is CLOSED.
  React.useLayoutEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!enabled || !vv) return;
    let frame = 0;
    // Scoped to this effect instance (one per `enabled`/`vv` lifetime): once
    // cleanup runs, any rAF this instance already scheduled must not write
    // state, however late it fires. useEffect cleanup is a passive effect —
    // it can run after a rAF callback for the same frame, not before — so a
    // frame scheduled a moment before `enabled` flipped false could otherwise
    // land after the reset and, worse, after a *later* re-enabled instance
    // has already written its own fresh value, clobbering it with stale data.
    let cancelled = false;
    const read = () => {
      const next = readKeyboardViewport(window.innerHeight, vv);
      setState((prev) =>
        prev.keyboardOpen === next.keyboardOpen &&
        prev.visibleHeight === next.visibleHeight &&
        prev.bottomInset === next.bottomInset
          ? prev
          : next,
      );
    };
    const update = () => {
      if (frame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (cancelled) return;
        read();
      });
    };
    read();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      cancelled = true;
      if (frame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [enabled]);

  // Disabled always reads closed — derived, not stored — so the output is
  // correct the instant `enabled` goes false, with no render-phase setState
  // needed (and no react-hooks/set-state-in-effect hazard from resetting
  // `state` inside the effect above). `state` itself may still hold a stale
  // value while disabled; that's fine, since it's never read here, and the
  // effect's own synchronous read() re-primes it the moment `enabled` flips
  // back to true.
  return enabled ? state : CLOSED;
}
