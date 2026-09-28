"use client";

import { ChevronDown } from "lucide-react";
import { AppLink } from "@/components/navigation/app-link";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent } from "@/components/ui/dropdown-menu";
import { TripMenuItems } from "@/components/shell/trip-switcher";
import type { SwitcherTrip } from "@/components/shell/shell-user";

/** TRIPS_PAGE.md §1: "Back to / {name}", no shadow, body → trip Home, chevron → switcher menu. */
export function BackToTripCard({ trip, trips }: { trip: SwitcherTrip; trips: SwitcherTrip[] }) {
  return (
    <div className="flex min-h-11 items-stretch rounded-[14px] border-2 border-border bg-card">
      <AppLink href={`/trips/${trip.id}`} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-l-[12px] px-3 py-2">
        <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full border-2 border-border bg-coral" />
        <span className="flex min-w-0 flex-col text-left">
          <span className="text-[12px] font-medium leading-tight text-muted-foreground">Back to</span>
          <span className="truncate text-sm font-bold leading-tight">{trip.name}</span>
        </span>
      </AppLink>
      <DropdownMenu>
        <DropdownMenuTrigger aria-label="Switch trip" className="grid w-10 shrink-0 place-items-center rounded-r-[12px] text-muted-foreground hover:text-foreground">
          <ChevronDown className="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          <TripMenuItems trips={trips} currentId={null} />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
