"use client";

import { usePathname } from "next/navigation";
import { Dock, type DockItem } from "@/components/ui/dock";

const ITEMS: DockItem[] = [
  { href: "/trips", label: "Trips", match: (p) => p === "/trips" || p === "/trips/new" },
  { href: "/globe", label: "Globe", match: (p) => p === "/globe" || p.startsWith("/globe/") },
  { href: "/account", label: "You", match: (p) => p === "/account" || p.startsWith("/account/") },
];

/** A Trip's own pages: /trips/:tripId and below (/trips/new is not a Trip). */
function isTripPath(path: string): boolean {
  const seg = path.split("/")[2];
  return path.startsWith("/trips/") && !!seg && seg !== "new";
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
  return (
    <Dock
      items={ITEMS}
      aria-label="Teepee"
      // Same sticky offset as TripNav: survives scrolling past the app header
      // (h-14 + safe-area-inset-top + 1px border-b). Inert below md.
      className="md:sticky md:top-[calc(3.5rem+env(safe-area-inset-top)+1px)] md:self-start md:h-[calc(100dvh-3.5rem-env(safe-area-inset-top)-1px)]"
    />
  );
}
