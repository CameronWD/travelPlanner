"use client";

import { useState } from "react";
import { Map } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createMapLoader } from "@/components/ui/map-loader";
import { useMediaQuery } from "@/components/ui/use-media-query";
import { cn } from "@/lib/cn";
import type { DayMapModel } from "@/lib/day-map";

const DayMapLoader = createMapLoader<{ tripId: string; model: DayMapModel; highlightId?: string; fill?: boolean }>(() =>
  import("@/components/trip/day-map").then((m) => m.DayMap),
);

const MD_UP = "(min-width: 768px)";

export function DayMapDialog({
  open,
  onOpenChange,
  tripId,
  model,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  tripId: string;
  model: DayMapModel;
}) {
  const [highlightId, setHighlightId] = useState<string | undefined>();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="full">
        <DialogHeader>
          <DialogTitle>Day map</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3.5 lg:flex-row">
          <div className="flex min-h-0 flex-1 flex-col">
            <DayMapLoader tripId={tripId} model={model} highlightId={highlightId} fill />
          </div>
          <ol aria-label="Today's places" className="hidden w-72 shrink-0 flex-col gap-1.5 overflow-y-auto lg:flex">
            {model.points.map((point) => (
              <li key={`${point.kind}:${point.id}`}>
                <button
                  type="button"
                  onClick={() => setHighlightId(point.id)}
                  aria-pressed={highlightId === point.id}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-2.5 rounded-md border-2 border-border px-3 text-left text-sm font-bold transition-colors hover:bg-muted",
                    highlightId === point.id && "bg-muted",
                  )}
                >
                  {point.order ? <span className="text-muted-foreground">{point.order}</span> : null}
                  <span className="min-w-0 truncate">{point.label}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The Day plan card renders once per size (phone, desktop), one of them
 * CSS-hidden, so only the card that matches the viewport mounts the dialog.
 */
export function DayMapButton({ tripId, model, size }: { tripId: string; model: DayMapModel; size: "phone" | "desktop" }) {
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(() => searchParams.get("map") === "1");
  const mdUp = useMediaQuery(MD_UP);
  if (model.points.length === 0) return null;

  const mounted = mdUp !== null && (size === "desktop") === mdUp;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("map")) return;
    url.searchParams.delete("map");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" shape="pill" onClick={() => onOpenChange(true)}>
        <Map aria-hidden="true" />
        Day map
      </Button>
      {mounted ? <DayMapDialog open={open} onOpenChange={onOpenChange} tripId={tripId} model={model} /> : null}
    </>
  );
}
