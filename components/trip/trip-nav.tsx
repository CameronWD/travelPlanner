"use client";

import { useSearchParams } from "next/navigation";
import { Dock, type DockItem } from "@/components/ui/dock";
import { DockAccountMenu, DockSearchButton } from "@/components/shell/dock-extras";
import { useDaysHref } from "@/components/trip/days-href-context";
import { useTripSlug } from "@/components/trip/use-trip-href";
import { tripPath } from "@/lib/trip-path";
import type { NavLabel } from "./nav-icons";

export interface NavItem {
  label: string;
  href: string;
}

// Plan-scoped surfaces keep the active variant (?plan=); dated views always follow the real plan.
//
// "Days" opens the Day view (/day) and "Calendar" opens the month grid +
// agenda (/calendar); "Money" (not "Budget") keeps the /budget segment. The
// labels live here, not as display-only renames in the wrappers, so that
// lib/help-guide.test.ts's nav-label drift guard actually covers them: it
// checks these functions' output, so a future rename fails the guide and the
// ⌘K palette instead of silently drifting past them.
export function primaryNav(tripRef: string, planParam?: string | null): NavItem[] {
  const base = tripPath(tripRef);
  const plan = planParam ? `?plan=${encodeURIComponent(planParam)}` : "";
  return [
    { label: "Home", href: base },
    { label: "Plan", href: `${base}/plan${plan}` },
    { label: "Days", href: `${base}/day` },
    { label: "Calendar", href: `${base}/calendar` },
    { label: "Money", href: `${base}/budget${plan}` },
    { label: "Summary", href: `${base}/summary` },
  ];
}

