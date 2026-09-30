import * as React from "react";
import { cn } from "@/lib/cn";
import { hueClasses } from "@/lib/hues";

export interface ChapterDividerProps {
  name: string;
  colour: string;
  summary: string;
  dragHandle?: React.ReactNode;
  actions?: React.ReactNode;
}

/**
 * A chapter's divider row (PLAN.md §1.3). Chapters no longer collapse — this
 * replaces the old collapsible group header with a plain rule: pill, rule,
 * summary, actions (e.g. a rough chapter's "Firm up" pill).
 */
export function ChapterDivider({ name, colour, summary, dragHandle, actions }: ChapterDividerProps) {
  return (
    <div className="flex items-center gap-2.5 py-1">
      {dragHandle}
      <span
        className={cn(
          "shrink-0 whitespace-nowrap rounded-full border-2 border-border px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-on-accent",
          hueClasses(colour).fill,
        )}
      >
        {name}
      </span>
      <span data-rule className="h-0.5 flex-1 bg-muted" />
      <span className="shrink-0 whitespace-nowrap text-xs font-bold text-muted-foreground">{summary}</span>
      {actions}
    </div>
  );
}
