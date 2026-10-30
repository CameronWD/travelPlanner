"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDateRange } from "@/lib/dates";
import type { HomeMapPoint, RouteMapStop } from "@/lib/route-map";
import { useTheme } from "@/components/ui/theme-provider";
import { GoogleMapFrame } from "@/components/map/google-map-frame";
import { HtmlPin } from "@/components/map/html-pin";
import { MapPolyline } from "@/components/map/map-polyline";
import { MapUnavailable } from "@/components/map/map-unavailable";
import { useFitBounds } from "@/components/map/use-fit-bounds";
import { pinHtml } from "@/lib/map/pins";
import { routeStyles } from "@/lib/map/palette";
import { stopHex } from "@/lib/stop-colours";

export type { RouteMapStop };

export interface RouteMapProps {
  stops: RouteMapStop[];
  /** Height of the map container in px. Defaults to 360. Ignored when `aspect` is given. */
  height?: number;
  /** Optional home base point to render as a bookend pin. */
  home?: HomeMapPoint | null;
  /** When true and home is set, also draw a return leg from last stop → home. */
  showReturn?: boolean;
  /**
   * Aspect ratio for the map container. When given, the container renders
   * `aspect-ratio` instead of a fixed `height` — used for the home tile
   * (Task 13), which is wide and short rather than a fixed pixel height.
   */
  aspect?: "16/9" | "4/3";
  /** Fires with the Stop's id when its pin is clicked (Jump list / Route map dialog jumps — PLAN.md §6.1, §6.3). */
  onStopClick?: (stopId: string) => void;
  /**
   * Share page trip progress (SHARE.md §5). When given, legs into the
   * travelled stops draw solid instead of dashed, and — while "during" —
   * the current stop's pin is bigger, haloed, and tagged "They're here".
   * Undefined behaves exactly like `{ stage: "before" }`.
   */
  progress?: RouteProgress;
  /**
   * Replaces the default frame classes (`rounded-lg shadow-hard-2`) *and*
   * the inline height/aspect-ratio style — the caller supplies its own
   * height classes (e.g. `h-[200px] lg:h-[400px]`) instead.
   */
  frameClassName?: string;
  /**
   * Pin the map to one theme regardless of the app's. The Share page is
   * light-only until its dark pass is done (spec 2026-10-01 §A); without
   * this the page's CSS goes light but the tiles and pins — chosen here
   * from useTheme(), not from CSS — would still render dark.
   */
  theme?: "light" | "dark";
  /** Encoded driving routes by `${fromStopId}>${toStopId}`; a leg with one draws solid along the road instead of a straight line. */
  legPaths?: Record<string, string>;
}

export type RouteProgress =
  | { stage: "before" }
  | { stage: "during"; currentStopId: string | null }
  | { stage: "after" };

/**
 * Number of legs (stop i → i+1) that have been travelled, for `progress`.
 * Leg i is travelled iff i < the returned count.
 */
export function travelledLegCount(stopIds: string[], progress: RouteProgress | undefined): number {
  if (!progress || progress.stage === "before") return 0;
  if (progress.stage === "after") return Math.max(0, stopIds.length - 1);
  const i = progress.currentStopId ? stopIds.indexOf(progress.currentStopId) : -1;
  return Math.max(0, i);
}

/** The Stop's own hue (lib/stop-colours), by its sortOrder — same rule the calendar uses. */
const stopFill = (sortOrder: number, dark: boolean) => stopHex(sortOrder, dark);

function stopPinHtml(n: number, sortOrder: number, dark: boolean, pop = false) {
  const pin = pinHtml({ variant: "stop", fill: stopFill(sortOrder, dark), label: String(n), dark });
  return pop ? `<div class="tp-pop">${pin}</div>` : pin;
}

// The current stop, while the trip is "during" (SHARE.md §5): bigger pin,
// coral halo, and a "They're here" tag above it. `enter` plays MOTION.md S5
// on the map's build — the pin pops, the tag drops in 200ms later.
function herePinHtml(n: number, sortOrder: number, dark: boolean, desktop: boolean, enter: boolean) {
  const size = desktop ? 40 : 32;
  const pin = pinHtml({ variant: "stop", fill: stopFill(sortOrder, dark), label: String(n), dark, size });
  const tagEnter = enter ? " tp-tag-drop" : "";
  const pinEnter = enter ? " tp-pin-pop" : "";
  return `<div class="relative"><span class="absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-full border-2 border-border bg-coral px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-on-accent${tagEnter}" data-here-tag>They're here</span><div class="rounded-full shadow-[0_0_0_6px_hsl(var(--coral)/0.35)]${pinEnter}">${pin}</div></div>`;
}