// Plan-scoped surfaces keep the active variant (?plan=); dated views always follow the real plan.
export function moreNav(tripRef: string, planParam?: string | null): NavItem[] {
  const base = tripPath(tripRef);
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

/** Days is the Day view: /trips/:id/day and every /trips/:id/day/:date. */
export function isDaysActive(daysHref: string, pathname: string, base: string): boolean {
  return isNavActive(daysHref, pathname, base);
}

/** One of the seven trip-scoped rail/sidebar rows, with its own active check. */
export interface TripRailItem {
  label: "Home" | "Plan" | "Days" | "Calendar" | "Money" | "Wishlist" | "More";
  href: string;
  match: (pathname: string) => boolean;
}

/**
 * The kit's trip-section ordering — Home, Plan, Days, Calendar, Money,
 * Wishlist, More — reshaped from primaryNav/moreNav (still the source of
 * truth for labels, hrefs and the ?plan= fork threading, ADR 0020). Shared by the Dock
 * (768–1279px) and the full sidebar (≥1280px) so the two can never disagree
 * about what is lit. Each item carries its own active check via isNavActive,
 * so Home's exact-match rule and query-string hrefs both work — a plain
 * path.startsWith(href) would over-match both of those.
 *
 * No Today slot — ADR 0010: the Today view is the Travelling-phase Home.
 *
 * Seven rows — Home, Plan, Days, Calendar, Money, Wishlist, More.
 */
export function tripRailItems(tripRef: string, planParam?: string | null, daysHref?: string | null): TripRailItem[] {
  const base = tripPath(tripRef);
  const nav = primaryNav(tripRef, planParam); // Home, Plan, Days, Calendar, Money, Summary
  const more = moreNav(tripRef, planParam); // Wishlist, Journal, Checklists, Files, Activity, Settings, Help
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

  const simple = (label: "Home" | "Plan" | "Calendar" | "Money" | "Wishlist"): TripRailItem => {
    const href = byLabel(label).href;
    return { label, href, match: (p) => isNavActive(href, p, base) };
  };
  // Matching stays on the /day prefix whatever the href says, so every dated
  // day lights the tab (isDaysActive); the href alone carries the default date
  // (or Plan, for a date-less Trip — DaysHrefProvider).
  const daysIndexHref = byLabel("Days").href;

  return [
    simple("Home"),
    simple("Plan"),
    { label: "Days", href: daysHref ?? daysIndexHref, match: (p) => isDaysActive(daysIndexHref, p, base) },
    simple("Calendar"),
    simple("Money"),
    simple("Wishlist"),
    { label: "More", href: moreHref, match: (p) => moreItems.some((item) => isNavActive(item.href, p, base)) },
  ];
}

export interface TripSidebarItem {
  label: NavLabel;
  href: string;
  match: (pathname: string) => boolean;
}

export interface TripSidebarGroup {
  /** Eyebrow above the group; null for the trailing Settings/Help pair. */
  heading: "Plan it" | "Keep" | null;
  items: TripSidebarItem[];
}

/**
 * The ≥1280px sidebar's full list (Feedback cmumd26ny000104jywgykrva2): every
 * section, no More. Hrefs and ?plan= threading still come from
 * primaryNav/moreNav; matching mirrors tripRailItems (Home exact, Days on the
 * /day prefix, everything else on its own prefix). The Dock keeps
 * tripRailItems — a 96px strip has no room for thirteen rows.
 */
export function tripSidebarGroups(tripRef: string, planParam?: string | null, daysHref?: string | null): TripSidebarGroup[] {
  const base = tripPath(tripRef);
  const all = [...primaryNav(tripRef, planParam), ...moreNav(tripRef, planParam)];
  const byLabel = (label: NavLabel) => all.find((i) => i.label === label)!;
  const item = (label: Exclude<NavLabel, "Days" | "More">): TripSidebarItem => {
    const href = byLabel(label).href;
    return { label, href, match: (p) => isNavActive(href, p, base) };
  };
  const daysIndexHref = byLabel("Days").href;
  const days: TripSidebarItem = { label: "Days", href: daysHref ?? daysIndexHref, match: (p) => isDaysActive(daysIndexHref, p, base) };
  return [
    { heading: "Plan it", items: [item("Home"), item("Plan"), days, item("Calendar"), item("Money"), item("Wishlist")] },
    { heading: "Keep", items: [item("Journal"), item("Checklists"), item("Files"), item("Summary"), item("Activity")] },
    { heading: null, items: [item("Settings"), item("Help")] },
  ];
}

/**
 * Sticky at md+ with no offset: there is no app top bar from 768px up (the
 * phone header is md:hidden — app/(app)/layout.tsx), so the rail pins to the
 * viewport top at full height. xl:hidden because the full sidebar takes over
 * at ≥1280px. Shared with AppShellRail.
 */
export const DOCK_STICKY_CLASS = "md:sticky md:top-0 md:self-start md:h-dvh xl:hidden";

interface TripNavProps {
  tripId: string;
  /** URL ref for the items; falls back to useTripSlug(tripId). */
  tripRef?: string | null;
  /** Days target; falls back to DaysHrefProvider. */
  daysHref?: string | null;
}

/**
 * The Dock for a trip's sections at 768–1279px (see components/ui/dock.tsx
 * for the mobile-hidden breakpoint; xl:hidden hands over to the sidebar).
 * Search sits under the mark and the Traveller's avatar menu at the bottom
 * (controller ruling R1): at this width the Dock is the only chrome.
 *
 * Keeps the muted app-scoped Trips/Globe/You after the seven trip items — at
 * this width the Dock is the only navigation there is.
 */
export function TripNav({ tripId, tripRef: tripRefProp, daysHref: daysHrefProp }: TripNavProps) {
  const ctxRef = useTripSlug(tripId);
  const planParam = useSearchParams().get("plan");
  const ctxDaysHref = useDaysHref();
  const tripRef = tripRefProp ?? ctxRef;
  const daysHref = daysHrefProp ?? ctxDaysHref;

  const items: DockItem[] = [
    ...tripRailItems(tripRef, planParam, daysHref).map(({ label, href, match }) => ({ label, href, match })),
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
