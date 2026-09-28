"use client";

import * as React from "react";
import Link from "next/link";
import { useAppRouter } from "@/components/navigation/use-app-router";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/cn";
import { clusterLabel, clusterStops } from "@/lib/geo-cluster";
import { HUE_CLASSES, type Hue } from "@/lib/hues";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorPanel } from "@/components/ui/error-panel";
import { RouteMapTileCanvas, type MapView } from "./route-map-tile-canvas";

export interface RouteMapTileStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  countryCode: string | null;
  nights: number;
  /** The Stop's own colour (lib/stop-colours stopHue). */
  stopColour: Hue;
  /** Position in plan order, 1-based — the pin's number. */
  number: number;
  /** Inset-card line: "4 nights · then Paris". */
  nextLine: string;
}

export interface RouteMapTileProps {
  /** Located Stops, in plan order. */
  stops: RouteMapTileStop[];
  tripId: string;
  /** How many real-plan Stops exist, located or not (tunes the empty state). */
  stopCount?: number;
}

/** Most outlying Stops shown as inset cards; the rest are reachable via "Whole trip". */
const MAX_INSETS = 3;

/**
 * The main geographic cluster (largest group of Stops within 1500km of each
 * other — never called a chapter) and the Stops outside it. Pure.
 */
export function routeMapModel(stops: RouteMapTileStop[]) {
  const clusters = clusterStops(stops);
  const main = clusters[0] ?? [];
  const mainIds = new Set(main.map((s) => s.id));
  const outlying = stops.filter((s) => !mainIds.has(s.id));
  const chip = `${clusterLabel(main)} · ${main.length} ${main.length === 1 ? "stop" : "stops"}`;
  return { main, mainIds: [...mainIds], outlying, chip };
}

class MapErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <ErrorPanel
          layout="card"
          headingLevel={3}
          title="The map didn’t load"
          description="The rest of your Home still works."
          className="absolute inset-4 justify-center border-0 bg-transparent px-4 py-4"
        />
      );
    }
    return this.props.children;
  }
}

// Hit area grows to 44px without growing the chip (spec §10).
const HIT = "relative after:absolute after:-inset-x-0 after:-inset-y-1.5 after:content-['']";

/**
 * Desktop Home Route map tile (spec 2026-09-27-desktop-home §6, amended by
 * beta-feedback §C). Fits the largest geographic cluster by default; Stops
 * outside it become inset cards (click pans). Chips switch the viewport:
 * Route (main cluster, with the route line) · "{Continent|Country} · N stops"
 * (selected by default, pins only) · Whole trip. Pin click → the Plan at
 * that Stop (`#stop-<id>`).
 */
export function RouteMapTile({ stops, tripId, stopCount }: RouteMapTileProps) {
  const router = useAppRouter();
  const [view, setView] = React.useState<MapView>("cluster");
  const [focus, setFocus] = React.useState<{ id: string; seq: number } | null>(null);

  if (stops.length === 0) {
    const hasUnlocated = (stopCount ?? 0) > 0;
    return (
      <Card radius="xl" shadow={3} className="flex h-full min-h-0 flex-col overflow-hidden p-4">
        <h2 className="sr-only">Route map</h2>
        <EmptyState
          icon={MapPin}
          tone="teal"
          className="flex-1"
          title="Add your first stop"
          description={
            hasUnlocated
              ? "Give your stops a location and we'll draw the route."
              : "We'll draw the route as you go."
          }
          action={
            <Link
              href={`/trips/${tripId}/plan?add=stop`}
              className="inline-flex min-h-11 items-center rounded-full border-2 border-border bg-primary px-4 text-sm font-bold text-primary-foreground shadow-hard-2"
            >
              + Add a stop
            </Link>
          }
        />
      </Card>
    );
  }

  const { mainIds, outlying, chip } = routeMapModel(stops);
  const chips: { value: MapView; label: string }[] = [
    { value: "route", label: "Route" },
    { value: "cluster", label: chip },
    { value: "whole", label: "Whole trip" },
  ];

  return (
    <Card radius="xl" shadow={3} className="relative h-full min-h-0 overflow-hidden">
      <h2 className="sr-only">Route map</h2>
      <MapErrorBoundary>
        <RouteMapTileCanvas
          stops={stops}
          mainIds={mainIds}
          view={view}
          focus={focus}
          onPinClick={(id) => router.push(`/trips/${tripId}/plan#stop-${id}`)}
        />
      </MapErrorBoundary>

      <div role="group" aria-label="Map view" className="absolute left-4 top-4 z-10 flex flex-wrap gap-2">
        {chips.map((c) => {
          const selected = view === c.value;
          return (
            <button
              key={c.value}
              type="button"
              aria-pressed={selected}
              onClick={() => setView(c.value)}
              className={cn(
                HIT,
                "rounded-full border-2 border-border px-3 py-1.5 text-[13px] font-bold shadow-hard-1",
                selected ? "bg-primary text-primary-foreground" : "bg-card text-foreground",
              )}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {outlying.length > 0 ? (
        <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
          {outlying.slice(0, MAX_INSETS).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setFocus((f) => ({ id: s.id, seq: (f?.seq ?? 0) + 1 }))}
              aria-label={`Show ${s.name} on the map`}
              className="flex w-[190px] items-start gap-2.5 rounded-[16px] border-2 border-border bg-card p-3 text-left shadow-hard-1"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-extrabold",
                  HUE_CLASSES[s.stopColour].chip,
                )}
              >
                {s.number}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-bold">{s.name}</span>
                <span className="text-xs text-muted-foreground">{s.nextLine}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <p className="pointer-events-none absolute bottom-3 left-4 z-10 text-[11px] font-semibold text-muted-foreground">
        © OpenStreetMap · CARTO
      </p>
    </Card>
  );
}
