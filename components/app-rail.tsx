"use client";

import { usePathname } from "next/navigation";
import { Dock, type DockItem } from "@/components/ui/dock";
import { DOCK_STICKY_CLASS } from "@/components/trip/trip-nav";
import { DockAccountMenu, DockSearchButton } from "@/components/shell/dock-extras";
import { SidebarFromContext } from "@/components/shell/sidebar-from-context";
import { isGlobeActive, isTripPath, isTripsActive } from "@/components/shell/app-paths";

const ITEMS: DockItem[] = [
  { href: "/trips", label: "Trips", match: isTripsActive },
  { href: "/globe", label: "Globe", match: isGlobeActive },
  { href: "/account", label: "You", match: (p) => p === "/account" || p.startsWith("/account/") },
];

/**
 * The app-level rail itself: the Dock with Trips/Globe/You, whatever the
 * pathname (Dock still reads it to light the current item), plus search
 * under the mark and the Traveller's avatar menu at the foot (ruling R1).
 * Same sticky class as TripNav: pinned to the viewport top at full height
 * (no top bar from md up) and handing over to the sidebar at xl. Inert
 * below md.
 */
export function AppRailDock() {
  return (
    <Dock items={ITEMS} aria-label="Teepee" search={<DockSearchButton />} className={DOCK_STICKY_CLASS}>
      <DockAccountMenu />
    </Dock>
  );
}

/**
 * Children only outside a Trip — for the app layout's own sidebar, which
 * the trip layout replaces with one that knows the Trip (never two).
 */
export function OutsideTrip({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (isTripPath(path)) return null;
  return <>{children}</>;
}

/**
 * The md+ rail on every signed-in page outside a Trip — the desktop kit's
 * Shell keeps the same Dock on every screen. Mounted once by
 * app/(app)/layout.tsx; inside a Trip it renders nothing, because the trip
 * layout's TripNav renders its own Dock there (never two rails).
 *
 * Reads the pathname on the client: a Server Component cannot read the URL
 * (the app layout is preserved across navigations), and the trip layout's
 * [data-trip-shell] only marks <main>, not a sibling of it.
 */
export function AppRail() {
  const path = usePathname();
  if (isTripPath(path)) return null;
  return <AppRailDock />;
}

/**
 * For a boundary ABOVE the trip layout — app/(app)/not-found.tsx and
 * app/(app)/trips/error.tsx. A notFound() or throw in the trip layout itself
 * (a bad, deleted or no-longer-shared Trip) skips the trip segment's own
 * not-found/error files, which render inside that layout, and lands in one of
 * these, so neither TripNav nor AppRail is on screen. On a trip path this
 * supplies the rail beside the content ([data-rail-shell] sends <main>
 * full-bleed, like [data-trip-shell], so the content re-centres itself right
 * of the rail); anywhere else AppRail is already there and this adds nothing.
 */
export function TripBoundaryRailShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (!isTripPath(path)) return <>{children}</>;
  return (
    <div data-rail-shell className="flex flex-col md:flex-row">
      <AppRailDock />
      <SidebarFromContext trip={null} />
      <div className="mx-auto w-full min-w-0 max-w-page-wide flex-1 px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}
