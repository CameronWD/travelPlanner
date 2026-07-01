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
        "inline-flex max-w-full items-center rounded-full border px-2.5 py-0.5 text-xs font-medium truncate",
        meta.chipClass,
        className,
      )}
      {...props}
    >
      {name}
    </span>
  );
}
