"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Dock, type DockItem } from "@/components/ui/dock";
import { NavMoreMenu } from "@/components/trip/nav-more-menu";

export interface NavItem {
  label: string;
  href: string;
}

// Plan-scoped surfaces keep the active variant (?plan=); dated views always follow the real plan.
//
// "Days" and "Money" (not "Calendar"/"Budget") — the Playground kit's rail
// ordering (task-7 brief, Step 5) names these tabs Days and Money, and the
// label lives here, not as a display-only rename in the wrappers, so that
// lib/help-guide.test.ts's nav-label drift guard actually covers it: it
// checks these functions' output, so a future rename fails the guide and the
// ⌘K palette instead of silently drifting past them. The route segments
// (/calendar, /budget) are unchanged — only the label moved.
export function primaryNav(tripId: string, planParam?: string | null): NavItem[] {
  const base = `/trips/${tripId}`;
  const plan = planParam ? `?plan=${encodeURIComponent(planParam)}` : "";
  return [
    { label: "Home", href: base },
    { label: "Plan", href: `${base}/plan${plan}` },
    { label: "Days", href: `${base}/calendar` },
    { label: "Money", href: `${base}/budget${plan}` },
    { label: "Summary", href: `${base}/summary` },
  ];
}

// Plan-scoped surfaces keep the active variant (?plan=); dated views always follow the real plan.
export function moreNav(tripId: string, planParam?: string | null): NavItem[] {
  const base = `/trips/${tripId}`;
  const plan = planParam ? `?plan=${encodeURIComponent(planParam)}` : "";
  return [
    { label: "Wishlist", href: `${base}/wishlist${plan}` },
    { label: "Journal", href: `${base}/journal` },
    { label: "Checklists", href: `${base}/checklists` },
    { label: "Files", href: `${base}/files` },
    { label: "Activity", href: `${base}/activity` },
    { label: "Settings", href: `${base}/settings` },
    { label: "Help", href: `${base}/help` },
  ];
}

/** Exact-match for Home (base), prefix-match for everything else. Ignores query strings. */
export function isNavActive(
  href: string,
  pathname: string,
  base: string,
): boolean {
  const path = href.split("?")[0];
  if (path === base) return pathname === base;
  return pathname === path || pathname.startsWith(path + "/");
}

/**
 * Days is the calendar route AND every single-day page: /trips/:id/day/:date
 * is one day of the Days view, so the rail keeps Days lit there.
 */
export function isDaysActive(daysHref: string, pathname: string, base: string): boolean {
  if (isNavActive(daysHref, pathname, base)) return true;
  const dayBase = `${base}/day`;
  return pathname === dayBase || pathname.startsWith(dayBase + "/");
}

interface TripNavProps {
  tripId: string;
}

/**
 * Left rail for a trip's sections (md+ — see components/ui/dock.tsx for the
 * mobile-hidden breakpoint). Replaces the old horizontal TripNav bar.
 *
 * primaryNav/moreNav stay the source of truth for nav data and the ?plan=
 * fork threading (ADR 0020); this component only reshapes their output into
 * the kit's rail ordering (Home, Plan, Days, Money, Wishlist, More, then the
 * muted app-scoped Trips/Globe/You) and supplies each item's active check via
 * isNavActive so Home's exact-match rule and query-string hrefs both work —
 * Dock's own default (path.startsWith(href)) would over-match both of those.
 *
 * No Today slot — ADR 0010: the Today view is the Travelling-phase Home.
 */
export function TripNav({ tripId }: TripNavProps) {
  const pathname = usePathname();
  const planParam = useSearchParams().get("plan");
  const base = `/trips/${tripId}`;

  const nav = primaryNav(tripId, planParam); // Home, Plan, Days, Money, Summary
  const more = moreNav(tripId, planParam); // Wishlist, Journal, Checklists, Files, Activity, Settings, Help
  const byLabel = (label: string) =>
    [...nav, ...more].find((i) => i.label === label)!;

  // Wishlist gets its own rail slot in the kit's ordering; the rest of
  // moreNav (plus Summary, which the rail has no slot for) live under More.
  const moreItems = [
    byLabel("Summary"),
    ...more.filter((item) => item.label !== "Wishlist"),
  ];
  const moreActive = moreItems.some((item) => isNavActive(item.href, pathname, base));

  const items: DockItem[] = [
    { href: byLabel("Home").href, label: "Home", match: (p) => isNavActive(byLabel("Home").href, p, base) },
    { href: byLabel("Plan").href, label: "Plan", match: (p) => isNavActive(byLabel("Plan").href, p, base) },
    { href: byLabel("Days").href, label: "Days", match: (p) => isDaysActive(byLabel("Days").href, p, base) },
    { href: byLabel("Money").href, label: "Money", match: (p) => isNavActive(byLabel("Money").href, p, base) },
    { href: byLabel("Wishlist").href, label: "Wishlist", match: (p) => isNavActive(byLabel("Wishlist").href, p, base) },
    {
      href: `${base}/more`,
      label: "More",
      match: () => moreActive,
      render: (active) => (
        <NavMoreMenu tripId={tripId} items={moreItems} active={active} />
      ),
    },
    { href: "/trips", label: "Trips", muted: true, match: (p) => p === "/trips" },
    { href: "/globe", label: "Globe", muted: true },
    { href: "/account", label: "You", muted: true },
  ];

  return (
    <Dock
      items={items}
      aria-label="Trip sections"
      // Sticky at md+ so the rail survives scrolling past the app header
      // (h-14 = 3.5rem, plus its safe-area-inset-top padding and 1px
      // border-b — app/(app)/layout.tsx) instead of scrolling away with the
      // page like an ordinary flex child. Below md this is inert (Dock
      // itself is display:none there).
      className="md:sticky md:top-[calc(3.5rem+env(safe-area-inset-top)+1px)] md:self-start md:h-[calc(100dvh-3.5rem-env(safe-area-inset-top)-1px)]"
    />
  );
}
