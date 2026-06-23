"use client";

import * as React from "react";
import { animate, useReducedMotion } from "motion/react";
import { DURATION, EASE_EMPHASIZED } from "@/lib/motion";

/**
 * Counts a number up to `value` and renders it via `format`. Counts from 0 on
 * first mount, then from the previous value on change. Under reduced motion it
 * renders the final value immediately. The accessible label is always the
 * final formatted value, so assistive tech never reads the intermediate digits.
 */
export function AnimatedNumber({
  value,
  format,
  durationSec = DURATION.countUp,
  className,
}: {
  value: number;
  format: (n: number) => string;
  durationSec?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = React.useState(0);
  const prev = React.useRef(0);

  React.useEffect(() => {
    // Reduced motion: don't animate. We render `value` directly below, so
    // there's nothing to do here (and no setState-in-effect).
    if (reduce) return;
    const controls = animate(prev.current, value, {
      duration: durationSec,
      ease: EASE_EMPHASIZED,
      // Track the live visual position so that if `value` changes mid-flight
      // the next animation resumes from where the digits actually are.
      onUpdate: (v) => {
        prev.current = v;
        setDisplay(v);
      },
    });
    return () => controls.stop();
  }, [value, reduce, durationSec]);

  // Under reduced motion show the final value with no count-up; otherwise the
  // animated `display` drives the digits.
  const shown = reduce ? value : display;

  return (
    <span className={className} aria-label={format(value)}>
      {/* Server renders the from-0 (or final, under reduced motion) value; the
          client may differ on first paint. The text is aria-hidden and purely
          decorative, so suppress the expected hydration diff. */}
      <span aria-hidden="true" suppressHydrationWarning>
        {format(shown)}
      </span>
    </span>
  );
}
