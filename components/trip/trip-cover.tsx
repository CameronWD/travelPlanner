import { projectStops, type LatLng } from "@/lib/route-render";

export interface TripCoverProps {
  tripId: string;
  name: string;
  /** True when Trip.coverImageKey is set. */
  hasCover: boolean;
  /** Located stops (lat/lng non-null), in route order. */
  stops: LatLng[];
  /** Extra classes for the cover container (controls aspect/size). */
  className?: string;
}

function monogram(name: string): string {
  const first = name.trim()[0];
  return (first ?? "?").toUpperCase();
}

/** Decision component: photo → route-render → monogram. */
export function TripCover({ tripId, name, hasCover, stops, className }: TripCoverProps) {
  if (hasCover) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- member-gated dynamic blob, not statically optimisable
      <img
        src={`/api/trips/${tripId}/cover`}
        alt={`${name} cover`}
        className={`size-full object-cover ${className ?? ""}`}
      />
    );
  }
  if (stops.length > 0) {
    return <RouteRender name={name} stops={stops} className={className} />;
  }
  return <MonogramCover name={name} className={className} />;
}

const VIEW_W = 400;
const VIEW_H = 240;
const PAD = 28;

function RouteRender({ name, stops, className }: { name: string; stops: LatLng[]; className?: string }) {
  const pts = projectStops(stops, VIEW_W, VIEW_H, PAD);
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid slice"
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
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={5} fill="currentColor" />
      ))}
    </svg>
  );
}

function MonogramCover({ name, className }: { name: string; className?: string }) {
  return (
    <div
      className={`flex size-full items-center justify-center bg-gradient-to-br from-secondary to-muted ${className ?? ""}`}
      aria-label={`${name} cover`}
    >
      <span className="font-display text-5xl font-semibold text-primary/70 select-none">
        {monogram(name)}
      </span>
    </div>
  );
}
