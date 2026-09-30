"use client";

import { Sheet, SheetTitle } from "@/components/ui/sheet";
import { DragSheetContent } from "./drag-sheet-content";
import { HUE_CLASSES, type Hue } from "@/lib/hues";
import { cn } from "@/lib/cn";
import type { CardActionItem } from "@/components/trip/card-actions";

/**
 * The mobile ⋯ actions sheet for a stop card (PLAN.md §7.6) — the same
 * `groups` that feed the desktop `MoreActionsMenu`, laid out as one bordered
 * card per group with 48px rows instead of a dropdown.
 */
export function StopActionsSheet({
  open,
  onOpenChange,
  number,
  hue,
  rough,
  name,
  meta,
  groups,
}: {
  open: boolean;
  onOpenChange(o: boolean): void;
  number: number;
  hue: Hue;
  rough: boolean;
  name: string;
  meta: string;
  groups: CardActionItem[][];
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <DragSheetContent hideCloseIcon onDismiss={() => onOpenChange(false)}>
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-xl border-2 border-border font-display text-lg font-extrabold",
              rough ? "border-dashed bg-muted" : HUE_CLASSES[hue].fill,
            )}
          >
            {number}
          </div>
          <div className="min-w-0 flex-1">
            <SheetTitle className="font-display text-[28px] leading-none">{name}</SheetTitle>
            {meta && <p className="text-xs font-semibold text-muted-foreground">{meta}</p>}
          </div>
        </div>
        {groups.map((group, i) => (
          <div
            key={i}
            role="group"
            aria-label={`Actions ${i + 1}`}
            className="flex flex-col divide-y-2 divide-muted overflow-hidden rounded-[14px] border-2 border-border bg-card"
          >
            {group.map((item) => (
              <button
                key={item.key}
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  onOpenChange(false);
                  item.onSelect();
                }}
                className={cn(
                  "flex min-h-12 w-full items-center gap-3 px-3.5 text-left text-sm font-bold disabled:opacity-45",
                  item.destructive && "text-coral-text",
                )}
              >
                {item.icon}
                <span className="flex-1">{item.label}</span>
                {item.hint && (
                  <span className="max-w-[40%] text-right text-xs font-semibold text-muted-foreground">
                    {item.hint}
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
      </DragSheetContent>
    </Sheet>
  );
}
