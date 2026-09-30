"use client";

import { cn } from "@/lib/cn";
import { HUE_CLASSES } from "@/lib/hues";
import type { BarSegment, BreakdownBy } from "@/lib/money/breakdown";

/**
 * The stacked bar above the rows (MONEY.md §5). `by` is accepted now, unused
 * until Task 16's re-keying animation needs it to key the segment transition.
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
  void by;
  return (
    <div
      data-slot="stacked-bar"
      aria-hidden="true"
      className={cn("flex h-[22px] overflow-hidden rounded-full border-2 border-border md:h-[26px]", className)}
    >
      {segments.map((s) => (
        <div
          key={s.key}
          data-slot="stacked-segment"
          className={cn("h-full border-r-2 border-border last:border-r-0", HUE_CLASSES[s.hue].fill)}
          style={{ width: `${Math.round(s.fraction * 1000) / 10}%` }}
        />
      ))}
    </div>
  );
}
