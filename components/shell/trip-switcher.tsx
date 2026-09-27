"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useShellUser } from "@/components/shell/shell-user";
import type { SwitcherTrip } from "@/components/shell/shell-user";
import { cn } from "@/lib/cn";

const Dot = () => (
  <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full border-2 border-border bg-coral" />
);

export interface TripSwitcherProps {
  /** The trip currently in scope — shown in the trigger. */
  current: SwitcherTrip;
  /** Every trip the Traveller is a member of (current included), in
   * compareForTripList order — see app/(app)/layout.tsx. */
  trips: SwitcherTrip[];
  /** "card" — the full ≥1280px sidebar slot (desktop-home spec §1).
   * "pill" — the compact 768–1279px trip-header pill (spec §A). */
  variant?: "card" | "pill";
}

/**
 * Trip switcher (desktop-home spec §1 / beta-feedback §A): the current
 * trip's name and status line, opening a menu of ALL the Traveller's trips
 * (the current one marked `aria-current="page"`), then "All trips" and
 * "+ New trip". Shared between the full sidebar (variant="card") and the
 * Dock-band trip header (variant="pill") so the two can never disagree
 * about which trips exist or how they're ordered.
 */
export function TripSwitcher({ current, trips, variant = "card" }: TripSwitcherProps) {
  // `trips` is expected to already include `current` (it's the same list the
  // trigger's name comes from) — but TripSwitcherFromContext's fallback can
  // hand us a `current` that isn't (yet) in the context's list, so make sure
  // it's always shown and marked rather than silently missing from the menu.
  const menuTrips = trips.some((t) => t.id === current.id) ? trips : [current, ...trips];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Switch trip — currently ${current.name}`}
        className={cn(
          "flex min-h-11 items-center gap-2 rounded-[14px] border-2 border-border bg-card shadow-hard-1",
          variant === "card" ? "w-full px-3 py-2.5" : "px-2.5 py-1.5",
        )}
      >
        <Dot />
        {variant === "card" ? (
          <span className="flex min-w-0 flex-1 flex-col items-start text-left">
            <span className="w-full truncate text-sm font-bold">{current.name}</span>
            <span className="w-full truncate text-xs text-muted-foreground">{current.statusLine}</span>
          </span>
        ) : (
          <span className="max-w-40 truncate text-sm font-bold">{current.name}</span>
        )}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        {menuTrips.map((trip) => {
          const isCurrent = trip.id === current.id;
          return (
            <DropdownMenuItem key={trip.id} asChild>
              <Link
                href={`/trips/${trip.id}`}
                aria-current={isCurrent ? "page" : undefined}
                className="flex items-center gap-2.5"
              >
                <Dot />
                <span className="flex min-w-0 flex-1 flex-col items-start">
                  <span className="w-full truncate text-sm font-bold">{trip.name}</span>
                  <span className="w-full truncate text-xs text-muted-foreground">{trip.statusLine}</span>
                </span>
              </Link>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/trips">All trips</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/trips/new">+ New trip</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The switcher where the Traveller's trip list isn't in hand as props — the
 * trip layout (a Server Component that only knows the current trip). Reads
 * ShellUserProvider (mounted by the app layout, which already loads every
 * trip for the switcher — see app/(app)/layout.tsx) so this never queries
 * again. Renders nothing outside the provider.
 */
export function TripSwitcherFromContext({
  tripId,
  fallbackName,
  variant,
}: {
  tripId: string;
  /** Used only if the trip isn't (yet) in the context's trips list. */
  fallbackName: string;
  variant?: "card" | "pill";
}) {
  const shell = useShellUser();
  if (!shell) return null;
  const trips = shell.trips ?? [];
  const current = trips.find((t) => t.id === tripId) ?? { id: tripId, name: fallbackName, statusLine: "" };
  return <TripSwitcher current={current} trips={trips} variant={variant} />;
}
