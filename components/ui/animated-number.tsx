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
  const [display, setDisplay] = React.useState(reduce ? value : 0);
  const prev = React.useRef(reduce ? value : 0);

  React.useEffect(() => {
    if (reduce) {
      setDisplay(value);
      prev.current = value;
      return;
    }
    const controls = animate(prev.current, value, {
      duration: durationSec,
      ease: EASE_EMPHASIZED,
      onUpdate: (v) => setDisplay(v),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, reduce, durationSec]);

  return (
    <span className={className} aria-label={format(value)}>
      <span aria-hidden="true">{format(display)}</span>
    </span>
  );
}
