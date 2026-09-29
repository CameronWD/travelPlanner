"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Dock, type DockItem } from "@/components/ui/dock";
import { DOCK_STICKY_CLASS, tripRailItems } from "@/components/trip/trip-nav";
import { DockAccountMenu, DockSearchButton } from "@/components/shell/dock-extras";
import { Sidebar, SidebarTripPlaceholder, SidebarTripSkeleton } from "@/components/shell/sidebar";
import { BackToTripCard } from "@/components/shell/back-to-trip-card";
import { useShellUser } from "@/components/shell/shell-user";
import { useRailTrip } from "@/components/shell/rail-trip";
import { useTripIdFromRef } from "@/components/trip/use-trip-href";
import { isGlobeActive, isTripPath, isTripsActive } from "@/components/shell/app-paths";

const APP_ITEMS: DockItem[] = [
  { href: "/trips", label: "Trips", match: isTripsActive },
  { href: "/globe", label: "Globe", match: isGlobeActive },
  { href: "/account", label: "You", match: (p) => p === "/account" || p.startsWith("/account/") },
];

/**
 * The md+ rail, mounted once by app/(app)/layout.tsx and never unmounted
 * (ADR 0062, amended 2026-09-29). Inside a Trip its rows come straight from
 * the URL's trip segment (slug or id — tripRailItems only needs the ref), so
 * they paint at once; the switcher card and counts arrive from the trip
 * layout via RailTripPublisher and show a skeleton until then. Outside a
 * Trip it is the Trips/Globe/You Dock and the Back-to card.
 *
 * Both branches render the same <Dock> then <Sidebar> in the same slots, so
 * React keeps their DOM nodes across the trip boundary; only rows and the
 * switcher slot re-render.
 */
export function AppShellRail() {
  const path = usePathname();
  const planParam = useSearchParams().get("plan");
  const shell = useShellUser();
  const { trip } = useRailTrip();
  const seg = isTripPath(path) ? path!.split("/")[2]! : null;
  // Before the trip layout publishes, the segment may be a slug; the sidebar's
  // search wants the real id (useTripIdFromRef hands an unknown ref back as-is).
  const segId = useTripIdFromRef(seg);
  if (!shell) return null;

  const published = seg && trip && (trip.id === seg || trip.slug === seg) ? trip : null;

  if (!seg) {
    return (
      <>
        <Dock items={APP_ITEMS} aria-label="Teepee" search={<DockSearchButton />} className={DOCK_STICKY_CLASS}>
          <DockAccountMenu />
        </Dock>
        <Sidebar
          {...shell}
          trip={null}
          switcher={shell.lastTrip ? <BackToTripCard trip={shell.lastTrip} trips={shell.trips} /> : <SidebarTripPlaceholder trip={null} />}
        />
      </>
    );
  }

  const ref = published?.slug ?? seg;
  const daysHref = published?.daysHref ?? null;
  const dockItems: DockItem[] = [
    ...tripRailItems(ref, planParam, daysHref).map(({ label, href, match }) => ({ label, href, match })),
    { href: "/trips", label: "Trips", muted: true, match: (p) => p === "/trips" },
    { href: "/globe", label: "Globe", muted: true },
    { href: "/account", label: "You", muted: true },
  ];
  return (
    <>
      <Dock items={dockItems} aria-label="Trip sections" search={<DockSearchButton />} className={DOCK_STICKY_CLASS}>
        <DockAccountMenu />
      </Dock>
      <Sidebar
        {...shell}
        trip={{ id: published?.id ?? segId ?? seg, name: published?.name ?? null, ref, daysHref }}
        switcher={published?.switcher ?? <SidebarTripSkeleton />}
        counts={published?.counts}
      />
    </>
  );
}