// Same "home" pin (ink rounded square, "H") the Day map uses for the stay.
const homePinHtml = (dark: boolean) => pinHtml({ variant: "home", label: "H", dark });

/** Leg colour: the destination Stop's own colour. */
function legColour(sortOrder: number, dark: boolean): string {
  return stopFill(sortOrder, dark);
}

const homeLegColour = (dark: boolean) => routeStyles(dark).returnLeg.color;

/**
 * Points the map should fit its viewport to.
 *
 * Fits the located stops alone whenever there are at least two of them — the
 * home base can be far from the trip itself (LA-042), and zooming out to
 * include it would shrink the actual route to a speck. Only when there are
 * fewer than two located stops (nothing meaningful to fit to on its own) does
 * home rejoin the set, so the map still has something to frame.
 *
 * Pure, so it's unit-testable without a map.
 */
export function routeFitPoints<P extends { lat: number; lng: number }>(
  stops: P[],
  home: P | null | undefined,
): P[] {
  if (stops.length >= 2 || !home) return stops;
  return [...stops, home];
}

/**
 * Stops that have valid coordinates.
 */
function stopsWithCoords(
  stops: RouteMapStop[],
): (RouteMapStop & { lat: number; lng: number })[] {
  return stops.filter(
    (s): s is RouteMapStop & { lat: number; lng: number } =>
      typeof s.lat === "number" &&
      typeof s.lng === "number" &&
      !isNaN(s.lat) &&
      !isNaN(s.lng),
  );
}

function RouteStopList({ stops }: { stops: RouteMapStop[] }) {
  if (stops.length === 0) return null;
  return (
    <ol className="flex flex-col gap-2">
      {stops.map((stop, i) => (
        <li key={stop.id} className="flex items-baseline gap-2 text-sm">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-border bg-card text-[10px] font-extrabold tabular-nums text-foreground">
            {i + 1}
          </span>
          <span className="font-bold">{stop.name}</span>
          <span className="text-xs font-medium text-muted-foreground">
            {formatDateRange(stop.arriveDate, stop.departDate)}
          </span>
        </li>
      ))}
    </ol>
  );
}

function MapFallback({ stops }: { stops: RouteMapStop[] }) {
  return (
    <div data-map-fallback className="flex flex-col gap-4 rounded-lg border-2 border-dashed border-border-soft px-5 py-6">
      <div className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
        <MapPin className="size-4 shrink-0" aria-hidden="true" />
        <span>
          Add coordinates to your stops to see the route map.
        </span>
      </div>
      <RouteStopList stops={stops} />
    </div>
  );
}

type Point = { lat: number; lng: number };

const LEG_DRAW_MS = 700;
const easePop = (t: number) => 1 - Math.pow(1 - t, 3);

