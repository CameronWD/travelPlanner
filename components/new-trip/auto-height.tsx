"use client";

import * as React from "react";
import { m, useReducedMotion } from "motion/react";

const EASE_POP = [0.2, 0.8, 0.2, 1] as const;

/**
 * Tweens its height to its content's measured height (MOTION N9's 320ms panel
 * height). Measuring an inner box keeps the content itself untransformed, and
 * it clips only mid-tween so focus rings and hard shadows show at rest.
 */
export function AutoHeight({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const innerRef = React.useRef<HTMLDivElement>(null);
  // The first measurement only replaces "auto" with the same size, so it snaps.
  const [size, setSize] = React.useState<{ height: number | "auto"; snap: boolean }>({ height: "auto", snap: true });
  const [tweening, setTweening] = React.useState(false);

  React.useEffect(() => {
    const el = innerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const height = entry.borderBoxSize?.[0]?.blockSize ?? el.offsetHeight;
      setSize((prev) => ({ height, snap: prev.height === "auto" }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <m.div
      data-auto-height
      initial={false}
      animate={{ height: size.height }}
      transition={{ duration: reduce || size.snap ? 0 : 0.32, ease: EASE_POP }}
      onAnimationStart={() => setTweening(true)}
      onAnimationComplete={() => setTweening(false)}
      style={{ overflow: tweening ? "hidden" : undefined }}
    >
      <div ref={innerRef}>{children}</div>
    </m.div>
  );
}
