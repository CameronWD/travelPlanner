"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

/** Rows past this index appear with no entrance (MOTION.md P1). */
const RISE_IN_CAP = 8;
const STAGGER_MS = 40;
/** Longest entrance: the last staggered row's delay plus --dur-slow, with headroom. */
export const RISE_IN_WINDOW_MS = 800;

export interface PlanRiseInProps {
  /** A list row's place in the stagger (40ms apart); rows from RISE_IN_CAP on don't animate. */
  index?: number;
  /** An explicit delay instead of an index (the rail tiles). */
  delayMs?: number;
  className?: string;
  children?: React.ReactNode;
}

/**
 * The Plan page's first-paint entrance (MOTION.md P1): `tp-rise-in` with its
 * delay on `--tp-delay`, so reduced motion can zero it (`tp-stagger`).
 *
 * The class comes off once the entrance has had time to play. The desktop and
 * mobile lists are both mounted (one `display:none`), and a CSS animation
 * replays when its element goes from hidden to shown — so a resize across
 * `lg` would otherwise replay every row's rise.
 */
export function PlanRiseIn({ index, delayMs, className, children }: PlanRiseInProps) {
  const delay = delayMs ?? (index !== undefined && index < RISE_IN_CAP ? index * STAGGER_MS : null);
  const [played, setPlayed] = React.useState(false);

  React.useEffect(() => {
    const t = window.setTimeout(() => setPlayed(true), RISE_IN_WINDOW_MS);
    return () => window.clearTimeout(t);
  }, []);

  const rising = delay !== null && !played;
  return (
    <div
      className={cn(rising && "tp-rise-in tp-stagger", className)}
      style={rising ? ({ "--tp-delay": `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}
