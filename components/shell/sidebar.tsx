import type { Route } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchField } from "@/components/shell/search-field";
import { SidebarNav, type SidebarNavCounts } from "@/components/shell/sidebar-nav";
import { SidebarFooter } from "@/components/shell/sidebar-footer";
import type { TravellerLike } from "@/lib/traveller";
import type { AdminQueue } from "@/lib/admin-queue";
import type { SwitcherTrip } from "@/components/shell/shell-user";

export interface SidebarProps {
  user: TravellerLike & { email: string | null };
  isAdmin: boolean;
  adminQueue: AdminQueue;
  /**
   * The Trip in scope, or null outside one (no trip nav). `name` is null while
   * the trip layout has not published it yet (AppShellRail); `ref` is the URL
   * ref the rows link with and `daysHref` the Days target — both fall back to
   * the contexts (useTripSlug / DaysHrefProvider) when absent.
   */
  trip?: { id: string; name: string | null; ref?: string; daysHref?: Route | null } | null;
  /** Trip switcher slot: BackToTripCard, TripSwitcher, or SidebarTripPlaceholder. */
  switcher: ReactNode;
  /** Plan / Wishlist counts (Task 12). */
  counts?: SidebarNavCounts;
  /** Every trip the Traveller belongs to — the Trips row count, and whether
   * the switcher slot shows at all outside a Trip (hidden at 0 trips). */
  trips?: SwitcherTrip[];
  /** Unused directly here (BackToTripCard is built by the caller and handed
   * in as `switcher`); kept on the props so ShellUser's shape flows straight
   * through {...shellUser} without a caller having to strip it. */
  lastTrip?: SwitcherTrip | null;
}

/**
 * The full app sidebar at ≥1280px (docs/specs/2026-09-27-desktop-home.md §1
 * as amended by beta-feedback §A): 248px, sun, sticky at full height — the
 * only chrome there, since the top bar is gone from 768px up and the Dock
 * hands over at xl. Lockup → /trips, search, trip switcher, trip nav
 * (inside a Trip), ALL TRIPS, and the Traveller's footer.
 *
 * No server-only imports on purpose: AppShellRail (the app layout's one
 * persistent rail, ADR 0062 amended 2026-09-29) renders it on the client.
 */
export function Sidebar({ user, isAdmin, adminQueue, trip, switcher, counts, trips }: SidebarProps) {
  const tripCount = trips?.length ?? 0;
  const hideSwitcher = tripCount === 0 && !trip;
  return (
    <aside
      data-testid="sidebar"
      className="island sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col gap-1 self-start overflow-y-auto border-r-2 border-border bg-sun px-4 py-[22px] xl:flex print:hidden"
    >
      <Link
        href="/trips"
        aria-label="Teepee, go to your trips"
        className="mb-[18px] ml-1.5 flex w-fit items-center rounded-md"
      >
        <Logo variant="lockup" size={34} />
      </Link>
      <div className={hideSwitcher ? "mb-6" : "mb-2.5"}>
        <SearchField tripId={trip?.id ?? null} />
      </div>
      {hideSwitcher ? null : <div className="mb-3.5">{switcher}</div>}
      {/* Controller ruling: the Trips row count is a trips-level affordance
          only — inside a Trip the row is just a plain nav link, so pass
          `undefined` there rather than gating inside SidebarNav. */}
      <SidebarNav tripId={trip?.id ?? null} tripRef={trip?.ref} daysHref={trip?.daysHref} counts={counts} tripCount={trip ? undefined : tripCount} />
      <SidebarFooter user={user} isAdmin={isAdmin} adminQueue={adminQueue} />
    </aside>
  );
}

/**
 * Placeholder for the switcher slot until Task 12's dropdown: a plain card
 * with the current Trip's name, or "Choose a trip" (→ /trips) outside one.
 */
export function SidebarTripPlaceholder({ trip }: { trip?: { id: string; name: string | null } | null }) {
  const cardClass =
    "flex min-h-11 items-center gap-2.5 rounded-[14px] border-2 border-border bg-card px-3 py-2.5 shadow-hard-1";
  const dot = <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full border-2 border-border bg-coral" />;
  if (!trip) {
    return (
      <Link href="/trips" className={cardClass}>
        {dot}
        <span className="truncate text-sm font-bold">Choose a trip</span>
      </Link>
    );
  }
  return (
    <div className={cardClass}>
      {dot}
      {trip.name ? <span className="truncate text-sm font-bold">{trip.name}</span> : null}
    </div>
  );
}

/** The switcher slot while the trip layout is still streaming its name (AppShellRail). */
export function SidebarTripSkeleton() {
  return (
    <div data-testid="sidebar-trip-skeleton" aria-hidden="true" className="flex min-h-11 items-center gap-2.5 rounded-[14px] border-2 border-border bg-card px-3 py-2.5 shadow-hard-1">
      <span className="size-2.5 shrink-0 rounded-full border-2 border-border bg-coral" />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5"><Skeleton className="h-3.5 w-28" /><Skeleton className="h-2.5 w-16" /></span>
    </div>
  );
}
