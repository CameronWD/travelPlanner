"use client";

/**
 * Collapsible panel that wraps the DayMap.
 *
 * - Renders nothing when model.points is empty (nothing to show).
 * - Toggle button mounts/unmounts DayMap so Leaflet only loads when opened.
 * - variant "tile" (desktop Travelling Home, spec D): always expanded — an
 *   h2 "Day map" over the mounted map, no toggle — and it keeps its grid
 *   cell with a quiet line on a day with nothing to map.
 */

import { useState } from "react";
import { Map } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { DayMapModel } from "@/lib/day-map";
import { DayMap } from "./day-map";
import { useMapMount, type MapMountWhen } from "@/components/ui/map-loader";

export function DayMapPanel({
  tripId,
  model,
  variant = "panel",
  mountWhen = true,
}: {
  tripId: string;
  model: DayMapModel;
  variant?: "panel" | "tile";
  /** Spec 2026-10-06 §D: the tile's breakpoint; elsewhere Leaflet never loads. */
  mountWhen?: MapMountWhen;
}) {
  const [open, setOpen] = useState(false);
  const showTile = useMapMount(mountWhen);

  if (variant === "tile") {
    return (
      <Card radius="xl" shadow={3} className="flex h-full min-h-0 flex-col p-5">
        <h2 className="flex items-center gap-2 font-display text-lg font-extrabold leading-tight tracking-[-0.03em]">
          <Map className="size-[18px] shrink-0" aria-hidden="true" />
          Day map
        </h2>
        {model.points.length === 0 ? (
          <p className="mt-3 text-sm font-semibold text-muted-foreground">Nothing to map today</p>
        ) : (
          <div className="mt-3 min-h-0 flex-1">{showTile ? <DayMap tripId={tripId} model={model} /> : null}</div>
        )}
      </Card>
    );
  }

  if (model.points.length === 0) return null;

  return (
    <Card>
      <div className="px-4 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-h-11 items-center gap-2 rounded-md text-[13px] font-extrabold text-foreground transition-colors hover:text-muted-foreground"
        >
          <Map className="size-4 shrink-0" aria-hidden="true" />
          {open ? "Hide day map" : "Show day map"}
        </button>
      </div>
      {open && (
        <div className="px-4 pb-4">
          <DayMap tripId={tripId} model={model} />
        </div>
      )}
    </Card>
  );
}
