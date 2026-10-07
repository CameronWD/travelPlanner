"use client";

import { useEffect, useRef, useState } from "react";
import { m, useTransform } from "motion/react";
import { useTween } from "@/components/money/use-tween";

const EASE_POP: [number, number, number, number] = [0.2, 0.8, 0.2, 1];

/** True the first time this link's countdown mounts this session; records it. */
function firstPlayThisSession(refKey: string): boolean {
  const key = `tp-share-count:${refKey}`;
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, "1");
    return true;
  } catch {
    // Storage blocked (private mode, sandboxed frame): just show the number.
    return false;
  }
}

/**
 * MOTION.md S4 — the Before countdown counts 0 → value over 600ms, once per
 * session per link. `refKey` is the link's hashed ref (shareRefParam), never
 * the raw token. Server and hydration render the final value; whether to
 * play is decided after mount. The digits run on a motion value, not state.
 * On a cold load, share-hero.tsx's inline script hides the digits
 * (data-count-pending) before paint when the count will play, so the final
 * number doesn't flash first; this clears it once it has decided.
 */
export function ShareCountdown({ value, refKey, className }: { value: number; refKey: string; className?: string }) {
  const [play, setPlay] = useState(false);
  const decided = useRef(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const digitsRef = useRef<HTMLSpanElement>(null);
  const mv = useTween(value, { from: 0, duration: 0.6, ease: EASE_POP, skip: !play, restartOn: play });
  const digits = useTransform(mv, (v) => String(Math.round(v)));

  useEffect(() => {
    // Once per mount, so Strict Mode's second effect run can't read the flag
    // the first one just wrote and cancel the count.
    if (decided.current) return;
    decided.current = true;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduced || !firstPlayThisSession(refKey)) {
      rootRef.current?.removeAttribute("data-count-pending");
      return;
    }
    // Deferred, not set in the effect body (react-hooks/set-state-in-effect).
    void Promise.resolve().then(() => setPlay(true));
  }, [refKey]);

  // Runs after useTween's restart (declared after it): the count is at 0, so
  // show the digits. Motion writes text on its next frame; write the 0 now.
  useEffect(() => {
    if (!play) return;
    if (digitsRef.current) digitsRef.current.textContent = "0";
    rootRef.current?.removeAttribute("data-count-pending");
  }, [play]);

  return (
    // suppressHydrationWarning: share-hero.tsx's inline script may have set
    // data-count-pending on this span before hydration.
    <span ref={rootRef} className={className} aria-label={String(value)} suppressHydrationWarning>
      <m.span ref={digitsRef} aria-hidden="true" suppressHydrationWarning>
        {digits}
      </m.span>
    </span>
  );
}
