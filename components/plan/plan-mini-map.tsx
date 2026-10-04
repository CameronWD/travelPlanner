"use client";

import * as React from "react";
import { MapIcon, Maximize2 } from "lucide-react";
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

export interface PlanMapButtonProps {
  stops: RouteMapStop[];
  home: HomeMapPoint | null;
}

/**
 * The rail's Route map button card (spec 2026-10-04 §C — it replaced the
 * 210px mini map tile, giving its height to the Fit tile and Jump list).
 * Opens PlanMapDialog, where a pin click jumps the main column to that Stop.
 * Nothing under two located Stops: there's no route to show, and the rail
 * slot around it is `empty:hidden`.
 */
export function PlanMapButton({ stops, home }: PlanMapButtonProps) {
  const [open, setOpen] = React.useState(false);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  // PlanMapDialog is a plain controlled Dialog, not a DialogTrigger — Radix's
  // own close-focus restore only knows about a DialogTrigger ref, so without
  // this it drops focus to <body> on close. Track "was it open" rather than
  // reacting to every `open` change, so mount (open starts false) never steals
  // focus from whatever the page already had focused.
  const wasOpenRef = React.useRef(false);
  React.useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      buttonRef.current?.focus();
    }
  }, [open]);

  if (locatedCount(stops) < 2) return null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(true)}
        className="pressable flex w-full items-center gap-2.5 rounded-[22px] border-2 border-border bg-card px-3.5 py-3 text-left shadow-hard-4"
      >
        <MapIcon className="size-5 shrink-0" aria-hidden="true" />
        <span className="flex-1 font-display text-base font-extrabold">Route map</span>
        <Maximize2 className="size-4 shrink-0" aria-hidden="true" />
      </button>
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

/**
 * The Route map (PLAN.md §6.1; spec 2026-10-04 §C): near-full-screen from sm
 * (92vw × 92vh), full-screen on a phone, the map filling it. The rail's Route
 * map button and the phone Fit strip's Map open it.
 */
export function PlanMapDialog({ open, onOpenChange, stops, home }: PlanMapDialogProps) {
  const { jumpTo } = usePlanBody();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="full">
        <DialogHeader>
          <DialogTitle>Route map</DialogTitle>
        </DialogHeader>
        {/* frameClassName drops RouteMap's fixed height: the map takes what the
            stretched body has left (DialogContent size="full"), never under
            240px — a short window scrolls the body instead. */}
        <RouteMapLoader
          stops={stops}
          home={home}
          frameClassName="min-h-[240px] flex-1 rounded-lg shadow-hard-2"
          onStopClick={(id) => {
            onOpenChange(false);
            jumpTo(id);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
