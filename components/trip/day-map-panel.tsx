"use client";

/**
 * Collapsible panel that wraps the DayMap.
 *
 * - Renders nothing when model.points is empty (nothing to show).
 * - Toggle button mounts/unmounts DayMap so Leaflet only loads when opened.
 */

import { useState } from "react";
import { Map } from "lucide-react";
import { Card } from "@/components/ui/card";
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