function Leg({ from, to, color, weight, opacity, dashed, draw = false }: { from: Point; to: Point; color: string; weight: number; opacity: number; dashed: boolean; draw?: boolean }) {
  // Decided at mount: a later re-render must not cut the draw short or restart it.
  const [animate] = useState(() => draw && !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [frac, setFrac] = useState(animate ? 0 : 1);

  useEffect(() => {
    if (!animate) return;
    let frame = 0;
    let start: number | null = null;
    const step = (now: number) => {
      start ??= now;
      const t = Math.min(1, (now - start) / LEG_DRAW_MS);
      setFrac(easePop(t));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [animate]);

  const path = useMemo(
    () => [
      { lat: from.lat, lng: from.lng },
      { lat: from.lat + (to.lat - from.lat) * frac, lng: from.lng + (to.lng - from.lng) * frac },
    ],
    [from.lat, from.lng, to.lat, to.lng, frac],
  );
  return <MapPolyline path={path} color={color} weight={weight} opacity={opacity} dashed={dashed} geodesic />;
}

function FitRoute({ points }: { points: Point[] }) {
  useFitBounds(points, { padding: 40 });
  return null;
}

const popupText = "block text-xs font-medium text-muted-foreground";

// ---------------------------------------------------------------------------
// Map component
// ---------------------------------------------------------------------------

export function RouteMap({ stops, height = 360, home = null, showReturn = false, aspect, onStopClick, progress, frameClassName, theme, legPaths }: RouteMapProps) {
  "use no memo";
  const { theme: appTheme } = useTheme();
  const isDark = (theme ?? appTheme) === "dark";
  // Entrances are read in render so they land in the pin HTML on first paint; the compiler would freeze that read.
  // The map remounts on a theme flip; what has already entered (stops, legs, the here pin) must not play again.
  const entrances = useRef({ done: new Set<string>(), mounted: false });
  const [openId, setOpenId] = useState<string | null>(null);

  const coordStops = stopsWithCoords(stops);
  const hasEnoughCoords = coordStops.length >= 2;

  const fitPoints = routeFitPoints(
    coordStops.map((s) => ({ lat: s.lat, lng: s.lng })),
    home ? { lat: home.lat, lng: home.lng } : null,
  );

  const travelled = travelledLegCount(coordStops.map((s) => s.id), progress);
  const currentStopId = progress?.stage === "during" ? progress.currentStopId : null;

  useEffect(() => {
    const done = entrances.current.done;
    entrances.current.mounted = true;
    coordStops.forEach((stop, i) => {
      done.add(stop.id);
      if (stop.id === currentStopId) done.add(`here:${stop.id}`);
      if (i > 0 && i - 1 < travelled) done.add(`leg:${stop.id}`);
    });
  });

  if (!hasEnoughCoords) {
    return <MapFallback stops={stops} />;
  }

  const { done: seen, mounted } = entrances.current;
  const desktop = window.matchMedia("(min-width: 1024px)").matches;
  const last = coordStops[coordStops.length - 1];
  const homeLegs = home
    ? [
        { key: "out", from: { lat: home.lat, lng: home.lng }, to: coordStops[0] },
        ...(showReturn ? [{ key: "back", from: last, to: { lat: home.lat, lng: home.lng } }] : []),
      ]
    : [];

  return (
    <GoogleMapFrame
        role="region"
        aria-label="Trip route map"
        dark={isDark}
        fallback={<MapUnavailable><RouteStopList stops={stops} /></MapUnavailable>}
        style={frameClassName ? undefined : aspect ? { aspectRatio: aspect.replace("/", " / ") } : { height }}
        className={cn("w-full overflow-hidden border-2 border-border", frameClassName ?? "rounded-lg shadow-hard-2")}
      >
        <FitRoute points={fitPoints} />
        {/* eslint-disable-next-line react-hooks/refs */}
        {coordStops.slice(1).map((stop, i) => {
          const encoded = legPaths?.[`${coordStops[i].id}>${stop.id}`];
          const opacity = i < travelled ? 0.9 : 0.7;
          return encoded ? (
            <MapPolyline key={`leg-${stop.id}`} encodedPath={encoded} color={legColour(stop.sortOrder, isDark)} weight={3} opacity={opacity} dashed={i >= travelled} />
          ) : (
            <Leg
              key={`leg-${stop.id}`}
              from={coordStops[i]}
              to={stop}
              color={legColour(stop.sortOrder, isDark)}
              weight={3}
              opacity={opacity}
              dashed={i >= travelled}
              draw={progress?.stage === "during" && i < travelled && !seen.has(`leg:${stop.id}`)}
            />
          );
        })}
        {homeLegs.map((leg) => (
          <Leg key={leg.key} from={leg.from} to={leg.to} color={homeLegColour(isDark)} weight={2} opacity={0.5} dashed />
        ))}
        {/* eslint-disable-next-line react-hooks/refs */}
        {coordStops.map((stop, index) => {
          const here = stop.id === currentStopId;
          const html = here
            ? herePinHtml(index + 1, stop.sortOrder, isDark, desktop, !seen.has(`here:${stop.id}`))
            : stopPinHtml(index + 1, stop.sortOrder, isDark, mounted && !seen.has(stop.id));
          return (
            <HtmlPin
              key={stop.id}
              position={{ lat: stop.lat, lng: stop.lng }}
              html={html}
              title={stop.name}
              onClick={() => {
                setOpenId(stop.id);
                onStopClick?.(stop.id);
              }}
              open={openId === stop.id}
              onClose={() => setOpenId(null)}
            >
              <div className="min-w-[min(140px,80vw)] max-w-[min(240px,90vw)] leading-normal">
                <strong className="block font-display text-sm font-extrabold">{stop.name}</strong>
                {stop.chapterName && <span className="block text-xs font-semibold text-muted-foreground">{stop.chapterName}</span>}
                <span className={popupText}>{formatDateRange(stop.arriveDate, stop.departDate)}</span>
              </div>
            </HtmlPin>
          );
        })}
        {home && (
          <HtmlPin
            position={{ lat: home.lat, lng: home.lng }}
            html={homePinHtml(isDark)}
            title={home.name}
            onClick={() => setOpenId("home")}
            open={openId === "home"}
            onClose={() => setOpenId(null)}
          >
            <div className="min-w-[min(120px,80vw)] max-w-[min(200px,90vw)] leading-normal">
              <strong className="block font-display text-sm font-extrabold">{home.name}</strong>
              <span className={popupText}>Home base</span>
            </div>
          </HtmlPin>
        )}
    </GoogleMapFrame>
  );
}
