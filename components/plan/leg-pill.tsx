"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import type { LegLabel } from "@/lib/plan/leg-label";

export interface LegRowProps {
  kind: "legs" | "missing" | "line";
  compact?: boolean;
  children?: React.ReactNode;
}

/**
 * The vertical strip between two Stops (PLAN.md §2): a connector line plus,
 * when there are legs to show, the pill(s) riding on it. Rough-to-rough gaps
 * pass no children — dashed connector only, no pill.
 */
export function LegRow({ kind, compact, children }: LegRowProps) {
  return (
    <div data-leg-kind={kind} className={cn("flex items-stretch", compact ? "min-h-10" : "min-h-[52px]")}>
      <span
        data-connector
        aria-hidden
        className={cn("shrink-0 border-l-2 border-border", compact ? "ml-5" : "ml-[26px]", kind !== "legs" && "border-dashed")}
      />
      {children ? (
        <div className={cn("flex flex-wrap items-center gap-1.5 py-2", compact ? "ml-3" : "ml-[18px]")}>{children}</div>
      ) : null}
    </div>
  );
}

export interface LegPillProps {
  label: LegLabel;
  onClick(): void;
  compact?: boolean;
}

/** A single leg on the strip: a real transport, or the dashed "missing" prompt (PLAN.md §2). */
export function LegPill({ label, onClick, compact }: LegPillProps) {
  const Icon = label.icon;
  return (
    <button
      type="button"
      aria-label={label.accessibleName}
      onClick={onClick}
      className={cn(
        "tap-target pressable inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border-2 border-border font-bold",
        compact ? "h-7 px-2.5 text-xs" : "h-[34px] px-3 text-[13px]",
        label.missing ? "border-dashed bg-background" : "bg-card",
      )}
    >
      {label.missing ? (
        compact ? (
          <>
            <Plus className="size-3.5" aria-hidden />
            <span>Add transport</span>
          </>
        ) : (
          <>
            <span>{label.label}</span>
            <span className="text-coral-text">{label.sub}</span>
          </>
        )
      ) : (
        <>
          {Icon ? <Icon className="size-4" aria-hidden /> : null}
          <span>{label.label}</span>
          {label.sub ? <span className="text-xs font-semibold text-muted-foreground tabular-nums">{label.sub}</span> : null}
        </>
      )}
    </button>
  );
}
