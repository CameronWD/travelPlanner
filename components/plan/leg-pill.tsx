"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import type { LegLabel } from "@/lib/plan/leg-label";

export interface LegRowProps {
  kind: "legs" | "missing" | "line";
  compact?: boolean;
  children?: React.ReactNode;
  /**
   * Spec 2026-10-05 §F: per child, the change-over place shown by its station
   * dot (`changeoverPlaces` in lib/plan/leg-label). Null/absent = nothing.
   */
  changeovers?: readonly (string | null)[];
}

/**
 * The vertical strip between two Stops (PLAN.md §2): a connector line plus,
 * when there are legs to show, the pill(s) riding on it — stacked one per
 * line in travel order, metro-style, each beside a station dot on the
 * connector (spec 2026-10-05 §F). Rough-to-rough gaps pass no children —
 * dashed connector only, no pill. The missing prompt gets no dot.
 */
export function LegRow({ kind, compact, children, changeovers }: LegRowProps) {
  const stations = React.Children.toArray(children);
  return (
    <div data-leg-kind={kind} className={cn("flex items-stretch", compact ? "min-h-10" : "min-h-[52px]")}>
      <span
        data-connector
        aria-hidden
        className={cn("shrink-0 border-l-2 border-border", compact ? "ml-5" : "ml-[26px]", kind !== "legs" && "border-dashed")}
      />
      {stations.length > 0 ? (
        <div data-leg-stack className={cn("flex min-w-0 flex-col items-start gap-1.5 py-2", compact ? "ml-3" : "ml-[18px]")}>
          {stations.map((node, i) => {
            const changeover = changeovers?.[i] ?? null;
            return (
              <div
                key={React.isValidElement(node) && node.key != null ? node.key : i}
                data-leg-station
                className="flex flex-col items-start gap-0.5"
              >
                {changeover ? (
                  <span data-changeover className="text-[11px] font-semibold leading-tight text-muted-foreground">
                    Change at {changeover}
                  </span>
                ) : null}
                <div className="relative">
                  {kind === "legs" ? (
                    // Centred on the connector: compact line centre is 21px from
                    // the row's left, the stack starts at 34px (ml-5 + 2px + ml-3);
                    // desktop 27px vs 46px (ml-[26px] + 2px + ml-[18px]).
                    <span
                      data-station-dot
                      aria-hidden
                      className={cn(
                        "absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-border bg-card",
                        compact ? "left-[-13px]" : "left-[-19px]",
                      )}
                    />
                  ) : null}
                  {node}
                </div>
              </div>
            );
          })}
        </div>
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
        "group tap-target pressable inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border-2 border-border font-bold",
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
            {/* MOTION.md P8 (optional): the Add label nudges on hover; no dash animation. */}
            <span className="inline-block text-coral-text transition-transform duration-[var(--dur-fast)] group-hover:translate-x-0.5">{label.sub}</span>
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
