"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { AppLink } from "@/components/navigation/app-link";
import { useNavState, type NavState } from "@/components/navigation/navigation-pending";
import { tripRailItems } from "@/components/trip/trip-nav";
import { useDaysHref } from "@/components/trip/days-href-context";
import { useTripSlug } from "@/components/trip/use-trip-href";
import { isGlobeActive, isTripsActive } from "@/components/shell/app-paths";
import { cn } from "@/lib/cn";

/**
 * Optional count beside a trip nav row (Task 12 fills these: Plan = Flags on
 * the real plan, Wishlist = ideas; hidden at 0).
 */
export interface SidebarNavCounts {
  Plan?: ReactNode;
  Wishlist?: ReactNode;
}

/**
 * Shared style for every sidebar nav row's trailing count (Plan, Wishlist,
 * Trips). Lives here — not in sidebar-nav-counts.tsx — because this module
 * is "use client" and safe for any importer; sidebar-nav-counts.tsx pulls in
 * lib/nav-counts.ts's DB reads, so importing *from* it into this
 * client component would risk dragging server-only code into the client
 * bundle. sidebar-nav-counts.tsx imports this constant instead.
 */
export const COUNT_CLASS = "text-[11px] font-extrabold";

/**
 * 42px row; the `before:` overlay grows the hit area 1px above and below to
 * the 44px floor without shifting layout. Inactive rows carry a transparent
 * 2px border so the active/hover border never moves the label.
 */
function rowClass(active: boolean) {
  return cn(
    "relative flex h-[42px] items-center justify-between gap-2 rounded-[12px] border-2 px-3 text-[15px] font-bold text-foreground",
    "before:absolute before:inset-x-0 before:-inset-y-px before:content-['']",
    active ? "border-border bg-coral shadow-hard-1" : "border-transparent hover:border-border",
  );
}

/**
 * `match` is asked of all three pathnames (ADR 0063): the effective one lights
 * the row at once, the real one carries aria-current, the pending one marks
 * the tapped row data-pending.
 */
function Row({ href, label, match, nav, count }: { href: string; label: string; match: (path: string) => boolean; nav: NavState; count?: ReactNode }) {
  const pending = nav.pendingPathname != null && match(nav.pendingPathname);
  return (
    <li className="py-px">
      <AppLink
        href={href}
        aria-current={match(nav.pathname) ? "page" : undefined}
        data-pending={pending ? "true" : undefined}
        className={rowClass(match(nav.effectivePathname))}
      >
        <span className="truncate">{label}</span>
        {count}
      </AppLink>
    </li>
  );
}

/**
 * The sidebar's navigation (≥1280px): the seven trip rows when inside a Trip —
 * the same model as the Dock (tripRailItems), so ?plan= threading and the
 * active rules are shared — then the "ALL TRIPS" section with Trips and
 * Globe. Active state reads the live pathname and ?plan= on the client, since
 * the layouts that mount the sidebar are preserved across navigations.
 */
export function SidebarNav({
  tripId,
  counts,
  tripCount,
}: {
  tripId?: string | null;
  counts?: SidebarNavCounts;
  /** Trips row count (Task 11); hidden at 0. */
  tripCount?: number;
}) {
  const nav = useNavState();
  const planParam = useSearchParams().get("plan");
  const daysHref = useDaysHref();
  const tripRef = useTripSlug(tripId ?? "");
  const tripItems = tripId ? tripRailItems(tripRef, planParam, daysHref) : [];

  return (
    <nav aria-label="Main" className="flex flex-col">
      {tripItems.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {tripItems.map((item) => (
            <Row
              key={item.label}
              href={item.href}
              label={item.label}
              match={item.match}
              nav={nav}
              count={item.label === "Plan" || item.label === "Wishlist" ? counts?.[item.label] : undefined}
            />
          ))}
        </ul>
      )}
      <p className="mx-3 mb-1 mt-4 text-[11px] font-extrabold uppercase tracking-[0.08em] text-on-accent-muted">
        All trips
      </p>
      <ul className="flex flex-col gap-0.5">
        <Row
          href="/trips"
          label="Trips"
          match={isTripsActive}
          nav={nav}
          count={tripCount ? <span className={COUNT_CLASS}>{tripCount}</span> : undefined}
        />
        <Row href="/globe" label="Globe" match={isGlobeActive} nav={nav} />
      </ul>
    </nav>
  );
}
