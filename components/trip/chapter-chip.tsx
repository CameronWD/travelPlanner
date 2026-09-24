import * as React from "react";
import { cn } from "@/lib/cn";
import { chapterColourMeta } from "@/lib/chapter-colours";

interface ChapterChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  name: string;
  colour: string;
}

export function ChapterChip({ name, colour, className, ...props }: ChapterChipProps) {
  const meta = chapterColourMeta(colour);
  return (
    <span
      className={cn(
        // Kit Chip, size m: the 2px ink outline + hue fill come from HUE_CLASSES[hue].chip.
        "inline-flex min-h-6 max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold leading-tight",
        meta.chipClass,
        className,
      )}
      {...props}
    >
      <span
        data-testid="chapter-chip-dot"
        aria-hidden="true"
        className={cn("size-2 shrink-0 rounded-full", meta.dotClass)}
      />
      <span className="min-w-0 truncate">{name}</span>
    </span>
  );
}
