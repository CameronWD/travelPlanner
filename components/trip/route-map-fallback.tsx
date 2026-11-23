import { MapPin } from "lucide-react";
import { formatDateRange } from "@/lib/dates";
import type { RouteMapStop } from "@/lib/route-map";

export function RouteStopList({ stops }: { stops: RouteMapStop[] }) {
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

export function MapFallback({ stops }: { stops: RouteMapStop[] }) {
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
