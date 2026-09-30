"use client";

import * as React from "react";
import { BookOpen, Plus, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TAB_BAR_MENU_COLLISION_PADDING } from "@/components/ui/tab-bar";
import { AiBookingParser } from "@/components/trip/ai-booking-parser";
import type { RouteMapStop } from "@/components/trip/route-map";
import type { HomeMapPoint } from "@/lib/route-map";
import type { PlanSummary } from "@/lib/plan-overview";
import { FitStrip } from "./fit-tile";
import { PlanMapDialog } from "./plan-mini-map";
import { usePlanBody } from "./plan-body";

interface PlanExtrasProps {
  tripId: string;
  chaptersEnabled: boolean;
  aiConfigured: boolean;
}

/** Chapters on/off lives in Settings (Task 21a), so this menu only exists while they're on. */
function ChaptersMenu() {
  const { actions } = usePlanBody();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="md">
          <BookOpen aria-hidden="true" />
          Chapters
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" collisionPadding={TAB_BAR_MENU_COLLISION_PADDING}>
        <DropdownMenuItem onSelect={actions.newChapter}>
          <BookOpen className="size-4" aria-hidden="true" />
          New Chapter
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={actions.suggestChapters}>
          <Wand2 className="size-4" aria-hidden="true" />
          Suggest from countries
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PasteBookingButton({ tripId }: { tripId: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="outline" size="md" onClick={() => setOpen(true)}>
        Paste a booking
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Paste a booking</DialogTitle>
          </DialogHeader>
          <AiBookingParser tripId={tripId} aiConfigured />
        </DialogContent>
      </Dialog>
    </>
  );
}

/** PLAN.md §1.1 header pills: Chapters · Paste a booking · the ink "Add a stop". */
export function PlanHeaderActions({ tripId, chaptersEnabled, aiConfigured }: PlanExtrasProps) {
  return (
    <>
      {chaptersEnabled && <ChaptersMenu />}
      {aiConfigured && <PasteBookingButton tripId={tripId} />}
      <PlanAddStopButton variant="primary" />
    </>
  );
}

export function PlanAddStopButton({ variant }: { variant: "round" | "primary" }) {
  const { actions } = usePlanBody();
  if (variant === "primary") {
    return (
      <Button variant="primary" size="md" onClick={actions.addStop}>
        <Plus aria-hidden="true" />
        Add a stop
      </Button>
    );
  }
  return (
    <button
      type="button"
      aria-label="Add a stop"
      onClick={actions.addStop}
      className="pressable grid size-11 place-items-center rounded-full border-2 border-border bg-foreground text-background shadow-cta"
    >
      <Plus className="size-5" aria-hidden="true" />
    </button>
  );
}

/** Below lg, PageHeader drops its pills, so Chapters and Paste a booking sit after the list instead (deviation 6). */
export function PlanMobileExtras({ tripId, chaptersEnabled, aiConfigured }: PlanExtrasProps) {
  if (!chaptersEnabled && !aiConfigured) return null;
  return (
    <div className="flex flex-wrap gap-2 lg:hidden">
      {chaptersEnabled && <ChaptersMenu />}
      {aiConfigured && <PasteBookingButton tripId={tripId} />}
    </div>
  );
}

/** PLAN.md §7.1 mobile Fit strip, with its Map button opening the full route map. */
export function PlanFitStrip({
  summary,
  stops,
  home,
}: {
  summary: PlanSummary;
  stops: RouteMapStop[];
  home: HomeMapPoint | null;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <FitStrip summary={summary} onOpenMap={stops.length >= 2 ? () => setOpen(true) : undefined} />
      <PlanMapDialog open={open} onOpenChange={setOpen} stops={stops} home={home} />
    </>
  );
}
