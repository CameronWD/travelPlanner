"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatStayRange, type StayStatus } from "@/lib/plan/plan-model";
import { nightsBetween, tzAbbrev } from "@/lib/dates";
import { stopHue } from "@/lib/stop-colours";
import { HUE_CLASSES } from "@/lib/hues";
import { MapLink } from "@/components/trip/map-link";
import { MoreActionsMenu, type CardActionItem } from "@/components/trip/card-actions";
import type { StopCardStop } from "@/components/plan/types";

export interface StopRowProps {
  stop: StopCardStop;
  number: number;
  open: boolean;
  onToggle(): void;
  bodyId: string;
  stay: StayStatus | null;
  plansCount: number;
  ideasCount: number;
  menuGroups: CardActionItem[][];
  dragHandle?: React.ReactNode;
  isPending?: boolean;
  children?: React.ReactNode;
}

export const STOP_ROW_GRID = "grid grid-cols-[40px_minmax(0,1fr)_auto_auto] items-center gap-3.5 px-4 py-3.5";

/** The folded stop row on desktop (PLAN.md §3). */
export function StopRow({
  stop,
  number,
  open,
  onToggle,
  bodyId,
  stay,
  plansCount,
  ideasCount,
  menuGroups,
  dragHandle,
  isPending,
  children,
}: StopRowProps) {
  const rough = !stop.arriveDate || !stop.departDate;
  const nights = !rough ? nightsBetween(stop.arriveDate as string, stop.departDate as string) : 0;
  const hasCoords = stop.lat != null && stop.lng != null;

  return (
    <article
      id={`stop-${stop.id}`}
      data-stop-id={stop.id}
      className={cn(
        "group/row relative flex-none scroll-mt-6 overflow-hidden rounded-[20px] border-2 border-border",
        rough ? "border-dashed bg-background" : "bg-card shadow-hard-4",
        isPending && "pointer-events-none opacity-60",
      )}
    >
      <div className={cn(STOP_ROW_GRID, dragHandle && "grid-cols-[auto_40px_minmax(0,1fr)_auto_auto]")}>
        {dragHandle}
        <span
          className={cn(
            "grid size-10 place-items-center rounded-xl border-2 border-border font-display text-lg font-extrabold text-on-accent",
            rough ? "border-dashed bg-muted text-foreground" : HUE_CLASSES[stopHue(stop.sortOrder)].fill,
          )}
        >
          {number}
        </span>

        <div className="min-w-0">
          <div className="flex min-w-0 items-baseline gap-2">
            <h2 className="truncate font-display text-2xl font-extrabold tracking-[-0.02em]">{stop.name}</h2>
            {stop.country && (
              <span className="shrink-0 text-[13px] font-semibold text-muted-foreground">{stop.country}</span>
            )}
            {hasCoords && (
              <MapLink
                lat={stop.lat}
                lng={stop.lng}
                label={stop.country ? `${stop.name}, ${stop.country}` : stop.name}
                className="text-muted-foreground/60"
              />
            )}
          </div>

          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {stay && stay.kind === "covered" && (
              <span
                data-chip
                className="inline-flex h-[26px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full border-2 border-border bg-teal/15 px-2.5 text-xs font-bold"
              >
                <Check className="size-3.5" aria-hidden />
                {stay.name}
              </span>
            )}
            {stay && stay.kind === "partial" && (
              <span
                data-chip
                className="inline-flex h-[26px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full border-2 border-border bg-sun/30 px-2.5 text-xs font-bold"
              >
                <Check className="size-3.5" aria-hidden />
                {stay.name} · {stay.totalNights - stay.coveredNights} {stay.totalNights - stay.coveredNights === 1 ? "night" : "nights"} open
              </span>
            )}
            {stay && stay.kind === "none" && (
              <span
                data-chip
                className="inline-flex h-[26px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full border-2 border-dashed border-border bg-coral/20 px-2.5 text-xs font-bold"
              >
                No bed yet
              </span>
            )}
            {plansCount > 0 && (
              <span
                data-chip
                className="inline-flex h-[26px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full border-2 border-border bg-card px-2.5 text-xs font-bold"
              >
                {plansCount} {plansCount === 1 ? "plan" : "plans"}
              </span>
            )}
            {ideasCount > 0 && (
              <span
                data-chip
                className="inline-flex h-[26px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full border-2 border-border bg-card px-2.5 text-xs font-bold"
              >
                {ideasCount} {ideasCount === 1 ? "idea" : "ideas"}
              </span>
            )}
          </div>

          {stop.notes && <p className="mt-1 truncate text-xs text-muted-foreground">{stop.notes}</p>}
        </div>

        <div className="flex flex-col items-end gap-1 whitespace-nowrap">
          {!rough ? (
            <>
              <span className="text-sm font-bold">
                {nights === 0 ? "Same day" : formatStayRange(stop.arriveDate as string, stop.departDate as string)}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-muted-foreground">
                  {tzAbbrev(stop.timezone, stop.arriveDate as string)}
                </span>
                {nights > 0 && (
                  <span
                    className={cn(
                      "shrink-0 whitespace-nowrap rounded-full border-2 border-border px-2 text-xs font-extrabold tabular-nums",
                      HUE_CLASSES[stopHue(stop.sortOrder)].fill,
                    )}
                  >
                    {nights}n
                  </span>
                )}
              </span>
            </>
          ) : (
            <>
              <span className="text-sm font-bold">Rough</span>
              <span className="shrink-0 whitespace-nowrap rounded-full border-2 border-dashed border-border bg-background px-2 text-xs font-extrabold tabular-nums">
                ~{stop.nights ?? 1}n
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <MoreActionsMenu
            label={`More actions for ${stop.name}`}
            groups={menuGroups}
            triggerClassName="tap-target size-9 rounded-[10px] border-2 border-border bg-card"
          />
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            aria-label={`${open ? "Fold" : "Open"} ${stop.name}`}
            onClick={onToggle}
            className={cn(
              "tap-target pressable grid size-9 place-items-center rounded-[10px] border-2 border-border transition-colors duration-[var(--dur-fast)]",
              open ? "bg-sun" : "bg-card",
            )}
          >
            <ChevronDown className={cn("size-4 transition-transform duration-[var(--dur-base)]", open && "rotate-180")} />
          </button>
        </div>
      </div>

      {open && <div id={bodyId}>{children}</div>}
    </article>
  );
}
