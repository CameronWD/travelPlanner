"use client";

/**
 * Collapsible panel that wraps the DayMap.
 *
 * - Renders nothing when model.points is empty (nothing to show).
 * - Toggle button mounts/unmounts DayMap so Leaflet only loads when opened.
 */

import { useState } from "react";
import { Map } from "lucide-react";
import { cn } from "@/lib/cn";
import type { DayMapModel } from "@/lib/day-map";
import { DayMap } from "./day-map";

export function DayMapPanel({
  tripId,
  model,
}: {
  tripId: string;
  model: DayMapModel;
}) {
  const [open, setOpen] = useState(false);

  if (model.points.length === 0) return null;

  return (
    <div className={cn("rounded-2xl border border-border bg-card shadow-sm")}>
      <div className="px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
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
    </div>
  );
}
