import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type PolaroidSize = "hero" | "small" | "mobile-hero";

/** TRIP_COVER.md §2 frame table. Frame: white, 2px ink. Inner: 2px ink, overflow hidden. */
const FRAME: Record<PolaroidSize, string> = {
  // Responsive: wears the mobile-hero frame below md, the desktop hero frame from md —
  // one Polaroid instance rather than mounting a size-specific one per breakpoint.
  hero: "w-[86px] rounded-[8px] p-[5px] pb-[14px] shadow-hard-1 rotate-[5deg] md:w-[150px] md:rounded-[10px] md:p-[7px] md:pb-[24px] md:shadow-hard-2 md:rotate-[4deg] md:mr-3 md:self-center",
  small: "w-[92px] rounded-[8px] p-[5px] pb-[14px] shadow-hard-1",
  "mobile-hero": "w-[86px] rounded-[8px] p-[5px] pb-[14px] shadow-hard-1 rotate-[5deg]",
};
const INNER: Record<PolaroidSize, string> = {
  hero: "aspect-[3/4] rounded-[3px] md:rounded-[4px]",
  small: "aspect-square rounded-[3px]",
  "mobile-hero": "aspect-[3/4] rounded-[3px]",
};
const SMALL_TILT = ["-rotate-[5deg]", "rotate-[4deg]", "-rotate-[3deg]"];

export interface PolaroidProps {
  size: PolaroidSize;
  /** Standard-card index; small frames alternate -5°, +4°, -3°. */
  index?: number;
  /** Hero only: the caption strip text (route sketch). */
  caption?: string | null;
  className?: string;
  children: ReactNode;
}

export function Polaroid({ size, index = 0, caption, className, children }: PolaroidProps) {
  return (
    <div
      data-polaroid={size}
      className={cn(
        "relative shrink-0 border-2 border-border bg-card",
        FRAME[size],
        size === "small" && SMALL_TILT[index % SMALL_TILT.length],
        className,
      )}
    >
      <div className={cn("relative overflow-hidden border-2 border-border bg-background", INNER[size])}>{children}</div>
      {size === "hero" && caption ? (
        <span aria-hidden="true" className="absolute inset-x-0 bottom-[5px] hidden truncate px-1 text-center text-[11px] font-bold text-foreground md:block">
          {caption}
        </span>
      ) : null}
    </div>
  );
}
