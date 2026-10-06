"use client";

import * as React from "react";
import { AnimatePresence, m } from "motion/react";
import { cn } from "@/lib/cn";
import { HUE_CLASSES } from "@/lib/hues";
import type { BarSegment, BreakdownBy } from "@/lib/money/breakdown";

const EASE_POP: [number, number, number, number] = [0.2, 0.8, 0.2, 1];

/**
 * The stacked bar above the rows (MONEY.md §5). Segments grow left to right on
 * mount; a `by` change fades the old bar out before the new one grows (MOTION.md M5).
 */
export function StackedBar({
  segments,
  by,
  className,
}: {
  segments: BarSegment[];
  by: BreakdownBy;
  className?: string;
}) {
  return (
    <AnimatePresence mode="wait" initial={true}>
      <m.div
        key={by}
        data-slot="stacked-bar"
        aria-hidden="true"
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        className={cn("flex h-[22px] overflow-hidden rounded-full border-2 border-border md:h-[26px]", className)}
      >
        {segments.map((s, i) => (
          <m.div
            key={s.key}
            data-slot="stacked-segment"
            className={cn("h-full origin-left border-r-2 border-border last:border-r-0", HUE_CLASSES[s.hue].fill)}
            style={{ width: `${Math.round(s.fraction * 1000) / 10}%` }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.32, delay: i * 0.04, ease: EASE_POP }}
          />
        ))}
      </m.div>
    </AnimatePresence>
  );
}

/**
 * Cross-fades its content when `swapKey` changes: the old content fades out,
 * then the new fades in, with no height animation (MOTION.md M6). The first
 * render shows at once — the tile's own entrance (M1) covers first paint.
 */
export function FadeSwap({ swapKey, className, children }: { swapKey: string; className?: string; children: React.ReactNode }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.div
        key={swapKey}
        className={className}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
      >
        {children}
      </m.div>
    </AnimatePresence>
  );
}
