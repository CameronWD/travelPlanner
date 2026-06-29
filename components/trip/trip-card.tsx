import * as React from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { PhaseDescription } from "@/lib/trip-phase";
import { TripCover } from "./trip-cover";

/**
 * Format a YYYY-MM-DD date range into a friendly string like "1 Jul – 12 Jul".
 * If either is missing, returns an em-dash.
 */
function formatDateRange(startDate: string, endDate: string): string {
  try {
    const fmt = new Intl.DateTimeFormat("en-AU", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
    const start = fmt.format(new Date(`${startDate}T00:00:00Z`));
    const end = fmt.format(new Date(`${endDate}T00:00:00Z`));
    return `${start} – ${end}`;
  } catch {
    return "—";
  }
}

export interface TripCardProps {
  id: string;
  name: string;
  startDate: string | null; // null for a date-less trip
  endDate: string | null;   // null for a date-less trip
  stopCount: number;
  phase?: PhaseDescription;
  unreadCount?: number;
  hasCover: boolean;
  coverStops: { lat: number; lng: number }[];
}

/**
 * A warm, playful card for a single trip in the trips grid.
 * The whole card is a link to /trips/[id].
 */
export function TripCard({
  id,
  name,
  startDate,
  endDate,
  stopCount,
  phase,
  unreadCount,
  hasCover,
  coverStops,
}: TripCardProps) {
  const dateRange =
    startDate && endDate ? formatDateRange(startDate, endDate) : "No dates yet";

  return (
    <Link
      href={`/trips/${id}`}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-soft",
        "transition-all duration-200 hover:shadow-soft-lg hover:-translate-y-0.5 motion-safe:active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
    >
      {/* Cover */}
      <div className="relative h-28 w-full overflow-hidden">
        <TripCover tripId={id} name={name} hasCover={hasCover} stops={coverStops} />
        {phase && (
          <span className="absolute left-3 top-3 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium text-foreground shadow-soft">
            {phase.phase === "travelling" || phase.phase === "past" ? phase.countdown : `${phase.label} · ${phase.countdown}`}
          </span>
        )}
        {unreadCount != null && unreadCount > 0 && (
          <span
            aria-label={`${unreadCount} new`}
            className="absolute right-3 top-3 rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground shadow-soft"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </div>

      {/* Card body */}
      <div className="flex flex-col gap-2 p-5 pt-4">
        <h3 className="font-display text-xl font-semibold leading-tight tracking-tight">
          {name}
        </h3>

        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>{dateRange}</span>

          <Badge variant="secondary" className="shrink-0">
            <MapPin className="size-3" aria-hidden="true" />
            {stopCount === 1 ? "1 stop" : `${stopCount} stops`}
          </Badge>
        </div>
      </div>
    </Link>
  );
}
