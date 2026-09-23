/**
 * Route → human context for a Feedback note (ADR 0040).
 *
 * Shared by the Feedback panel (browser) and the inbox renderer (node script),
 * so this module must stay free of React, Prisma and next/* imports.
 */

/** Strip query/hash and any trailing slash, keeping a leading "/". */
function normalise(route: string): string {
  const path = route.split(/[?#]/, 1)[0];
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

/** Trip sub-routes, keyed by the segment after the trip id. */
const TRIP_SUBPAGE_LABELS: Record<string, string> = {
  plan: "Plan editor",
  budget: "Money",
  summary: "Summary",
  calendar: "Days",
  today: "Today",
  wishlist: "Wishlist",
  checklists: "Checklists",
  journal: "Journal",
  files: "Files",
  activity: "Activity",
  compare: "Compare",
  settings: "Trip settings",
  print: "Print view",
  help: "Trip help",
};

const TOP_LEVEL_LABELS: Record<string, string> = {
  "/trips": "Trips",
  "/trips/new": "New trip",
  "/globe": "Globe",
  "/help": "Help",
};

/**
 * The trip id in a `/trips/<id>/…` path, or null. "new" is a route, not an id.
 */
export function tripIdFromRoute(route: string): string | null {
  const segments = normalise(route).split("/").filter(Boolean);
  if (segments[0] !== "trips") return null;
  const id = segments[1];
  if (!id || id === "new") return null;
  return id;
}

/** A human label for the screen a Feedback note was written from. */
export function pageLabelForRoute(route: string): string {
  const path = normalise(route);
  const topLevel = TOP_LEVEL_LABELS[path];
  if (topLevel) return topLevel;

  if (tripIdFromRoute(path)) {
    const segments = path.split("/").filter(Boolean);
    const subpage = segments[2];
    if (!subpage) return "Trip home";
    const label = TRIP_SUBPAGE_LABELS[subpage];
    if (label) return label;
  }

  return path;
}

/** The coarse heading a note is filed under in the Feedback inbox. */
export function areaForRoute(route: string): string {
  const path = normalise(route);
  if (path === "/globe" || path.startsWith("/globe/")) return "Globe";
  if (path === "/trips" || path === "/trips/new") return "Trips list";

  if (tripIdFromRoute(path)) {
    const subpage = path.split("/").filter(Boolean)[2];
    if (!subpage) return "Trip home";
    if (subpage === "plan" || subpage === "compare") return "Plan editor";
    if (subpage === "budget") return "Money";
    if (subpage === "wishlist") return "Wishlist";
    return TRIP_SUBPAGE_LABELS[subpage] ?? "Elsewhere";
  }

  return "Elsewhere";
}
