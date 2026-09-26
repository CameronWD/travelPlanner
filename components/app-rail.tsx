"use client";

import { usePathname } from "next/navigation";
import { Dock, type DockItem } from "@/components/ui/dock";

const ITEMS: DockItem[] = [
  { href: "/trips", label: "Trips", match: (p) => p === "/trips" || p === "/trips/new" },
  { href: "/globe", label: "Globe", match: (p) => p === "/globe" || p.startsWith("/globe/") },
  { href: "/account", label: "You", match: (p) => p === "/account" || p.startsWith("/account/") },
];

/**
 * A Trip's own pages: /trips/:tripId and below (/trips/new is not a Trip).
 * Null-safe: usePathname() is null outside the App Router (e.g. rendering a
 * boundary on its own), which is simply not a trip path.
 */
function isTripPath(path: string | null): boolean {
  if (!path) return false;
  const seg = path.split("/")[2];
  return path.startsWith("/trips/") && !!seg && seg !== "new";
}

/**
 * The app-level rail itself: the Dock with Trips/Globe/You, whatever the
 * pathname (Dock still reads it to light the current item). Same sticky
 * offset as TripNav: survives scrolling past the app header (h-14 +
 * safe-area-inset-top + 1px border-b). Inert below md.
 */
export function AppRailDock() {
  return (
    <Dock
      items={ITEMS}
      aria-label="Teepee"
      className="md:sticky md:top-[calc(3.5rem+env(safe-area-inset-top)+1px)] md:self-start md:h-[calc(100dvh-3.5rem-env(safe-area-inset-top)-1px)]"
    />
  );
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
      <div className="mx-auto w-full min-w-0 max-w-page-wide flex-1 px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}
