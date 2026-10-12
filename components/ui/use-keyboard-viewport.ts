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
  vv: { height: number; offsetTop: number } | null,
): KeyboardViewport {
  if (!vv) return { keyboardOpen: false, visibleHeight: innerHeight, bottomInset: 0 };
  return {
    keyboardOpen: innerHeight - vv.height > KEYBOARD_THRESHOLD_PX,
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

  // Reset synchronously when `enabled` flips false, during render (the
  // "adjusting state when a prop changes" pattern — see
  // components/navigation/navigation-pending.tsx) rather than in the effect
  // below, which react-hooks/set-state-in-effect flags.
  const [seenEnabled, setSeenEnabled] = React.useState(enabled);
  if (seenEnabled !== enabled) {
    setSeenEnabled(enabled);
    if (!enabled) setState(CLOSED);
  }

  React.useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!enabled || !vv) return;
    let frame = 0;
    const update = () => {
      if (frame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = readKeyboardViewport(window.innerHeight, vv);
        setState((prev) =>
          prev.keyboardOpen === next.keyboardOpen &&
          prev.visibleHeight === next.visibleHeight &&
          prev.bottomInset === next.bottomInset
            ? prev
            : next,
        );
      });
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      if (frame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [enabled]);
  return state;
}
