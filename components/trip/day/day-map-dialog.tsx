"use client";

import { useContext, useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Map } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createMapLoader } from "@/components/ui/map-loader";
import { useMediaQuery } from "@/components/ui/use-media-query";
import { DayRouteButtons } from "@/components/trip/day-route-buttons";
import { cn } from "@/lib/cn";
import { dayFromPathname } from "@/lib/day-path";
import { recordUsageAction } from "@/lib/usage/client";
import { DayPanelContext, useIsDayInView } from "@/components/trip/day/day-carousel";
import type { DayMapModel, DayMapPoint } from "@/lib/day-map";
import { travelPhrase } from "@/lib/travel-times/phrase";

const DayMapLoader = createMapLoader<{ tripId: string; model: DayMapModel; highlightId?: string; fill?: boolean }>(() =>
  import("@/components/trip/day-map").then((m) => m.DayMap),
);

const MD_UP = "(min-width: 768px)";

// The URL is the one source of truth for "the Day map is open", so the two
// Day plan cards (one CSS-hidden) can never disagree about it.
const mapParamListeners = new Set<() => void>();

function subscribeMapParam(listener: () => void) {
  mapParamListeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    mapParamListeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

const mapParamOpen = () => new URLSearchParams(window.location.search).get("map") === "1";

function setMapParam(open: boolean) {
  const url = new URL(window.location.href);
  if (open) url.searchParams.set("map", "1");
  else url.searchParams.delete("map");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  mapParamListeners.forEach((l) => l());
}

function placeRows(model: DayMapModel) {
  const key = (p: DayMapPoint) => `${p.kind}:${p.id}`;
  const onRoute = new Set(model.routePoints.map(key));
  const ordered = [...model.routePoints, ...model.points.filter((p) => !onRoute.has(key(p)))];
  const seen = new Set<string>();
  return ordered
    .filter((p) => !seen.has(key(p)) && seen.add(key(p)))
    .map((point, i) => {
      const prev = i > 0 && i < model.routePoints.length ? ordered[i - 1] : undefined;
      const hop = prev ? model.hops?.find((h) => h.fromId === prev.id && h.toId === point.id) : undefined;
      return { point, time: hop && hop.minutes != null && hop.mode != null ? travelPhrase({ minutes: hop.minutes, mode: hop.mode, estimated: hop.estimated }) : null };
    });
}

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
  const rows = placeRows(model);
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
          <div data-testid="places-column" className="hidden w-72 shrink-0 flex-col gap-3 lg:flex">
            <ol aria-label="Today’s places" className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-1.5">
              {rows.map(({ point, time }) => (
                <li key={`${point.kind}:${point.id}`} className="flex flex-col gap-1">
                  {time ? <p className="px-3 text-xs font-semibold text-muted-foreground">{time}</p> : null}
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
            <DayRouteButtons routePoints={model.routePoints} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The Day plan card renders once per size (phone, desktop), one of them
 * CSS-hidden, so only the card that matches the viewport mounts the dialog.
 * In the carousel only the day in view mounts it, which a settle changes
 * before the page's own date (`shown`) catches up (ADR 0065).
 */
export function DayMapButton({ tripId, model, size, shown = true }: { tripId: string; model: DayMapModel; size: "phone" | "desktop"; shown?: boolean }) {
  const paramOpen = useSyncExternalStore(subscribeMapParam, mapParamOpen, () => false);
  const mdUp = useMediaQuery(MD_UP);
  const inView = useIsDayInView() ?? shown;
  // Between a swipe's settle and its landing the address is still the day
  // before's, and Next folds a replaceState into its router, undoing the
  // navigation in flight. So the map opens at once and ?map=1 waits for the landing.
  const day = useContext(DayPanelContext);
  const addressDay = dayFromPathname(usePathname() ?? "");
  const landed = day == null || addressDay === day;
  const [asked, setAsked] = useState(false);
  if (asked && !inView) setAsked(false);
  useEffect(() => {
    if (asked && landed) setMapParam(true);
  }, [asked, landed]);
  if (model.points.length === 0) return null;

  const mounted = inView && mdUp !== null && (size === "desktop") === mdUp;
  const setOpen = (open: boolean) => {
    setAsked(open && !landed);
    if (landed) setMapParam(open);
  };

  return (
    <>
      <Button type="button" variant="secondary" size="sm" shape="pill" onClick={() => {
          recordUsageAction("day-map-opened");
          setOpen(true);
        }}>
        <Map aria-hidden="true" />
        Day map
      </Button>
      {mounted ? <DayMapDialog open={paramOpen || asked} onOpenChange={setOpen} tripId={tripId} model={model} /> : null}
    </>
  );
}
