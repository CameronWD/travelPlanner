import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { projectStops, orderedRoutePoints, type LatLng } from "@/lib/route-render";

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
}

function monogram(name: string): string {
  const first = name.trim()[0];
  return (first ?? "?").toUpperCase();
}

/** Decision component: photo → route-render → monogram. */
export function TripCover({ tripId, name, hasCover, stops, home, roundTrip, className, coverVersion }: TripCoverProps) {
  if (hasCover) {
    const src = `/api/trips/${tripId}/cover${coverVersion ? `?v=${encodeURIComponent(coverVersion)}` : ""}`;
    return (
      // Two layers of the SAME image. The foreground is object-contain, so the
      // photo is never cropped — that was the point of 274455a, and a Traveller
      // whose cover is a portrait phone photo must not lose its top and bottom.
      // But object-contain alone left most of a landscape box as flat bg-muted,
      // because almost every cover is shot in portrait. The backdrop fills that
      // space with a blurred, dimmed copy instead of grey. Same URL as the
      // foreground, so it is one network request and one cache entry — which
      // matters for the offline warm-set.
      //
      // The backdrop is offset by a fixed 32px (-left-8/-top-8) rather than
      // scaled up, because blur-xl's fringe is a fixed 24px radius, not a
      // percentage of the box. A percentage scale (e.g. scale-110) shrinks
      // with the box and would leave that fringe visible on the shortest
      // cover (the h-36 card). 32px of margin clears the 24px radius with
      // room to spare at every box size. If either the blur radius or this
      // margin changes, check that 32 still beats the radius.
      //
      // Width/height are both given explicitly as size-[calc(100%+4rem)]
      // (100% of the box + the 32px offset on each side) rather than left
      // alone to `inset-x/-y` auto-sizing (LA-028): an absolutely positioned
      // <img> with opposite insets set but no explicit size can fall back to
      // its intrinsic aspect ratio instead of stretching to fill, leaving a
      // background-coloured gap on one axis whenever the photo's aspect
      // ratio didn't happen to match the box's.
      <div className={`relative size-full overflow-hidden bg-muted ${className ?? ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- member-gated dynamic blob, not statically optimisable */}
        <img
          src={src}
          alt=""
          aria-hidden="true"
          className="absolute -left-8 -top-8 size-[calc(100%+4rem)] max-w-none object-cover blur-xl brightness-75"
        />
        {/* eslint-disable-next-line @next/next/no-img-element -- member-gated dynamic blob, not statically optimisable */}
        <img
          src={src}
          alt={`${name} cover`}
          className="relative size-full object-contain"
        />
      </div>
    );
  }
  if (stops.length > 0) {
    return <RouteRender name={name} stops={stops} home={home ?? null} roundTrip={roundTrip ?? false} className={className} />;
  }
  return <MonogramCover tripId={tripId} name={name} className={className} />;
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
// same ramp backs components/ui/empty-state.tsx's `Tone`) — not the 9-hue
// category ramp in lib/hues.ts. Written out in full (not `from-${hue}`) so
// Tailwind's scanner sees every class; see lib/hues.ts's own comment on why.
const MONOGRAM_GRADIENTS = ["from-coral", "from-sun", "from-teal", "from-lilac"] as const;

/** Deterministic per-trip pick from MONOGRAM_GRADIENTS, so a given trip's
 *  plain-monogram cover always lands on the same one of the four. */
function monogramGradient(tripId: string): (typeof MONOGRAM_GRADIENTS)[number] {
  let hash = 0;
  for (let i = 0; i < tripId.length; i++) hash = (hash * 31 + tripId.charCodeAt(i)) >>> 0;
  return MONOGRAM_GRADIENTS[hash % MONOGRAM_GRADIENTS.length];
}

function MonogramCover({ tripId, name, className }: { tripId: string; name: string; className?: string }) {
  return (
    <div
      className={`flex size-full items-center justify-center bg-gradient-to-br ${monogramGradient(tripId)} to-muted ${className ?? ""}`}
      aria-label={`${name} cover`}
    >
      <span className="font-display text-5xl font-semibold text-on-accent/80 select-none">
        {monogram(name)}
      </span>
    </div>
  );
}
