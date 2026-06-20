import * as React from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

/**
 * A deterministic gradient cover derived from the trip id/name.
 *
 * We hash the string to a small integer and map it to one of several warm,
 * travel-inspired gradient presets. These must be complete Tailwind class
 * strings (not dynamic) so the compiler can include them in the bundle.
 */
const GRADIENT_CLASSES: readonly string[] = [
  "bg-gradient-to-br from-rose-400 to-amber-300",
  "bg-gradient-to-br from-sky-400 to-teal-300",
  "bg-gradient-to-br from-violet-400 to-pink-300",
  "bg-gradient-to-br from-amber-400 to-orange-300",
  "bg-gradient-to-br from-emerald-400 to-cyan-300",
  "bg-gradient-to-br from-rose-500 to-pink-300",
  "bg-gradient-to-br from-indigo-400 to-purple-300",
  "bg-gradient-to-br from-yellow-400 to-amber-300",
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function tripGradient(id: string, name: string): string {
  const index = hashString(id + name) % GRADIENT_CLASSES.length;
  return GRADIENT_CLASSES[index];
}

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
  startDate: string;
  endDate: string;
  stopCount: number;
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
}: TripCardProps) {
  const gradient = tripGradient(id, name);
  const dateRange = formatDateRange(startDate, endDate);

  return (
    <Link
      href={`/trips/${id}`}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-soft",
        "transition-all duration-200 hover:shadow-soft-lg hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
    >
      {/* Gradient cover */}
      <div className={cn("h-28 w-full", gradient)} aria-hidden="true" />

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
