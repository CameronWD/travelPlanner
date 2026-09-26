"use client";

import * as React from "react";
import Link from "next/link";
import { MapPin, MoreVertical, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CardTitle, cardVariants } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cn";
import type { PhaseDescription, TripPhase } from "@/lib/trip-phase";
import { TripCover } from "./trip-cover";
import type { LatLng } from "@/lib/route-render";
import { DuplicateTripDialog } from "./duplicate-trip-dialog";
import { HUE_CLASSES } from "@/lib/hues";

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
  home?: LatLng | null;
  roundTrip?: boolean;
  coverVersion?: string | null;
  /** Trip.coverFocalX / coverFocalY — where the cover photo's crop centres (spec E2); null = centre. */
  focalX?: number | null;
  focalY?: number | null;
  /** The single "up next" card in the grid — kit's `NEXT UP` treatment: spans 2 columns, bigger heading. */
  featured?: boolean;
  /**
   * Extra detail shown only on the featured card, in a details column beside
   * the cover at `lg+` (the card stacks like every other card below `lg`).
   */
  featuredDetails?: {
    /** Big display-font countdown value, e.g. "26", "5", "Not dated". */
    countdown: string;
    /** Small stacked unit beside the countdown, e.g. "DAYS TO GO"; null when it stands alone. */
    unit: string | null;
    /** "first Stop → last Stop" (or a single Stop's name; "" when there are none). */
    routeSummary: string;
    /** e.g. "3 stops · 9 nights". */
    stopsAndNights: string;
    /** The Home's next step for this trip, or null when there isn't one. */
    nextStep: string | null;
  };
}

/** Dot colour class per trip phase, matching the design tokens. */
const PHASE_DOT_CLASS: Record<TripPhase, string> = {
  planning: "bg-primary",
  "final-prep": "bg-primary",
  sketching: HUE_CLASSES.sun.fill,
  travelling: HUE_CLASSES.teal.fill,
  past: HUE_CLASSES.stone.fill,
};

/**
 * A warm, playful card for a single trip in the trips grid.
 * The whole card is a link to /trips/[id].
 * An absolutely-positioned ⋯ menu in the top-right provides extra actions
 * (Duplicate) without triggering card navigation.
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
  home,
  roundTrip,
  coverVersion,
  focalX,
  focalY,
  featured,
  featuredDetails,
}: TripCardProps) {
  const dateRange =
    startDate && endDate ? formatDateRange(startDate, endDate) : "No dates yet";

  const [duplicateOpen, setDuplicateOpen] = React.useState(false);

  // Never boil the "up next" card down to a single letter: when it has no
  // photo and no located Stops (so TripCover would otherwise fall back to
  // the monogram), show the trip name instead.
  const coverVariant: "initial" | "name" =
    featured && !hasCover && coverStops.length === 0 ? "name" : "initial";

  const showFeaturedDetails = Boolean(featured && featuredDetails);

  return (
    // Outer wrapper is `relative group` so the absolutely-positioned menu sits correctly
    // and is a SIBLING of the Link (not a descendant), preventing navigation on click.
    // `group` here powers the opacity-0 / group-hover:opacity-100 on the ⋯ trigger.
    <div className="relative group h-full">
      <Link
        href={`/trips/${id}`}
        className={cn(
          cardVariants({ tone: "white", radius: "xl", shadow: featured ? 3 : 2, interactive: true }),
          "flex h-full flex-col overflow-hidden",
          showFeaturedDetails && "lg:flex-row",
        )}
      >
        {/* Cover — kit shows a flat accent fill here; our real photo/route-render/monogram
            cover (components/trip/trip-cover.tsx) already carries per-trip visual variety,
            so the card body stays a neutral `white` tone rather than layering a decorative
            tone fill behind it. */}
        <div
          className={cn(
            "relative w-full overflow-hidden",
            featured ? "h-48" : "h-36",
            showFeaturedDetails && "lg:h-full lg:w-1/2 lg:shrink-0",
          )}
        >
          <TripCover tripId={id} name={name} hasCover={hasCover} stops={coverStops} home={home} roundTrip={roundTrip} coverVersion={coverVersion} focalX={focalX} focalY={focalY} variant={coverVariant} />
          {phase && (
            <Badge
              caps
              className="absolute left-3 top-3 max-w-[calc(100%-1.5rem)] gap-1.5 whitespace-normal text-left leading-tight"
            >
              <span
                data-testid="phase-dot"
                aria-hidden="true"
                className={cn("size-2 shrink-0 rounded-full", PHASE_DOT_CLASS[phase.phase])}
              />
              {phase.phase === "travelling" || phase.phase === "past" ? phase.countdown : `${phase.label} · ${phase.countdown}`}
            </Badge>
          )}
          {unreadCount != null && unreadCount > 0 && (
            <Badge variant="accent" aria-label={`${unreadCount} new`} className="absolute right-3 top-3">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </div>

        {/* Card body — stacked layout, used by every card at every width, and
            by the featured card below `lg` (kept for phone: "the 2-column
            grid and card stack unchanged"). */}
        <div className={cn("flex flex-col gap-2 p-5 pt-4", showFeaturedDetails && "lg:hidden")}>
          <CardTitle className={featured ? "text-2xl sm:text-3xl" : "text-xl"}>
            {name}
          </CardTitle>

          <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>{dateRange}</span>

            <Badge variant="secondary" className="shrink-0">
              <MapPin className="size-3" aria-hidden="true" />
              {stopCount === 1 ? "1 stop" : `${stopCount} stops`}
            </Badge>
          </div>
        </div>

        {/* Featured details column — "Next up" earns its width: a richer
            right-hand column replaces the stacked body at `lg+` only. */}
        {showFeaturedDetails && (
          <div className="hidden flex-col justify-center gap-2 p-5 lg:flex lg:flex-1">
            <CardTitle className="text-2xl sm:text-3xl">{name}</CardTitle>

            <div className="flex items-baseline gap-1.5">
              <span className="font-display text-4xl font-extrabold tracking-[-0.03em]">
                {featuredDetails!.countdown}
              </span>
              {featuredDetails!.unit && (
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {featuredDetails!.unit}
                </span>
              )}
            </div>

            {featuredDetails!.routeSummary && (
              <p className="text-sm text-muted-foreground">{featuredDetails!.routeSummary}</p>
            )}

            <p className="text-sm text-muted-foreground">{featuredDetails!.stopsAndNights}</p>

            {featuredDetails!.nextStep && (
              <p data-testid="featured-next-step" className="text-sm font-semibold text-foreground">
                {featuredDetails!.nextStep}
              </p>
            )}
          </div>
        )}
      </Link>

      {/* ⋯ menu — absolutely positioned as a sibling of the Link, so clicks here
          never trigger card navigation. z-10 to sit above the card hover states.
          size-11 (44px) meets the touch-target minimum; opaque bg-card + 2px
          border match the kit's solid chip surfaces (no translucency/blur). */}
      <div className="absolute right-2 top-2 z-10">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Trip actions"
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "flex size-11 items-center justify-center rounded-full border-2 border-border bg-card text-foreground shadow-hard-1",
              "hover:bg-muted",
              "transition-opacity opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            )}
          >
            <MoreVertical className="size-4" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => setDuplicateOpen(true)}
            >
              <Copy className="size-4" aria-hidden="true" />
              Duplicate
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Controlled duplicate dialog — rendered outside the Link */}
      <DuplicateTripDialog
        tripId={id}
        tripName={name}
        open={duplicateOpen}
        onOpenChange={setDuplicateOpen}
      />
    </div>
  );
}
