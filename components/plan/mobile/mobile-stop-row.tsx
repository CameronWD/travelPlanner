"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDateRangeCompact, nightsBetween } from "@/lib/dates";
import { stopHue } from "@/lib/stop-colours";
import { HUE_CLASSES } from "@/lib/hues";
import type { StayStatus } from "@/lib/plan/plan-model";
import type { StopCardStop } from "@/components/plan/types";

export interface MobileStopRowProps {
  stop: StopCardStop;
  number: number;
  stay: StayStatus | null;
  plansCount: number;
  onOpen(): void;
  dragProps?: React.HTMLAttributes<HTMLButtonElement>;
}

/** The mobile Plan list's stop row (PLAN.md §7.1): a whole-row tap target that
 * opens the stop sheet (Task 18). Rough rows are long-pressed to reorder
 * (spec D7) via `dragProps`, spread straight onto the button. */
export function MobileStopRow({ stop, number, stay, plansCount, onOpen, dragProps }: MobileStopRowProps) {
  const rough = !stop.arriveDate || !stop.departDate;
  const nights = !rough ? nightsBetween(stop.arriveDate as string, stop.departDate as string) : 0;

  return (
    <button
      type="button"
      id={`m-stop-${stop.id}`}
      data-mobile-stop-id={stop.id}
      aria-label={`Open ${stop.name}`}
      onClick={onOpen}
      {...dragProps}
      className={cn(
        "pressable flex min-h-16 w-full scroll-mt-6 items-center gap-3 rounded-[18px] border-2 border-border px-3 py-2.5 text-left",
        rough ? "border-dashed bg-background" : "bg-card shadow-hard-3",
      )}
    >
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-xl border-2 border-border font-display text-base font-extrabold text-on-accent",
          rough ? "border-dashed bg-muted text-foreground" : HUE_CLASSES[stopHue(stop.sortOrder)].fill,
        )}
      >
        {number}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-[19px] font-extrabold">{stop.name}</span>
        <span
          className={cn(
            "block truncate text-xs font-semibold",
            stay?.kind === "none" ? "text-coral-text" : "text-muted-foreground",
          )}
        >
          {summaryContent(rough, stay, plansCount)}
        </span>
      </span>

      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-sm font-extrabold tabular-nums">
          {rough ? "Rough" : formatDateRangeCompact(stop.arriveDate as string, stop.departDate as string)}
        </span>
        <span
          className={cn(
            "shrink-0 whitespace-nowrap rounded-full border-2 px-2 text-xs font-extrabold tabular-nums",
            rough ? "border-dashed border-border bg-background" : cn("border-border", HUE_CLASSES[stopHue(stop.sortOrder)].fill),
          )}
        >
          {rough ? `~${stop.nights ?? 1}n` : `${nights}n`}
        </span>
      </span>
    </button>
  );
}

function summaryContent(rough: boolean, stay: StayStatus | null, plansCount: number): React.ReactNode {
  if (rough) return "Drag to reorder";
  if (!stay) return plansCount > 0 ? `${plansCount} plans` : "";
  if (stay.kind === "none") {
    return plansCount > 0 ? `No bed yet · ${plansCount} plans` : "No bed yet";
  }
  // covered or partial
  return (
    <>
      <Check className="inline size-3" aria-hidden /> {stay.name}
      {plansCount > 0 ? ` · ${plansCount} plans` : ""}
    </>
  );
}
