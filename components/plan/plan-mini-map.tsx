"use client";

import * as React from "react";
import { Maximize2, ArrowUpRight } from "lucide-react";
import { RouteMapLoader } from "@/components/trip/route-map-loader";
import type { RouteMapStop } from "@/components/trip/route-map";
import type { HomeMapPoint } from "@/lib/route-map";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePlanBody } from "./plan-body";

function locatedCount(stops: RouteMapStop[]): number {
  return stops.filter(
    (s) => typeof s.lat === "number" && typeof s.lng === "number" && !Number.isNaN(s.lat) && !Number.isNaN(s.lng),
  ).length;
}

export interface PlanMiniMapProps {
  stops: RouteMapStop[];
  home: HomeMapPoint | null;
  /** Home is far from the trip (LA-042) — the full map excludes it from its fit, so the tile shows a quiet pill instead of drawing it small and wrong. */
  farHome: { name: string } | null;
}

/**
 * Rail mini map (PLAN.md §6.1): the existing RouteMap, compact, with an
 * "Open map ⤢" overlay that opens the full-size PlanMapDialog. A pin click
 * jumps the main column to that Stop, the same as a Jump list row.
 */
export function PlanMiniMap({ stops, home, farHome }: PlanMiniMapProps) {
  const { jumpTo } = usePlanBody();
  const [open, setOpen] = React.useState(false);

  if (locatedCount(stops) < 2) return null;

  return (
    <>
      {/* `isolate`: the z-[500] overlays below must not leak above the z-50 dialog layer (spec 2026-10-01 §C). */}
      <div className="relative isolate h-[210px] overflow-hidden rounded-[22px] border-2 border-border shadow-hard-4">
        <RouteMapLoader stops={stops} height={206} home={farHome ? null : home} onStopClick={jumpTo} />
        <button
          type="button"
          className="pressable absolute bottom-2 right-2 z-[500] inline-flex h-7 items-center gap-1 rounded-full border-2 border-border bg-card px-2.5 text-xs font-bold"
          onClick={() => setOpen(true)}
        >
          Open map <Maximize2 className="size-3.5" aria-hidden="true" />
        </button>
        {farHome && (
          <span className="absolute bottom-2 left-2 z-[500] inline-flex h-7 items-center gap-1 rounded-full border-2 border-border bg-card px-2.5 text-xs font-bold">
            + {farHome.name} <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </span>
        )}
      </div>
      <PlanMapDialog open={open} onOpenChange={setOpen} stops={stops} home={home} />
    </>
  );
}

export interface PlanMapDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  stops: RouteMapStop[];
  home: HomeMapPoint | null;
}

/** The full-size route map (PLAN.md §6.1) — the mini map's "Open map" overlay, and Task 21's other entry points, open this. */
export function PlanMapDialog({ open, onOpenChange, stops, home }: PlanMapDialogProps) {
  const { jumpTo } = usePlanBody();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:rounded-none">
        <DialogHeader>
          <DialogTitle>Route map</DialogTitle>
        </DialogHeader>
        <RouteMapLoader
          stops={stops}
          height={480}
          home={home}
          onStopClick={(id) => {
            onOpenChange(false);
            jumpTo(id);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
