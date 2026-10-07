"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { SAMPLE_TRIPS, type SampleTrip } from "./sample-trips";

/**
 * The Landing card fan's shuffle (handoff LANDING.md §5.2–5.3): tap the front
 * card, or every 8s on its own, every piece drops out and the next sample
 * trip drops in. One instance per tree; the phone and desktop trees rotate
 * independently (only one is displayed). Web Animations on each piece's
 * positioned *wrapper* — never on the .tp-card-in card, whose transform is
 * its tilt.
 */
const SHUFFLE_OUT_MS = 170;
const SHUFFLE_IN_MS = 380;
export const AUTO_ROTATE_MS = 8_000;
export const TAP_COOLDOWN_MS = 2 * AUTO_ROTATE_MS;

export type ShuffleTiming = { outStaggerMs: number; inStaggerMs: number };
export const PHONE_TIMING: ShuffleTiming = { outStaggerMs: 30, inStaggerMs: 70 };
export const DESKTOP_TIMING: ShuffleTiming = { outStaggerMs: 20, inStaggerMs: 55 };

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
// The ribbon is a band, not a card: it fades in place rather than dropping.
const FADE_ONLY = "stops";
// el.animate() needs a literal easing; var() is not a timing function. These
// mirror --ease-exit / --ease-bounce in app/globals.css.
const EASE_EXIT = "cubic-bezier(0.4, 0, 1, 1)";
const EASE_BOUNCE = "cubic-bezier(0.34, 1.56, 0.64, 1)";

function reducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION).matches;
}

type Piece = { name: string; el: HTMLElement };

function canAnimate(el: HTMLElement) {
  return typeof el.animate === "function";
}

export function useTripShuffle(
  pieceOrder: readonly string[],
  timing: ShuffleTiming,
): {
  index: number;
  trip: SampleTrip;
  pieceRef: (name: string) => (el: HTMLElement | null) => void;
  shuffle: () => Promise<void>;
} {
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const busy = useRef(false);
  const lastTap = useRef(0);
  const pieces = useRef(new Map<string, HTMLElement>());
  const refCallbacks = useRef(new Map<string, (el: HTMLElement | null) => void>());

  const pieceRef = useCallback((name: string) => {
    let cb = refCallbacks.current.get(name);
    if (!cb) {
      cb = (el) => {
        if (el) pieces.current.set(name, el);
        else pieces.current.delete(name);
      };
      refCallbacks.current.set(name, cb);
    }
    return cb;
  }, []);

  // flushSync, not requestAnimationFrame: rAF never fires in a background
  // tab, and the cards would stay hidden at opacity 0 until it did.
  const commit = useCallback((next: number) => {
    indexRef.current = next;
    flushSync(() => setIndex(next));
  }, []);

  const run = useCallback(async () => {
    if (busy.current) return;
    const next = (indexRef.current + 1) % SAMPLE_TRIPS.length;
    if (reducedMotion()) {
      commit(next);
      return;
    }
    busy.current = true;
    const registered: Piece[] = Array.from(pieces.current, ([name, el]) => ({ name, el })).filter((p) => canAnimate(p.el));
    const outOrder = registered.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    const inOrder = pieceOrder
      .map((name) => ({ name, el: pieces.current.get(name) }))
      .filter((p): p is Piece => !!p.el && canAnimate(p.el));
    try {
      const outs = outOrder.map(({ name, el }, k) =>
        el.animate(
          name === FADE_ONLY
            ? [{ opacity: 1 }, { opacity: 0 }]
            : [{ transform: "none", opacity: 1 }, { transform: "translateY(24px) scale(.9)", opacity: 0 }],
          { duration: SHUFFLE_OUT_MS, delay: k * timing.outStaggerMs, easing: EASE_EXIT, fill: "forwards" },
        ),
      );
      await Promise.all(outs.map((a) => a.finished));
      commit(next);
      const ins = inOrder.map(({ name, el }, k) =>
        el.animate(
          [
            name === FADE_ONLY ? { opacity: 0 } : { transform: `translateY(-36px) rotate(${k % 2 ? 6 : -6}deg) scale(1.06)`, opacity: 0 },
            { transform: "none", opacity: 1 },
          ],
          { duration: SHUFFLE_IN_MS, delay: k * timing.inStaggerMs, easing: EASE_BOUNCE, fill: "backwards" },
        ),
      );
      // A card that lands early would otherwise fall back to its out
      // animation's forwards fill (opacity 0) until the last card lands.
      outs.forEach((a) => a.cancel());
      await Promise.all(ins.map((a) => a.finished));
    } catch {
      // A cancelled animation rejects `finished`; the finally puts things right.
    } finally {
      if (indexRef.current !== next) commit(next);
      for (const el of pieces.current.values()) el.getAnimations?.().forEach((a) => a.cancel());
      busy.current = false;
    }
  }, [pieceOrder, timing, commit]);

  const shuffle = useCallback(() => {
    lastTap.current = Date.now();
    return run();
  }, [run]);

  useEffect(() => {
    if (reducedMotion()) return;
    const id = window.setInterval(() => {
      if (document.hidden || reducedMotion() || busy.current) return;
      if (Date.now() - lastTap.current <= TAP_COOLDOWN_MS) return;
      void run();
    }, AUTO_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [run]);

  return { index, trip: SAMPLE_TRIPS[index], pieceRef, shuffle };
}
