/**
 * Pathname rules the app-level chrome shares (Dock, sidebar, boundary
 * shells). Pure — no React, no Next imports — so any of them can use it
 * without import cycles.
 */

/** The Trips list (and New trip, which is not a Trip). */
export const isTripsActive = (p: string) => p === "/trips" || p === "/trips/new";

export const isGlobeActive = (p: string) => p === "/globe" || p.startsWith("/globe/");

/**
 * A Trip's own pages: /trips/:tripId and below (/trips/new is not a Trip).
 * Null-safe: usePathname() is null outside the App Router (e.g. rendering a
 * boundary on its own), which is simply not a trip path.
 */
export function isTripPath(path: string | null): boolean {
  if (!path) return false;
  const seg = path.split("/")[2];
  return path.startsWith("/trips/") && !!seg && seg !== "new";
}

/** A Trip's Home exactly — /trips/:tripId, no deeper segment. */
export function isTripHomePath(path: string | null): boolean {
  if (!isTripPath(path)) return false;
  return path!.replace(/\/+$/, "").split("/").length === 3;
}

/** The Day view: /trips/:id/day and /trips/:id/day/:date. */
export function isTripDayPath(path: string | null): boolean {
  if (!isTripPath(path)) return false;
  const seg = path!.replace(/\/+$/, "").split("/");
  return seg[3] === "day" && seg.length <= 5;
}

/**
 * Trip sub-routes whose page renders its own PageHeader (AUDIT.md §1), so
 * TripHeaderFrame hides the layout's trip header there at every width, the
 * way it does for the Day view. Each migration adds its segment here.
 */
export const PAGE_HEADER_ROUTES: readonly string[] = ["files", "activity", "compare", "journal", "more", "help", "budget"];

/** Exactly /trips/:ref/<segment> for a listed segment — not deeper. */
export function isPageHeaderPath(path: string | null, routes: readonly string[] = PAGE_HEADER_ROUTES): boolean {
  if (!isTripPath(path)) return false;
  const seg = path!.replace(/\/+$/, "").split("/");
  return seg.length === 4 && routes.includes(seg[3]);
}
