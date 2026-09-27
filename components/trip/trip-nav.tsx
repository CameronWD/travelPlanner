"use client";

import { useSearchParams } from "next/navigation";
import { Dock, type DockItem } from "@/components/ui/dock";
import { DockAccountMenu, DockSearchButton } from "@/components/shell/dock-extras";

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

/** One of the six trip-scoped rail/sidebar rows, with its own active check. */
export interface TripRailItem {
  label: "Home" | "Plan" | "Days" | "Money" | "Wishlist" | "More";
  href: string;
  match: (pathname: string) => boolean;
}

/**
 * The kit's trip-section ordering — Home, Plan, Days, Money, Wishlist, More —
 * reshaped from primaryNav/moreNav (still the source of truth for labels,
 * hrefs and the ?plan= fork threading, ADR 0020). Shared by the Dock
 * (768–1279px) and the full sidebar (≥1280px) so the two can never disagree
 * about what is lit. Each item carries its own active check via isNavActive,
 * so Home's exact-match rule and query-string hrefs both work — a plain
 * path.startsWith(href) would over-match both of those.
 *
 * No Today slot — ADR 0010: the Today view is the Travelling-phase Home.
 */
export function tripRailItems(tripId: string, planParam?: string | null): TripRailItem[] {
  const base = `/trips/${tripId}`;
  const nav = primaryNav(tripId, planParam); // Home, Plan, Days, Money, Summary
  const more = moreNav(tripId, planParam); // Wishlist, Journal, Checklists, Files, Activity, Settings, Help
  const byLabel = (label: string) => [...nav, ...more].find((i) => i.label === label)!;

  // Wishlist gets its own slot in the kit's ordering; the rest of moreNav
  // (plus Summary, which has no slot) live on the More page
  // (/trips/:id/more), so More stays lit on any of them and on /more.
  const moreHref = `${base}/more`;
  const moreItems = [
    byLabel("Summary"),
    ...more.filter((item) => item.label !== "Wishlist"),
    { label: "More", href: moreHref },
  ];

  const simple = (label: "Home" | "Plan" | "Money" | "Wishlist"): TripRailItem => {
    const href = byLabel(label).href;
    return { label, href, match: (p) => isNavActive(href, p, base) };
  };
  const daysHref = byLabel("Days").href;

  return [
    simple("Home"),
    simple("Plan"),
    { label: "Days", href: daysHref, match: (p) => isDaysActive(daysHref, p, base) },
    simple("Money"),
    simple("Wishlist"),
    { label: "More", href: moreHref, match: (p) => moreItems.some((item) => isNavActive(item.href, p, base)) },
  ];
}

/**
 * Sticky at md+ with no offset: there is no app top bar from 768px up (the
 * phone header is md:hidden — app/(app)/layout.tsx), so the rail pins to the
 * viewport top at full height. xl:hidden because the full sidebar takes over
 * at ≥1280px. Shared with AppRailDock.
 */
export const DOCK_STICKY_CLASS = "md:sticky md:top-0 md:self-start md:h-dvh xl:hidden";

interface TripNavProps {
  tripId: string;
}

/**
 * The Dock for a trip's sections at 768–1279px (see components/ui/dock.tsx
 * for the mobile-hidden breakpoint; xl:hidden hands over to the sidebar).
 * Search sits under the mark and the Traveller's avatar menu at the bottom
 * (controller ruling R1): at this width the Dock is the only chrome.
 *
 * Keeps the muted app-scoped Trips/Globe/You after the six trip items — at
 * this width the Dock is the only navigation there is.
 */
export function TripNav({ tripId }: TripNavProps) {
  const planParam = useSearchParams().get("plan");

  const items: DockItem[] = [
    ...tripRailItems(tripId, planParam).map(({ label, href, match }) => ({ label, href, match })),
    { href: "/trips", label: "Trips", muted: true, match: (p) => p === "/trips" },
    { href: "/globe", label: "Globe", muted: true },
    { href: "/account", label: "You", muted: true },
  ];

  return (
    <Dock
      items={items}
      aria-label="Trip sections"
      search={<DockSearchButton />}
      className={DOCK_STICKY_CLASS}
    >
      <DockAccountMenu />
    </Dock>
  );
}
