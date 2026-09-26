import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { projectStops, orderedRoutePoints, type LatLng } from "@/lib/route-render";
import { HUE_CLASSES, type Hue } from "@/lib/hues";
import { CoverPhoto } from "@/components/trip/cover-photo";

/**
 * Frame for a cover used as its own standalone surface (trip Home) — kit
 * shape (2px border, hard shadow, rounded-2xl). NOT used by the trips-list
 * card (`trip-card.tsx`): there, `TripCover` sits inside the card's own top
 * section and must stay a bare, border/shadow-less fill, or the list card
 * would render two nested Card borders.
 */
export function TripCoverCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Card radius="2xl" className={cn("relative overflow-hidden bg-muted", className)}>
      {children}
    </Card>
  );
}

export interface TripCoverProps {
  tripId: string;
  name: string;
  /** True when Trip.coverImageKey is set. */
  hasCover: boolean;
  /** Located stops (lat/lng non-null), in route order. */
  stops: LatLng[];
  /** Home base coordinates — bookends the route render (start always; end too on round trip). */
  home?: LatLng | null;
  /** Whether this is a round trip (home also appended at end). */
  roundTrip?: boolean;
  /** Extra classes for the cover container (controls aspect/size). */
  className?: string;
  /** Cache-bust token for the cover URL — pass Trip.coverImageKey. A new
   *  upload generates a new key, so the img URL changes exactly when the
   *  image does and the browser's max-age cache of the old bytes is never
   *  shown for a new cover. */
  coverVersion?: string | null;
  /**
   * Monogram-fallback presentation: "initial" (default) shows one big letter;
   * "name" shows the trip name instead, for a spot (e.g. the trips-list
   * featured card) that must never boil a whole trip down to a single
   * letter. "tile" is the trip Home's cover tile (spec E2): a portrait
   * photo is shown whole with a light blur filling the tile's edges; the
   * monogram fallback shows the initial, as "initial" does.
   */
  variant?: "initial" | "name" | "tile";
  /** Trip.coverFocalX — 0–1 across the photo where its crop centres; null = centre. */
  focalX?: number | null;
  /** Trip.coverFocalY — 0–1 down the photo; null = centre. */
  focalY?: number | null;
}

function monogram(name: string): string {
  const first = name.trim()[0];
  return (first ?? "?").toUpperCase();
}

/** Decision component: photo → route-render → monogram. */
export function TripCover({ tripId, name, hasCover, stops, home, roundTrip, className, coverVersion, variant, focalX, focalY }: TripCoverProps) {
  if (hasCover) {
    const src = `/api/trips/${tripId}/cover${coverVersion ? `?v=${encodeURIComponent(coverVersion)}` : ""}`;
    return (
      <CoverPhoto
        src={src}
        alt={`${name} cover`}
        focalX={focalX}
        focalY={focalY}
        tile={variant === "tile"}
        className={className}
      />
    );
  }
  if (stops.length > 0) {
    return <RouteRender name={name} stops={stops} home={home ?? null} roundTrip={roundTrip ?? false} className={className} />;
  }
  return (
    <MonogramCover
      tripId={tripId}
      name={name}
      variant={variant === "name" ? "name" : "initial"}
      className={className}
    />
  );
}

const VIEW_W = 400;
const VIEW_H = 240;
const PAD = 28;

function RouteRender({ name, stops, home, roundTrip, className }: { name: string; stops: LatLng[]; home: LatLng | null; roundTrip: boolean; className?: string }) {
  const allPoints = orderedRoutePoints(stops, home, roundTrip);
  const pts = projectStops(allPoints, VIEW_W, VIEW_H, PAD);
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  // Determine which projected-point indices are the home node.
  // First point is home when home is set; last point is home too on a round trip.
  const homeIndices = new Set<number>();
  if (home) {
    homeIndices.add(0);
    if (roundTrip) homeIndices.add(pts.length - 1);
  }

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`${name} route`}
      className={`size-full bg-secondary text-primary ${className ?? ""}`}
    >
      {pts.length > 1 && (
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeDasharray="2 7"
          strokeLinecap="round"
          opacity={0.7}
        />
      )}
      {pts.map((p, i) =>
        homeIndices.has(i) ? (
          /* Home node: larger ringed circle to distinguish from regular stops */
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={8} fill="currentColor" opacity={0.15} />
            <circle cx={p.x} cy={p.y} r={5} fill="currentColor" />
          </g>
        ) : (
          <circle key={i} cx={p.x} cy={p.y} r={5} fill="currentColor" />
        )
      )}
    </svg>
  );
}

// The four bold accent tokens used for tinted tiles elsewhere (e.g. this
// same ramp backs components/ui/empty-state.tsx's `Tone`) — not the full
// 9-hue category ramp in lib/hues.ts.
const MONOGRAM_HUES = ["coral", "sun", "teal", "lilac"] as const;

/** Deterministic per-trip pick from MONOGRAM_HUES, so a given trip's
 *  plain-monogram cover always lands on the same one of the four. */
function monogramHue(tripId: string): (typeof MONOGRAM_HUES)[number] {
  let hash = 0;
  for (let i = 0; i < tripId.length; i++) hash = (hash * 31 + tripId.charCodeAt(i)) >>> 0;
  return MONOGRAM_HUES[hash % MONOGRAM_HUES.length];
}

function MonogramCover({
  tripId,
  name,
  variant = "initial",
  className,
}: {
  tripId: string;
  name: string;
  variant?: "initial" | "name";
  className?: string;
}) {
  const hue: Hue = monogramHue(tripId);
  return (
    <div
      className={`flex size-full items-center justify-center ${HUE_CLASSES[hue].fill} text-on-accent ${className ?? ""}`}
      aria-label={`${name} cover`}
    >
      {variant === "name" ? (
        <span className="font-display text-3xl font-extrabold select-none px-4 text-center">
          {name}
        </span>
      ) : (
        <span className="font-display text-5xl font-semibold text-on-accent/80 select-none">
          {monogram(name)}
        </span>
      )}
    </div>
  );
}
