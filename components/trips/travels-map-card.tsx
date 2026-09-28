"use client";

/**
 * "Your travels" map card (TRIPS_PAGE.md §5 desktop, §8.4 mobile). The map
 * fills the card; the title pill, filter chips, Globe pill and attribution
 * overlay it. Desktop lets the Traveller filter to one trip via chips
 * (overflow past three trips collapses into a "+N" popover); mobile has no
 * chips and the whole card is a single link to the Globe.
 */

import * as React from "react";
import Link from "next/link";
import { TravelMapLoader } from "@/components/trips/travel-map-loader";
import type { TravelMapTrip } from "@/components/trips/travel-map";
import { ErrorPanel } from "@/components/ui/error-panel";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HUE_CLASSES } from "@/lib/hues";
import { cn } from "@/lib/cn";

const MAX_CHIPS = 3;
const CHIP = "inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border-2 border-border px-3 text-[13px] font-bold";

/** Shared by MapBoundary's caught render errors and TravelMap's own onFail — same panel either way. */
function MapFailurePanel() {
  return (
    <ErrorPanel
      layout="card"
      headingLevel={3}
      title="The map didn’t load"
      description="The rest of the page still works."
      className="absolute inset-4 justify-center border-0 bg-transparent px-4 py-4"
    />
  );
}

class MapBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return <MapFailurePanel />;
    }
    return this.props.children;
  }
}

function TripChip({ trip, selected, onSelect }: { trip: TravelMapTrip; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(CHIP, selected ? "bg-primary text-primary-foreground" : "bg-card text-foreground")}
    >
      <span aria-hidden="true" className={cn("size-2.5 rounded-full", HUE_CLASSES[trip.hue].dot)} />
      {trip.name}
    </button>
  );
}

export interface TravelsMapCardProps {
  /** I5: null when "Your travels" failed to load — shows the failure panel in place of the map. */
  trips: TravelMapTrip[] | null;
  variant: "desktop" | "mobile";
  /** First run: world view, no chips, centred hint. */
  empty?: boolean;
  className?: string;
}

/** TRIPS_PAGE.md §5 (desktop) and §8.4 (mobile). The map fills the card; chips overlay it. */
export function TravelsMapCard({ trips, variant, empty = false, className }: TravelsMapCardProps) {
  const [filter, setFilter] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);
  const mobile = variant === "mobile";
  const list = trips ?? [];
  const visible = list.slice(0, MAX_CHIPS);
  const overflow = list.slice(MAX_CHIPS);
  const card = cn(
    "relative overflow-hidden border-2 border-border bg-map-fill",
    mobile ? "h-[190px] rounded-[22px] shadow-hard-2" : "h-full min-h-0 rounded-[24px] shadow-hard-3",
    className,
  );
  const body = (
    <>
      {trips === null || failed ? (
        <MapFailurePanel />
      ) : (
        <MapBoundary>
          <TravelMapLoader trips={trips} filterTripId={filter} variant={variant} onFail={() => setFailed(true)} />
        </MapBoundary>
      )}
      <div className={cn("pointer-events-none absolute left-4 top-4 z-[500] flex items-center gap-2", mobile && "left-3.5 top-3.5")}>
        <span
          className={cn(
            "shrink-0 whitespace-nowrap rounded-full border-2 border-border bg-card font-display font-extrabold text-foreground",
            mobile ? "px-3 py-0.5 text-[16px]" : "px-3.5 py-[3px] text-[20px]",
          )}
        >
          Your travels
        </span>
        {!mobile && !empty && list.length > 0 ? (
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              aria-pressed={filter === null}
              onClick={() => setFilter(null)}
              className={cn(CHIP, filter === null ? "bg-primary text-primary-foreground" : "bg-card text-foreground")}
            >
              All trips
            </button>
            {visible.map((t) => (
              <TripChip key={t.id} trip={t} selected={filter === t.id} onSelect={() => setFilter(t.id)} />
            ))}
            {overflow.length > 0 ? (
              <Popover>
                <PopoverTrigger
                  className={cn(CHIP, overflow.some((t) => t.id === filter) ? "bg-primary text-primary-foreground" : "bg-card text-foreground")}
                >
                  +{overflow.length}
                </PopoverTrigger>
                <PopoverContent align="start" className="flex flex-col gap-1.5 p-2">
                  {overflow.map((t) => (
                    <TripChip key={t.id} trip={t} selected={filter === t.id} onSelect={() => setFilter(t.id)} />
                  ))}
                </PopoverContent>
              </Popover>
            ) : null}
          </div>
        ) : null}
      </div>
      {empty ? (
        <div className="pointer-events-none absolute inset-0 z-[500] grid place-items-center">
          {mobile ? (
            <span className="whitespace-nowrap rounded-[12px] border-2 border-border bg-card px-3 py-1.5 text-[13px] font-bold text-foreground">
              Pins appear as you add stops
            </span>
          ) : (
            <div className="flex items-center gap-3 whitespace-nowrap rounded-[16px] border-2 border-border bg-card px-[18px] py-3.5 shadow-hard-1">
              <span aria-hidden="true" className="size-[26px] rounded-full border-2 border-dashed border-border" />
              <span className="flex flex-col">
                <span className="text-[15px] font-bold text-foreground">Your map fills in as you go</span>
                <span className="text-[13px] text-muted-foreground">Every stop you add gets a pin</span>
              </span>
            </div>
          )}
        </div>
      ) : null}
      {!mobile ? (
        <Link
          href="/globe"
          className="absolute bottom-4 right-4 z-[500] shrink-0 whitespace-nowrap rounded-full border-2 border-border bg-card px-3.5 py-1.5 text-[13px] font-bold text-foreground shadow-hard-1"
        >
          Open Globe →
        </Link>
      ) : (
        <span
          aria-hidden="true"
          className="absolute bottom-3.5 right-3.5 z-[500] shrink-0 whitespace-nowrap rounded-full border-2 border-border bg-card px-3 py-1 text-[12px] font-bold text-foreground"
        >
          Globe →
        </span>
      )}
      <p className="pointer-events-none absolute bottom-3 left-4 z-[500] shrink-0 whitespace-nowrap text-[11px] font-semibold text-muted-foreground">
        © OpenStreetMap · CARTO
      </p>
    </>
  );
  if (mobile) {
    return (
      <Link href="/globe" aria-label="Your travels — open the Globe" className={cn(card, "block")}>
        {body}
      </Link>
    );
  }
  return (
    <section aria-label="Your travels" className={card}>
      {body}
    </section>
  );
}
