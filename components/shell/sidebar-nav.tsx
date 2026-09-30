"use client";

import { Fragment, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { AppLink } from "@/components/navigation/app-link";
import { useNavState, type NavState } from "@/components/navigation/navigation-pending";
import { tripSidebarGroups } from "@/components/trip/trip-nav";
import { NAV_ICONS } from "@/components/trip/nav-icons";
import { useDaysHref } from "@/components/trip/days-href-context";
import { useTripSlug } from "@/components/trip/use-trip-href";
import { isGlobeActive, isTripsActive } from "@/components/shell/app-paths";
import { cn } from "@/lib/cn";

/**
 * Optional count beside a trip nav row (Task 12 fills these: Plan = Flags on
 * the real plan, Wishlist = ideas; hidden at 0). Money = costs due within 14
 * days (Phase 1 Task 7).
 */
export interface SidebarNavCounts {
  Plan?: ReactNode;
  Wishlist?: ReactNode;
  Money?: ReactNode;
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
function Row({ href, label, match, nav, count, icon: Icon }: { href: string; label: string; match: (path: string) => boolean; nav: NavState; count?: ReactNode; icon?: LucideIcon }) {
  const pending = nav.pendingPathname != null && match(nav.pendingPathname);
  return (
    <li className="py-px">
      <AppLink
        href={href}
        aria-current={match(nav.pathname) ? "page" : undefined}
        data-pending={pending ? "true" : undefined}
        className={rowClass(match(nav.effectivePathname))}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {Icon ? <Icon className="size-[18px] shrink-0" aria-hidden="true" /> : null}
          <span className="truncate">{label}</span>
        </span>
        {count}
      </AppLink>
    </li>
  );
}

/**
 * Eyebrow above a group of rows. The first group sits flush under the
 * switcher (mt-0); later ones (including "Across trips") get the usual
 * mt-4 gap.
 */
const EYEBROW = "mx-3 mb-1 mt-4 text-[11px] font-extrabold uppercase tracking-[0.08em] text-on-accent-muted";

/**
 * The sidebar's navigation (≥1280px): thirteen trip rows in three groups
 * (Plan it, Keep, and a heading-less Settings/Help pair) when inside a
 * Trip — built from tripSidebarGroups, so ?plan= threading and the active
 * rules match the Dock's tripRailItems — then the "Across trips" section
 * with Trips and Globe. Active state reads the live pathname and ?plan= on
 * the client, since the layouts that mount the sidebar are preserved across
 * navigations.
 */
export function SidebarNav({
  tripId,
  tripRef: tripRefProp,
  daysHref: daysHrefProp,
  counts,
  tripCount,
}: {
  tripId?: string | null;
  /** URL ref for the rows (AppShellRail passes the pathname's); falls back to useTripSlug(tripId). */
  tripRef?: string | null;
  /** Days target; falls back to DaysHrefProvider. */
  daysHref?: string | null;
  counts?: SidebarNavCounts;
  /** Trips row count (Task 11); hidden at 0. */
  tripCount?: number;
}) {
  const nav = useNavState();
  const planParam = useSearchParams().get("plan");
  // Both hooks run unconditionally (rules of hooks); the props win when given.
  const ctxDaysHref = useDaysHref();
  const ctxRef = useTripSlug(tripId ?? "");
  const daysHref = daysHrefProp ?? ctxDaysHref;
  const tripRef = tripRefProp ?? ctxRef;
  const groups = tripId ? tripSidebarGroups(tripRef, planParam, daysHref) : [];

  return (
    <nav aria-label="Main" className="flex flex-col">
      {groups.map((group, i) => (
        <Fragment key={group.heading ?? `group-${i}`}>
          {group.heading ? (
            <p className={cn(EYEBROW, i === 0 && "mt-0")}>{group.heading}</p>
          ) : (
            <div className="mt-3" />
          )}
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <Row
                key={item.label}
                href={item.href}
                label={item.label}
                match={item.match}
                nav={nav}
                icon={NAV_ICONS[item.label]}
                count={item.label === "Plan" || item.label === "Wishlist" || item.label === "Money" ? counts?.[item.label] : undefined}
              />
            ))}
          </ul>
        </Fragment>
      ))}
      <p className={EYEBROW}>Across trips</p>
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
