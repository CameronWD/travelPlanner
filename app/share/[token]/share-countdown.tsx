"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useTransform } from "motion/react";
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
 */
export function ShareCountdown({ value, refKey, className }: { value: number; refKey: string; className?: string }) {
  const [play, setPlay] = useState(false);
  const decided = useRef(false);
  const mv = useTween(value, { from: 0, duration: 0.6, ease: EASE_POP, skip: !play, restartOn: play });
  const digits = useTransform(mv, (v) => String(Math.round(v)));

  useEffect(() => {
    // Once per mount, so Strict Mode's second effect run can't read the flag
    // the first one just wrote and cancel the count.
    if (decided.current) return;
    decided.current = true;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduced || !firstPlayThisSession(refKey)) return;
    // Deferred, not set in the effect body (react-hooks/set-state-in-effect).
    void Promise.resolve().then(() => setPlay(true));
  }, [refKey]);

  return (
    <span className={className} aria-label={String(value)}>
      <motion.span aria-hidden="true" suppressHydrationWarning>
        {digits}
      </motion.span>
    </span>
  );
}
